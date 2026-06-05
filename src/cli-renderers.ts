import type { createDiagnosticsSupportBundle } from "./diagnostics.js";
import {
  renderRecord
} from "./ledger.js";
import type {
  checkLedgerConsistency,
  ContextMemoryRecord,
  MarkdownExportPreview,
  ReadContext,
  ReadContextStatus,
  RelationshipResolutionResult,
  repairLedgerFromEvents
} from "./ledger.js";
import type { LiveSyncReport } from "./live-adapters.js";
import type { migrateLedgerEvents } from "./migration.js";
import { sanitizeStringValueForBoundary } from "./safety.js";

type ConsistencyStatus = Awaited<ReturnType<typeof checkLedgerConsistency>>;
type ConsistencyIssue = ConsistencyStatus["issues"][number];
type MigrationReport = Awaited<ReturnType<typeof migrateLedgerEvents>>;
type MigrationIssue = MigrationReport["issues"][number];
type RepairReport = Awaited<ReturnType<typeof repairLedgerFromEvents>>;
type DiagnosticsBundle = ReturnType<typeof createDiagnosticsSupportBundle>;

export function renderConsistencyStatus(status: ConsistencyStatus): string {
  if (status.ok) {
    return `Ledger consistent: ${status.currentCount} record(s) match event replay.`;
  }

  const lines = [`Ledger inconsistent: ${status.issues.length} issue(s).`];

  for (const issue of status.issues) {
    const details = renderConsistencyIssueDetails(issue);
    lines.push(`- ${safeValue(issue.code)}: ${safeValue(issue.message)}${details ? ` ${details}` : ""}`);
  }

  return lines.join("\n");
}

function renderConsistencyIssueDetails(issue: ConsistencyIssue): string {
  const parts: string[] = [];

  if (issue.currentCount !== undefined) {
    parts.push(`current=${issue.currentCount}`);
  }

  if (issue.replayedCount !== undefined) {
    parts.push(`replayed=${issue.replayedCount}`);
  }

  if (issue.line !== undefined) {
    parts.push(`line=${issue.line}`);
  }

  const ids = [
    ...(issue.missingFromReplayIds ?? []),
    ...(issue.missingFromLedgerIds ?? []),
    ...(issue.changedRecordIds ?? [])
  ];

  if (ids.length > 0) {
    parts.push(`ids=${ids.map(safeValue).join(",")}`);
  }

  if (issue.omittedRecordIdCount && issue.omittedRecordIdCount > 0) {
    parts.push(`omittedIds=${issue.omittedRecordIdCount}`);
  }

  if (issue.orderMismatch) {
    parts.push("orderMismatch=true");
  }

  return parts.length > 0 ? `(${parts.join("; ")})` : "";
}

export function renderMigrationStatus(report: MigrationReport): string {
  const summary = migrationSummary(report);

  if (report.issues.length === 0) {
    return summary;
  }

  return [
    summary,
    ...report.issues.map((issue) => {
      const details = renderMigrationIssueDetails(issue);
      return `- ${safeValue(issue.code)}: ${safeValue(issue.message)}${details ? ` ${details}` : ""}`;
    })
  ].join("\n");
}

export function renderRepairStatus(report: RepairReport): string {
  const summary = report.changed
    ? `Repaired ledger from event replay with ${report.repairedCount} record(s).`
    : report.wouldChange
      ? `Repair would rebuild ledger from ${report.repairedCount} replayed record(s).`
      : "No repair needed: ledger already matches event replay.";

  if (report.issues.length === 0) {
    return summary;
  }

  return [
    summary,
    ...report.issues.map((issue) => {
      const details = renderConsistencyIssueDetails(issue);
      return `- ${safeValue(issue.code)}: ${safeValue(issue.message)}${details ? ` ${details}` : ""}`;
    })
  ].join("\n");
}

function migrationSummary(report: MigrationReport): string {
  if (report.reason === "migrated") {
    return `Migrated ${report.migratedCount} ledger record(s) into event history.`;
  }

  if (report.reason === "would_migrate") {
    return `Migration would backfill ${report.ledgerCount} ledger record(s) into event history.`;
  }

  if (report.reason === "empty_ledger") {
    return "No migration needed: ledger is empty.";
  }

  if (report.reason === "event_history_matches_ledger") {
    return `No migration needed: ${report.ledgerCount} ledger record(s) already match event history.`;
  }

  if (report.reason === "event_history_drift") {
    return "Migration refused: existing event history does not match the current ledger.";
  }

  if (report.reason === "ledger_malformed") {
    return "Migration refused: legacy ledger could not be migrated.";
  }

  if (report.reason === "event_write_failed") {
    return "Migration failed: event history could not be written.";
  }

  return `Migration status: ${report.reason}.`;
}

