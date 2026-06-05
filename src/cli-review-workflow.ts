import {
  blameMemory,
  diffExport,
  guardExport,
  renderBlameReport,
  renderDiffExportReport,
  renderGuardReport
} from "./review-workflow.js";
import {
  rootFlag,
  stringFlag
} from "./cli-args.js";
import type { ParsedArgs } from "./cli-args.js";
import { printJsonOrText } from "./cli-output.js";

export async function handleDiffExport(parsed: ParsedArgs): Promise<void> {
  const destination = requiredDestination(parsed);
  const report = await diffExport(destination, rootFlag(parsed));

  printJsonOrText(parsed, report, renderDiffExportReport(report));
  process.exitCode = report.exitCode;
}

export async function handleGuard(parsed: ParsedArgs): Promise<void> {
  const destination = requiredDestination(parsed);
  const report = await guardExport(destination, rootFlag(parsed));

  printJsonOrText(parsed, report, renderGuardReport(report));
  process.exitCode = report.exitCode;
}

export async function handleBlame(parsed: ParsedArgs): Promise<void> {
  const id = parsed.positionals[0];

  if (!id) {
    throw new Error("Missing memory id for blame.");
  }

  const report = await blameMemory(id, rootFlag(parsed));
  printJsonOrText(parsed, report, renderBlameReport(report));
}

function requiredDestination(parsed: ParsedArgs): string {
  const destination = stringFlag(parsed, "destination");

  if (!destination) {
    throw new Error("Missing --destination.");
  }

  return destination;
}
