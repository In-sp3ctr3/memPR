import {
  checkLedgerConsistency,
  listRecords
} from "./ledger.js";
import {
  appendDiagnosticEntry,
  createCorrelationId,
  createDiagnosticsSupportBundle,
  redactDiagnosticPath,
  resolveDiagnosticsPaths
} from "./diagnostics.js";
import {
  readAccessFlag,
  rootFlag
} from "./cli-args.js";
import type { ParsedArgs } from "./cli-args.js";
import { printJsonOrText } from "./cli-output.js";
import {
  renderDiagnosticsReport,
  renderMigrationStatus
} from "./cli-renderers.js";
import { migrateLedgerEvents } from "./migration.js";
import { scanAcceptedMemoryRecords } from "./scanner.js";

export async function handleDiagnostics(parsed: ParsedArgs): Promise<void> {
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
    diagnosticsPath: redactDiagnosticPath(diagnosticsPath),
    bundle
  };

  printJsonOrText(parsed, payload, renderDiagnosticsReport(payload));

  if (scan.issues.length > 0 || !consistency.ok) {
    process.exitCode = 1;
  }
}

export async function handleMigrate(parsed: ParsedArgs): Promise<void> {
  const report = await migrateLedgerEvents(rootFlag(parsed), {
    dryRun: parsed.flags["dry-run"] === true
  });

  printJsonOrText(parsed, report, renderMigrationStatus(report));

  if (report.issues.length > 0) {
    process.exitCode = 1;
  }
}
