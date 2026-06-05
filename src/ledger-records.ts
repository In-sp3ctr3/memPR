import { randomBytes } from "node:crypto";
import { normalizeLocalFileDestination } from "./export-adapters.js";
import { normalizeMemorySourceVerification } from "./provenance.js";
import {
  normalizeMemoryModelInput,
  normalizeReviewer,
  normalizeStoredMemoryModel
} from "./memory-model.js";
import { normalizeOptionalText } from "./text-normalization.js";
import { isExpired, normalizeExpiry } from "./ttl.js";
import {
  MEMORY_RISKS,
  MEMORY_SOURCE_TRUST,
  MEMORY_SOURCE_TYPES,
  MEMORY_STATUSES,
  POLICY_DECISIONS
} from "./types.js";
import type {
  MemoryRecord,
  MemoryRisk,
  MemorySourceTrust,
  MemorySourceType,
  MemorySourceVerification,
  MemoryStatus,
  PolicyDecision,
  PolicyResult,
  ProposeMemoryInput
} from "./types.js";

const UNKNOWN_POLICY_VERSION = "unknown";

export interface NormalizedProposalInput {
  memory: string;
  source: string;
  sourceType?: string;
  sourceTrust: MemorySourceTrust;
  quote?: string;
  sourceLineStart?: number;
  sourceLineEnd?: number;
  sourceHash?: string;
  gitCommit?: string;
  verifySource?: boolean;
  sourceVerification?: MemorySourceVerification;
  scope: string;
  kind: MemoryRecord["kind"];
  tags: string[];
  confidence: number | null;
  retention_class: string | null;
  priority: number | null;
  applies_to_paths: string[];
  risk?: MemoryRisk;
  destination: string;
  ttl: string | null;
  expires_at: string | null;
  supersedes: string[];
  conflictsWith: string[];
}

export function createMemoryRecord(
  input: NormalizedProposalInput,
  policy: PolicyResult
): MemoryRecord {
  const now = new Date().toISOString();
  const lastVerifiedAt = input.sourceVerification?.status === "verified" ? now : null;
  const source: {
    type: MemorySourceType;
    uri: string;
    quote?: string;
    verification?: MemorySourceVerification;
  } = {
    type: normalizeSourceType(input.sourceType, input.source),
    uri: input.source,
    quote: input.quote,
    verification: input.sourceVerification
  };

  if (source.quote === undefined) {
    delete source.quote;
  }

  return normalizeRecord({
    schema_version: "mempr-record-v1",
    id: createId(),
    memory: input.memory,
    source,
    source_trust: input.sourceTrust,
    scope: input.scope,
    kind: input.kind,
    tags: input.tags,
    confidence: input.confidence,
    risk: policy.risk,
    decision: policy.decision,
    decision_reason: policy.reason,
    policy_version: policy.policyVersion,
    destination: input.destination,
    status: statusFromDecision(policy.decision),
    reviewer: null,
    approved_by: null,
    last_verified_at: lastVerifiedAt,
    last_used_at: null,
    retention_class: input.retention_class,
    priority: input.priority,
    applies_to_paths: input.applies_to_paths,
    ttl: input.ttl,
    expires_at: input.expires_at,
    supersedes: input.supersedes,
    conflicts_with: input.conflictsWith,
    created_at: now,
    updated_at: now
  });
}

export function normalizeProposalInput(input: ProposeMemoryInput): NormalizedProposalInput {
  const memory = normalizeRequiredText(input.memory, "Memory text is required.");
  const source = normalizeOptionalText(input.source) ?? "manual";
  const expiry = normalizeExpiry(input.ttl);
  const model = normalizeMemoryModelInput(input);

  return {
    memory,
    source,
    sourceType: input.sourceType,
    sourceTrust: normalizeSourceTrust(input.sourceTrust),
    quote: normalizeOptionalText(input.quote),
    sourceLineStart: input.sourceLineStart,
    sourceLineEnd: input.sourceLineEnd,
    sourceHash: normalizeSourceHash(input.sourceHash),
    gitCommit: normalizeOptionalText(input.gitCommit),
    verifySource: input.verifySource,
    scope: normalizeOptionalText(input.scope) ?? "user",
    kind: model.kind,
    tags: model.tags,
    confidence: model.confidence,
    retention_class: model.retention_class,
    priority: model.priority,
    applies_to_paths: model.applies_to_paths,
    risk: input.risk,
    destination: normalizeLocalFileDestination(
      normalizeOptionalText(input.destination) ?? "MEMORY.md"
    ),
    ttl: expiry.ttl,
    expires_at: expiry.expires_at,
    supersedes: normalizeLinkIds(input.supersedes, "supersedes"),
    conflictsWith: normalizeLinkIds(input.conflictsWith, "conflicts_with")
  };
}