export function renderRelationshipResolution(result: RelationshipResolutionResult): string {
  const retired = result.evidence.retiredRecordIds.length === 0
    ? "none"
    : result.evidence.retiredRecordIds.map(safeValue).join(", ");
  const overrides = result.evidence.overrideRecordIds.length === 0
    ? "none"
    : result.evidence.overrideRecordIds.map(safeValue).join(", ");

  return [
    `Accepted ${safeValue(result.record.id)} with relationship evidence.`,
    `Action: ${safeValue(result.evidence.action)}`,
    `Retired: ${retired}`,
    `Overrides: ${overrides}`,
    `Cycles: ${result.evidence.cycleRecordIds.length}`,
    `Reason: ${safeValue(result.evidence.reason)}`
  ].join("\n");
}

export function renderRelationshipGraph(value: unknown): string {
  const graph = value as {
    recordIds?: string[];
    recordId?: string;
    incoming?: { supersedes: string[]; conflicts_with: string[] };
    outgoing?: { supersedes: string[]; conflicts_with: string[] };
    cycles?: Array<{ recordIds: string[] }>;
    missingReferences?: unknown[];
  };

  if (graph.recordId) {
    return [
      `Relationship graph for ${safeValue(graph.recordId)}`,
      `Incoming superseded by: ${formatIds(graph.incoming?.supersedes ?? [])}`,
      `Incoming conflicts with: ${formatIds(graph.incoming?.conflicts_with ?? [])}`,
      `Outgoing supersedes: ${formatIds(graph.outgoing?.supersedes ?? [])}`,
      `Outgoing conflicts_with: ${formatIds(graph.outgoing?.conflicts_with ?? [])}`,
      `Supersession cycles: ${graph.cycles?.length ?? 0}`,
      `Missing references: ${graph.missingReferences?.length ?? 0}`
    ].join("\n");
  }

  return [
    `Relationship graph: ${graph.recordIds?.length ?? 0} record(s).`,
    `Supersession cycles: ${graph.cycles?.length ?? 0}`,
    `Missing references: ${graph.missingReferences?.length ?? 0}`
  ].join("\n");
}

export function renderLiveSyncReport(report: LiveSyncReport): string {
  const mode = report.dryRun ? "Dry-run" : "Confirmed";

  return [
    `${mode} live sync for ${safeValue(report.destination)}`,
    `Adapter: ${safeValue(report.adapter.title)} (${safeValue(report.adapter.id)})`,
    `Records: ${report.recordIds.length}`,
    `Planned: ${report.summary.planned}`,
    `Skipped: ${report.summary.skipped}`,
    `Succeeded: ${report.summary.succeeded}`,
    `Failed: ${report.summary.failed}`,
    `Retries: ${report.summary.retries}`,
    report.issues.length > 0 ? `Issues: ${report.issues.map(safeValue).join(", ")}` : ""
  ].filter(Boolean).join("\n");
}

function formatIds(ids: readonly string[]): string {
  return ids.length === 0 ? "none" : ids.map(safeValue).join(", ");
}

export function renderExportPreview(report: MarkdownExportPreview): string {
  const recordSummary = report.recordCount === 0
    ? "none"
    : report.recordIds.map(safeValue).join(", ");
  const warningLines = report.warnings.length === 0
    ? []
    : [
      "Warnings:",
      ...report.warnings.map(renderReadContextWarning),
      ""
    ];

  return [
    `Dry-run export preview for ${safeValue(report.destination)}`,
    `Would write destination: ${safeValue(report.destination)}`,
    `Adapter: ${safeValue(report.adapter.title)} (${safeValue(report.adapter.id)})`,
    `Destination exists: ${report.destinationExists ? "yes" : "no"}`,
    `Records: ${report.recordCount} (${recordSummary})`,
    ...warningLines,
    "",
    "Would-be file content:",
    report.safe_content_preview
  ].join("\n");
}

export function renderReadContext(context: ReadContext): string {
  const scopeText = context.scopes.length === 0
    ? "all scopes"
    : context.scopes.map(safeValue).join(", ");

  if (!context.ok) {
    return [
      `Read context assembly blocked for ${safeValue(context.destination)} (${scopeText}).`,
      ...context.issues.map(renderReadContextIssue),
      ...context.warnings.map(renderReadContextWarning)
    ].join("\n");
  }

  const summary = `Read context assembled for ${safeValue(context.destination)} (${scopeText}): `
    + `${context.records.length} record(s).`;
  const warnings = context.warnings.map(renderReadContextWarning);

  if (context.records.length === 0 && warnings.length === 0) {
    return summary;
  }

  return [
    summary,
    ...warnings,
    "",
    context.records.map(renderContextRecord).join("\n\n")
  ].join("\n");
}

function renderContextRecord(record: ContextMemoryRecord): string {
  const lines = [
    `${safeValue(record.id)} [${safeValue(record.source_trust)}] ${safeValue(record.kind)}`,
    `status: accepted`,
    `scope: ${safeValue(record.scope)}`,
    `destination: ${safeValue(record.destination)}`,
    `source: ${safeValue(record.source.type)}:${safeValue(record.source.uri)}`,
    `source_verification: ${safeValue(record.source.verification.status)}/${safeValue(record.source.verification.method)}`,
    `memory: ${safeValue(record.memory)}`
  ];

  if (record.tags.length > 0) {
    lines.push(`tags: ${record.tags.map(safeValue).join(", ")}`);
  }

  if (record.confidence !== null) {
    lines.push(`confidence: ${record.confidence}`);
  }

  if (record.priority !== null) {
    lines.push(`priority: ${record.priority}`);
  }

  if (record.applies_to_paths.length > 0) {
    lines.push(`applies_to_paths: ${record.applies_to_paths.map(safeValue).join(", ")}`);
  }

  if (record.expires_at !== null) {
    lines.push(`expires_at: ${safeValue(record.expires_at)}`);
  }

  return lines.join("\n");
}

