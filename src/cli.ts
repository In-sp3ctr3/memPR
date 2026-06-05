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
  syncLiveAdapter
} from "./live-adapters.js";
import { handleSuggest } from "./cli-suggest.js";
import {
  handleDiagnostics,
  handleMigrate
} from "./cli-maintenance.js";
import { printJsonOrText } from "./cli-output.js";
import {
  handleBlame,
  handleDiffExport,
  handleGuard
} from "./cli-review-workflow.js";
import { printHelp } from "./cli-help.js";
import {
  renderConsistencyStatus,
  renderExportPreview,
  renderLiveSyncReport,
  renderReadContext,
  renderReadContextStatus,
  renderReadContextWarning,
  renderRelationshipGraph,
  renderRelationshipResolution,
  renderRepairStatus
} from "./cli-renderers.js";
import {
  commaSeparatedFlag,
  hasRelationshipResolutionFlags,
  liveAdapterFlag,
  numberFlag,
  parseArgs,
  proposalModelFlags,
  readAccessFlag,
  readPermissionFlag,
  reviewerFlag,
  reviewActionFlag,
  riskFlag,
  rootFlag,
  scopeFilterFlag,
  sourceVerificationFlags,
  sourceTrustFlag,
  statusFlag,
  stringFlag
} from "./cli-args.js";
import type { ParsedArgs } from "./cli-args.js";
import { MemoryProposalBlockedError } from "./errors.js";
import { sanitizeErrorMessage } from "./safety.js";
import type {
  ReadContextOptions
} from "./ledger.js";
import type { MemoryStatus } from "./types.js";

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
    case "blame":
      await handleBlame(parsed);
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
    case "suggest":
      await handleSuggest(parsed);
      return;
    case "sync-live":
      await handleSyncLive(parsed);
      return;
    case "export":
      await handleExport(parsed);
      return;
    case "diff-export":
      await handleDiffExport(parsed);
      return;
    case "guard":
      await handleGuard(parsed);
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
      ...sourceVerificationFlags(parsed),
      scope: stringFlag(parsed, "scope"),
      ...proposalModelFlags(parsed),
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
        overrideRelationships: parsed.flags["override-relationships"] === true,
        reviewer: reviewerFlag(parsed)
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
    rootFlag(parsed),
    { reviewer: reviewerFlag(parsed) }
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
        overrideRelationships: parsed.flags["override-relationships"] === true,
        reviewer: reviewerFlag(parsed)
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
    rootFlag(parsed),
    { reviewer: reviewerFlag(parsed) }
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
  await exportMarkdown(destination, rootFlag(parsed));
  const payload = {
    destination: preview.destination,
    warnings: preview.warnings
  };
  const warningText = preview.warnings.length === 0
    ? ""
    : `\n${preview.warnings.map(renderReadContextWarning).join("\n")}`;

  printJsonOrText(parsed, payload, `Exported ${preview.destination}${warningText}`);
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

const cliArgs = process.argv.slice(2);

main(cliArgs).catch((error: unknown) => {
  if (error instanceof MemoryProposalBlockedError) {
    const message = "Memory proposal blocked without persistence because it contains unsafe persistent content.";

    if (cliArgs.includes("--json")) {
      printJsonError(error.code, message);
    } else {
      console.error(`mempr: ${message}`);
    }

    process.exitCode = 1;
    return;
  }

  const message = sanitizeErrorMessage(error);

  if (cliArgs.includes("--json")) {
    printJsonError(errorCode(error), message);
  } else {
    console.error(`mempr: ${message}`);
  }

  process.exitCode = 1;
});

function printJsonError(code: string, message: string): void {
  printJsonOrText({
    command: undefined,
    positionals: [],
    flags: { json: true }
  }, {
    ok: false,
    error: {
      code,
      message
    }
  }, "");
}

function errorCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code;
  }

  return "MEMPR_CLI_ERROR";
}