export function normalizeRecord(record: MemoryRecord): MemoryRecord {
  const sourceUri = normalizeRequiredText(record.source.uri, "Record source uri is required.");
  const quote = normalizeOptionalText(record.source.quote);
  const expiry = normalizeExpiry(record.ttl, record.expires_at);
  const model = normalizeStoredMemoryModel(record);
  const source: {
    type: MemorySourceType;
    uri: string;
    quote?: string;
    verification?: MemorySourceVerification;
  } = {
    type: normalizeSourceType(record.source.type, sourceUri),
    uri: sourceUri,
    quote,
    verification: normalizeMemorySourceVerification(record.source.verification)
  };

  if (source.quote === undefined) {
    delete source.quote;
  }

  return {
    schema_version: "mempr-record-v1",
    id: normalizeRequiredText(record.id, "Record id is required."),
    memory: normalizeRequiredText(record.memory, "Record memory is required."),
    source,
    source_trust: normalizeSourceTrust(record.source_trust),
    scope: normalizeRequiredText(record.scope, "Record scope is required."),
    kind: model.kind,
    tags: model.tags,
    confidence: model.confidence,
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
    reviewer: normalizeReviewer(record.reviewer),
    approved_by: normalizeReviewer(record.approved_by),
    last_verified_at: normalizeOptionalText(record.last_verified_at) ?? null,
    last_used_at: normalizeOptionalText(record.last_used_at) ?? null,
    retention_class: model.retention_class,
    priority: model.priority,
    applies_to_paths: model.applies_to_paths,
    ttl: expiry.ttl,
    expires_at: expiry.expires_at,
    supersedes: normalizeLinkIds(record.supersedes, "supersedes"),
    conflicts_with: normalizeLinkIds(record.conflicts_with, "conflicts_with"),
    created_at: normalizeRequiredText(record.created_at, "Record created_at is required."),
    updated_at: normalizeRequiredText(record.updated_at, "Record updated_at is required.")
  };
}

export function normalizeRequiredText(value: string, message: string): string {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

export function normalizeRisk(risk: MemoryRisk): MemoryRisk {
  if (isOneOf(MEMORY_RISKS, risk)) {
    return risk;
  }

  throw new Error(`Invalid memory risk: ${String(risk)}.`);
}

export function normalizeStatus(status: MemoryStatus): MemoryStatus {
  if (isOneOf(MEMORY_STATUSES, status)) {
    return status;
  }

  throw new Error(`Invalid memory status: ${String(status)}.`);
}

export function normalizeSourceType(
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

export function validateStatusTransition(
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

export function validateProposalReferences(
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

export function reviewLinkedAutoAccept(
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

export function isRecordExpired(record: MemoryRecord, now = new Date()): boolean {
  return isExpired(record.expires_at, now);
}

function statusFromDecision(decision: PolicyDecision): MemoryStatus {
  if (decision === "auto_accept") {
    return "accepted";
  }

  if (decision === "reject_audited") {
    return "rejected";
  }

  if (decision === "review") {
    return "pending";
  }

  throw new Error("Blocked proposals do not create memory records.");
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

function normalizeDecision(decision: unknown): PolicyDecision {
  if (decision === "reject") {
    return "reject_audited";
  }

  if (isOneOf(POLICY_DECISIONS, decision)) {
    return decision;
  }

  throw new Error(`Invalid policy decision: ${String(decision)}.`);
}

function normalizeSourceHash(value: string | null | undefined): string | undefined {
  const normalized = normalizeOptionalText(value);
  return normalized?.toLowerCase();
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

function validateKnownLinks(
  ids: readonly string[],
  existingIds: ReadonlySet<string>,
  fieldName: string
): void {
  if (ids.some((id) => !existingIds.has(id))) {
    throw new Error(`Unknown memory id in ${fieldName}.`);
  }
}

function isOneOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function createId(): string {
  return `mem_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}
