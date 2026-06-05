import {
  acceptMemoryWithRelationships,
  exportMarkdown,
  updateRecordStatus
} from "./ledger.js";
import { syncLiveAdapter } from "./live-adapters.js";
import type { LiveSyncInput } from "./live-adapters.js";
import {
  isSafeRecordId,
  normalizeRequiredTextArg,
  optionalBooleanArg,
  optionalDestinationArg,
  optionalLiveAdapterArg,
  optionalNumberArg,
  optionalTextArg,
  requireMutationConfirmation,
  toolError,
  toolSuccess,
  unsupportedKeys
} from "./mcp-tool-args.js";
import type { ToolResult } from "./mcp-tool-args.js";
import { DEFAULT_EXPORT_DESTINATION } from "./mcp-tool-defaults.js";
import type { MemoryStatus } from "./types.js";

export { callProposeTool } from "./mcp-propose-tool.js";

export async function callReviewTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const confirmationError = requireMutationConfirmation(args);

  if (confirmationError) {
    return confirmationError;
  }

  const unsupported = unsupportedKeys(args, [
    "id",
    "decision",
    "reason",
    "reviewer",
    "retireSuperseded",
    "overrideRelationships",
    "confirm"
  ]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const id = normalizeRequiredTextArg(args.id);

  if (!id) {
    return toolError("invalid_arguments", "Memory id is required.");
  }

  if (!isSafeRecordId(id)) {
    return toolError("invalid_arguments", "Invalid memory id argument.");
  }

  if (args.decision !== "accept" && args.decision !== "reject" && args.decision !== "retire") {
    return toolError("invalid_arguments", "Decision must be accept, reject, or retire.");
  }

  const reason = normalizeRequiredTextArg(args.reason);

  if (!reason) {
    return toolError("invalid_arguments", "Review reason is required.");
  }

  const retireSuperseded = optionalBooleanArg(args, "retireSuperseded");
  const overrideRelationships = optionalBooleanArg(args, "overrideRelationships");
  const reviewer = optionalTextArg(args, "reviewer");

  if (!retireSuperseded.ok) {
    return retireSuperseded.error;
  }

  if (!overrideRelationships.ok) {
    return overrideRelationships.error;
  }

  if (!reviewer.ok) {
    return reviewer.error;
  }

  if (args.decision === "accept" && (retireSuperseded.value || overrideRelationships.value)) {
    const result = await acceptMemoryWithRelationships(id, {
      reason,
      retireSuperseded: retireSuperseded.value === true,
      overrideRelationships: overrideRelationships.value === true,
      reviewer: reviewer.value
    }, root);

    return toolSuccess({
      record: result.record,
      relationshipResolution: result
    }, `Reviewed memory ${result.record.id}.`);
  }

  const status: MemoryStatus = args.decision === "accept"
    ? "accepted"
    : args.decision === "retire"
      ? "retired"
      : "rejected";
  const record = await updateRecordStatus(id, status, reason, root, {
    reviewer: reviewer.value
  });
  return toolSuccess({
    record
  }, `Reviewed memory ${record.id}.`);
}

export async function callLiveSyncTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, [
    "adapter",
    "destination",
    "dryRun",
    "maxRetries",
    "confirm"
  ]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const dryRun = optionalBooleanArg(args, "dryRun");

  if (!dryRun.ok) {
    return dryRun.error;
  }

  if (dryRun.value !== true) {
    const confirmationError = requireMutationConfirmation(args);

    if (confirmationError) {
      return confirmationError;
    }
  }

  const adapter = optionalLiveAdapterArg(args);
  const destination = optionalDestinationArg(args, DEFAULT_EXPORT_DESTINATION);
  const maxRetries = optionalNumberArg(args, "maxRetries");

  if (!adapter.ok) {
    return adapter.error;
  }

  if (!destination.ok) {
    return destination.error;
  }

  if (!maxRetries.ok) {
    return maxRetries.error;
  }

  const input: LiveSyncInput = {
    adapterId: adapter.value,
    destination: destination.value,
    dryRun: dryRun.value === true,
    confirm: args.confirm === true
  };

  if (maxRetries.value !== undefined) {
    input.maxRetries = maxRetries.value;
  }

  const report = await syncLiveAdapter(input, root);
  return toolSuccess({
    report
  }, `Live sync ${report.ok ? "completed" : "reported issues"}.`);
}

export async function callExportTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const confirmationError = requireMutationConfirmation(args);

  if (confirmationError) {
    return confirmationError;
  }

  const unsupported = unsupportedKeys(args, ["destination", "confirm"]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const destination = optionalDestinationArg(args, DEFAULT_EXPORT_DESTINATION);

  if (!destination.ok) {
    return destination.error;
  }

  await exportMarkdown(destination.value, root);
  return toolSuccess({
    destination: destination.value
  }, `Exported ${destination.value}.`);
}
