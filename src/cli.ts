#!/usr/bin/env node
import {
  acceptMemoryWithRelationships,
  analyzeRelationshipGraph,
  assembleReadContext,
  checkLedgerConsistency,
  exportMarkdown,
  getRecordHistory,
  getReviewContext,
  listRecords,
  proposeMemory,
  renderRecordHistory,
  renderRecord,
  renderReviewContext,
  previewMarkdownExport,
  repairLedgerFromEvents,
  summarizeReadContextStatus,
  updateRecordStatus
} from "./ledger.js";
import {
  appendDiagnosticEntry,
  createCorrelationId,
  createDiagnosticsSupportBundle,
  resolveDiagnosticsPaths
} from "./diagnostics.js";
import {
  listLiveAdapters,
  syncLiveAdapter
} from "./live-adapters.js";
import { migrateLedgerEvents } from "./migration.js";
import { scanAcceptedMemoryRecords } from "./scanner.js";
import type {
  MarkdownExportPreview,
  ReadContext,
  ReadContextOptions,
  ReadContextStatus,
  RelationshipResolutionResult
} from "./ledger.js";
import type { LiveAdapterId, LiveSyncReport } from "./live-adapters.js";
import type { ReadContextPermissionConstraint } from "./read-permissions.js";
import type { ReadAccessOptions } from "./read-policy.js";
import type { MemoryRisk, MemorySourceTrust, MemoryStatus } from "./types.js";

interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

const BOOLEAN_FLAGS = new Set([
  "accept",
  "confirm",
  "dry-run",
  "from-events",
  "json",
  "override-relationships",
  "read-exclude-conflicts",
  "read-exclude-supersedes",
  "retire-superseded",
  "reject"
]);

async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  switch (parsed.command) {
    case "propose":
      await handlePropose(parsed);
      return;
    case "list":
      await handleList(parsed);
      return;
    case "inbox":
      await handleInbox(parsed);
      return;
    case "diff":
      await handleDiff(parsed);
      return;
    case "review":
      await handleReview(parsed);
      return;
    case "history":
      await handleHistory(parsed);
      return;
    case "accept":
      await handleStatus(parsed, "accepted");
      return;
    case "reject":
      await handleStatus(parsed, "rejected");
      return;
    case "retire":
      await handleStatus(parsed, "retired");
      return;
    case "relationships":
      await handleRelationships(parsed);
      return;
    case "sync-live":
      await handleSyncLive(parsed);
      return;
    case "export":
      await handleExport(parsed);
      return;
    case "context":
      await handleContext(parsed);
      return;
    case "context-status":
      await handleContextStatus(parsed);
      return;
    case "check":
      await handleCheck(parsed);
      return;
    case "repair":
      await handleRepair(parsed);
      return;
    case "diagnostics":
      await handleDiagnostics(parsed);
      return;
    case "migrate":
      await handleMigrate(parsed);
      return;
    case "help":
    case undefined:
      printHelp();
      return;
    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
}

async function handlePropose(parsed: ParsedArgs): Promise<void> {
  const memory = stringFlag(parsed, "memory");

  if (!memory) {
    throw new Error("Missing --memory.");
  }

  const record = await proposeMemory(
    {
      memory,
      source: stringFlag(parsed, "source"),
      sourceType: stringFlag(parsed, "source-type"),
      sourceTrust: sourceTrustFlag(parsed),
      quote: stringFlag(parsed, "quote"),
      scope: stringFlag(parsed, "scope"),
      risk: riskFlag(parsed),
      destination: stringFlag(parsed, "destination"),
      ttl: stringFlag(parsed, "ttl") ?? null,
      supersedes: commaSeparatedFlag(parsed, "supersedes"),
      conflictsWith: commaSeparatedFlag(parsed, "conflicts-with")
    },
    rootFlag(parsed)
  );

  printJsonOrText(parsed, record, renderRecord(record));
}

