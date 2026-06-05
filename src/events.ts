import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { hashJson, withoutHashFields } from "./hash.js";
import {
  assertNoPersistentSecretLikeContent,
  memoryRecordStringFields
} from "./persistence-safety.js";
import {
  safeAppendStoreFile,
  safeReadOptionalStoreFile
} from "./store-paths.js";
import type { MemoryRecord, MemoryStatus } from "./types.js";

const EVENT_DIR = ".mempr";
const EVENT_FILE = "events.jsonl";

export interface EventPaths {
  root: string;
  directory: string;
  eventFile: string;
}

export type MemoryEvent =
  | MemoryProposedEvent
  | MemoryProposalBlockedEvent
  | MemoryStatusChangedEvent
  | MemoryExportedEvent
  | LedgerMigratedEvent
  | MemoryRelationshipResolvedEvent
  | MemoryLiveSyncedEvent;

export interface MemoryEventIntegrity {
  schema_version?: "mempr-event-v2" | string;
  previous_event_hash?: string | null;
  event_hash?: string;
  record_hash?: string;
  records_hash?: string;
  policy_config_hash?: string;
}

export interface MemoryProposedEvent extends MemoryEventIntegrity {
  id: string;
  type: "memory_proposed";
  created_at: string;
  record_id: string;
  record: MemoryRecord;
}

export interface MemoryProposalBlockedEvent extends MemoryEventIntegrity {
  id: string;
  type: "memory_proposal_blocked";
  created_at: string;
  reason: string;
  policy_version: string;
  risk: "high";
  decision: "block_no_persist";
  scope: string;
  scope_hash?: string;
  scope_preview?: string;
  destination: string;
  destination_hash?: string;
  destination_preview?: string;
  source_type: string;
  source_trust: string;
  memory_hash: string;
  memory_preview: string;
  source_uri_hash?: string;
  source_uri_preview?: string;
  quote_hash?: string;
  quote_preview?: string;
  policy_config_hash?: string;
}

export interface MemoryStatusChangedEvent extends MemoryEventIntegrity {
  id: string;
  type: "memory_status_changed";
  created_at: string;
  record_id: string;
  previous_status: MemoryStatus;
  next_status: MemoryStatus;
  reason: string | null;
  record: MemoryRecord;
}

export interface MemoryExportedEvent extends MemoryEventIntegrity {
  id: string;
  type: "memory_exported";
  created_at: string;
  destination: string;
  record_ids: string[];
}

export interface MemoryRelationshipResolvedEvent extends MemoryEventIntegrity {
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

export interface MemoryLiveSyncedEvent extends MemoryEventIntegrity {
  id: string;
  type: "memory_live_synced";
  created_at: string;
  adapter_id: string;
  adapter_title: string;
  destination: string;
  dry_run: false;
  status: "succeeded" | "partial_failure" | "failed";
  record_ids: string[];
  outcomes: MemoryLiveSyncEventOutcome[];
}

export interface MemoryLiveSyncEventOutcome {
  record_id: string;
  status: "skipped" | "succeeded" | "failed";
  idempotency_key: string;
  downstream_id: string | null;
  attempts: number;
  error_code?: string;
}

export interface LedgerMigratedEvent extends MemoryEventIntegrity {
  id: string;
  type: "ledger_migrated";
  created_at: string;
  source: "legacy_ledger_jsonl";
  record_count: number;
  records: MemoryRecord[];
}

export function resolveEventPaths(root = process.cwd()): EventPaths {
  const resolvedRoot = resolve(root);

  return {
    root: resolvedRoot,
    directory: join(resolvedRoot, EVENT_DIR),
    eventFile: join(resolvedRoot, EVENT_DIR, EVENT_FILE)
  };
}

export function createEventId(): string {
  return `evt_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

export async function appendEvent(
  event: MemoryEvent,
  root = process.cwd()
): Promise<void> {
  assertNoPersistentSecretLikeContent(
    memoryRecordStringFields(event),
    "Memory event contains unsafe persistent content."
  );
  const paths = resolveEventPaths(root);
  const enriched = await withIntegrityMetadata(event, paths.root);
  await safeAppendStoreFile(paths.root, EVENT_FILE, `${JSON.stringify(enriched)}\n`);
}

export async function readEvents(root = process.cwd()): Promise<MemoryEvent[]> {
  const paths = resolveEventPaths(root);
  const file = await safeReadOptionalStoreFile(paths.root, EVENT_FILE);
  const content = file.exists ? file.content : "";

  if (!content.trim()) {
    return [];
  }

  return content
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as MemoryEvent;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Malformed event record on line ${index + 1}: ${detail}`);
      }
    });
}

