import {
  readEvents
} from "./events.js";
import type { MemoryEvent } from "./events.js";
import {
  normalizeRequiredText,
  normalizeStatus
} from "./ledger-records.js";
import {
  readRecords,
  resolveLedgerPaths
} from "./ledger-store.js";
import {
  formatLinkIds,
  renderRecord
} from "./ledger-renderers.js";
import { sanitizeStringValueForBoundary } from "./safety.js";
import { assertReadAccess } from "./read-policy.js";
import type { ReadAccessOptions } from "./read-policy.js";
import { normalizeOptionalText } from "./text-normalization.js";
import type {
  MemoryRecord,
  MemoryStatus
} from "./types.js";

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

export function renderRecordHistory(history: RecordHistory): string {
  const lines = [
    "Current record",
    renderRecord(history.record),
    "",
    "Timeline"
  ];

  for (const issue of history.issues) {
    const location = issue.line === undefined ? "" : ` line=${issue.line}`;
    lines.push(`  issue: ${safeValue(issue.code)}: ${safeValue(issue.message)}${location}`);
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
      destination: event.destination
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
      `  - ${safeValue(event.created_at)} memory_proposed`,
      `    status: ${safeValue(event.status)}`,
      `    destination: ${safeValue(event.destination)}`
    ].join("\n");
  }

  if (event.type === "memory_status_changed") {
    return [
      `  - ${safeValue(event.created_at)} memory_status_changed`,
      `    status: ${safeValue(event.previous_status)} -> ${safeValue(event.next_status)}`,
      `    reason: ${safeValue(event.reason ?? "none")}`
    ].join("\n");
  }

  if (event.type === "memory_exported") {
    return [
      `  - ${safeValue(event.created_at)} memory_exported`,
      `    destination: ${safeValue(event.destination)}`
    ].join("\n");
  }

  if (event.type === "ledger_migrated") {
    return [
      `  - ${safeValue(event.created_at)} ledger_migrated`,
      `    source: ${safeValue(event.source)}`,
      `    migrated_records: ${event.record_count}`
    ].join("\n");
  }

  if (event.type === "memory_relationship_resolved") {
    return [
      `  - ${safeValue(event.created_at)} memory_relationship_resolved`,
      `    action: ${safeValue(event.action)}`,
      `    retired: ${formatLinkIds(event.retired_record_ids)}`,
      `    overrides: ${formatLinkIds(event.override_record_ids)}`,
      `    cycles: ${event.cycle_record_ids.length}`,
      `    reason: ${safeValue(event.reason)}`
    ].join("\n");
  }

  return [
    `  - ${safeValue(event.created_at)} memory_live_synced`,
    `    adapter: ${safeValue(event.adapter_id)}`,
    `    destination: ${safeValue(event.destination)}`,
    `    status: ${safeValue(event.status)}`,
    `    downstream_id: ${safeValue(event.downstream_id ?? "none")}`,
    `    attempts: ${event.attempts}`
  ].join("\n");
}

function safeValue(value: string): string {
  return sanitizeStringValueForBoundary(value);
}