async function handleList(parsed: ParsedArgs): Promise<void> {
  const records = await listRecords(
    {
      status: statusFlag(parsed),
      risk: riskFlag(parsed),
      destination: stringFlag(parsed, "destination")
    },
    rootFlag(parsed),
    readAccessFlag(parsed)
  );
  const text = records.length === 0
    ? "No memory records found."
    : records.map(renderRecord).join("\n\n");

  printJsonOrText(parsed, records, text);
}

async function handleInbox(parsed: ParsedArgs): Promise<void> {
  const records = await listRecords(
    {
      status: "pending",
      risk: riskFlag(parsed),
      destination: stringFlag(parsed, "destination")
    },
    rootFlag(parsed),
    readAccessFlag(parsed)
  );
  const text = records.length === 0
    ? "No pending memory records found."
    : records.map(renderRecord).join("\n\n");

  printJsonOrText(parsed, records, text);
}

async function handleDiff(parsed: ParsedArgs): Promise<void> {
  const id = parsed.positionals[0];

  if (!id) {
    throw new Error("Missing memory id for diff.");
  }

  const context = await getReviewContext(id, rootFlag(parsed), readAccessFlag(parsed));

  printJsonOrText(parsed, context, renderReviewContext(context));
}

async function handleReview(parsed: ParsedArgs): Promise<void> {
  const id = parsed.positionals[0];

  if (!id) {
    throw new Error("Missing memory id for review.");
  }

  const accept = reviewActionFlag(parsed, "accept");
  const reject = reviewActionFlag(parsed, "reject");

  if (accept === reject) {
    throw new Error("Review requires exactly one of --accept or --reject.");
  }

  if (accept && hasRelationshipResolutionFlags(parsed)) {
    const result = await acceptMemoryWithRelationships(
      id,
      {
        reason: stringFlag(parsed, "reason") ?? "",
        retireSuperseded: parsed.flags["retire-superseded"] === true,
        overrideRelationships: parsed.flags["override-relationships"] === true
      },
      rootFlag(parsed)
    );

    printJsonOrText(parsed, result, renderRelationshipResolution(result));
    return;
  }

  const record = await updateRecordStatus(
    id,
    accept ? "accepted" : "rejected",
    stringFlag(parsed, "reason"),
    rootFlag(parsed)
  );

  printJsonOrText(parsed, record, renderRecord(record));
}

async function handleHistory(parsed: ParsedArgs): Promise<void> {
  const id = parsed.positionals[0];

  if (!id) {
    throw new Error("Missing memory id for history.");
  }

  const history = await getRecordHistory(id, rootFlag(parsed), readAccessFlag(parsed));

  printJsonOrText(parsed, history, renderRecordHistory(history));
}

async function handleStatus(
  parsed: ParsedArgs,
  status: MemoryStatus
): Promise<void> {
  const id = parsed.positionals[0];

  if (!id) {
    throw new Error(`Missing memory id for ${status}.`);
  }

  if (status === "accepted" && hasRelationshipResolutionFlags(parsed)) {
    const result = await acceptMemoryWithRelationships(
      id,
      {
        reason: stringFlag(parsed, "reason") ?? "",
        retireSuperseded: parsed.flags["retire-superseded"] === true,
        overrideRelationships: parsed.flags["override-relationships"] === true
      },
      rootFlag(parsed)
    );

    printJsonOrText(parsed, result, renderRelationshipResolution(result));
    return;
  }

  const record = await updateRecordStatus(
    id,
    status,
    stringFlag(parsed, "reason"),
    rootFlag(parsed)
  );

  printJsonOrText(parsed, record, renderRecord(record));
}

async function handleRelationships(parsed: ParsedArgs): Promise<void> {
  const graph = await analyzeRelationshipGraph(rootFlag(parsed));
  const id = parsed.positionals[0];
  const payload = id
    ? {
        recordId: id,
        incoming: graph.incoming[id] ?? { supersedes: [], conflicts_with: [] },
        outgoing: graph.outgoing[id] ?? { supersedes: [], conflicts_with: [] },
        cycles: graph.cycles.filter((cycle) => cycle.recordIds.includes(id)),
        missingReferences: graph.missingReferences.filter((reference) => {
          return reference.recordId === id || reference.missingRecordId === id;
        })
      }
    : graph;

  printJsonOrText(parsed, payload, renderRelationshipGraph(payload));
}

