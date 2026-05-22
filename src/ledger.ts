import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  appendEvent,
  createEventId,
  readEvents,
  replayEvents,
  resolveEventPaths,
  verifyEventIntegrity
} from "./events.js";
import type { MemoryEvent } from "./events.js";
import {
  normalizeLocalFileDestination,
  replaceManagedBlock,
  selectExportAdapter
} from "./export-adapters.js";
import {
  analyzeRelationships,
  filterRelationshipAnalysis
} from "./relationships.js";
import type {
  RelationshipCycle,
  RelationshipGraphAnalysis,
  RelationshipReferenceSet
} from "./relationships.js";
import { loadPolicyConfig } from "./policy-config.js";
import { classifyMemory } from "./policy.js";
import { hashJson } from "./hash.js";
import {
  assertReadAccess,
  evaluateReadAccess,
  MEMPR_READ_POLICY_DENIED_MESSAGE,
  ReadDeniedError
} from "./read-policy.js";
import type { ReadAccessOptions } from "./read-policy.js";
import type {
  ReadPermissionDeniedEvidence,
  ReadContextPermissionConstraint,
  ReadContextPermissionIssueCode
} from "./read-permissions.js";
import { READ_PERMISSION_CONTRACT_VERSION } from "./read-permissions.js";
import { createCorrelationId } from "./diagnostics.js";
import { scanAcceptedMemoryRecords } from "./scanner.js";
import type { MemoryScanFinding } from "./scanner.js";
import { atomicWriteFile, withStoreLock } from "./storage.js";
import { isExpired, normalizeExpiry } from "./ttl.js";
import {
  MEMORY_RISKS,
  MEMORY_SOURCE_TRUST,
  MEMORY_SOURCE_TYPES,
  MEMORY_STATUSES,
  POLICY_DECISIONS
} from "./types.js";
import type {
  LedgerPaths,
  ListFilters,
  MemoryRecord,
  MemoryRisk,
  MemorySourceTrust,
  MemorySourceType,
  MemoryStatus,
  PolicyResult,
  PolicyDecision,
  ProposeMemoryInput
} from "./types.js";

const LEDGER_DIR = ".mempr";
const LEDGER_FILE = "ledger.jsonl";
const MAX_ISSUE_IDS = 20;
const UNKNOWN_POLICY_VERSION = "unknown";
const READ_CONTEXT_STALE_WARNING_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type LedgerConsistencyIssueCode =
  | "ledger_read_failed"
  | "event_file_missing"
  | "event_malformed"
  | "event_hash_mismatch"
  | "event_read_failed"
  | "event_replay_failed"
  | "ledger_replay_mismatch";

export interface LedgerConsistencyIssue {
  code: LedgerConsistencyIssueCode;
  message: string;
  currentCount?: number;
  replayedCount?: number;
  line?: number;
  missingFromReplayIds?: string[];
  missingFromLedgerIds?: string[];
  changedRecordIds?: string[];
  omittedRecordIdCount?: number;
  orderMismatch?: boolean;
}

export interface LedgerConsistencyStatus {
  ok: boolean;
  root: string;
  currentCount: number;
  replayedCount: number | null;
  issues: LedgerConsistencyIssue[];
}

export type RecordHistoryEvent =
  | RecordHistoryProposedEvent
  | RecordHistoryStatusChangedEvent
  | RecordHistoryExportedEvent
  | RecordHistoryMigratedEvent
  | RecordHistoryRelationshipResolvedEvent
  | RecordHistoryLiveSyncedEvent;

export type RecordHistoryIssueCode =
  | "event_malformed"
  | "event_read_failed";

export interface RecordHistoryIssue {
  code: RecordHistoryIssueCode;
  message: string;
  line?: number;
}

export interface RecordHistoryProposedEvent {
  id: string;
  type: "memory_proposed";
  created_at: string;
  record_id: string;
  status: MemoryStatus;
  destination: string;
}

export interface RecordHistoryStatusChangedEvent {
  id: string;
  type: "memory_status_changed";
  created_at: string;
  record_id: string;
  previous_status: MemoryStatus;
  next_status: MemoryStatus;
  reason: string | null;
}

export interface RecordHistoryExportedEvent {
  id: string;
  type: "memory_exported";
  created_at: string;
  record_id: string;
  destination: string;
  output_path: string;
}

export interface RecordHistoryMigratedEvent {
  id: string;
  type: "ledger_migrated";
  created_at: string;
  record_id: string;
  source: "legacy_ledger_jsonl";
  record_count: number;
}

export interface RecordHistoryRelationshipResolvedEvent {
  id: string;
  type: "memory_relationship_resolved";
  created_at: string;
  record_id: string;
  action: "accept_and_retire" | "accept_with_override" | "retire";
  reason: string;
  retired_record_ids: string[];
  override_record_ids: string[];
  cycle_record_ids: string[][];
}

export interface RecordHistoryLiveSyncedEvent {
  id: string;
  type: "memory_live_synced";
  created_at: string;
  record_id: string;
  adapter_id: string;
  destination: string;
  status: "skipped" | "succeeded" | "failed";
  idempotency_key: string;
  downstream_id: string | null;
  attempts: number;
  error_code?: string;
}

export interface RecordHistory {
  record: MemoryRecord;
  events: RecordHistoryEvent[];
  issues: RecordHistoryIssue[];
}

export interface MarkdownExportPreview {
  destination: string;
  outputPath: string;
  adapter: {
    id: string;
    title: string;
  };
  recordIds: string[];
  recordCount: number;
  destinationExists: boolean;
  warnings: ReadContextWarning[];
  content: string;
}

export interface ExportMarkdownOptions {
  dryRun?: boolean;
  readAccess?: ReadAccessOptions;
}

export type ReadContextIssueCode =
  | "invalid_destination"
  | "ledger_read_failed"
  | "read_identity_missing"
  | "read_identity_invalid"
  | "read_policy_denied"
  | "read_policy_malformed"
  | ReadContextPermissionIssueCode
  | "expired_record"
  | "secret_like_content"
  | "relationship_conflict"
  | "relationship_supersession"
  | "relationship_cycle";

export interface ReadContextIssue {
  code: ReadContextIssueCode;
  message: string;
  recordIds: string[];
  relationship?: "conflicts_with" | "supersedes";
  metadata?: ReadPermissionDeniedEvidence;
}

export type ReadContextWarningCode = "expiring_record" | "sensitive_content";

export interface ReadContextWarning {
  code: ReadContextWarningCode;
  message: string;
  destination: string;
  recordIds: string[];
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  warningWindowDays: number | null;
}

export interface ReadContextOptions {
  destination?: string | null;
  scope?: string | readonly string[] | null;
  scopes?: string | readonly string[] | null;
  actor?: string | null;
  allowedScopes?: string | readonly string[] | null;
  readPermission?: ReadContextPermissionConstraint | null;
  permission?: ReadContextPermissionConstraint | null;
  readPermissionConstraint?: ReadContextPermissionConstraint | null;
  readAccess?: ReadAccessOptions | null;
}

export interface ReadContextStatusOptions {
  destination?: string | null;
  readAccess?: ReadAccessOptions | null;
}

export interface ReadContextStatusCounts {
  total: number;
  accepted: number;
  pending: number;
  rejected: number;
}

export interface ReadContext {
  ok: boolean;
  destination: string;
  scope: string | null;
  scopes: string[];
  recordIds: string[];
  recordCount: number;
  records: MemoryRecord[];
  issues: ReadContextIssue[];
  warnings: ReadContextWarning[];
}

export interface ReadContextDestinationStatus {
  destination: string;
  ok: boolean;
  blocked: boolean;
  counts: ReadContextStatusCounts;
  acceptedRecordIds: string[];
  issues: ReadContextIssue[];
  warnings: ReadContextWarning[];
}

export interface ReadContextStatus {
  ok: boolean;
  blocked: boolean;
  destination: string | null;
  destinationCount: number;
  blockedCount: number;
  warningCount: number;
  destinations: ReadContextDestinationStatus[];
  issues: ReadContextIssue[];
}

interface MarkdownExportPlan {
  destination: string;
  outputPath: string;
  adapterId: string;
  adapterTitle: string;
  recordIds: string[];
  recordCount: number;
  destinationExists: boolean;
  warnings: ReadContextWarning[];
  content: string;
}

interface NormalizedReadPermissionConstraint {
  actor: string;
  allowedScopes: string[];
  effectiveScopes: string[];
  validUntil: string | null;
  excludeConflicts: boolean;
  excludeSupersedes: boolean;
}

type ReadPermissionConstraintResult =
  | { supplied: false }
  | { supplied: true; ok: true; value: NormalizedReadPermissionConstraint }
  | { supplied: true; ok: false; issue: ReadContextIssue };

interface RelationshipStatusChange {
  recordId: string;
  previousStatus: MemoryStatus;
  nextRecord: MemoryRecord;
  reason: string;
  createdAt: string;
}

interface RelationshipResolutionWork {
  records: MemoryRecord[];
  record: MemoryRecord;
  retiredRecords: MemoryRecord[];
  evidence: RelationshipResolutionEvidence;
  statusChanges: RelationshipStatusChange[];
}

export function resolveLedgerPaths(root = process.cwd()): LedgerPaths {
  const resolvedRoot = resolve(root);

  return {
    root: resolvedRoot,
    directory: join(resolvedRoot, LEDGER_DIR),
    ledgerFile: join(resolvedRoot, LEDGER_DIR, LEDGER_FILE)
  };
}

