export const MEMORY_RISKS = ["low", "medium", "high"] as const;
export const MEMORY_STATUSES = ["pending", "accepted", "rejected", "retired"] as const;
export const MEMORY_KINDS = [
  "fact",
  "preference",
  "instruction",
  "procedure",
  "decision",
  "warning",
  "constraint"
] as const;
export const POLICY_DECISIONS = [
  "auto_accept",
  "review",
  "reject_audited",
  "block_no_persist"
] as const;
export const MEMORY_SOURCE_TYPES = ["manual", "file", "url", "conversation", "other"] as const;
export const MEMORY_SOURCE_TRUST = ["trusted", "unknown", "untrusted"] as const;
export const SOURCE_VERIFICATION_STATUSES = [
  "verified",
  "unverified",
  "failed",
  "not_applicable"
] as const;
export const SOURCE_VERIFICATION_METHODS = [
  "file_quote",
  "file_hash",
  "url_hash",
  "conversation_ref",
  "manual",
  "none"
] as const;

export type MemoryRisk = (typeof MEMORY_RISKS)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type PolicyDecision = (typeof POLICY_DECISIONS)[number];
export type MemorySourceType = (typeof MEMORY_SOURCE_TYPES)[number];
export type MemorySourceTrust = (typeof MEMORY_SOURCE_TRUST)[number];
export type SourceVerificationStatus = (typeof SOURCE_VERIFICATION_STATUSES)[number];
export type SourceVerificationMethod = (typeof SOURCE_VERIFICATION_METHODS)[number];

export interface MemorySourceVerification {
  status: SourceVerificationStatus;
  method: SourceVerificationMethod;
  checked_at: string | null;
  reason: string;
  path?: string;
  start_line?: number;
  end_line?: number;
  content_hash?: string;
  quote_hash?: string;
  git_commit?: string;
}

export interface MemorySource {
  type: MemorySourceType;
  uri: string;
  quote?: string | null;
  verification?: MemorySourceVerification;
}

export interface MemoryRecord {
  schema_version: "mempr-record-v1";
  id: string;
  memory: string;
  source: MemorySource;
  source_trust: MemorySourceTrust;
  scope: string;
  kind: MemoryKind;
  tags: string[];
  confidence: number | null;
  risk: MemoryRisk;
  decision: PolicyDecision;
  decision_reason: string;
  policy_version: string;
  destination: string;
  status: MemoryStatus;
  status_reason?: string | null;
  reviewer: string | null;
  approved_by: string | null;
  last_verified_at: string | null;
  last_used_at: string | null;
  retention_class: string | null;
  priority: number | null;
  applies_to_paths: string[];
  ttl: string | null;
  expires_at: string | null;
  supersedes: string[];
  conflicts_with: string[];
  created_at: string;
  updated_at: string;
}

export interface ProposeMemoryInput {
  memory: string;
  source?: string;
  sourceType?: string;
  sourceTrust?: MemorySourceTrust;
  quote?: string;
  sourceLineStart?: number;
  sourceLineEnd?: number;
  sourceHash?: string;
  gitCommit?: string;
  verifySource?: boolean;
  scope?: string;
  kind?: MemoryKind;
  tags?: string | readonly string[] | null;
  confidence?: number | null;
  retentionClass?: string | null;
  priority?: number | null;
  appliesToPaths?: string | readonly string[] | null;
  risk?: MemoryRisk;
  destination?: string;
  ttl?: string | null;
  supersedes?: string | readonly string[] | null;
  conflictsWith?: string | readonly string[] | null;
}

export interface LedgerPaths {
  root: string;
  directory: string;
  ledgerFile: string;
}

export interface ListFilters {
  status?: MemoryStatus;
  risk?: MemoryRisk;
  destination?: string;
}

export interface PolicyResult {
  risk: MemoryRisk;
  decision: PolicyDecision;
  reason: string;
  policyVersion: string;
}
