import { normalizeRecord } from "./ledger-records.js";
import { normalizeMemorySourceVerification } from "./provenance.js";
import { sanitizeStringValueForBoundary } from "./safety.js";
import type { RelationshipCycle } from "./relationships.js";
import type { MemoryRecord, MemorySourceVerification } from "./types.js";
import type { ReviewContext } from "./ledger.js";

export function renderRecord(record: MemoryRecord): string {
  const normalized = normalizeRecord(record);

  return [
    `${safeValue(normalized.id)} [${safeValue(normalized.status)}] ${safeValue(normalized.memory)}`,
    `  scope: ${safeValue(normalized.scope)}`,
    `  kind: ${safeValue(normalized.kind)}`,
    `  tags: ${formatLinkIds(normalized.tags)}`,
    `  confidence: ${normalized.confidence ?? "none"}`,
    `  risk: ${safeValue(normalized.risk)}`,
    `  source: ${safeValue(normalized.source.uri)}`,
    `  source_trust: ${safeValue(normalized.source_trust)}`,
    `  source_verification: ${renderSourceVerification(normalized.source.verification)}`,
    `  destination: ${safeValue(normalized.destination)}`,
    `  supersedes: ${formatLinkIds(normalized.supersedes)}`,
    `  conflicts_with: ${formatLinkIds(normalized.conflicts_with)}`,
    `  reviewer: ${safeValue(normalized.reviewer ?? "none")}`,
    `  approved_by: ${safeValue(normalized.approved_by ?? "none")}`,
    `  priority: ${normalized.priority ?? "none"}`,
    `  retention_class: ${safeValue(normalized.retention_class ?? "none")}`,
    `  applies_to_paths: ${formatLinkIds(normalized.applies_to_paths)}`,
    `  policy_version: ${safeValue(normalized.policy_version)}`,
    `  decision: ${safeValue(normalized.decision)} (${safeValue(normalized.decision_reason)})`
  ].join("\n");
}

export function renderReviewContext(context: ReviewContext): string {
  return [
    "Review candidate",
    renderReviewRecord(context.candidate),
    "",
    "Supersedes",
    renderRelationshipRecords(context.supersedes),
    "",
    "Conflicts with",
    renderRelationshipRecords(context.conflicts_with),
    "",
    "Incoming superseded by",
    renderRelationshipRecords(context.incoming_superseded_by),
    "",
    "Incoming conflicts with",
    renderRelationshipRecords(context.incoming_conflicts_with),
    "",
    "Supersession cycles",
    renderRelationshipCycles(context.cycles)
  ].join("\n");
}

export function formatLinkIds(ids: readonly string[]): string {
  return ids.length > 0 ? ids.map(safeValue).join(", ") : "none";
}

function renderSourceVerification(
  verification: MemorySourceVerification | undefined
): string {
  const normalized = verification ?? normalizeMemorySourceVerification(undefined);
  const location = normalized.path
    ? ` ${safeValue(normalized.path)}${normalized.start_line !== undefined && normalized.end_line !== undefined
      ? `:${normalized.start_line}-${normalized.end_line}`
      : ""}`
    : "";

  if (normalized.status === "verified") {
    return `${safeValue(normalized.status)} via ${safeValue(normalized.method)}${location}`;
  }

  return `${safeValue(normalized.status)} (${safeValue(normalized.reason)})`;
}

function renderRelationshipRecords(records: readonly MemoryRecord[]): string {
  if (records.length === 0) {
    return "  none";
  }

  return records.map(renderReviewRecord).join("\n");
}

function renderRelationshipCycles(cycles: readonly RelationshipCycle[]): string {
  if (cycles.length === 0) {
    return "  none";
  }

  return cycles.map((cycle) => {
    return `  ${safeValue(cycle.relationship)}: ${formatLinkIds(cycle.recordIds)} -> ${safeValue(cycle.recordIds[0])}`;
  }).join("\n");
}

function renderReviewRecord(record: MemoryRecord): string {
  const normalized = normalizeRecord(record);

  return [
    `  ${safeValue(normalized.id)} [${safeValue(normalized.status)}]`,
    `    destination: ${safeValue(normalized.destination)}`,
    `    source_verification: ${renderSourceVerification(normalized.source.verification)}`,
    `    memory: ${safeValue(normalized.memory)}`
  ].join("\n");
}

function safeValue(value: string): string {
  return sanitizeStringValueForBoundary(value);
}