async function handleSyncLive(parsed: ParsedArgs): Promise<void> {
  const adapterId = liveAdapterFlag(parsed);
  const report = await syncLiveAdapter(
    {
      adapterId,
      destination: stringFlag(parsed, "destination"),
      dryRun: parsed.flags["dry-run"] === true,
      confirm: parsed.flags.confirm === true,
      maxRetries: numberFlag(parsed, "max-retries")
    },
    rootFlag(parsed)
  );

  printJsonOrText(parsed, report, renderLiveSyncReport(report));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

async function handleExport(parsed: ParsedArgs): Promise<void> {
  const destination = stringFlag(parsed, "destination") ?? "MEMORY.md";

  if (parsed.flags["dry-run"] === true) {
    const preview = await exportMarkdown(destination, rootFlag(parsed), {
      dryRun: true,
      readAccess: readAccessFlag(parsed)
    });
    const jsonPreview = {
      dryRun: true,
      ...preview
    };
    printJsonOrText(
      parsed,
      jsonPreview,
      renderExportPreview(preview)
    );
    return;
  }

  const preview = await previewMarkdownExport(destination, rootFlag(parsed), readAccessFlag(parsed));
  const outputPath = await exportMarkdown(destination, rootFlag(parsed));
  const payload = {
    destination: outputPath,
    warnings: preview.warnings
  };
  const warningText = preview.warnings.length === 0
    ? ""
    : `\n${preview.warnings.map(renderReadContextWarning).join("\n")}`;

  printJsonOrText(parsed, payload, `Exported ${outputPath}${warningText}`);
}

async function handleContext(parsed: ParsedArgs): Promise<void> {
  const options: ReadContextOptions = {
    destination: stringFlag(parsed, "destination"),
    scopes: scopeFilterFlag(parsed)
  };
  const readPermission = readPermissionFlag(parsed);

  if (readPermission !== undefined) {
    options.readPermission = readPermission;
  }

  options.readAccess = readAccessFlag(parsed);

  const context = await assembleReadContext(options, rootFlag(parsed));

  printJsonOrText(parsed, context, renderReadContext(context));

  if (!context.ok) {
    process.exitCode = 1;
  }
}

async function handleContextStatus(parsed: ParsedArgs): Promise<void> {
  const status = await summarizeReadContextStatus(
    {
      destination: stringFlag(parsed, "destination"),
      readAccess: readAccessFlag(parsed)
    },
    rootFlag(parsed)
  );

  printJsonOrText(parsed, status, renderReadContextStatus(status));
}

async function handleCheck(parsed: ParsedArgs): Promise<void> {
  const status = await checkLedgerConsistency(rootFlag(parsed), readAccessFlag(parsed));

  printJsonOrText(parsed, status, renderConsistencyStatus(status));

  if (!status.ok) {
    process.exitCode = 1;
  }
}

async function handleDiagnostics(parsed: ParsedArgs): Promise<void> {
  const root = rootFlag(parsed);
  const readAccess = readAccessFlag(parsed);
  const records = await listRecords({}, root, readAccess);
  const accepted = records.filter((record) => record.status === "accepted");
  const scan = scanAcceptedMemoryRecords(accepted);
  const consistency = await checkLedgerConsistency(root, readAccess);
  const correlationId = createCorrelationId();
  const bundle = createDiagnosticsSupportBundle({
    root,
    records,
    scan,
    consistency,
    correlationId
  });
  const dryRun = parsed.flags["dry-run"] === true;
  const diagnosticsPath = dryRun
    ? resolveDiagnosticsPaths(root).diagnosticsFile
    : await appendDiagnosticEntry(bundle, root);
  const payload = {
    dryRun,
    diagnosticsPath,
    bundle
  };

  printJsonOrText(parsed, payload, renderDiagnosticsReport(payload));

  if (scan.issues.length > 0 || !consistency.ok) {
    process.exitCode = 1;
  }
}

async function handleRepair(parsed: ParsedArgs): Promise<void> {
  const report = await repairLedgerFromEvents(rootFlag(parsed), {
    fromEvents: parsed.flags["from-events"] === true,
    confirm: parsed.flags.confirm === true
  });

  printJsonOrText(parsed, report, renderRepairStatus(report));

  if (report.issues.length > 0 && !report.changed) {
    process.exitCode = 1;
  }
}

async function handleMigrate(parsed: ParsedArgs): Promise<void> {
  const report = await migrateLedgerEvents(rootFlag(parsed), {
    dryRun: parsed.flags["dry-run"] === true
  });

  printJsonOrText(parsed, report, renderMigrationStatus(report));

  if (report.issues.length > 0) {
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];

    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const raw = value.slice(2);
    const equalsIndex = raw.indexOf("=");

    if (equalsIndex >= 0) {
      flags[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }

    if (BOOLEAN_FLAGS.has(raw)) {
      flags[raw] = true;
      continue;
    }

    const next = rest[index + 1];

    if (next && !next.startsWith("--")) {
      flags[raw] = next;
      index += 1;
    } else {
      flags[raw] = true;
    }
  }

  return { command, positionals, flags };
}

function printJsonOrText(parsed: ParsedArgs, value: unknown, text: string): void {
  if (parsed.flags.json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  console.log(text);
}

function renderConsistencyStatus(status: Awaited<ReturnType<typeof checkLedgerConsistency>>): string {
  if (status.ok) {
    return `Ledger consistent: ${status.currentCount} record(s) match event replay.`;
  }

  const lines = [`Ledger inconsistent: ${status.issues.length} issue(s).`];

  for (const issue of status.issues) {
    const details = renderConsistencyIssueDetails(issue);
    lines.push(`- ${issue.code}: ${issue.message}${details ? ` ${details}` : ""}`);
  }

  return lines.join("\n");
}

function renderConsistencyIssueDetails(
  issue: Awaited<ReturnType<typeof checkLedgerConsistency>>["issues"][number]
): string {
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
    parts.push(`ids=${ids.join(",")}`);
  }

  if (issue.omittedRecordIdCount && issue.omittedRecordIdCount > 0) {
    parts.push(`omittedIds=${issue.omittedRecordIdCount}`);
  }

  if (issue.orderMismatch) {
    parts.push("orderMismatch=true");
  }

  return parts.length > 0 ? `(${parts.join("; ")})` : "";
}

function renderMigrationStatus(report: Awaited<ReturnType<typeof migrateLedgerEvents>>): string {
  const summary = migrationSummary(report);

  if (report.issues.length === 0) {
    return summary;
  }

  return [
    summary,
    ...report.issues.map((issue) => {
      const details = renderMigrationIssueDetails(issue);
      return `- ${issue.code}: ${issue.message}${details ? ` ${details}` : ""}`;
    })
  ].join("\n");
}

function renderRepairStatus(report: Awaited<ReturnType<typeof repairLedgerFromEvents>>): string {
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
      return `- ${issue.code}: ${issue.message}${details ? ` ${details}` : ""}`;
    })
  ].join("\n");
}