export async function proposeMemory(
  input: ProposeMemoryInput,
  root = process.cwd()
): Promise<MemoryRecord> {
  const paths = resolveLedgerPaths(root);
  return withStoreLock(paths.directory, async () => {
    const normalizedInput = normalizeProposalInput(input);
    const records = await readRecords(paths);
    validateProposalReferences(normalizedInput, records);
    const policyConfig = await loadPolicyConfig(paths.root);
    const classified = classifyMemory(normalizedInput, policyConfig);
    const policy = reviewLinkedAutoAccept(classified, normalizedInput);
    const record = createMemoryRecord(normalizedInput, policy);

    await appendRecord(paths, record);
    await appendEvent({
      id: createEventId(),
      type: "memory_proposed",
      created_at: record.created_at,
      record_id: record.id,
      record,
      policy_config_hash: hashJson(policyConfig)
    }, paths.root);
    return record;
  });
}

export async function listRecords(
  filters: ListFilters = {},
  root = process.cwd(),
  readAccess: ReadAccessOptions = {}
): Promise<MemoryRecord[]> {
  await assertReadAccess(root, {
    action: "read",
    surface: "records_list",
    resource: "records",
    destination: filters.destination ?? null,
    filters: {
      status: filters.status ?? null,
      risk: filters.risk ?? null,
      destination: filters.destination ?? null
    }
  }, readAccess);
  const records = await readRecords(resolveLedgerPaths(root));
  const status = filters.status ? normalizeStatus(filters.status) : undefined;
  const risk = filters.risk ? normalizeRisk(filters.risk) : undefined;
  const destination = normalizeOptionalText(filters.destination);

  return records.filter((record) => {
    return (!status || record.status === status)
      && (!risk || record.risk === risk)
      && (!destination || record.destination === destination);
  });
}

export async function getRecord(
  id: string,
  root = process.cwd(),
  readAccess: ReadAccessOptions = {}
): Promise<MemoryRecord> {
  const recordId = normalizeRequiredText(id, "Memory id is required.");
  await assertReadAccess(root, {
    action: "read",
    surface: "record_inspect",
    resource: "record",
    recordIds: [recordId]
  }, readAccess);
  const records = await readRecords(resolveLedgerPaths(root));
  const record = records.find((candidate) => candidate.id === recordId);

  if (!record) {
    throw new Error(`No memory record found for ${recordId}.`);
  }

  return record;
}

export async function getRecordHistory(
  id: string,
  root = process.cwd(),
  readAccess: ReadAccessOptions = {}
): Promise<RecordHistory> {
  const recordId = normalizeRequiredText(id, "Memory id is required.");
  await assertReadAccess(root, {
    action: "read",
    surface: "record_history",
    resource: "record_history",
    recordIds: [recordId]
  }, readAccess);
  const records = await readRecords(resolveLedgerPaths(root));
  const record = records.find((candidate) => candidate.id === recordId);

  if (!record) {
    throw new Error(`No memory record found for ${recordId}.`);
  }

  const issues: RecordHistoryIssue[] = [];
  let events: RecordHistoryEvent[] = [];

  try {
    events = summarizeRecordEvents(recordId, await readEvents(root));
  } catch (error) {
    issues.push(historyReadIssue(error));
  }

  return {
    record,
    events,
    issues
  };
}

export interface ReviewContext {
  candidate: MemoryRecord;
  supersedes: MemoryRecord[];
  conflicts_with: MemoryRecord[];
  incoming: RelationshipReferenceSet;
  incoming_superseded_by: MemoryRecord[];
  incoming_conflicts_with: MemoryRecord[];
  cycles: RelationshipCycle[];
}

export interface RelationshipResolutionOptions {
  reason: string;
  retireSuperseded?: boolean;
  overrideRelationships?: boolean;
}

export interface RelationshipResolutionEvidence {
  action: "accept_and_retire" | "accept_with_override" | "retire";
  reason: string;
  retiredRecordIds: string[];
  overrideRecordIds: string[];
  cycleRecordIds: string[][];
}

export interface RelationshipResolutionResult {
  record: MemoryRecord;
  retiredRecords: MemoryRecord[];
  evidence: RelationshipResolutionEvidence;
  graph: RelationshipGraphAnalysis;
}

export async function getReviewContext(
  id: string,
  root = process.cwd(),
  readAccess: ReadAccessOptions = {}
): Promise<ReviewContext> {
  const recordId = normalizeRequiredText(id, "Memory id is required.");
  await assertReadAccess(root, {
    action: "read",
    surface: "record_inspect",
    resource: "record",
    recordIds: [recordId]
  }, readAccess);
  const records = await readRecords(resolveLedgerPaths(root));
  const byId = recordsById(records);
  const candidate = byId.get(recordId);

  if (!candidate) {
    throw new Error(`No memory record found for ${recordId}.`);
  }

  const supersedes = recordsForRelationship(candidate, byId, "supersedes");
  const conflictsWith = recordsForRelationship(candidate, byId, "conflicts_with");
  const graph = analyzeRelationships(records);
  const incoming = graph.incoming[recordId] ?? { supersedes: [], conflicts_with: [] };

  return {
    candidate,
    supersedes,
    conflicts_with: conflictsWith,
    incoming,
    incoming_superseded_by: recordsForIds(incoming.supersedes, byId),
    incoming_conflicts_with: recordsForIds(incoming.conflicts_with, byId),
    cycles: graph.cycles.filter((cycle) => cycle.recordIds.includes(recordId))
  };
}

export async function analyzeRelationshipGraph(
  root = process.cwd()
): Promise<RelationshipGraphAnalysis> {
  return analyzeRelationships(await readRecords(resolveLedgerPaths(root)));
}

export async function acceptMemoryWithRelationships(
  id: string,
  options: RelationshipResolutionOptions,
  root = process.cwd()
): Promise<RelationshipResolutionResult> {
  const paths = resolveLedgerPaths(root);
  return withStoreLock(paths.directory, async () => {
    const recordId = normalizeRequiredText(id, "Memory id is required.");
    const reason = normalizeRequiredText(options.reason, "A reason is required to accept memory.");
    const records = await readRecords(paths);
    const result = resolveRelationshipAcceptance(records, recordId, {
      reason,
      retireSuperseded: options.retireSuperseded === true,
      overrideRelationships: options.overrideRelationships === true
    });

    await writeRecords(paths, result.records);
    await appendRelationshipStatusEvents(result, paths.root);
    await appendEvent({
      id: createEventId(),
      type: "memory_relationship_resolved",
      created_at: new Date().toISOString(),
      record_id: result.record.id,
      action: result.evidence.action,
      reason: result.evidence.reason,
      retired_record_ids: result.evidence.retiredRecordIds,
      override_record_ids: result.evidence.overrideRecordIds,
      cycle_record_ids: result.evidence.cycleRecordIds
    }, paths.root);

    return {
      record: result.record,
      retiredRecords: result.retiredRecords,
      evidence: result.evidence,
      graph: filterRelationshipAnalysis(
        analyzeRelationships(result.records),
        [
          result.record.id,
          ...result.evidence.retiredRecordIds,
          ...result.evidence.overrideRecordIds,
          ...result.evidence.cycleRecordIds.flat()
        ]
      )
    };
  });
}

export async function checkLedgerConsistency(
  root = process.cwd(),
  readAccess: ReadAccessOptions = {}
): Promise<LedgerConsistencyStatus> {
  const paths = resolveLedgerPaths(root);
  const issues: LedgerConsistencyIssue[] = [];
  let currentRecords: MemoryRecord[];

  try {
    await assertReadAccess(root, {
      action: "read",
      surface: "consistency_status",
      resource: "consistency"
    }, readAccess);
  } catch (error) {
    if (error instanceof ReadDeniedError) {
      return {
        ok: false,
        root: paths.root,
        currentCount: 0,
        replayedCount: null,
        issues: [{
          code: "event_read_failed",
          message: `${error.message} Correlation ID: ${createCorrelationId()}.`
        }]
      };
    }

    throw error;
  }

  try {
    currentRecords = await readRecords(paths);
  } catch {
    return {
      ok: false,
      root: paths.root,
      currentCount: 0,
      replayedCount: null,
      issues: [{
        code: "ledger_read_failed",
        message: "Ledger records could not be read."
      }]
    };
  }

  const eventPaths = resolveEventPaths(paths.root);
  let hasEventFile: boolean;

  try {
    hasEventFile = await fileExists(eventPaths.eventFile);
  } catch {
    return {
      ok: false,
      root: paths.root,
      currentCount: currentRecords.length,
      replayedCount: null,
      issues: [{
        code: "event_read_failed",
        message: "Event file could not be read."
      }]
    };
  }

  if (!hasEventFile && currentRecords.length > 0) {
    issues.push({
      code: "event_file_missing",
      message: "Event file is missing while ledger has records.",
      currentCount: currentRecords.length,
      replayedCount: 0
    });
  }

  let replayedRecords: MemoryRecord[];

  try {
    const events = await readEvents(paths.root);
    verifyEventIntegrity(events);
    replayedRecords = replayEvents(events).map(normalizeRecord);
  } catch (error) {
    issues.push(consistencyReadOrReplayIssue(error));

    return {
      ok: false,
      root: paths.root,
      currentCount: currentRecords.length,
      replayedCount: null,
      issues
    };
  }

  const mismatch = compareCurrentToReplay(currentRecords, replayedRecords);

  if (mismatch) {
    issues.push(mismatch);
  }

  return {
    ok: issues.length === 0,
    root: paths.root,
    currentCount: currentRecords.length,
    replayedCount: replayedRecords.length,
    issues
  };
}

export interface LedgerRepairOptions {
  fromEvents?: boolean;
  confirm?: boolean;
}

export interface LedgerRepairResult {
  root: string;
  changed: boolean;
  wouldChange: boolean;
  repairedCount: number;
  issues: LedgerConsistencyIssue[];
}

