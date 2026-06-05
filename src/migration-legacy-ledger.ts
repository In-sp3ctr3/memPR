import { normalizeLocalFileDestination } from "./export-adapters.js";
import {
  normalizeReviewer,
  normalizeStoredMemoryModel
} from "./memory-model.js";
import {
  hasPersistentSecretLikeContent,
  memoryRecordStringFields
} from "./persistence-safety.js";
import { normalizeMemorySourceVerification } from "./provenance.js";
import { safeReadOptionalStoreFile } from "./store-paths.js";
import { normalizeExpiry } from "./ttl.js";
import {
  MEMORY_RISKS,
  MEMORY_SOURCE_TRUST,
  MEMORY_SOURCE_TYPES,
  MEMORY_STATUSES,
  POLICY_DECISIONS
} from "./types.js";
import type {
  LedgerPaths,
  MemoryRecord,
  MemorySourceTrust
} from "./types.js";
import type { LedgerMigrationIssue } from "./migration-types.js";

export const MAX_REPORTED_MIGRATION_IDS = 20;
const UNKNOWN_POLICY_VERSION = "unknown";

export async function readLegacyLedger(
  paths: LedgerPaths
): Promise<{ records: MemoryRecord[]; issue?: undefined } | { records?: undefined; issue: LedgerMigrationIssue }> {
  let content: string;

  try {
    const file = await safeReadOptionalStoreFile(paths.root, "ledger.jsonl");
    content = file.exists ? file.content : "";
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

export function duplicateRecordIds(records: readonly MemoryRecord[]): string[] {
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

export function limitMigrationIds(ids: readonly string[]): string[] {
  return ids.slice(0, MAX_REPORTED_MIGRATION_IDS);
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
    || !isLegacyOrCurrentPolicyDecision(value.decision)
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
    uri: normalizeRequiredRecordText(source.uri),
    verification: normalizeMemorySourceVerification(source.verification)
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
  let model: ReturnType<typeof normalizeStoredMemoryModel>;

  try {
    expiry = normalizeExpiry(value.ttl, value.expires_at);
    supersedes = normalizeLinkIds(value.supersedes);
    conflictsWith = normalizeLinkIds(value.conflicts_with);
    validateNoLinkOverlap(supersedes, conflictsWith);
    model = normalizeStoredMemoryModel(value);
  } catch {
    return malformedRecord(line);
  }

  let destination: string;

  try {
    destination = normalizeLocalFileDestination(normalizeRequiredRecordText(value.destination));
  } catch {
    return invalidRecordDestination(line);
  }

  const record: MemoryRecord = {
    schema_version: "mempr-record-v1",
    id: normalizeRequiredRecordText(value.id),
    memory: normalizeRequiredRecordText(value.memory),
    source: normalizedSource,
    source_trust: sourceTrust,
    scope: normalizeRequiredRecordText(value.scope),
    kind: model.kind,
    tags: model.tags,
    confidence: model.confidence,
    risk: value.risk,
    decision: normalizePolicyDecision(value.decision),
    decision_reason: normalizeRequiredRecordText(value.decision_reason),
    policy_version: policyVersion,
    destination,
    status: value.status,
    status_reason: normalizeOptionalRecordText(value.status_reason) ?? null,
    reviewer: normalizeReviewer(value.reviewer),
    approved_by: normalizeReviewer(value.approved_by),
    last_verified_at: normalizeOptionalRecordText(value.last_verified_at) ?? null,
    last_used_at: normalizeOptionalRecordText(value.last_used_at) ?? null,
    retention_class: model.retention_class,
    priority: model.priority,
    applies_to_paths: model.applies_to_paths,
    ttl: expiry.ttl,
    expires_at: expiry.expires_at,
    supersedes,
    conflicts_with: conflictsWith,
    created_at: normalizeRequiredRecordText(value.created_at),
    updated_at: normalizeRequiredRecordText(value.updated_at)
  };

  if (hasPersistentSecretLikeContent(memoryRecordStringFields(record))) {
    return secretRecordData(line);
  }

  return { record };
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

function invalidRecordDestination(line: number): { issue: LedgerMigrationIssue } {
  return {
    issue: {
      code: "invalid_record_destination",
      message: "Legacy ledger contains an invalid record destination.",
      line
    }
  };
}

function secretRecordData(line: number): { issue: LedgerMigrationIssue } {
  return {
    issue: {
      code: "ledger_malformed",
      message: "Legacy ledger contains secret-like record data.",
      line
    }
  };
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

function isLegacyOrCurrentPolicyDecision(value: unknown): value is MemoryRecord["decision"] | "reject" {
  return value === "reject" || isOneOf(POLICY_DECISIONS, value);
}

function normalizePolicyDecision(value: MemoryRecord["decision"] | "reject"): MemoryRecord["decision"] {
  return value === "reject" ? "reject_audited" : value;
}
