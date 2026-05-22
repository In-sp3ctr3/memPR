import { readFile, writeFile } from "node:fs/promises";
import {
  createEventId,
  readEvents,
  replayEvents,
  resolveEventPaths
} from "./events.js";
import type { LedgerConsistencyIssue } from "./ledger.js";
import { checkLedgerConsistency, resolveLedgerPaths } from "./ledger.js";
import { withStoreLock } from "./storage.js";
import { normalizeExpiry } from "./ttl.js";
import {
  MEMORY_RISKS,
  MEMORY_SOURCE_TRUST,
  MEMORY_SOURCE_TYPES,
  MEMORY_STATUSES,
  POLICY_DECISIONS
} from "./types.js";
import type { LedgerPaths, MemoryRecord, MemorySourceTrust } from "./types.js";

export interface LedgerMigrationOptions {
  dryRun?: boolean;
}

export type LedgerMigrationReason =
  | "empty_ledger"
  | "event_history_matches_ledger"
  | "event_history_drift"
  | "event_write_failed"
  | "ledger_malformed"
  | "migrated"
  | "would_migrate";

export type LedgerMigrationIssueCode =
  | "duplicate_record_id"
  | "event_history_drift"
  | "event_hash_mismatch"
  | "event_malformed"
  | "event_read_failed"
  | "event_replay_failed"
  | "event_write_failed"
  | "ledger_malformed"
  | "ledger_read_failed"
  | "ledger_replay_mismatch";

export interface LedgerMigrationIssue {
  code: LedgerMigrationIssueCode;
  message: string;
  line?: number;
  currentCount?: number;
  replayedCount?: number | null;
  recordIds?: string[];
  omittedRecordIdCount?: number;
  orderMismatch?: boolean;
}

export interface LedgerMigrationResult {
  root: string;
  dryRun: boolean;
  changed: boolean;
  wouldChange: boolean;
  reason: LedgerMigrationReason;
  ledgerCount: number;
  eventCount: number | null;
  migratedCount: number;
  issues: LedgerMigrationIssue[];
}

const MAX_REPORTED_IDS = 20;
const UNKNOWN_POLICY_VERSION = "unknown";

export async function migrateLedgerEvents(
  root = process.cwd(),
  options: LedgerMigrationOptions = {}
): Promise<LedgerMigrationResult> {
  const paths = resolveLedgerPaths(root);
  const dryRun = options.dryRun === true;

  const existingHistory = await assessExistingHistory(paths.root, dryRun);

  if (existingHistory) {
    return existingHistory;
  }

  if (dryRun) {
    return assessEmptyHistoryMigration(paths, dryRun);
  }

  return withStoreLock(paths.directory, async () => {
      const lockedHistory = await assessExistingHistory(paths.root, dryRun);

      if (lockedHistory) {
        return lockedHistory;
      }

      const assessed = await assessEmptyHistoryMigration(paths, dryRun);

      if (!assessed.wouldChange) {
        return assessed;
      }

      const ledger = await readLegacyLedger(paths);

      if (ledger.issue) {
        return result(paths.root, dryRun, false, false, "ledger_malformed", {
          ledgerCount: 0,
          eventCount: 0,
          migratedCount: 0,
          issues: [ledger.issue]
        });
      }

      const duplicates = duplicateRecordIds(ledger.records);

      if (duplicates.length > 0) {
        return result(paths.root, dryRun, false, false, "ledger_malformed", {
          ledgerCount: ledger.records.length,
          eventCount: 0,
          migratedCount: 0,
          issues: [{
            code: "duplicate_record_id",
            message: "Legacy ledger contains duplicate record ids.",
            recordIds: limitIds(duplicates),
            omittedRecordIdCount: Math.max(0, duplicates.length - MAX_REPORTED_IDS)
          }]
        });
      }

      const migrationEvent = {
        id: createEventId(),
        type: "ledger_migrated" as const,
        created_at: new Date().toISOString(),
        source: "legacy_ledger_jsonl" as const,
        record_count: ledger.records.length,
        records: ledger.records
      };

      try {
        replayEvents([migrationEvent]);
        await writeFile(
          resolveEventPaths(paths.root).eventFile,
          `${JSON.stringify(migrationEvent)}\n`,
          "utf8"
        );
      } catch {
        return result(paths.root, dryRun, false, true, "event_write_failed", {
          ledgerCount: ledger.records.length,
          eventCount: 0,
          migratedCount: 0,
          issues: [{
            code: "event_write_failed",
            message: "Migration event could not be written."
          }]
        });
      }

      return result(paths.root, dryRun, true, true, "migrated", {
        ledgerCount: ledger.records.length,
        eventCount: 1,
        migratedCount: ledger.records.length,
        issues: []
      });
  });
}