export async function repairLedgerFromEvents(
  root = process.cwd(),
  options: LedgerRepairOptions = {}
): Promise<LedgerRepairResult> {
  const paths = resolveLedgerPaths(root);

  if (options.fromEvents !== true) {
    throw new Error("Ledger repair requires --from-events.");
  }

  const events = await readEvents(paths.root);
  verifyEventIntegrity(events);
  const replayedRecords = replayEvents(events).map(normalizeRecord);
  const currentRecords = await readRecords(paths);
  const mismatch = compareCurrentToReplay(currentRecords, replayedRecords);
  const issues = mismatch ? [mismatch] : [];

  if (issues.length === 0) {
    return {
      root: paths.root,
      changed: false,
      wouldChange: false,
      repairedCount: replayedRecords.length,
      issues: []
    };
  }

  if (options.confirm !== true) {
    return {
      root: paths.root,
      changed: false,
      wouldChange: true,
      repairedCount: replayedRecords.length,
      issues
    };
  }

  return withStoreLock(paths.directory, async () => {
    await writeRecords(paths, replayedRecords);
    return {
      root: paths.root,
      changed: true,
      wouldChange: true,
      repairedCount: replayedRecords.length,
      issues
    };
  });
}

export async function updateRecordStatus(
  id: string,
  status: MemoryStatus,
  reason: string | undefined,
  root = process.cwd()
): Promise<MemoryRecord> {
  const paths = resolveLedgerPaths(root);
  return withStoreLock(paths.directory, async () => {
    const nextStatus = normalizeStatus(status);
    const statusReason = normalizeOptionalText(reason);
    const records = await readRecords(paths);
    const now = new Date().toISOString();
    let previousStatus: MemoryStatus | undefined;
    let updated: MemoryRecord | undefined;

    const nextRecords = records.map((record) => {
      if (record.id !== id) {
        return record;
      }

      validateStatusTransition(record.status, nextStatus, statusReason);
      previousStatus = record.status;

      updated = {
        ...record,
        status: nextStatus,
        status_reason: statusReason ?? null,
        updated_at: now
      };

      return updated;
    });

    if (!updated) {
      throw new Error(`No memory record found for ${id}.`);
    }

    if (!previousStatus) {
      throw new Error(`No previous status found for ${id}.`);
    }

    await writeRecords(paths, nextRecords);
    await appendEvent({
      id: createEventId(),
      type: "memory_status_changed",
      created_at: now,
      record_id: updated.id,
      previous_status: previousStatus,
      next_status: updated.status,
      reason: updated.status_reason ?? null,
      record: updated
    }, paths.root);

    if (updated.status === "retired") {
      await appendEvent({
        id: createEventId(),
        type: "memory_relationship_resolved",
        created_at: now,
        record_id: updated.id,
        action: "retire",
        reason: updated.status_reason ?? "Retired.",
        retired_record_ids: [updated.id],
        override_record_ids: [],
        cycle_record_ids: []
      }, paths.root);
    }

    return updated;
  });
}

function resolveRelationshipAcceptance(
  records: readonly MemoryRecord[],
  recordId: string,
  options: Required<RelationshipResolutionOptions>
): RelationshipResolutionWork {
  const now = new Date().toISOString();
  const byId = recordsById(records);
  const candidate = byId.get(recordId);

  if (!candidate) {
    throw new Error(`No memory record found for ${recordId}.`);
  }

  validateStatusTransition(candidate.status, "accepted", options.reason);

  const acceptedSuperseded = candidate.supersedes
    .map((id) => byId.get(id))
    .filter((record): record is MemoryRecord => {
      return record !== undefined
        && record.status === "accepted"
        && record.destination === candidate.destination;
    });
  const acceptedConflicts = candidate.conflicts_with
    .map((id) => byId.get(id))
    .filter((record): record is MemoryRecord => {
      return record !== undefined
        && record.status === "accepted"
        && record.destination === candidate.destination;
    });

  if (acceptedSuperseded.length > 0 && !options.retireSuperseded && !options.overrideRelationships) {
    throw new Error(
      "Accepting this memory requires --retire-superseded or --override-relationships."
    );
  }

  if (acceptedConflicts.length > 0 && !options.overrideRelationships) {
    throw new Error(
      "Accepting this memory requires --override-relationships for accepted conflicts."
    );
  }

  const acceptedCandidate: MemoryRecord = {
    ...candidate,
    status: "accepted",
    status_reason: options.reason,
    updated_at: now
  };
  const retiredIds = new Set(
    options.retireSuperseded ? acceptedSuperseded.map((record) => record.id) : []
  );
  const overrideIds = new Set<string>();
  const statusChanges: RelationshipStatusChange[] = [{
    recordId: acceptedCandidate.id,
    previousStatus: candidate.status,
    nextRecord: acceptedCandidate,
    reason: options.reason,
    createdAt: now
  }];
  const nextRecords = records.map((record) => {
    if (record.id === acceptedCandidate.id) {
      return acceptedCandidate;
    }

    if (retiredIds.has(record.id)) {
      const retired: MemoryRecord = {
        ...record,
        status: "retired",
        status_reason: options.reason,
        updated_at: now
      };

      statusChanges.push({
        recordId: retired.id,
        previousStatus: record.status,
        nextRecord: retired,
        reason: options.reason,
        createdAt: now
      });

      return retired;
    }

    return record;
  });
  const graph = analyzeRelationships(nextRecords);
  const candidateCycleIds = graph.cycles
    .filter((cycle) => cycle.recordIds.includes(candidate.id))
    .filter((cycle) => cycle.recordIds.every((id) => {
      const record = nextRecords.find((nextRecord) => nextRecord.id === id);
      return record?.status === "accepted" && record.destination === candidate.destination;
    }))
    .map((cycle) => cycle.recordIds);

  for (const record of acceptedSuperseded) {
    if (!retiredIds.has(record.id)) {
      overrideIds.add(record.id);
    }
  }

  for (const record of acceptedConflicts) {
    overrideIds.add(record.id);
  }

  for (const cycleIds of candidateCycleIds) {
    for (const id of cycleIds) {
      if (id !== candidate.id) {
        overrideIds.add(id);
      }
    }
  }

  if (candidateCycleIds.length > 0 && !options.overrideRelationships) {
    throw new Error(
      "Accepting this memory would leave an accepted supersession cycle; use --override-relationships."
    );
  }

  const retiredRecords = nextRecords.filter((record) => retiredIds.has(record.id));

  return {
    records: nextRecords,
    record: acceptedCandidate,
    retiredRecords,
    evidence: {
      action: retiredRecords.length > 0 ? "accept_and_retire" : "accept_with_override",
      reason: options.reason,
      retiredRecordIds: retiredRecords.map((record) => record.id),
      overrideRecordIds: [...overrideIds],
      cycleRecordIds: candidateCycleIds
    },
    statusChanges
  };
}

async function appendRelationshipStatusEvents(
  result: RelationshipResolutionWork,
  root: string
): Promise<void> {
  for (const change of result.statusChanges) {
    await appendEvent({
      id: createEventId(),
      type: "memory_status_changed",
      created_at: change.createdAt,
      record_id: change.recordId,
      previous_status: change.previousStatus,
      next_status: change.nextRecord.status,
      reason: change.reason,
      record: change.nextRecord
    }, root);
  }
}

export function exportMarkdown(destination?: string, root?: string): Promise<string>;
export function exportMarkdown(
  destination: string | undefined,
  root: string | undefined,
  options: ExportMarkdownOptions & { dryRun: true }
): Promise<MarkdownExportPreview>;
export function exportMarkdown(
  destination: string | undefined,
  root: string | undefined,
  options: ExportMarkdownOptions
): Promise<string | MarkdownExportPreview>;
export async function exportMarkdown(
  destination = "MEMORY.md",
  root = process.cwd(),
  options: ExportMarkdownOptions = {}
): Promise<string | MarkdownExportPreview> {
  const targetDestination = normalizeLocalFileDestination(destination);
  const adapter = selectExportAdapter(targetDestination);
  const paths = resolveLedgerPaths(root);

  if (options.dryRun === true) {
    await assertReadAccess(paths.root, {
      action: "read",
      surface: "export_preview",
      resource: "export_preview",
      destination: targetDestination
    }, options.readAccess ?? {});
    const plan = await buildMarkdownExportPlan(paths, targetDestination, adapter);
    return markdownExportPreview(plan);
  }

  return withStoreLock(paths.directory, async () => {
    const plan = await buildMarkdownExportPlan(paths, targetDestination, adapter);

    await mkdir(dirname(plan.outputPath), { recursive: true });
    await writeFile(plan.outputPath, plan.content);
    await appendEvent({
      id: createEventId(),
      type: "memory_exported",
      created_at: new Date().toISOString(),
      destination: plan.destination,
      output_path: plan.outputPath,
      record_ids: plan.recordIds
    }, paths.root);
    return plan.outputPath;
  });
}

export async function previewMarkdownExport(
  destination = "MEMORY.md",
  root = process.cwd(),
  readAccess: ReadAccessOptions = {}
): Promise<MarkdownExportPreview> {
  const targetDestination = normalizeLocalFileDestination(destination);
  await assertReadAccess(root, {
    action: "read",
    surface: "export_preview",
    resource: "export_preview",
    destination: targetDestination
  }, readAccess);
  const adapter = selectExportAdapter(targetDestination);
  const paths = resolveLedgerPaths(root);
  const plan = await buildMarkdownExportPlan(paths, targetDestination, adapter);
  return markdownExportPreview(plan);
}