function renderReadContextIssue(issue: ReadContext["issues"][number]): string {
  const details = [
    `ids=${issue.recordIds.map(safeValue).join(",")}`,
    issue.relationship ? `relationship=${safeValue(issue.relationship)}` : ""
  ].filter(Boolean).join("; ");

  return `- ${safeValue(issue.code)}: ${safeValue(issue.message)}${details ? ` (${details})` : ""}`;
}

export function renderReadContextWarning(warning: ReadContext["warnings"][number]): string {
  const details = [
    `ids=${warning.recordIds.map(safeValue).join(",")}`,
    `destination=${safeValue(warning.destination)}`
  ];

  if (warning.expiresAt !== null) {
    details.push(`expiresAt=${safeValue(warning.expiresAt)}`);
  }

  if (warning.daysUntilExpiry !== null) {
    details.push(`daysUntilExpiry=${warning.daysUntilExpiry}`);
  }

  if (warning.warningWindowDays !== null) {
    details.push(`warningWindowDays=${warning.warningWindowDays}`);
  }

  return `- warning ${safeValue(warning.code)}: ${safeValue(warning.message)} (${details.join("; ")})`;
}

export function renderDiagnosticsReport(report: {
  dryRun: boolean;
  diagnosticsPath: string;
  bundle: DiagnosticsBundle;
}): string {
  const { bundle } = report;
  const action = report.dryRun ? "Prepared diagnostics bundle" : "Wrote diagnostics bundle";

  return [
    `${action} ${bundle.correlationId}.`,
    `Diagnostics file: ${safeValue(report.diagnosticsPath)}`,
    `Records: ${bundle.summary.records} `
      + `(accepted=${bundle.summary.accepted}, pending=${bundle.summary.pending}, rejected=${bundle.summary.rejected})`,
    `Scanner: blockers=${bundle.summary.scanBlockers}, warnings=${bundle.summary.scanWarnings}, redactionMarkers=${bundle.summary.redactionMarkers}`,
    `Consistency: ${bundle.summary.consistencyOk ? "ok" : "issues"}`
  ].join("\n");
}

export function renderReadContextStatus(status: ReadContextStatus): string {
  if (status.destinations.length === 0) {
    if (status.issues.length > 0) {
      return [
        "Read context status unavailable.",
        ...status.issues.map(renderReadContextIssue)
      ].join("\n");
    }

    return "No read-context destinations found.";
  }

  const lines = [
    `Read context status: ${status.destinationCount} destination(s), `
      + `${status.blockedCount} with blockers, ${status.warningCount} warning(s).`
  ];

  for (const destination of status.destinations) {
    const acceptedIds = destination.acceptedRecordIds.length === 0
      ? "none"
      : destination.acceptedRecordIds.map(safeValue).join(", ");

    lines.push(
      [
        `- ${safeValue(destination.destination)}: ${destination.ok ? "no blockers" : "blocked"}`,
        `accepted=${destination.counts.accepted}`,
        `pending=${destination.counts.pending}`,
        `rejected=${destination.counts.rejected}`,
        `total=${destination.counts.total}`,
        `warnings=${destination.warnings.length}`,
        `acceptedIds=${acceptedIds}`
      ].join("; ")
    );

    for (const issue of destination.issues) {
      lines.push(`  ${renderReadContextIssue(issue)}`);
    }

    for (const warning of destination.warnings) {
      lines.push(`  ${renderReadContextWarning(warning)}`);
    }
  }

  return lines.join("\n");
}

function renderMigrationIssueDetails(issue: MigrationIssue): string {
  const parts: string[] = [];

  if (issue.currentCount !== undefined) {
    parts.push(`current=${issue.currentCount}`);
  }

  if (issue.replayedCount !== undefined && issue.replayedCount !== null) {
    parts.push(`replayed=${issue.replayedCount}`);
  }

  if (issue.line !== undefined) {
    parts.push(`line=${issue.line}`);
  }

  if (issue.recordIds && issue.recordIds.length > 0) {
    parts.push(`ids=${issue.recordIds.map(safeValue).join(",")}`);
  }

  if (issue.omittedRecordIdCount && issue.omittedRecordIdCount > 0) {
    parts.push(`omittedIds=${issue.omittedRecordIdCount}`);
  }

  if (issue.orderMismatch) {
    parts.push("orderMismatch=true");
  }

  return parts.length > 0 ? `(${parts.join("; ")})` : "";
}

function safeValue(value: string): string {
  return sanitizeStringValueForBoundary(value);
}
