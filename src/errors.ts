export interface BlockedProposalAudit {
  id: string;
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
}

export class MemoryProposalBlockedError extends Error {
  readonly code = "MEMPR_PROPOSAL_BLOCKED";
  readonly audit: BlockedProposalAudit;

  constructor(audit: BlockedProposalAudit) {
    super("Memory proposal blocked without persistence because it contains unsafe persistent content.");
    this.name = "MemoryProposalBlockedError";
    this.audit = audit;
  }
}