export async function assembleReadContext(
  options: ReadContextOptions = {},
  root = process.cwd()
): Promise<ReadContext> {
  const requestedDestination = options.destination ?? "MEMORY.md";
  const scopes = normalizeScopeFilters(options);
  const permissionConstraint = normalizeReadPermissionConstraint(options, scopes);
  const paths = resolveLedgerPaths(root);
  let targetDestination: string;

  try {
    targetDestination = normalizeLocalFileDestination(requestedDestination);
  } catch {
    return readContextBlocked(reportableDestination(requestedDestination), scopes, {
      code: "invalid_destination",
      message: "Read context assembly blocked by an invalid destination path.",
      recordIds: []
    });
  }

  if (permissionConstraint.supplied && !permissionConstraint.ok) {
    return readContextBlocked(
      targetDestination,
      scopes,
      withPermissionDeniedEvidence(permissionConstraint.issue, targetDestination, scopes)
    );
  }

  const effectiveScopes = permissionConstraint.supplied
    ? permissionConstraint.value.effectiveScopes
    : scopes;

  const readDecision = await evaluateReadAccess(paths.root, {
    action: "read",
    surface: "read_context",
    resource: "context",
    destination: targetDestination,
    scopes: effectiveScopes
  }, options.readAccess ?? {});

  if (!readDecision.ok) {
    return readContextBlocked(targetDestination, effectiveScopes, {
      code: readDecision.code,
      message: `${MEMPR_READ_POLICY_DENIED_MESSAGE} Correlation ID: ${createCorrelationId()}.`,
      recordIds: []
    });
  }

  let records: MemoryRecord[];

  try {
    records = await readRecords(paths);
  } catch {
    return readContextBlocked(targetDestination, effectiveScopes, {
      code: "ledger_read_failed",
      message: "Read context assembly blocked because ledger records could not be read.",
      recordIds: []
    });
  }

  const accepted = records.filter((record) => {
    return record.status === "accepted" && record.destination === targetDestination;
  });
  const issues = readContextIssues(accepted);

  if (issues.length > 0) {
    return {
      ok: false,
      destination: targetDestination,
      scope: displayScope(effectiveScopes),
      scopes: effectiveScopes,
      recordIds: [],
      recordCount: 0,
      records: [],
      issues,
      warnings: permissionConstraint.supplied ? [] : readContextWarnings(accepted)
    };
  }

  const scopedRecords = effectiveScopes.length === 0
    ? accepted
    : accepted.filter((record) => effectiveScopes.includes(record.scope));
  const expiryFilteredRecords = permissionConstraint.supplied
    ? filterRecordsByPermissionExpiry(scopedRecords, permissionConstraint.value.validUntil)
    : scopedRecords;
  const contextRecords = permissionConstraint.supplied
    ? filterRecordsByPermissionRelationships(expiryFilteredRecords, permissionConstraint.value)
    : expiryFilteredRecords;
  const warnings = permissionConstraint.supplied
    ? readContextWarnings(contextRecords)
    : readContextWarnings(accepted);

  return {
    ok: true,
    destination: targetDestination,
    scope: displayScope(effectiveScopes),
    scopes: effectiveScopes,
    recordIds: contextRecords.map((record) => record.id),
    recordCount: contextRecords.length,
    records: contextRecords,
    issues: [],
    warnings
  };
}

export async function assembleContext(
  options: ReadContextOptions = {},
  root = process.cwd()
): Promise<ReadContext> {
  return assembleReadContext(options, root);
}

export async function summarizeReadContextStatus(
  options: ReadContextStatusOptions = {},
  root = process.cwd()
): Promise<ReadContextStatus> {
  const requestedDestination = options.destination;
  const paths = resolveLedgerPaths(root);
  let targetDestination: string | null = null;

  if (requestedDestination !== undefined && requestedDestination !== null) {
    try {
      targetDestination = normalizeLocalFileDestination(requestedDestination);
    } catch {
      const issue: ReadContextIssue = {
        code: "invalid_destination",
        message: "Read context status summary blocked by an invalid destination path.",
        recordIds: []
      };

      return {
        ok: false,
        blocked: true,
        destination: reportableDestination(requestedDestination),
        destinationCount: 1,
        blockedCount: 1,
        warningCount: 0,
        destinations: [
          emptyReadContextDestinationStatus(
            reportableDestination(requestedDestination),
            issue
          )
        ],
        issues: [issue]
      };
    }
  }

  const readDecision = await evaluateReadAccess(paths.root, {
    action: "read",
    surface: "read_context_status",
    resource: "context_status",
    destination: targetDestination
  }, options.readAccess ?? {});

  if (!readDecision.ok) {
    const issue: ReadContextIssue = {
      code: readDecision.code,
      message: `${MEMPR_READ_POLICY_DENIED_MESSAGE} Correlation ID: ${createCorrelationId()}.`,
      recordIds: []
    };

    return {
      ok: false,
      blocked: true,
      destination: targetDestination,
      destinationCount: targetDestination ? 1 : 0,
      blockedCount: targetDestination ? 1 : 0,
      warningCount: 0,
      destinations: targetDestination
        ? [emptyReadContextDestinationStatus(targetDestination, issue)]
        : [],
      issues: [issue]
    };
  }

  let records: MemoryRecord[];

  try {
    records = await readRecords(paths);
  } catch {
    const issue: ReadContextIssue = {
      code: "ledger_read_failed",
      message: "Read context status summary blocked because ledger records could not be read.",
      recordIds: []
    };

    return {
      ok: false,
        blocked: true,
        destination: targetDestination,
        destinationCount: targetDestination ? 1 : 0,
        blockedCount: targetDestination ? 1 : 0,
        warningCount: 0,
        destinations: targetDestination
          ? [emptyReadContextDestinationStatus(targetDestination, issue)]
          : [],
      issues: [issue]
    };
  }

  const destinations = targetDestination
    ? [targetDestination]
    : readContextStatusDestinations(records);
  const summaries = destinations.map((destination) => {
    return summarizeReadContextDestination(destination, records);
  });
  const blockedCount = summaries.filter((summary) => summary.blocked).length;
  const warningCount = summaries.reduce((total, summary) => {
    return total + summary.warnings.length;
  }, 0);

  return {
    ok: blockedCount === 0,
    blocked: blockedCount > 0,
    destination: targetDestination,
    destinationCount: summaries.length,
    blockedCount,
    warningCount,
    destinations: summaries,
    issues: []
  };
}

export async function getReadContextStatus(
  options: ReadContextStatusOptions = {},
  root = process.cwd()
): Promise<ReadContextStatus> {
  return summarizeReadContextStatus(options, root);
}

export async function assembleContextStatus(
  options: ReadContextStatusOptions = {},
  root = process.cwd()
): Promise<ReadContextStatus> {
  return summarizeReadContextStatus(options, root);
}

export async function getContextStatus(
  options: ReadContextStatusOptions = {},
  root = process.cwd()
): Promise<ReadContextStatus> {
  return summarizeReadContextStatus(options, root);
}

export function renderRecord(record: MemoryRecord): string {
  const normalized = normalizeRecord(record);

  return [
    `${normalized.id} [${normalized.status}] ${normalized.memory}`,
    `  scope: ${normalized.scope}`,
    `  risk: ${normalized.risk}`,
    `  source: ${normalized.source.uri}`,
    `  source_trust: ${normalized.source_trust}`,
    `  destination: ${normalized.destination}`,
    `  supersedes: ${formatLinkIds(normalized.supersedes)}`,
    `  conflicts_with: ${formatLinkIds(normalized.conflicts_with)}`,
    `  policy_version: ${normalized.policy_version}`,
    `  decision: ${normalized.decision} (${normalized.decision_reason})`
  ].join("\n");
}

export function renderReviewContext(context: ReviewContext): string {
  return [
    "Review candidate",
    renderReviewRecord(context.candidate),
    "",
    "Supersedes",
    renderRelationshipRecords(context.supersedes),
    "",
    "Conflicts with",
    renderRelationshipRecords(context.conflicts_with),
    "",
    "Incoming superseded by",
    renderRelationshipRecords(context.incoming_superseded_by),
    "",
    "Incoming conflicts with",
    renderRelationshipRecords(context.incoming_conflicts_with),
    "",
    "Supersession cycles",
    renderRelationshipCycles(context.cycles)
  ].join("\n");
}

export function renderRecordHistory(history: RecordHistory): string {
  const lines = [
    "Current record",
    renderRecord(history.record),
    "",
    "Timeline"
  ];

  for (const issue of history.issues) {
    const location = issue.line === undefined ? "" : ` line=${issue.line}`;
    lines.push(`  issue: ${issue.code}: ${issue.message}${location}`);
  }

  if (history.events.length === 0) {
    lines.push("  no events found for this record");
    return lines.join("\n");
  }

  for (const event of history.events) {
    lines.push(renderHistoryEvent(event));
  }

  return lines.join("\n");
}

async function appendRecord(paths: LedgerPaths, record: MemoryRecord): Promise<void> {
  const records = await readRecords(paths);
  records.push(record);
  await writeRecords(paths, records);
}