export function replayEvents(events: readonly MemoryEvent[]): MemoryRecord[] {
  const recordsById = new Map<string, MemoryRecord>();

  for (const event of events) {
    if (event.type === "ledger_migrated") {
      if (recordsById.size > 0) {
        throw new Error("Cannot replay ledger migration after memory records already exist.");
      }

      if (event.source !== "legacy_ledger_jsonl") {
        throw new Error("Cannot replay ledger migration from unknown source.");
      }

      if (event.record_count !== event.records.length) {
        throw new Error("Cannot replay ledger migration with mismatched record count.");
      }

      for (const record of event.records) {
        if (recordsById.has(record.id)) {
          throw new Error(`Cannot replay ledger migration with duplicate record ${record.id}.`);
        }

        recordsById.set(record.id, record);
      }

      continue;
    }

    if (event.type === "memory_proposed") {
      if (recordsById.has(event.record_id)) {
        throw new Error(`Cannot replay duplicate proposal for record ${event.record_id}.`);
      }

      if (event.record.id !== event.record_id) {
        throw new Error(`Cannot replay proposal with mismatched record id ${event.record_id}.`);
      }

      recordsById.set(event.record_id, event.record);
      continue;
    }

    if (event.type === "memory_proposal_blocked") {
      continue;
    }

    if (event.type === "memory_status_changed") {
      const previous = recordsById.get(event.record_id);

      if (!previous) {
        throw new Error(`Cannot replay status change for unknown record ${event.record_id}.`);
      }

      if (previous.status !== event.previous_status) {
        throw new Error(
          `Cannot replay status change for ${event.record_id}: expected previous status ${previous.status}, got ${event.previous_status}.`
        );
      }

      if (event.record.status !== event.next_status) {
        throw new Error(
          `Cannot replay status change for ${event.record_id}: event record status does not match next status.`
        );
      }

      if ((event.record.status_reason ?? null) !== event.reason) {
        throw new Error(
          `Cannot replay status change for ${event.record_id}: event record reason does not match event reason.`
        );
      }

      recordsById.set(event.record_id, event.record);
      continue;
    }

    if (event.type === "memory_exported") {
      for (const recordId of event.record_ids) {
        if (!recordsById.has(recordId)) {
          throw new Error(`Cannot replay export for unknown record ${recordId}.`);
        }
      }

      continue;
    }

    if (event.type === "memory_relationship_resolved") {
      if (!recordsById.has(event.record_id)) {
        throw new Error(`Cannot replay relationship resolution for unknown record ${event.record_id}.`);
      }

      for (const recordId of [
        ...event.retired_record_ids,
        ...event.override_record_ids,
        ...event.cycle_record_ids.flat()
      ]) {
        if (!recordsById.has(recordId)) {
          throw new Error(`Cannot replay relationship resolution for unknown record ${recordId}.`);
        }
      }

      continue;
    }

    if (event.type === "memory_live_synced") {
      for (const recordId of event.record_ids) {
        if (!recordsById.has(recordId)) {
          throw new Error(`Cannot replay live sync for unknown record ${recordId}.`);
        }
      }

      continue;
    }

    const unknownType = (event as { type?: unknown }).type;
    throw new Error(`Unknown memory event type: ${String(unknownType)}.`);
  }

  return [...recordsById.values()];
}

export function verifyEventIntegrity(events: readonly MemoryEvent[]): void {
  let previousHash: string | null = null;

  for (const event of events) {
    if (!event.event_hash) {
      continue;
    }

    if ((event.previous_event_hash ?? null) !== previousHash) {
      throw new Error(`Cannot verify event hash chain at ${event.id}.`);
    }

    const expectedEventHash = eventHash(event);

    if (event.event_hash !== expectedEventHash) {
      throw new Error(`Cannot verify event hash for ${event.id}.`);
    }

    if ("record" in event && event.record_hash && event.record_hash !== hashJson(event.record)) {
      throw new Error(`Cannot verify record hash for ${event.id}.`);
    }

    if ("records" in event && event.records_hash && event.records_hash !== hashJson(event.records)) {
      throw new Error(`Cannot verify records hash for ${event.id}.`);
    }

    previousHash = event.event_hash;
  }
}

async function withIntegrityMetadata(
  event: MemoryEvent,
  root: string
): Promise<MemoryEvent> {
  const previous_event_hash = await latestEventHash(root);
  const enriched = addContentHashes({
    ...event,
    schema_version: event.schema_version ?? "mempr-event-v2",
    previous_event_hash
  } as MemoryEvent);

  return {
    ...enriched,
    event_hash: eventHash(enriched)
  } as MemoryEvent;
}

function addContentHashes(event: MemoryEvent): MemoryEvent {
  if ("record" in event) {
    return {
      ...event,
      record_hash: hashJson(event.record)
    };
  }

  if ("records" in event) {
    return {
      ...event,
      records_hash: hashJson(event.records)
    };
  }

  return event;
}

function eventHash(event: MemoryEvent): string {
  return hashJson(withoutHashFields(event));
}

async function latestEventHash(root: string): Promise<string | null> {
  const file = await safeReadOptionalStoreFile(root, EVENT_FILE);
  const content = file.exists ? file.content : "";

  if (!content.trim()) {
    return null;
  }

  const lastLine = content.split("\n").filter(Boolean).at(-1);

  if (!lastLine) {
    return null;
  }

  try {
    const event = JSON.parse(lastLine) as MemoryEvent;
    return event.event_hash ?? null;
  } catch {
    throw new Error("Cannot append event because existing event history is malformed.");
  }
}
