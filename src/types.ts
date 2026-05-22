export const MEMORY_RISKS = ["low", "medium", "high"] as const;
export const MEMORY_STATUSES = ["pending", "accepted", "rejected", "retired"] as const;
export const POLICY_DECISIONS = ["auto_accept", "review", "reject"] as const;
export const MEMORY_SOURCE_TYPES = ["manual", "file", "url", "conversation", "other"] as const;
export const MEMORY_SOURCE_TRUST = ["trusted", "unknown", "untrusted"] as const;

export type MemoryRisk = (typeof MEMORY_RISKS)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];
export type PolicyDecision = (typeof POLICY_DECISIONS)[number];
export type MemorySourceType = (typeof MEMORY_SOURCE_TYPES)[number];
export type MemorySourceTrust = (typeof MEMORY_SOURCE_TRUST)[number];

export interface MemorySource {
  type: MemorySourceType;
  uri: string;
  quote?: string | null;
}

export interface MemoryRecord {
  id: string;
  memory: string;
  source: MemorySource;
  source_trust: MemorySourceTrust;
  scope: string;
  risk: MemoryRisk;
  decision: PolicyDecision;
  decision_reason: string;
  policy_version: string;
  destination: string;
  status: MemoryStatus;
  status_reason?: string | null;
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
  scope?: string;
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
