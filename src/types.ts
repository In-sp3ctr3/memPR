export type MemoryRisk = "low" | "medium" | "high";
export type MemoryStatus = "pending" | "accepted" | "rejected";
export type PolicyDecision = "auto_accept" | "review" | "reject";

export interface MemorySource {
  type: string;
  uri: string;
  quote?: string;
}

export interface MemoryRecord {
  id: string;
  memory: string;
  source: MemorySource;
  scope: string;
  risk: MemoryRisk;
  decision: PolicyDecision;
  decision_reason: string;
  destination: string;
  status: MemoryStatus;
  status_reason?: string;
  ttl: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposeMemoryInput {
  memory: string;
  source?: string;
  sourceType?: string;
  quote?: string;
  scope?: string;
  risk?: MemoryRisk;
  destination?: string;
  ttl?: string | null;
}

export interface LedgerPaths {
  root: string;
  directory: string;
  ledgerFile: string;
}

export interface ListFilters {
  status?: MemoryStatus;
}

export interface PolicyResult {
  risk: MemoryRisk;
  decision: PolicyDecision;
  reason: string;
}