async function assessExistingHistory(
  root: string,
  dryRun: boolean
): Promise<LedgerMigrationResult | undefined> {
  const paths = resolveLedgerPaths(root);
  let eventContent: string;

  try {
    eventContent = await readOptional(resolveEventPaths(root).eventFile);
  } catch {
    return result(paths.root, dryRun, false, false, "event_history_drift", {
      ledgerCount: 0,
      eventCount: null,
      migratedCount: 0,
      issues: [{
        code: "event_read_failed",
        message: "Event history could not be read."
      }]
    });
  }

  if (!eventContent.trim()) {
    return undefined;
  }

  let eventCount: number | null = null;

  try {
    eventCount = (await readEvents(root)).length;
  } catch {
    eventCount = null;
  }

  const consistency = await checkLedgerConsistency(root);

  if (consistency.ok) {
    return result(paths.root, dryRun, false, false, "event_history_matches_ledger", {
      ledgerCount: consistency.currentCount,
      eventCount,
      migratedCount: 0,
      issues: []
    });
  }

  return result(paths.root, dryRun, false, false, "event_history_drift", {
    ledgerCount: consistency.currentCount,
    eventCount,
    migratedCount: 0,
    issues: consistency.issues.map(fromConsistencyIssue)
  });
}

async function assessEmptyHistoryMigration(
  paths: LedgerPaths,
  dryRun: boolean
): Promise<LedgerMigrationResult> {
  const ledger = await readLegacyLedger(paths);

  if (ledger.issue) {
    return result(paths.root, dryRun, false, false, "ledger_malformed", {
      ledgerCount: 0,
      eventCount: 0,
      migratedCount: 0,
      issues: [ledger.issue]
    });
  }

  const duplicates = duplicateRecordIds(ledger.records);

  if (duplicates.length > 0) {
    return result(paths.root, dryRun, false, false, "ledger_malformed", {
      ledgerCount: ledger.records.length,
      eventCount: 0,
      migratedCount: 0,
      issues: [{
        code: "duplicate_record_id",
        message: "Legacy ledger contains duplicate record ids.",
        recordIds: limitIds(duplicates),
        omittedRecordIdCount: Math.max(0, duplicates.length - MAX_REPORTED_IDS)
      }]
    });
  }

  if (ledger.records.length === 0) {
    return result(paths.root, dryRun, false, false, "empty_ledger", {
      ledgerCount: 0,
      eventCount: 0,
      migratedCount: 0,
      issues: []
    });
  }

  return result(paths.root, dryRun, false, true, dryRun ? "would_migrate" : "migrated", {
    ledgerCount: ledger.records.length,
    eventCount: 0,
    migratedCount: dryRun ? 0 : ledger.records.length,
    issues: []
  });
}

async function readLegacyLedger(
  paths: LedgerPaths
): Promise<{ records: MemoryRecord[]; issue?: undefined } | { records?: undefined; issue: LedgerMigrationIssue }> {
  let content: string;

  try {
    content = await readOptional(paths.ledgerFile);
  } catch {
    return {
      issue: {
        code: "ledger_read_failed",
        message: "Legacy ledger could not be read."
      }
    };
  }

  if (!content.trim()) {
    return { records: [] };
  }

  const records: MemoryRecord[] = [];
  const lines = content.split("\n").filter(Boolean);

  for (const [index, line] of lines.entries()) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      return {
        issue: {
          code: "ledger_malformed",
          message: "Legacy ledger contains malformed JSON.",
          line: index + 1
        }
      };
    }

    const validated = validateMemoryRecord(parsed, index + 1);

    if (validated.issue) {
      return {
        issue: validated.issue
      };
    }

    records.push(validated.record);
  }

  return { records };
}

