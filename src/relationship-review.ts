import {
  appendEvent,
  createEventId
} from "./events.js";
import { normalizeReviewer } from "./memory-model.js";
import {
  assertNoPersistentSecretLikeContent,
  reviewPersistentSecretFields
} from "./persistence-safety.js";
import {
  analyzeRelationships,
  filterRelationshipAnalysis
} from "./relationships.js";
import type {
  RelationshipCycle,
  RelationshipGraphAnalysis,
  RelationshipReferenceSet
} from "./relationships.js";
import {
  normalizeRequiredText,
  validateStatusTransition
} from "./ledger-records.js";
import {
  readRecords,
  resolveLedgerPaths,
  writeRecords
} from "./ledger-store.js";
import { assertReadAccess } from "./read-policy.js";
import type { ReadAccessOptions } from "./read-policy.js";
import { withStoreLock } from "./storage.js";
import type {
  MemoryRecord,
  MemoryStatus
} from "./types.js";

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
  reviewer?: string | null;
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

interface NormalizedRelationshipResolutionOptions {
  reason: string;
  retireSuperseded: boolean;
  overrideRelationships: boolean;
  reviewer: string | null;
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
    const reviewer = normalizeReviewer(options.reviewer);
    assertNoPersistentSecretLikeContent(
      reviewPersistentSecretFields({ reason, reviewer }),
      "Relationship review metadata contains secret-like content."
    );
    const records = await readRecords(paths);
    const result = resolveRelationshipAcceptance(records, recordId, {
      reason,
      retireSuperseded: options.retireSuperseded === true,
      overrideRelationships: options.overrideRelationships === true,
      reviewer
    });

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
    await writeRecords(paths, result.records);

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

function resolveRelationshipAcceptance(
  records: readonly MemoryRecord[],
  recordId: string,
  options: NormalizedRelationshipResolutionOptions
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
    reviewer: options.reviewer ?? candidate.reviewer,
    approved_by: options.reviewer ?? candidate.approved_by,
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
