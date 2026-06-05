import type { ReadAccessOptions } from "./read-policy.js";
import type {
  ReadPermissionDeniedEvidence,
  ReadContextPermissionConstraint,
  ReadContextPermissionIssueCode
} from "./read-permissions.js";
import type {
  MemoryKind,
  MemorySourceTrust,
  MemorySourceType,
  SourceVerificationMethod,
  SourceVerificationStatus
} from "./types.js";

export type ReadContextIssueCode =
  | "invalid_destination"
  | "ledger_read_failed"
  | "read_identity_missing"
  | "read_identity_invalid"
  | "read_policy_denied"
  | "read_policy_malformed"
  | ReadContextPermissionIssueCode
  | "expired_record"
  | "secret_like_content"
  | "managed_block_marker_content"
  | "relationship_conflict"
  | "relationship_supersession"
  | "relationship_cycle";

export interface ReadContextIssue {
  code: ReadContextIssueCode;
  message: string;
  recordIds: string[];
  relationship?: "conflicts_with" | "supersedes";
  metadata?: ReadPermissionDeniedEvidence;
}

export type ReadContextWarningCode = "expiring_record" | "sensitive_content";

export interface ReadContextWarning {
  code: ReadContextWarningCode;
  message: string;
  destination: string;
  recordIds: string[];
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  warningWindowDays: number | null;
}

export interface ReadContextOptions {
  destination?: string | null;
  scope?: string | readonly string[] | null;
  scopes?: string | readonly string[] | null;
  actor?: string | null;
  allowedScopes?: string | readonly string[] | null;
  readPermission?: ReadContextPermissionConstraint | null;
  permission?: ReadContextPermissionConstraint | null;
  readPermissionConstraint?: ReadContextPermissionConstraint | null;
  readAccess?: ReadAccessOptions | null;
}

export interface ReadContextStatusOptions {
  destination?: string | null;
  readAccess?: ReadAccessOptions | null;
}

export interface ReadContextStatusCounts {
  total: number;
  accepted: number;
  pending: number;
  rejected: number;
}

export interface ContextMemoryRecord {
  id: string;
  memory: string;
  kind: MemoryKind;
  tags: string[];
  source: {
    type: MemorySourceType;
    uri: string;
    verification: {
      status: SourceVerificationStatus;
      method: SourceVerificationMethod;
    };
  };
  source_trust: MemorySourceTrust;
  scope: string;
  destination: string;
  confidence: number | null;
  priority: number | null;
  applies_to_paths: string[];
  expires_at: string | null;
}

export interface ReadContext {
  ok: boolean;
  destination: string;
  scope: string | null;
  scopes: string[];
  recordIds: string[];
  recordCount: number;
  records: ContextMemoryRecord[];
  issues: ReadContextIssue[];
  warnings: ReadContextWarning[];
}

export interface ReadContextDestinationStatus {
  destination: string;
  ok: boolean;
  blocked: boolean;
  counts: ReadContextStatusCounts;
  acceptedRecordIds: string[];
  issues: ReadContextIssue[];
  warnings: ReadContextWarning[];
}

export interface ReadContextStatus {
  ok: boolean;
  blocked: boolean;
  destination: string | null;
  destinationCount: number;
  blockedCount: number;
  warningCount: number;
  destinations: ReadContextDestinationStatus[];
  issues: ReadContextIssue[];
}