async function readRecords(paths: LedgerPaths): Promise<MemoryRecord[]> {
  const content = await readOptional(paths.ledgerFile);

  if (!content.trim()) {
    return [];
  }

  return content
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return normalizeRecord(JSON.parse(line) as MemoryRecord);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Malformed ledger record on line ${index + 1}: ${detail}`);
      }
    });
}

async function writeRecords(paths: LedgerPaths, records: MemoryRecord[]): Promise<void> {
  await mkdir(paths.directory, { recursive: true });
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  await atomicWriteFile(paths.ledgerFile, content ? `${content}\n` : "");
}

async function buildMarkdownExportPlan(
  paths: LedgerPaths,
  targetDestination: string,
  adapter: ReturnType<typeof selectExportAdapter>
): Promise<MarkdownExportPlan> {
  const records = await readRecords(paths);
  const accepted = records.filter((record) => {
    return record.status === "accepted" && record.destination === targetDestination;
  });
  const issues = readContextIssues(accepted);

  if (issues.length > 0) {
    throw new Error(formatExportBlockingIssue(issues[0]));
  }

  const outputPath = join(paths.root, targetDestination);
  const destinationFile = await readExistingFile(outputPath);
  const block = adapter.renderManagedBlock(accepted, targetDestination);
  const content = replaceManagedBlock(destinationFile.content, block);
  const recordIds = accepted.map((record) => record.id);
  const warnings = readContextWarnings(accepted);

  return {
    destination: targetDestination,
    outputPath,
    adapterId: adapter.id,
    adapterTitle: adapter.title,
    recordIds,
    recordCount: recordIds.length,
    destinationExists: destinationFile.exists,
    warnings,
    content
  };
}

function markdownExportPreview(plan: MarkdownExportPlan): MarkdownExportPreview {
  return {
    destination: plan.destination,
    outputPath: plan.outputPath,
    adapter: {
      id: plan.adapterId,
      title: plan.adapterTitle
    },
    recordIds: plan.recordIds,
    recordCount: plan.recordCount,
    destinationExists: plan.destinationExists,
    warnings: plan.warnings,
    content: plan.content
  };
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

async function readExistingFile(path: string): Promise<{ exists: boolean; content: string }> {
  try {
    return {
      exists: true,
      content: await readFile(path, "utf8")
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        exists: false,
        content: ""
      };
    }

    throw error;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function consistencyReadOrReplayIssue(error: unknown): LedgerConsistencyIssue {
  const message = error instanceof Error ? error.message : String(error);
  const malformedMatch = /^Malformed event record on line (\d+):/.exec(message);

  if (malformedMatch) {
    return {
      code: "event_malformed",
      message: "Event file contains malformed JSON.",
      line: Number(malformedMatch[1])
    };
  }

  if (
    message.startsWith("Record ")
    || message.startsWith("Invalid memory ")
    || message.startsWith("Invalid policy ")
  ) {
    return {
      code: "event_malformed",
      message: "Event file contains malformed event data."
    };
  }

  if (message.startsWith("Cannot replay") || message.startsWith("Unknown memory event type")) {
    return {
      code: "event_replay_failed",
      message: "Events could not be replayed into ledger records."
    };
  }

  if (message.startsWith("Cannot verify event hash") || message.startsWith("Cannot verify record")) {
    return {
      code: "event_hash_mismatch",
      message: "Event hash-chain verification failed."
    };
  }

  return {
    code: "event_read_failed",
    message: "Event file could not be read."
  };
}

function historyReadIssue(error: unknown): RecordHistoryIssue {
  const message = error instanceof Error ? error.message : String(error);
  const malformedMatch = /^Malformed event record on line (\d+):/.exec(message);

  if (malformedMatch) {
    return {
      code: "event_malformed",
      message: "Event file contains malformed JSON.",
      line: Number(malformedMatch[1])
    };
  }

  if (
    message.startsWith("Record ")
    || message.startsWith("Invalid memory ")
    || message.startsWith("Invalid policy ")
    || message.startsWith("Cannot read properties")
  ) {
    return {
      code: "event_malformed",
      message: "Event file contains malformed event data."
    };
  }

  return {
    code: "event_read_failed",
    message: "Event file could not be read."
  };
}

function compareCurrentToReplay(
  currentRecords: readonly MemoryRecord[],
  replayedRecords: readonly MemoryRecord[]
): LedgerConsistencyIssue | undefined {
  const currentById = recordsById(currentRecords);
  const replayedById = recordsById(replayedRecords);
  const missingFromReplayIds = currentRecords
    .map((record) => record.id)
    .filter((id) => !replayedById.has(id));
  const missingFromLedgerIds = replayedRecords
    .map((record) => record.id)
    .filter((id) => !currentById.has(id));
  const changedRecordIds = currentRecords
    .map((record) => record.id)
    .filter((id) => {
      const replayed = replayedById.get(id);
      return replayed ? stableRecordJson(currentById.get(id)!) !== stableRecordJson(replayed) : false;
    });
  const shownMissingFromReplayIds = limitIds(missingFromReplayIds);
  const shownMissingFromLedgerIds = limitIds(missingFromLedgerIds);
  const shownChangedRecordIds = limitIds(changedRecordIds);
  const rawRecordIdCount = missingFromReplayIds.length
    + missingFromLedgerIds.length
    + changedRecordIds.length;
  const shownRecordIdCount = shownMissingFromReplayIds.length
    + shownMissingFromLedgerIds.length
    + shownChangedRecordIds.length;
  const orderMismatch = currentRecords.length === replayedRecords.length
    && currentRecords.some((record, index) => record.id !== replayedRecords[index]?.id);

  if (
    currentRecords.length === replayedRecords.length
    && missingFromReplayIds.length === 0
    && missingFromLedgerIds.length === 0
    && changedRecordIds.length === 0
    && !orderMismatch
  ) {
    return undefined;
  }

  return {
    code: "ledger_replay_mismatch",
    message: "Current ledger records do not match event replay.",
    currentCount: currentRecords.length,
    replayedCount: replayedRecords.length,
    missingFromReplayIds: shownMissingFromReplayIds,
    missingFromLedgerIds: shownMissingFromLedgerIds,
    changedRecordIds: shownChangedRecordIds,
    omittedRecordIdCount: Math.max(0, rawRecordIdCount - shownRecordIdCount),
    orderMismatch
  };
}

function recordsById(records: readonly MemoryRecord[]): Map<string, MemoryRecord> {
  return new Map(records.map((record) => [record.id, record]));
}

function recordsForRelationship(
  candidate: MemoryRecord,
  byId: ReadonlyMap<string, MemoryRecord>,
  relationship: "supersedes" | "conflicts_with"
): MemoryRecord[] {
  const records: MemoryRecord[] = [];
  const missingIds: string[] = [];

  for (const id of candidate[relationship]) {
    const record = byId.get(id);

    if (record) {
      records.push(record);
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length > 0) {
    throw new Error(
      `Review context for ${candidate.id} references missing ${relationship} id(s): `
        + `${missingIds.join(", ")}.`
    );
  }

  return records;
}

function recordsForIds(
  ids: readonly string[],
  byId: ReadonlyMap<string, MemoryRecord>
): MemoryRecord[] {
  return ids
    .map((id) => byId.get(id))
    .filter((record): record is MemoryRecord => record !== undefined);
}

function stableRecordJson(record: MemoryRecord): string {
  return JSON.stringify(normalizeRecord(record));
}

function limitIds(ids: readonly string[]): string[] {
  return ids.slice(0, MAX_ISSUE_IDS);
}

function summarizeRecordEvents(
  recordId: string,
  events: readonly MemoryEvent[]
): RecordHistoryEvent[] {
  return events
    .map((event, index) => ({
      index,
      summary: summarizeRecordEvent(recordId, event)
    }))
    .filter((entry): entry is { index: number; summary: RecordHistoryEvent } => {
      return entry.summary !== undefined;
    })
    .sort(compareHistoryEntries)
    .map((entry) => entry.summary);
}

function summarizeRecordEvent(
  recordId: string,
  event: MemoryEvent
): RecordHistoryEvent | undefined {
  if (event.type === "memory_proposed") {
    if (event.record_id !== recordId) {
      return undefined;
    }

    return {
      id: event.id,
      type: event.type,
      created_at: event.created_at,
      record_id: event.record_id,
      status: normalizeStatus(event.record.status),
      destination: normalizeRequiredText(
        event.record.destination,
        "Record destination is required."
      )
    };
  }

  if (event.type === "memory_status_changed") {
    if (event.record_id !== recordId) {
      return undefined;
    }

    return {
      id: event.id,
      type: event.type,
      created_at: event.created_at,
      record_id: event.record_id,
      previous_status: normalizeStatus(event.previous_status),
      next_status: normalizeStatus(event.next_status),
      reason: normalizeOptionalText(event.reason) ?? null
    };
  }

  if (event.type === "memory_exported") {
    if (!event.record_ids.includes(recordId)) {
      return undefined;
    }

    return {
      id: event.id,
      type: event.type,
      created_at: event.created_at,
      record_id: recordId,
      destination: event.destination,
      output_path: event.output_path
    };
  }

  if (event.type === "ledger_migrated") {
    if (!event.records.some((record) => record.id === recordId)) {
      return undefined;
    }

    return {
      id: event.id,
      type: event.type,
      created_at: event.created_at,
      record_id: recordId,
      source: event.source,
      record_count: event.record_count
    };
  }

  if (event.type === "memory_relationship_resolved") {
    const relatedIds = new Set([
      event.record_id,
      ...event.retired_record_ids,
      ...event.override_record_ids,
      ...event.cycle_record_ids.flat()
    ]);

    if (!relatedIds.has(recordId)) {
      return undefined;
    }

    return {
      id: event.id,
      type: event.type,
      created_at: event.created_at,
      record_id: recordId,
      action: event.action,
      reason: event.reason,
      retired_record_ids: [...event.retired_record_ids],
      override_record_ids: [...event.override_record_ids],
      cycle_record_ids: event.cycle_record_ids.map((cycle) => [...cycle])
    };
  }

  if (event.type === "memory_live_synced") {
    const outcome = event.outcomes.find((candidate) => candidate.record_id === recordId);

    if (!outcome) {
      return undefined;
    }

    return {
      id: event.id,
      type: event.type,
      created_at: event.created_at,
      record_id: recordId,
      adapter_id: event.adapter_id,
      destination: event.destination,
      status: outcome.status,
      idempotency_key: outcome.idempotency_key,
      downstream_id: outcome.downstream_id,
      attempts: outcome.attempts,
      error_code: outcome.error_code
    };
  }

  return undefined;
}

function compareHistoryEntries(
  left: { index: number; summary: RecordHistoryEvent },
  right: { index: number; summary: RecordHistoryEvent }
): number {
  const leftTime = Date.parse(left.summary.created_at);
  const rightTime = Date.parse(right.summary.created_at);
  const leftSort = Number.isNaN(leftTime) ? Number.POSITIVE_INFINITY : leftTime;
  const rightSort = Number.isNaN(rightTime) ? Number.POSITIVE_INFINITY : rightTime;

  if (leftSort !== rightSort) {
    return leftSort - rightSort;
  }

  return left.index - right.index;
}

function renderHistoryEvent(event: RecordHistoryEvent): string {
  if (event.type === "memory_proposed") {
    return [
      `  - ${event.created_at} memory_proposed`,
      `    status: ${event.status}`,
      `    destination: ${event.destination}`
    ].join("\n");
  }

  if (event.type === "memory_status_changed") {
    return [
      `  - ${event.created_at} memory_status_changed`,
      `    status: ${event.previous_status} -> ${event.next_status}`,
      `    reason: ${event.reason ?? "none"}`
    ].join("\n");
  }

  if (event.type === "memory_exported") {
    return [
      `  - ${event.created_at} memory_exported`,
      `    destination: ${event.destination}`,
      `    output_path: ${event.output_path}`
    ].join("\n");
  }

  if (event.type === "ledger_migrated") {
    return [
      `  - ${event.created_at} ledger_migrated`,
      `    source: ${event.source}`,
      `    migrated_records: ${event.record_count}`
    ].join("\n");
  }

  if (event.type === "memory_relationship_resolved") {
    return [
      `  - ${event.created_at} memory_relationship_resolved`,
      `    action: ${event.action}`,
      `    retired: ${formatLinkIds(event.retired_record_ids)}`,
      `    overrides: ${formatLinkIds(event.override_record_ids)}`,
      `    cycles: ${event.cycle_record_ids.length}`,
      `    reason: ${event.reason}`
    ].join("\n");
  }

  return [
    `  - ${event.created_at} memory_live_synced`,
    `    adapter: ${event.adapter_id}`,
    `    destination: ${event.destination}`,
    `    status: ${event.status}`,
    `    downstream_id: ${event.downstream_id ?? "none"}`,
    `    attempts: ${event.attempts}`
  ].join("\n");
}

function expiredRecordIds(records: readonly MemoryRecord[], now = new Date()): string[] {
  return records
    .filter((record) => isRecordExpired(record, now))
    .map((record) => record.id);
}

function isRecordExpired(record: MemoryRecord, now: Date): boolean {
  return isExpired(record.expires_at, now);
}

function readContextWarnings(
  records: readonly MemoryRecord[],
  now = new Date()
): ReadContextWarning[] {
  const expiryWarnings = records.flatMap((record) => {
    const warning = expiringRecordWarning(record, now);
    return warning ? [warning] : [];
  });
  const scan = scanAcceptedMemoryRecords(records);
  const scanWarnings = scan.warnings.map(scanFindingWarning);

  return [
    ...expiryWarnings,
    ...scanWarnings
  ];
}

function filterRecordsByPermissionExpiry(
  records: readonly MemoryRecord[],
  validUntil: string | null
): MemoryRecord[] {
  if (!validUntil) {
    return [...records];
  }

  const validUntilMs = Date.parse(validUntil);

  return records.filter((record) => {
    if (!record.expires_at) {
      return true;
    }

    return Date.parse(record.expires_at) > validUntilMs;
  });
}

function filterRecordsByPermissionRelationships(
  records: readonly MemoryRecord[],
  constraint: Pick<NormalizedReadPermissionConstraint, "excludeConflicts" | "excludeSupersedes">
): MemoryRecord[] {
  if (!constraint.excludeConflicts && !constraint.excludeSupersedes) {
    return [...records];
  }

  return records.filter((record) => {
    if (constraint.excludeConflicts && record.conflicts_with.length > 0) {
      return false;
    }

    if (constraint.excludeSupersedes && record.supersedes.length > 0) {
      return false;
    }

    return true;
  });
}

function expiringRecordWarning(
  record: MemoryRecord,
  now: Date
): ReadContextWarning | undefined {
  if (!record.expires_at || isRecordExpired(record, now)) {
    return undefined;
  }

  const expiresAtMs = Date.parse(record.expires_at);

  if (Number.isNaN(expiresAtMs)) {
    return undefined;
  }

  const msUntilExpiry = expiresAtMs - now.getTime();
  const daysUntilExpiry = Math.ceil(msUntilExpiry / DAY_IN_MS);

  if (daysUntilExpiry > READ_CONTEXT_STALE_WARNING_DAYS) {
    return undefined;
  }

  return {
    code: "expiring_record",
    message: `Accepted memory record expires within ${READ_CONTEXT_STALE_WARNING_DAYS} day(s).`,
    destination: record.destination,
    recordIds: [record.id],
    expiresAt: record.expires_at,
    daysUntilExpiry: Math.max(0, daysUntilExpiry),
    warningWindowDays: READ_CONTEXT_STALE_WARNING_DAYS
  };
}

function scanFindingWarning(finding: MemoryScanFinding): ReadContextWarning {
  return {
    code: "sensitive_content",
    message: `${finding.message} Correlation ID: ${finding.correlationId}.`,
    destination: finding.destination,
    recordIds: [...finding.recordIds],
    expiresAt: null,
    daysUntilExpiry: null,
    warningWindowDays: null
  };
}

function formatExpiredExportError(recordIds: readonly string[]): string {
  return [
    `Cannot export ${recordIds.length} expired accepted memory record(s).`,
    `Record IDs: ${recordIds.join(", ")}.`
  ].join(" ");
}

function formatExportBlockingIssue(issue: ReadContextIssue): string {
  if (issue.code === "expired_record") {
    return formatExpiredExportError(issue.recordIds);
  }

  if (issue.code === "secret_like_content") {
    return [
      "Cannot export accepted memory records with blocked content.",
      `Record IDs: ${issue.recordIds.join(", ")}.`,
      issue.message
    ].join(" ");
  }

  if (issue.code === "relationship_conflict") {
    return formatRelationshipExportError(
      "conflict",
      "conflicts_with",
      issue.recordIds[0],
      issue.recordIds[1]
    );
  }

  if (issue.code === "relationship_supersession") {
    return formatRelationshipExportError(
      "supersession",
      "supersedes",
      issue.recordIds[0],
      issue.recordIds[1]
    );
  }

  if (issue.code === "relationship_cycle") {
    return [
      "Cannot export accepted memory records with a supersession cycle.",
      `Record IDs: ${issue.recordIds.join(", ")}.`
    ].join(" ");
  }

  return "Cannot export accepted memory records while read-context assembly is blocked.";
}

function readContextBlocked(
  destination: string,
  scopes: readonly string[],
  issue: ReadContextIssue
): ReadContext {
  return {
    ok: false,
    destination,
    scope: displayScope(scopes),
    scopes: [...scopes],
    recordIds: [],
    recordCount: 0,
    records: [],
    issues: [issue],
    warnings: []
  };
}

function emptyReadContextDestinationStatus(
  destination: string,
  issue: ReadContextIssue
): ReadContextDestinationStatus {
  return {
    destination,
    ok: false,
    blocked: true,
    counts: {
      total: 0,
      accepted: 0,
      pending: 0,
      rejected: 0
    },
    acceptedRecordIds: [],
    issues: [issue],
    warnings: []
  };
}

function readContextStatusDestinations(records: readonly MemoryRecord[]): string[] {
  const destinations: string[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.destination)) {
      continue;
    }

    seen.add(record.destination);
    destinations.push(record.destination);
  }

  return destinations.sort();
}

function summarizeReadContextDestination(
  destination: string,
  records: readonly MemoryRecord[]
): ReadContextDestinationStatus {
  const destinationRecords = records.filter((record) => record.destination === destination);
  const accepted = destinationRecords.filter((record) => record.status === "accepted");
  const pending = destinationRecords.filter((record) => record.status === "pending");
  const rejected = destinationRecords.filter((record) => record.status === "rejected");
  const issues = readContextIssues(accepted);
  const warnings = readContextWarnings(accepted);

  return {
    destination,
    ok: issues.length === 0,
    blocked: issues.length > 0,
    counts: {
      total: destinationRecords.length,
      accepted: accepted.length,
      pending: pending.length,
      rejected: rejected.length
    },
    acceptedRecordIds: accepted.map((record) => record.id),
    issues,
    warnings
  };
}

function displayScope(scopes: readonly string[]): string | null {
  return scopes.length === 1 ? scopes[0] : null;
}

function readContextIssues(records: readonly MemoryRecord[]): ReadContextIssue[] {
  const expiredIds = expiredRecordIds(records);
  const scan = scanAcceptedMemoryRecords(records);
  const issues: ReadContextIssue[] = [];

  if (expiredIds.length > 0) {
    issues.push({
      code: "expired_record",
      message: `Read context assembly blocked by ${expiredIds.length} expired accepted memory record(s).`,
      recordIds: expiredIds
    });
  }

  issues.push(...readContextRelationshipIssues(records));
  issues.push(...scan.issues.map(scanFindingIssue));
  return issues;
}

function scanFindingIssue(finding: MemoryScanFinding): ReadContextIssue {
  return {
    code: "secret_like_content",
    message: `${finding.message} Correlation ID: ${finding.correlationId}.`,
    recordIds: [...finding.recordIds]
  };
}

function readContextRelationshipIssues(records: readonly MemoryRecord[]): ReadContextIssue[] {
  const acceptedIds = new Set(records.map((record) => record.id));
  const issues: ReadContextIssue[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    for (const linkedRecordId of record.conflicts_with) {
      if (acceptedIds.has(linkedRecordId)) {
        pushReadContextRelationshipIssue(
          issues,
          seen,
          "relationship_conflict",
          "conflicts_with",
          record.id,
          linkedRecordId
        );
      }
    }

    for (const linkedRecordId of record.supersedes) {
      if (acceptedIds.has(linkedRecordId)) {
        pushReadContextRelationshipIssue(
          issues,
          seen,
          "relationship_supersession",
          "supersedes",
          record.id,
          linkedRecordId
        );
      }
    }
  }

  for (const cycle of analyzeRelationships(records).cycles) {
    pushReadContextCycleIssue(issues, seen, cycle.recordIds);
  }

  return issues;
}

function pushReadContextRelationshipIssue(
  issues: ReadContextIssue[],
  seen: Set<string>,
  code: "relationship_conflict" | "relationship_supersession",
  relationship: "conflicts_with" | "supersedes",
  recordId: string,
  linkedRecordId: string
): void {
  const key = [
    code,
    ...[recordId, linkedRecordId].sort()
  ].join(":");

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  issues.push({
    code,
    message: `Read context assembly blocked by accepted ${relationship} relationship.`,
    recordIds: [recordId, linkedRecordId],
    relationship
  });
}

function pushReadContextCycleIssue(
  issues: ReadContextIssue[],
  seen: Set<string>,
  recordIds: readonly string[]
): void {
  const key = [
    "relationship_cycle",
    ...recordIds
  ].join(":");

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  issues.push({
    code: "relationship_cycle",
    message: "Read context assembly blocked by accepted supersession cycle.",
    recordIds: [...recordIds],
    relationship: "supersedes"
  });
}

function assertNoBlockingExportRelationships(records: readonly MemoryRecord[]): void {
  const acceptedIds = new Set(records.map((record) => record.id));

  for (const record of records) {
    const linkedRecordId = record.conflicts_with.find((id) => acceptedIds.has(id));

    if (linkedRecordId) {
      throw new Error(
        formatRelationshipExportError("conflict", "conflicts_with", record.id, linkedRecordId)
      );
    }
  }

  for (const record of records) {
    const linkedRecordId = record.supersedes.find((id) => acceptedIds.has(id));

    if (linkedRecordId) {
      throw new Error(
        formatRelationshipExportError("supersession", "supersedes", record.id, linkedRecordId)
      );
    }
  }
}

function formatRelationshipExportError(
  relationship: "conflict" | "supersession",
  fieldName: "conflicts_with" | "supersedes",
  recordId: string,
  linkedRecordId: string
): string {
  return [
    `Cannot export accepted memory records with a ${relationship} relationship (${fieldName}).`,
    `Record IDs: ${recordId}, ${linkedRecordId}.`
  ].join(" ");
}

function createMemoryRecord(
  input: NormalizedProposalInput,
  policy: PolicyResult
): MemoryRecord {
  const now = new Date().toISOString();
  const source: { type: MemorySourceType; uri: string; quote?: string } = {
    type: normalizeSourceType(input.sourceType, input.source),
    uri: input.source,
    quote: input.quote
  };

  if (source.quote === undefined) {
    delete source.quote;
  }

  return normalizeRecord({
    id: createId(),
    memory: input.memory,
    source,
    source_trust: input.sourceTrust,
    scope: input.scope,
    risk: policy.risk,
    decision: policy.decision,
    decision_reason: policy.reason,
    policy_version: policy.policyVersion,
    destination: input.destination,
    status: statusFromDecision(policy.decision),
    ttl: input.ttl,
    expires_at: input.expires_at,
    supersedes: input.supersedes,
    conflicts_with: input.conflictsWith,
    created_at: now,
    updated_at: now
  });
}

function normalizeProposalInput(input: ProposeMemoryInput): NormalizedProposalInput {
  const memory = normalizeRequiredText(input.memory, "Memory text is required.");
  const source = normalizeOptionalText(input.source) ?? "manual";
  const expiry = normalizeExpiry(input.ttl);

  return {
    memory,
    source,
    sourceType: input.sourceType,
    sourceTrust: normalizeSourceTrust(input.sourceTrust),
    quote: normalizeOptionalText(input.quote),
    scope: normalizeOptionalText(input.scope) ?? "user",
    risk: input.risk,
    destination: normalizeOptionalText(input.destination) ?? "MEMORY.md",
    ttl: expiry.ttl,
    expires_at: expiry.expires_at,
    supersedes: normalizeLinkIds(input.supersedes, "supersedes"),
    conflictsWith: normalizeLinkIds(input.conflictsWith, "conflicts_with")
  };
}

function normalizeRecord(record: MemoryRecord): MemoryRecord {
  const sourceUri = normalizeRequiredText(record.source.uri, "Record source uri is required.");
  const quote = normalizeOptionalText(record.source.quote);
  const expiry = normalizeExpiry(record.ttl, record.expires_at);
  const source: { type: MemorySourceType; uri: string; quote?: string } = {
    type: normalizeSourceType(record.source.type, sourceUri),
    uri: sourceUri,
    quote
  };

  if (source.quote === undefined) {
    delete source.quote;
  }

  const normalized: MemoryRecord = {
    id: normalizeRequiredText(record.id, "Record id is required."),
    memory: normalizeRequiredText(record.memory, "Record memory is required."),
    source,
    source_trust: normalizeSourceTrust(record.source_trust),
    scope: normalizeRequiredText(record.scope, "Record scope is required."),
    risk: normalizeRisk(record.risk),
    decision: normalizeDecision(record.decision),
    decision_reason: normalizeRequiredText(
      record.decision_reason,
      "Record decision reason is required."
    ),
    policy_version: normalizePolicyVersion(record.policy_version),
    destination: normalizeRequiredText(record.destination, "Record destination is required."),
    status: normalizeStatus(record.status),
    status_reason: normalizeOptionalText(record.status_reason) ?? null,
    ttl: expiry.ttl,
    expires_at: expiry.expires_at,
    supersedes: normalizeLinkIds(record.supersedes, "supersedes"),
    conflicts_with: normalizeLinkIds(record.conflicts_with, "conflicts_with"),
    created_at: normalizeRequiredText(record.created_at, "Record created_at is required."),
    updated_at: normalizeRequiredText(record.updated_at, "Record updated_at is required.")
  };

  return normalized;
}

function statusFromDecision(decision: PolicyDecision): MemoryStatus {
  if (decision === "auto_accept") {
    return "accepted";
  }

  if (decision === "reject") {
    return "rejected";
  }

  return "pending";
}

function validateStatusTransition(
  currentStatus: MemoryStatus,
  nextStatus: MemoryStatus,
  reason: string | undefined
): void {
  if (currentStatus === nextStatus) {
    return;
  }

  if (currentStatus === "pending" && (nextStatus === "accepted" || nextStatus === "rejected")) {
    if (!reason) {
      throw new Error("A reason is required to review a pending memory.");
    }

    return;
  }

  if (currentStatus === "accepted" && nextStatus === "rejected") {
    if (!reason) {
      throw new Error("A reason is required to reject an accepted memory.");
    }

    return;
  }

  if (currentStatus === "rejected" && nextStatus === "accepted") {
    if (!reason) {
      throw new Error("A reason is required to accept a rejected memory.");
    }

    return;
  }

  if (currentStatus === "accepted" && nextStatus === "retired") {
    if (!reason) {
      throw new Error("A reason is required to retire an accepted memory.");
    }

    return;
  }

  throw new Error(`Cannot change memory status from ${currentStatus} to ${nextStatus}.`);
}

function normalizeSourceType(
  sourceType: string | null | undefined,
  source: string
): MemorySourceType {
  const normalized = normalizeOptionalText(sourceType);

  if (normalized && isOneOf(MEMORY_SOURCE_TYPES, normalized)) {
    return normalized;
  }

  if (normalized) {
    return "other";
  }

  return inferSourceType(source);
}

function normalizeSourceTrust(value: unknown): MemorySourceTrust {
  if (value === null || value === undefined) {
    return "unknown";
  }

  if (isOneOf(MEMORY_SOURCE_TRUST, value)) {
    return value;
  }

  throw new Error("Invalid memory source trust.");
}

function normalizePolicyVersion(value: unknown): string {
  if (value === null || value === undefined) {
    return UNKNOWN_POLICY_VERSION;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  throw new Error("Invalid policy version.");
}

function inferSourceType(source: string): MemorySourceType {
  if (!source) {
    return "manual";
  }

  if (source === "manual") {
    return "manual";
  }

  if (source === "conversation") {
    return "conversation";
  }

  if (source.startsWith("http://") || source.startsWith("https://")) {
    return "url";
  }

  return "file";
}

function normalizeRisk(risk: MemoryRisk): MemoryRisk {
  if (isOneOf(MEMORY_RISKS, risk)) {
    return risk;
  }

  throw new Error(`Invalid memory risk: ${String(risk)}.`);
}

function normalizeStatus(status: MemoryStatus): MemoryStatus {
  if (isOneOf(MEMORY_STATUSES, status)) {
    return status;
  }

  throw new Error(`Invalid memory status: ${String(status)}.`);
}

function normalizeDecision(decision: PolicyDecision): PolicyDecision {
  if (isOneOf(POLICY_DECISIONS, decision)) {
    return decision;
  }

  throw new Error(`Invalid policy decision: ${String(decision)}.`);
}

function normalizeRequiredText(value: string, message: string): string {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function normalizeLinkIds(value: unknown, fieldName: string): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  const rawIds = typeof value === "string"
    ? value.split(",")
    : Array.isArray(value)
      ? value
      : invalidLinkIds(fieldName, "must be a string or array of strings.");
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawId of rawIds) {
    if (typeof rawId !== "string") {
      invalidLinkIds(fieldName, "must contain only strings.");
    }

    const id = normalizeOptionalText(rawId);

    if (!id) {
      invalidLinkIds(fieldName, "cannot contain empty memory ids.");
    }

    if (!seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  }

  return normalized;
}

function invalidLinkIds(fieldName: string, detail: string): never {
  throw new Error(`Invalid ${fieldName}: ${detail}`);
}

function validateProposalReferences(
  input: NormalizedProposalInput,
  records: readonly MemoryRecord[]
): void {
  const existingIds = new Set(records.map((record) => record.id));
  const conflicts = new Set(input.conflictsWith);

  for (const id of input.supersedes) {
    if (conflicts.has(id)) {
      throw new Error(
        "Invalid memory links: the same id cannot be both superseded and conflicting."
      );
    }
  }

  validateKnownLinks(input.supersedes, existingIds, "supersedes");
  validateKnownLinks(input.conflictsWith, existingIds, "conflicts_with");
}

function validateKnownLinks(
  ids: readonly string[],
  existingIds: ReadonlySet<string>,
  fieldName: string
): void {
  if (ids.some((id) => !existingIds.has(id))) {
    throw new Error(`Unknown memory id in ${fieldName}.`);
  }
}

function reviewLinkedAutoAccept(
  policy: PolicyResult,
  input: NormalizedProposalInput
): PolicyResult {
  if (
    policy.decision !== "auto_accept"
    || (input.supersedes.length === 0 && input.conflictsWith.length === 0)
  ) {
    return policy;
  }

  return {
    ...policy,
    risk: policy.risk === "low" ? "medium" : policy.risk,
    decision: "review",
    reason: "Supersession or conflict metadata requires reviewer confirmation."
  };
}

function formatLinkIds(ids: readonly string[]): string {
  return ids.length > 0 ? ids.join(", ") : "none";
}

function renderRelationshipRecords(records: readonly MemoryRecord[]): string {
  if (records.length === 0) {
    return "  none";
  }

  return records.map(renderReviewRecord).join("\n");
}

function renderRelationshipCycles(cycles: readonly RelationshipCycle[]): string {
  if (cycles.length === 0) {
    return "  none";
  }

  return cycles.map((cycle) => {
    return `  ${cycle.relationship}: ${cycle.recordIds.join(" -> ")} -> ${cycle.recordIds[0]}`;
  }).join("\n");
}

function renderReviewRecord(record: MemoryRecord): string {
  const normalized = normalizeRecord(record);

  return [
    `  ${normalized.id} [${normalized.status}]`,
    `    destination: ${normalized.destination}`,
    `    memory: ${normalized.memory}`
  ].join("\n");
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeScopeFilters(options: ReadContextOptions): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const scope of rawScopeFilters(options)) {
    const value = normalizeOptionalText(scope);

    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function normalizeReadPermissionConstraint(
  options: ReadContextOptions,
  requestedScopes: readonly string[]
): ReadPermissionConstraintResult {
  const input = readPermissionConstraintInput(options);

  if (!input.supplied) {
    return { supplied: false };
  }

  const constraint = input.value;
  const actor = isObjectRecord(constraint)
    ? normalizeUnknownText(constraint.actor)
    : undefined;

  if (!actor) {
    return {
      supplied: true,
      ok: false,
      issue: readPermissionScopeIssue(
        "read_permission_missing_actor",
        "Read context assembly blocked because the supplied read constraint is missing an actor label."
      )
    };
  }

  const allowedScopes = isObjectRecord(constraint)
    ? normalizeScopeList(constraint.allowedScopes)
    : [];

  if (allowedScopes.length === 0) {
    return {
      supplied: true,
      ok: false,
      issue: readPermissionScopeIssue(
        "read_permission_missing_allowed_scopes",
        "Read context assembly blocked because the supplied read constraint has no allowed scopes."
      )
    };
  }

  const allowed = new Set(allowedScopes);
  const deniedScopes = requestedScopes.filter((scope) => !allowed.has(scope));

  if (deniedScopes.length > 0) {
    return {
      supplied: true,
      ok: false,
      issue: readPermissionScopeIssue(
        "invalid_scope",
        "Read context assembly blocked because a requested scope is outside the supplied allowed scopes."
      )
    };
  }

  const validUntilInput = isObjectRecord(constraint) ? constraint.validUntil : undefined;
  const validUntilResult = normalizePermissionValidUntil(validUntilInput);

  if (!validUntilResult.ok) {
    return {
      supplied: true,
      ok: false,
      issue: readPermissionScopeIssue(
        "read_permission_invalid_expiry_constraint",
        "Read context assembly blocked because the supplied read expiry constraint is invalid."
      )
    };
  }

  const relationshipConstraintResult = normalizePermissionRelationshipConstraint(constraint);

  if (!relationshipConstraintResult.ok) {
    return {
      supplied: true,
      ok: false,
      issue: readPermissionScopeIssue(
        "read_permission_invalid_relationship_constraint",
        "Read context assembly blocked because the supplied read relationship constraint is invalid."
      )
    };
  }

  return {
    supplied: true,
    ok: true,
    value: {
      actor,
      allowedScopes,
      effectiveScopes: requestedScopes.length > 0 ? [...requestedScopes] : allowedScopes,
      validUntil: validUntilResult.value,
      excludeConflicts: relationshipConstraintResult.excludeConflicts,
      excludeSupersedes: relationshipConstraintResult.excludeSupersedes
    }
  };
}

function readPermissionConstraintInput(
  options: ReadContextOptions
): { supplied: false } | { supplied: true; value: unknown } {
  const record = options as Record<string, unknown>;
  const keys = ["readPermission", "permission", "readPermissionConstraint"] as const;

  if (
    Object.hasOwn(record, "actor")
    || Object.hasOwn(record, "allowedScopes")
  ) {
    return {
      supplied: true,
      value: {
        actor: record.actor,
        allowedScopes: record.allowedScopes
      }
    };
  }

  for (const key of keys) {
    if (Object.hasOwn(record, key)) {
      return {
        supplied: true,
        value: record[key]
      };
    }
  }

  return { supplied: false };
}

function normalizePermissionValidUntil(
  value: unknown
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined) {
    return {
      ok: true,
      value: null
    };
  }

  if (typeof value !== "string" || !normalizeOptionalText(value)) {
    return { ok: false };
  }

  try {
    return {
      ok: true,
      value: normalizeExpiry(value).expires_at
    };
  } catch {
    return { ok: false };
  }
}

function normalizePermissionRelationshipConstraint(
  constraint: unknown
): { ok: true; excludeConflicts: boolean; excludeSupersedes: boolean } | { ok: false } {
  if (!isObjectRecord(constraint)) {
    return {
      ok: true,
      excludeConflicts: false,
      excludeSupersedes: false
    };
  }

  const excludeConflicts = normalizePermissionRelationshipFlag(
    constraint,
    "excludeConflicts"
  );
  const excludeSupersedes = normalizePermissionRelationshipFlag(
    constraint,
    "excludeSupersedes"
  );

  if (!excludeConflicts.ok || !excludeSupersedes.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    excludeConflicts: excludeConflicts.value,
    excludeSupersedes: excludeSupersedes.value
  };
}

function normalizePermissionRelationshipFlag(
  constraint: Record<string, unknown>,
  key: "excludeConflicts" | "excludeSupersedes"
): { ok: true; value: boolean } | { ok: false } {
  if (!Object.hasOwn(constraint, key) || constraint[key] === undefined) {
    return {
      ok: true,
      value: false
    };
  }

  if (typeof constraint[key] !== "boolean") {
    return { ok: false };
  }

  return {
    ok: true,
    value: constraint[key]
  };
}

function normalizeScopeList(value: unknown): string[] {
  const rawScopes = typeof value === "string"
    ? value.split(",")
    : Array.isArray(value)
      ? value
      : [];
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawScope of rawScopes) {
    if (typeof rawScope !== "string") {
      return [];
    }

    const scope = normalizeOptionalText(rawScope);

    if (!scope || seen.has(scope)) {
      continue;
    }

    seen.add(scope);
    normalized.push(scope);
  }

  return normalized;
}

function normalizeUnknownText(value: unknown): string | undefined {
  return typeof value === "string" ? normalizeOptionalText(value) : undefined;
}

function readPermissionScopeIssue(
  code: ReadContextPermissionIssueCode,
  message: string
): ReadContextIssue {
  return {
    code,
    message,
    recordIds: []
  };
}

function withPermissionDeniedEvidence(
  issue: ReadContextIssue,
  destination: string,
  scopes: readonly string[]
): ReadContextIssue {
  if (!isReadPermissionDeniedIssue(issue.code)) {
    return issue;
  }

  return {
    ...issue,
    metadata: {
      action: "read",
      surface: "read_context",
      resource: "context",
      destination,
      scopes: [...scopes],
      contractVersion: READ_PERMISSION_CONTRACT_VERSION,
      contentReturned: false,
      sideEffects: "none"
    }
  };
}

function isReadPermissionDeniedIssue(
  code: ReadContextIssueCode
): code is ReadContextPermissionIssueCode {
  return (
    code === "read_permission_missing_actor"
    || code === "read_permission_missing_allowed_scopes"
    || code === "read_permission_invalid_expiry_constraint"
    || code === "read_permission_invalid_relationship_constraint"
    || code === "invalid_scope"
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rawScopeFilters(options: ReadContextOptions): string[] {
  return [
    ...scopeFilterValues(options.scopes),
    ...scopeFilterValues(options.scope)
  ];
}

function scopeFilterValues(value: string | readonly string[] | null | undefined): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return value.split(",");
  }

  return [...value];
}

function reportableDestination(value: string): string {
  return value.trim();
}

function isOneOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function createId(): string {
  return `mem_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

interface NormalizedProposalInput {
  memory: string;
  source: string;
  sourceType?: string;
  sourceTrust: MemorySourceTrust;
  quote?: string;
  scope: string;
  risk?: MemoryRisk;
  destination: string;
  ttl: string | null;
  expires_at: string | null;
  supersedes: string[];
  conflictsWith: string[];
}
