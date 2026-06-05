import {
  appendEvent,
  createEventId
} from "./events.js";
import { MemoryProposalBlockedError } from "./errors.js";
import { loadPolicyConfig } from "./policy-config.js";
import { classifyMemory } from "./policy.js";
import { hashJson } from "./hash.js";
import { verifyMemorySource } from "./provenance.js";
import { normalizeReviewer } from "./memory-model.js";
import {
  assertNoPersistentSecretLikeContent,
  reviewPersistentSecretFields
} from "./persistence-safety.js";
import { createBlockedProposalAudit } from "./proposal-audit.js";
import {
  createMemoryRecord,
  normalizeProposalInput,
  normalizeRecord,
  normalizeRequiredText,
  normalizeRisk,
  normalizeSourceType,
  normalizeStatus,
  reviewLinkedAutoAccept,
  validateProposalReferences,
  validateStatusTransition
} from "./ledger-records.js";
import {
  readRecords,
  resolveLedgerPaths,
  writeRecords
} from "./ledger-store.js";
import {
  assertReadAccess
} from "./read-policy.js";
import type { ReadAccessOptions } from "./read-policy.js";
import { withStoreLock } from "./storage.js";
import { normalizeOptionalText } from "./text-normalization.js";
import type {
  LedgerPaths,
  ListFilters,
  MemoryRecord,
  MemoryStatus,
  ProposeMemoryInput
} from "./types.js";

export { resolveLedgerPaths } from "./ledger-store.js";
export { checkLedgerConsistency, repairLedgerFromEvents } from "./ledger-consistency.js";
export { exportMarkdown, previewMarkdownExport } from "./ledger-export.js";
export { getRecordHistory, renderRecordHistory } from "./ledger-history.js";
export { renderRecord, renderReviewContext } from "./ledger-renderers.js";
export {
  acceptMemoryWithRelationships,
  analyzeRelationshipGraph,
  getReviewContext
} from "./relationship-review.js";
export type {
  LedgerConsistencyIssue,
  LedgerConsistencyIssueCode,
  LedgerConsistencyStatus,
  LedgerRepairOptions,
  LedgerRepairResult
} from "./ledger-consistency.js";
export type {
  ExportMarkdownOptions,
  MarkdownExportPreview
} from "./ledger-export.js";
export type {
  RecordHistory,
  RecordHistoryEvent,
  RecordHistoryExportedEvent,
  RecordHistoryIssue,
  RecordHistoryIssueCode,
  RecordHistoryLiveSyncedEvent,
  RecordHistoryMigratedEvent,
  RecordHistoryProposedEvent,
  RecordHistoryRelationshipResolvedEvent,
  RecordHistoryStatusChangedEvent
} from "./ledger-history.js";
export type {
  RelationshipResolutionEvidence,
  RelationshipResolutionOptions,
  RelationshipResolutionResult,
  ReviewContext
} from "./relationship-review.js";
export {
  assembleContext,
  assembleContextStatus,
  assembleReadContext,
  getContextStatus,
  getReadContextStatus,
  summarizeReadContextStatus
} from "./read-context.js";
export type {
  ContextMemoryRecord,
  ReadContext,
  ReadContextDestinationStatus,
  ReadContextIssue,
  ReadContextIssueCode,
  ReadContextOptions,
  ReadContextStatus,
  ReadContextStatusCounts,
  ReadContextStatusOptions,
  ReadContextWarning,
  ReadContextWarningCode
} from "./read-context.js";

export async function proposeMemory(
  input: ProposeMemoryInput,
  root = process.cwd()
): Promise<MemoryRecord> {
  const paths = resolveLedgerPaths(root);
  const normalizedInput = normalizeProposalInput(input);
  const policyConfig = await loadPolicyConfig(paths.root);
  const earlyPolicy = classifyMemory(normalizedInput, policyConfig);

  if (earlyPolicy.decision === "block_no_persist") {
    throwBlockedProposal(normalizedInput, earlyPolicy);
  }

  return withStoreLock(paths.directory, async () => {
    const records = await readRecords(paths);
    validateProposalReferences(normalizedInput, records);
    normalizedInput.sourceVerification = await verifyMemorySource({
      root: paths.root,
      sourceType: normalizeSourceType(normalizedInput.sourceType, normalizedInput.source),
      sourceUri: normalizedInput.source,
      quote: normalizedInput.quote,
      sourceLineStart: normalizedInput.sourceLineStart,
      sourceLineEnd: normalizedInput.sourceLineEnd,
      sourceHash: normalizedInput.sourceHash,
      gitCommit: normalizedInput.gitCommit,
      verifySource: normalizedInput.verifySource
    });
    const classified = classifyMemory(normalizedInput, policyConfig);
    const policy = reviewLinkedAutoAccept(classified, normalizedInput);

    if (policy.decision === "block_no_persist") {
      throwBlockedProposal(normalizedInput, policy);
    }

    const record = createMemoryRecord(normalizedInput, policy);

    await appendEvent({
      id: createEventId(),
      type: "memory_proposed",
      created_at: record.created_at,
      record_id: record.id,
      record,
      policy_config_hash: hashJson(policyConfig)
    }, paths.root);
    await writeRecords(paths, [...records, record]);
    return record;
  });
}

function throwBlockedProposal(
  normalizedInput: ReturnType<typeof normalizeProposalInput>,
  policy: ReturnType<typeof classifyMemory>
): never {
  const audit = createBlockedProposalAudit(normalizedInput, policy);

  throw new MemoryProposalBlockedError(audit);
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

export interface StatusReviewOptions {
  reviewer?: string | null;
}

export async function updateRecordStatus(
  id: string,
  status: MemoryStatus,
  reason: string | undefined,
  root = process.cwd(),
  options: StatusReviewOptions = {}
): Promise<MemoryRecord> {
  const paths = resolveLedgerPaths(root);
  return withStoreLock(paths.directory, async () => {
    const nextStatus = normalizeStatus(status);
    const statusReason = normalizeOptionalText(reason);
    const reviewer = normalizeReviewer(options.reviewer);
    assertNoPersistentSecretLikeContent(
      reviewPersistentSecretFields({ reason: statusReason, reviewer }),
      "Review metadata contains secret-like content."
    );
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
        reviewer: nextStatus === "accepted" && reviewer ? reviewer : record.reviewer,
        approved_by: nextStatus === "accepted" && reviewer ? reviewer : record.approved_by,
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

    await writeRecords(paths, nextRecords);

    return updated;
  });
}