function validateMemoryRecord(
  value: unknown,
  line: number
): { record: MemoryRecord; issue?: undefined } | { record?: undefined; issue: LedgerMigrationIssue } {
  if (!isRecordObject(value)) {
    return malformedRecord(line);
  }

  const source = value.source;

  if (!isRecordObject(source)) {
    return malformedRecord(line);
  }

  if (
    !isNonEmptyString(value.id)
    || !isNonEmptyString(value.memory)
    || !isNonEmptyString(source.uri)
    || !isOneOf(MEMORY_SOURCE_TYPES, source.type)
    || !isNonEmptyString(value.scope)
    || !isOneOf(MEMORY_RISKS, value.risk)
    || !isOneOf(POLICY_DECISIONS, value.decision)
    || !isNonEmptyString(value.decision_reason)
    || !isNonEmptyString(value.destination)
    || !isOneOf(MEMORY_STATUSES, value.status)
    || !isNullableString(value.status_reason)
    || !isNullableString(value.ttl)
    || (value.expires_at !== undefined && !isNullableString(value.expires_at))
    || !isOptionalStringArray(value.supersedes)
    || !isOptionalStringArray(value.conflicts_with)
    || !isNonEmptyString(value.created_at)
    || !isNonEmptyString(value.updated_at)
    || !isNullableString(source.quote)
  ) {
    return malformedRecord(line);
  }

  const quote = normalizeOptionalRecordText(source.quote);
  const normalizedSource: MemoryRecord["source"] = {
    type: source.type,
    uri: normalizeRequiredRecordText(source.uri)
  } as MemoryRecord["source"];

  if (quote !== undefined) {
    normalizedSource.quote = quote;
  }

  let sourceTrust: MemorySourceTrust;
  let policyVersion: string;

  try {
    sourceTrust = normalizeSourceTrust(value.source_trust);
    policyVersion = normalizePolicyVersion(value.policy_version);
  } catch {
    return malformedRecord(line);
  }

  let expiry: ReturnType<typeof normalizeExpiry>;
  let supersedes: string[];
  let conflictsWith: string[];

  try {
    expiry = normalizeExpiry(value.ttl, value.expires_at);
    supersedes = normalizeLinkIds(value.supersedes);
    conflictsWith = normalizeLinkIds(value.conflicts_with);
    validateNoLinkOverlap(supersedes, conflictsWith);
  } catch {
    return malformedRecord(line);
  }

  return {
    record: {
      id: normalizeRequiredRecordText(value.id),
      memory: normalizeRequiredRecordText(value.memory),
      source: normalizedSource,
      source_trust: sourceTrust,
      scope: normalizeRequiredRecordText(value.scope),
      risk: value.risk,
      decision: value.decision,
      decision_reason: normalizeRequiredRecordText(value.decision_reason),
      policy_version: policyVersion,
      destination: normalizeRequiredRecordText(value.destination),
      status: value.status,
      status_reason: normalizeOptionalRecordText(value.status_reason) ?? null,
      ttl: expiry.ttl,
      expires_at: expiry.expires_at,
      supersedes,
      conflicts_with: conflictsWith,
      created_at: normalizeRequiredRecordText(value.created_at),
      updated_at: normalizeRequiredRecordText(value.updated_at)
    } as MemoryRecord
  };
}

function malformedRecord(line: number): { issue: LedgerMigrationIssue } {
  return {
    issue: {
      code: "ledger_malformed",
      message: "Legacy ledger contains malformed record data.",
      line
    }
  };
}

function fromConsistencyIssue(issue: LedgerConsistencyIssue): LedgerMigrationIssue {
  const recordIds = [
    ...(issue.missingFromReplayIds ?? []),
    ...(issue.missingFromLedgerIds ?? []),
    ...(issue.changedRecordIds ?? [])
  ];

  return {
    code: normalizeConsistencyIssueCode(issue.code),
    message: issue.message,
    line: issue.line,
    currentCount: issue.currentCount,
    replayedCount: issue.replayedCount,
    recordIds: recordIds.length > 0 ? limitIds(recordIds) : undefined,
    omittedRecordIdCount: issue.omittedRecordIdCount,
    orderMismatch: issue.orderMismatch
  };
}

function normalizeConsistencyIssueCode(code: LedgerConsistencyIssue["code"]): LedgerMigrationIssueCode {
  if (code === "event_file_missing") {
    return "event_history_drift";
  }

  return code;
}

function duplicateRecordIds(records: readonly MemoryRecord[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const record of records) {
    if (seen.has(record.id)) {
      duplicates.add(record.id);
    }

    seen.add(record.id);
  }

  return [...duplicates];
}

function result(
  root: string,
  dryRun: boolean,
  changed: boolean,
  wouldChange: boolean,
  reason: LedgerMigrationReason,
  details: Omit<LedgerMigrationResult, "root" | "dryRun" | "changed" | "wouldChange" | "reason">
): LedgerMigrationResult {
  return {
    root,
    dryRun,
    changed,
    wouldChange,
    reason,
    ...details
  };
}

function limitIds(ids: readonly string[]): string[] {
  return ids.slice(0, MAX_REPORTED_IDS);
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

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function normalizeRequiredRecordText(value: unknown): string {
  return String(value).trim();
}

function normalizeOptionalRecordText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSourceTrust(value: unknown): MemorySourceTrust {
  if (value === null || value === undefined) {
    return "unknown";
  }

  if (isOneOf(MEMORY_SOURCE_TRUST, value)) {
    return value;
  }

  throw new Error("Invalid legacy memory source trust.");
}

function normalizePolicyVersion(value: unknown): string {
  if (value === null || value === undefined) {
    return UNKNOWN_POLICY_VERSION;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  throw new Error("Invalid legacy policy version.");
}

function normalizeLinkIds(value: string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawId of value) {
    const id = normalizeOptionalRecordText(rawId);

    if (!id) {
      throw new Error("Invalid legacy memory link id.");
    }

    if (!seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  }

  return normalized;
}

function validateNoLinkOverlap(supersedes: readonly string[], conflictsWith: readonly string[]): void {
  const conflicts = new Set(conflictsWith);

  for (const id of supersedes) {
    if (conflicts.has(id)) {
      throw new Error("Invalid legacy memory links.");
    }
  }
}

function isOneOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}
