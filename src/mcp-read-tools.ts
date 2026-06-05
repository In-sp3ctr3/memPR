import {
  analyzeRelationshipGraph,
  assembleReadContext,
  checkLedgerConsistency,
  getRecordHistory,
  getReviewContext,
  listRecords,
  previewMarkdownExport,
  summarizeReadContextStatus
} from "./ledger.js";
import { normalizeDestinationForOperation } from "./destination-safety.js";
import {
  isMemoryRisk,
  isMemoryStatus,
  isSafeRecordId,
  optionalDestinationArg,
  optionalReadAccessArg,
  readContextOptionsArg,
  readContextStatusOptionsArg,
  requiredStringArg,
  toolError,
  toolSuccess,
  unsupportedKeys,
  validateMcpPreviewDestination
} from "./mcp-tool-args.js";
import type { ToolResult } from "./mcp-tool-args.js";
import { DEFAULT_EXPORT_DESTINATION } from "./mcp-tool-defaults.js";
import {
  safeMcpRecordHistory,
  safeMcpRecordSummaries,
  safeMcpRecordSummary,
  safeMcpReviewContext
} from "./mcp-safe-projections.js";
import type { ListFilters } from "./types.js";

export async function callListTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, [
    "status",
    "risk",
    "destination",
    "reviewOnly",
    "auth",
    "readAccess"
  ]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const readAccess = optionalReadAccessArg(args);

  if (!readAccess.ok) {
    return readAccess.error;
  }

  const filters: ListFilters = {};

  if (args.status !== undefined && !isMemoryStatus(args.status)) {
    return toolError("invalid_arguments", "Invalid status argument.");
  }

  if (args.risk !== undefined && !isMemoryRisk(args.risk)) {
    return toolError("invalid_arguments", "Invalid risk argument.");
  }

  if (
    args.destination !== undefined
    && (typeof args.destination !== "string" || !args.destination.trim())
  ) {
    return toolError("invalid_arguments", "Invalid destination argument.");
  }

  if (isMemoryStatus(args.status)) {
    filters.status = args.status;
  }

  if (isMemoryRisk(args.risk)) {
    filters.risk = args.risk;
  }

  if (typeof args.destination === "string") {
    filters.destination = args.destination.trim();
  }

  if (args.reviewOnly === true) {
    filters.status = "pending";
  } else if (args.reviewOnly !== undefined && typeof args.reviewOnly !== "boolean") {
    return toolError("invalid_arguments", "Invalid reviewOnly argument.");
  }

  const records = await listRecords(filters, root, readAccess.value);
  return toolSuccess({
    records: safeMcpRecordSummaries(records)
  }, `Found ${records.length} MemPR record(s).`);
}

export async function callInspectTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, ["id", "auth", "readAccess"]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const readAccess = optionalReadAccessArg(args);

  if (!readAccess.ok) {
    return readAccess.error;
  }

  const id = requiredStringArg(args, "id");

  if (!id) {
    return toolError("invalid_arguments", "Memory id is required.");
  }

  if (!isSafeRecordId(id)) {
    return toolError("invalid_arguments", "Invalid memory id argument.");
  }

  const reviewContext = await getReviewContext(id, root, readAccess.value);
  return toolSuccess({
    record: safeMcpRecordSummary(reviewContext.candidate),
    reviewContext: safeMcpReviewContext(reviewContext)
  }, `Loaded review context for ${id}.`);
}

export async function callHistoryTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, ["id", "auth", "readAccess"]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const readAccess = optionalReadAccessArg(args);

  if (!readAccess.ok) {
    return readAccess.error;
  }

  const id = requiredStringArg(args, "id");

  if (!id) {
    return toolError("invalid_arguments", "Memory id is required.");
  }

  if (!isSafeRecordId(id)) {
    return toolError("invalid_arguments", "Invalid memory id argument.");
  }

  const history = await getRecordHistory(id, root, readAccess.value);
  return toolSuccess(safeMcpRecordHistory(history), `Loaded history for ${id}.`);
}

