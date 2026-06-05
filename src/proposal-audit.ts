import { createEventId } from "./events.js";
import type { BlockedProposalAudit } from "./errors.js";
import {
  type NormalizedProposalInput,
  normalizeSourceType
} from "./ledger-records.js";
import { proposalPersistentSecretFields } from "./persistence-safety.js";
import {
  redactedPreviewForReport,
  scanPersistentFields,
  sha256Text
} from "./safety.js";
import type { PolicyResult } from "./types.js";

export function createBlockedProposalAudit(
  input: NormalizedProposalInput,
  policy: PolicyResult
): BlockedProposalAudit {
  const secretFields = new Set(
    scanPersistentFields(proposalPersistentSecretFields(input)).map((finding) => finding.field)
  );
  const audit: BlockedProposalAudit = {
    id: createEventId(),
    created_at: new Date().toISOString(),
    reason: policy.reason,
    policy_version: policy.policyVersion,
    risk: "high",
    decision: "block_no_persist",
    scope: auditScalar("scope", input.scope, secretFields),
    destination: auditScalar("destination", input.destination, secretFields),
    source_type: normalizeSourceType(input.sourceType, input.source),
    source_trust: input.sourceTrust,
    memory_hash: sha256Text(input.memory),
    memory_preview: redactedPreviewForReport(input.memory)
  };

  attachSecretAuditEvidence(audit, "scope", input.scope, secretFields);
  attachSecretAuditEvidence(audit, "destination", input.destination, secretFields);

  if (input.source !== "manual") {
    audit.source_uri_hash = sha256Text(input.source);
    audit.source_uri_preview = redactedPreviewForReport(input.source);
  }

  if (input.quote !== undefined) {
    audit.quote_hash = sha256Text(input.quote);
    audit.quote_preview = redactedPreviewForReport(input.quote);
  }

  return audit;
}

function auditScalar(
  field: "scope" | "destination",
  value: string,
  secretFields: ReadonlySet<string>
): string {
  return secretFields.has(field) ? redactedPreviewForReport(value) : value;
}

function attachSecretAuditEvidence(
  audit: BlockedProposalAudit,
  field: "scope" | "destination",
  value: string,
  secretFields: ReadonlySet<string>
): void {
  if (!secretFields.has(field)) {
    return;
  }

  if (field === "scope") {
    audit.scope_hash = sha256Text(value);
    audit.scope_preview = redactedPreviewForReport(value);
    return;
  }

  audit.destination_hash = sha256Text(value);
  audit.destination_preview = redactedPreviewForReport(value);
}
