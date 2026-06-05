import type { MemoryProposalBlockedError } from "./errors.js";
import type {
  MemoryKind,
  MemoryRecord,
  MemoryRisk,
  MemorySourceTrust,
  MemorySourceType,
  PolicyResult,
  ProposeMemoryInput
} from "./types.js";
import type { MemorySourceVerification } from "./types.js";

export type SuggestionSourceKind =
  | "transcript"
  | "git_diff"
  | "existing_memory_file"
  | "shell_history"
  | "observation";

export interface SuggestionCandidate {
  memory: string;
  kind: MemoryKind;
  source: string;
  sourceType: MemorySourceType;
  sourceTrust: MemorySourceTrust;
  quote?: string;
  scope: string;
  risk?: MemoryRisk;
  destination: string;
  tags: string[];
  confidence: number | null;
  reason: string;
}

export interface SuggestOptions {
  root?: string;
  destination?: string;
  sourceTrust?: MemorySourceTrust;
  scope?: string;
  limit?: number;
}

export interface SuggestionProposalSuccess {
  index: number;
  record: MemoryRecord;
}

export interface SuggestionProposalBlocked {
  index: number;
  error: {
    code: "MEMPR_PROPOSAL_BLOCKED";
    message: string;
  };
  audit: MemoryProposalBlockedError["audit"];
}

export interface SuggestionProposalReport {
  records: SuggestionProposalSuccess[];
  blocked: SuggestionProposalBlocked[];
}

export interface MemoryDiffPreview {
  candidate: ProposeMemoryInput;
  policy: PolicyResult;
  sourceVerification: MemorySourceVerification;
  destination: string;
  wouldWrite: false;
}

export interface CandidateContext {
  sourceKind: SuggestionSourceKind;
  source: string;
  sourceType: MemorySourceType;
  quote?: string;
  reason: string;
  defaultConfidence: number;
}

export interface ResolvedSuggestOptions {
  root: string;
  destination: string;
  sourceTrust: MemorySourceTrust;
  scope: string;
  limit: number;
}