export async function callCheckTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, ["auth", "readAccess"]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const readAccess = optionalReadAccessArg(args);

  if (!readAccess.ok) {
    return readAccess.error;
  }

  const status = await checkLedgerConsistency(root, readAccess.value);
  return toolSuccess({
    status
  }, `Ledger consistency: ${status.ok ? "ok" : "issues found"}.`);
}

export async function callContextTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, [
    "destination",
    "scope",
    "scopes",
    "readPermission",
    "auth",
    "readAccess"
  ]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const contextOptions = readContextOptionsArg(args);

  if (!contextOptions.ok) {
    return contextOptions.error;
  }

  const readAccess = optionalReadAccessArg(args);

  if (!readAccess.ok) {
    return readAccess.error;
  }

  contextOptions.value!.readAccess = readAccess.value;

  const context = await assembleReadContext(
    contextOptions.value!,
    root
  );
  return toolSuccess(
    context as unknown as Record<string, unknown>,
    context.ok
      ? `Assembled context ${context.destination}.`
      : `Read context assembly blocked for ${context.destination}.`
  );
}

export async function callContextStatusTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, ["destination", "auth", "readAccess"]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const statusOptions = readContextStatusOptionsArg(args);

  if (!statusOptions.ok) {
    return statusOptions.error;
  }

  const readAccess = optionalReadAccessArg(args);

  if (!readAccess.ok) {
    return readAccess.error;
  }

  statusOptions.value!.readAccess = readAccess.value;

  const status = await summarizeReadContextStatus(statusOptions.value!, root);
  return toolSuccess(
    status as unknown as Record<string, unknown>,
    status.blocked
      ? `Read context status found ${status.blockedCount} destination(s) with blockers.`
      : `Read context status found no blockers across ${status.destinationCount} destination(s).`
  );
}

export async function callRelationshipsTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, ["id", "auth", "readAccess"]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const readAccess = optionalReadAccessArg(args);

  if (!readAccess.ok) {
    return readAccess.error;
  }

  if (args.id !== undefined && (typeof args.id !== "string" || !isSafeRecordId(args.id))) {
    return toolError("invalid_arguments", "Invalid id argument.");
  }

  const graph = await analyzeRelationshipGraph(root);
  const recordId = typeof args.id === "string" ? args.id : undefined;
  const payload = recordId
    ? {
        recordId,
        incoming: graph.incoming[recordId] ?? { supersedes: [], conflicts_with: [] },
        outgoing: graph.outgoing[recordId] ?? { supersedes: [], conflicts_with: [] },
        cycles: graph.cycles.filter((cycle) => cycle.recordIds.includes(recordId)),
        missingReferences: graph.missingReferences.filter((reference) => {
          return reference.recordId === recordId || reference.missingRecordId === recordId;
        })
      }
    : graph;

  return toolSuccess({
    graph: payload
  }, "Analyzed MemPR relationship graph.");
}

export async function callExportPreviewTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, ["destination", "auth", "readAccess"]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const destination = optionalDestinationArg(args, DEFAULT_EXPORT_DESTINATION);

  if (!destination.ok) {
    return destination.error;
  }

  const previewDestination = normalizeDestinationForOperation(
    destination.value ?? DEFAULT_EXPORT_DESTINATION,
    "export_preview"
  );
  const disclosureError = await validateMcpPreviewDestination(previewDestination, root);

  if (disclosureError) {
    return disclosureError;
  }

  const readAccess = optionalReadAccessArg(args);

  if (!readAccess.ok) {
    return readAccess.error;
  }

  const preview = await previewMarkdownExport(previewDestination, root, readAccess.value);
  return toolSuccess({
    dryRun: true,
    ...preview
  }, `Previewed export ${preview.destination}.`);
}