function migrationSummary(report: Awaited<ReturnType<typeof migrateLedgerEvents>>): string {
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

function renderRelationshipResolution(result: RelationshipResolutionResult): string {
  const retired = result.evidence.retiredRecordIds.length === 0
    ? "none"
    : result.evidence.retiredRecordIds.join(", ");
  const overrides = result.evidence.overrideRecordIds.length === 0
    ? "none"
    : result.evidence.overrideRecordIds.join(", ");

  return [
    `Accepted ${result.record.id} with relationship evidence.`,
    `Action: ${result.evidence.action}`,
    `Retired: ${retired}`,
    `Overrides: ${overrides}`,
    `Cycles: ${result.evidence.cycleRecordIds.length}`,
    `Reason: ${result.evidence.reason}`
  ].join("\n");
}

function renderRelationshipGraph(value: unknown): string {
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
      `Relationship graph for ${graph.recordId}`,
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

function renderLiveSyncReport(report: LiveSyncReport): string {
  const mode = report.dryRun ? "Dry-run" : "Confirmed";

  return [
    `${mode} live sync for ${report.destination}`,
    `Adapter: ${report.adapter.title} (${report.adapter.id})`,
    `Records: ${report.recordIds.length}`,
    `Planned: ${report.summary.planned}`,
    `Skipped: ${report.summary.skipped}`,
    `Succeeded: ${report.summary.succeeded}`,
    `Failed: ${report.summary.failed}`,
    `Retries: ${report.summary.retries}`,
    report.issues.length > 0 ? `Issues: ${report.issues.join(", ")}` : ""
  ].filter(Boolean).join("\n");
}

function formatIds(ids: readonly string[]): string {
  return ids.length === 0 ? "none" : ids.join(", ");
}

function renderExportPreview(report: MarkdownExportPreview): string {
  const recordSummary = report.recordCount === 0
    ? "none"
    : report.recordIds.join(", ");
  const warningLines = report.warnings.length === 0
    ? []
    : [
      "Warnings:",
      ...report.warnings.map(renderReadContextWarning),
      ""
    ];

  return [
    `Dry-run export preview for ${report.destination}`,
    `Would write: ${report.outputPath}`,
    `Adapter: ${report.adapter.title} (${report.adapter.id})`,
    `Destination exists: ${report.destinationExists ? "yes" : "no"}`,
    `Records: ${report.recordCount} (${recordSummary})`,
    ...warningLines,
    "",
    "Would-be file content:",
    report.content
  ].join("\n");
}

function renderReadContext(context: ReadContext): string {
  const scopeText = context.scopes.length === 0
    ? "all scopes"
    : context.scopes.join(", ");

  if (!context.ok) {
    return [
      `Read context assembly blocked for ${context.destination} (${scopeText}).`,
      ...context.issues.map(renderReadContextIssue),
      ...context.warnings.map(renderReadContextWarning)
    ].join("\n");
  }

  const summary = `Read context assembled for ${context.destination} (${scopeText}): `
    + `${context.records.length} record(s).`;
  const warnings = context.warnings.map(renderReadContextWarning);

  if (context.records.length === 0 && warnings.length === 0) {
    return summary;
  }

  return [
    summary,
    ...warnings,
    "",
    context.records.map(renderRecord).join("\n\n")
  ].join("\n");
}

function renderReadContextIssue(issue: ReadContext["issues"][number]): string {
  const details = [
    `ids=${issue.recordIds.join(",")}`,
    issue.relationship ? `relationship=${issue.relationship}` : ""
  ].filter(Boolean).join("; ");

  return `- ${issue.code}: ${issue.message}${details ? ` (${details})` : ""}`;
}

function renderReadContextWarning(warning: ReadContext["warnings"][number]): string {
  const details = [
    `ids=${warning.recordIds.join(",")}`,
    `destination=${warning.destination}`
  ];

  if (warning.expiresAt !== null) {
    details.push(`expiresAt=${warning.expiresAt}`);
  }

  if (warning.daysUntilExpiry !== null) {
    details.push(`daysUntilExpiry=${warning.daysUntilExpiry}`);
  }

  if (warning.warningWindowDays !== null) {
    details.push(`warningWindowDays=${warning.warningWindowDays}`);
  }

  return `- warning ${warning.code}: ${warning.message} (${details.join("; ")})`;
}

function renderDiagnosticsReport(report: {
  dryRun: boolean;
  diagnosticsPath: string;
  bundle: ReturnType<typeof createDiagnosticsSupportBundle>;
}): string {
  const { bundle } = report;
  const action = report.dryRun ? "Prepared diagnostics bundle" : "Wrote diagnostics bundle";

  return [
    `${action} ${bundle.correlationId}.`,
    `Diagnostics file: ${report.diagnosticsPath}`,
    `Records: ${bundle.summary.records} `
      + `(accepted=${bundle.summary.accepted}, pending=${bundle.summary.pending}, rejected=${bundle.summary.rejected})`,
    `Scanner: blockers=${bundle.summary.scanBlockers}, warnings=${bundle.summary.scanWarnings}, redactionMarkers=${bundle.summary.redactionMarkers}`,
    `Consistency: ${bundle.summary.consistencyOk ? "ok" : "issues"}`
  ].join("\n");
}

function renderReadContextStatus(status: ReadContextStatus): string {
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
      : destination.acceptedRecordIds.join(", ");

    lines.push(
      [
        `- ${destination.destination}: ${destination.ok ? "no blockers" : "blocked"}`,
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

function renderMigrationIssueDetails(
  issue: Awaited<ReturnType<typeof migrateLedgerEvents>>["issues"][number]
): string {
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
    parts.push(`ids=${issue.recordIds.join(",")}`);
  }

  if (issue.omittedRecordIdCount && issue.omittedRecordIdCount > 0) {
    parts.push(`omittedIds=${issue.omittedRecordIdCount}`);
  }

  if (issue.orderMismatch) {
    parts.push("orderMismatch=true");
  }

  return parts.length > 0 ? `(${parts.join("; ")})` : "";
}

function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
}

function commaSeparatedFlag(parsed: ParsedArgs, name: string): string[] | undefined {
  if (!Object.hasOwn(parsed.flags, name)) {
    return undefined;
  }

  const value = parsed.flags[name];

  if (typeof value !== "string") {
    throw new Error(`--${name} requires comma-separated memory ids.`);
  }

  return value.split(",");
}

function scopeFilterFlag(parsed: ParsedArgs): string[] | undefined {
  const hasScope = Object.hasOwn(parsed.flags, "scope");
  const hasScopes = Object.hasOwn(parsed.flags, "scopes");

  if (!hasScope && !hasScopes) {
    return undefined;
  }

  const value = hasScope ? parsed.flags.scope : parsed.flags.scopes;

  if (typeof value !== "string") {
    throw new Error("--scope requires comma-separated scopes.");
  }

  const raw = value.trim();

  if (!raw) {
    return undefined;
  }

  return raw.split(",");
}

function readPermissionFlag(parsed: ParsedArgs): ReadContextPermissionConstraint | undefined {
  const hasActor = Object.hasOwn(parsed.flags, "actor") || Object.hasOwn(parsed.flags, "read-actor");
  const hasAllowedScopes = Object.hasOwn(parsed.flags, "allowed-scopes");
  const hasValidUntil = Object.hasOwn(parsed.flags, "read-valid-until");
  const hasExcludeConflicts = Object.hasOwn(parsed.flags, "read-exclude-conflicts");
  const hasExcludeSupersedes = Object.hasOwn(parsed.flags, "read-exclude-supersedes");

  if (
    !hasActor
    && !hasAllowedScopes
    && !hasValidUntil
    && !hasExcludeConflicts
    && !hasExcludeSupersedes
  ) {
    return undefined;
  }

  const constraint: ReadContextPermissionConstraint = {};

  if (hasActor) {
    const actor = Object.hasOwn(parsed.flags, "actor")
      ? parsed.flags.actor
      : parsed.flags["read-actor"];

    if (typeof actor !== "string") {
      throw new Error("--actor requires an actor label.");
    }

    constraint.actor = actor;
  }

  if (hasAllowedScopes) {
    const allowedScopes = parsed.flags["allowed-scopes"];

    if (typeof allowedScopes !== "string") {
      throw new Error("--allowed-scopes requires comma-separated scopes.");
    }

    constraint.allowedScopes = allowedScopes.split(",");
  }

  if (hasValidUntil) {
    const validUntil = parsed.flags["read-valid-until"];

    if (typeof validUntil !== "string") {
      throw new Error("--read-valid-until requires an expiry value.");
    }

    constraint.validUntil = validUntil;
  }

  if (hasExcludeConflicts) {
    if (parsed.flags["read-exclude-conflicts"] !== true) {
      throw new Error("--read-exclude-conflicts does not take a value.");
    }

    constraint.excludeConflicts = true;
  }

  if (hasExcludeSupersedes) {
    if (parsed.flags["read-exclude-supersedes"] !== true) {
      throw new Error("--read-exclude-supersedes does not take a value.");
    }

    constraint.excludeSupersedes = true;
  }

  return constraint;
}

function readAccessFlag(parsed: ParsedArgs): ReadAccessOptions {
  const principalId = stringFlag(parsed, "read-principal") ?? stringFlag(parsed, "principal");
  const signature = stringFlag(parsed, "read-signature") ?? stringFlag(parsed, "signature");
  const signedAt = stringFlag(parsed, "read-signed-at") ?? stringFlag(parsed, "signed-at");
  const nonce = stringFlag(parsed, "read-nonce") ?? stringFlag(parsed, "nonce");
  const hasReadAccessFlag = [
    "read-principal",
    "principal",
    "read-signature",
    "signature",
    "read-signed-at",
    "signed-at",
    "read-nonce",
    "nonce"
  ].some((flag) => Object.hasOwn(parsed.flags, flag));

  if (!hasReadAccessFlag) {
    return {};
  }

  for (const flag of [
    "read-principal",
    "principal",
    "read-signature",
    "signature",
    "read-signed-at",
    "signed-at",
    "read-nonce",
    "nonce"
  ]) {
    if (Object.hasOwn(parsed.flags, flag) && typeof parsed.flags[flag] !== "string") {
      throw new Error(`--${flag} requires a value.`);
    }
  }

  return {
    auth: {
      principalId,
      signature,
      signedAt,
      nonce
    }
  };
}

function reviewActionFlag(parsed: ParsedArgs, name: "accept" | "reject"): boolean {
  if (!Object.hasOwn(parsed.flags, name)) {
    return false;
  }

  if (parsed.flags[name] !== true) {
    throw new Error(`--${name} does not take a value.`);
  }

  return true;
}

function hasRelationshipResolutionFlags(parsed: ParsedArgs): boolean {
  return parsed.flags["retire-superseded"] === true
    || parsed.flags["override-relationships"] === true;
}

function liveAdapterFlag(parsed: ParsedArgs): LiveAdapterId {
  const value = stringFlag(parsed, "adapter") ?? "fake";
  const adapters = new Set(listLiveAdapters().map((adapter) => adapter.id));

  if (adapters.has(value as LiveAdapterId)) {
    return value as LiveAdapterId;
  }

  throw new Error(`--adapter must be one of ${[...adapters].join(", ")}.`);
}

function numberFlag(parsed: ParsedArgs, name: string): number | undefined {
  const value = stringFlag(parsed, name);

  if (value === undefined) {
    return undefined;
  }

  const numeric = Number(value);

  if (!Number.isInteger(numeric)) {
    throw new Error(`--${name} must be an integer.`);
  }

  return numeric;
}

function rootFlag(parsed: ParsedArgs): string | undefined {
  return stringFlag(parsed, "root");
}

function riskFlag(parsed: ParsedArgs): MemoryRisk | undefined {
  const value = stringFlag(parsed, "risk");

  if (!value) {
    return undefined;
  }

  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new Error("--risk must be low, medium, or high.");
}

function statusFlag(parsed: ParsedArgs): MemoryStatus | undefined {
  const value = stringFlag(parsed, "status");

  if (!value) {
    return undefined;
  }

  if (value === "pending" || value === "accepted" || value === "rejected" || value === "retired") {
    return value;
  }

  throw new Error("--status must be pending, accepted, rejected, or retired.");
}

function sourceTrustFlag(parsed: ParsedArgs): MemorySourceTrust | undefined {
  const hasSourceTrust = Object.hasOwn(parsed.flags, "source-trust");
  const rawValue = parsed.flags["source-trust"];

  if (!hasSourceTrust) {
    return undefined;
  }

  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    throw new Error("--source-trust must be trusted, unknown, or untrusted.");
  }

  const value = rawValue.trim();

  if (value === "trusted" || value === "unknown" || value === "untrusted") {
    return value;
  }

  throw new Error("--source-trust must be trusted, unknown, or untrusted.");
}

function printHelp(): void {
  console.log(`mempr

Usage:
  mempr propose --memory <text> [--source <uri>] [--source-trust trusted|unknown|untrusted] [--scope repo|project|user] [--risk low|medium|high] [--ttl <value>] [--supersedes <ids>] [--conflicts-with <ids>] [--destination <path>]
  mempr list [--status pending|accepted|rejected|retired] [--risk low|medium|high] [--destination <path>]
  mempr inbox [--risk low|medium|high] [--destination <path>] [--json]
  mempr diff <id> [--json]
  mempr review <id> --accept|--reject --reason <text> [--retire-superseded] [--override-relationships] [--json]
  mempr history <id> [--json]
  mempr accept <id> [--reason <text>] [--retire-superseded] [--override-relationships]
  mempr reject <id> [--reason <text>]
  mempr retire <id> --reason <text>
  mempr relationships [id] [--json]
  mempr export [--destination <path>] [--dry-run] [--json]
  mempr sync-live --adapter fake|mem0|langgraph|llm-wiki|custom [--destination <path>] --dry-run|--confirm [--max-retries <n>] [--json]
  mempr context [--destination <path>] [--scope <scope[,scope]>] [--actor <label> --allowed-scopes <scope[,scope]>] [--read-valid-until <ttl>] [--read-exclude-conflicts] [--read-exclude-supersedes] [--json]
  mempr context-status [--destination <path>] [--json]
  mempr check [--json]
  mempr diagnostics [--dry-run] [--json]
  mempr migrate [--dry-run] [--json]

Options:
  --root <path>          Run against another workspace.
  --dry-run              Preview export or migration/backfill without writing events.
                         With diagnostics, preview the redacted support bundle without appending diagnostics.
  --json                 Print JSON output.
  --reason <text>        Reviewer rationale; required for risky changes and status reversals.
  --retire-superseded    Accept a proposal and retire accepted same-destination records it supersedes.
  --override-relationships Accept with explicit unresolved relationship evidence.
  --confirm              Confirm live adapter sync writes/network attempts.
  --adapter <id>         Live adapter id; defaults to fake.
  --max-retries <n>      Retry count for confirmed live adapter operations; default 2.
  --risk <level>         Explicit proposal risk: low, medium, or high.
  --scope <value>        Proposal scope or context scope filter; context accepts comma-separated scopes.
  --actor <label>        Optional read-context actor label used with --allowed-scopes.
  --read-actor <label>   Alias for --actor.
  --allowed-scopes <csv> Optional read-context allowed scopes used with --actor.
  --read-valid-until <v> Optional read-context expiry threshold used with --actor and --allowed-scopes.
  --read-exclude-conflicts Optional read-context filter for records declaring conflicts.
  --read-exclude-supersedes Optional read-context filter for records declaring supersessions.
  --read-principal <id> Local-key principal id used when .mempr/read-policy.json exists.
  --read-signature <v> Signature over the deterministic MemPR read request payload.
  --read-signed-at <v> Optional signed request timestamp included in the signed payload.
  --read-nonce <v>     Optional signed request nonce included in the signed payload.
  --source-trust <level> Source trust metadata: trusted, unknown, or untrusted.
  --ttl <value>          Store a canonical expiry; expired accepted records block export.
  --supersedes <ids>     Comma-separated memory ids this proposal supersedes.
  --conflicts-with <ids> Comma-separated memory ids this proposal conflicts with.
  --destination <path>   Destination path for proposal/export filtering; defaults to MEMORY.md.
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`mempr: ${message}`);
  process.exitCode = 1;
});
