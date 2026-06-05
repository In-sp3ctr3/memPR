import {
  getReviewContext
} from "./ledger.js";
import {
  normalizeRequiredTextArg,
  requireMutationConfirmation,
  toolSuccess,
  unsupportedKeys
} from "./mcp-tool-args.js";
import { toolError } from "./mcp-tool-args.js";
import type { ToolResult } from "./mcp-tool-args.js";
import {
  safeHumanReviewPrompt,
  safeMcpRecordSummary
} from "./mcp-safe-projections.js";
import {
  PREVIEW_ALLOWED_ARGS,
  SUGGEST_ALLOWED_ARGS,
  previewInputArg,
  suggestOptionsArg,
  suggestSourceArg
} from "./mcp-suggest-args.js";
import type { McpSuggestSource } from "./mcp-suggest-args.js";
import {
  previewMemoryDiff,
  proposeSuggestionCandidates,
  safeCandidatePreview,
  suggestFromExistingMemoryFile,
  suggestFromGitDiff,
  suggestFromObservation,
  suggestFromTranscript
} from "./suggest.js";

export async function callSuggestTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, SUGGEST_ALLOWED_ARGS);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const source = suggestSourceArg(args);

  if (!source.ok) {
    return source.error;
  }

  const options = suggestOptionsArg(args);

  if (!options.ok) {
    return options.error;
  }

  const suggestions = await loadSuggestions(source.value!, root, options.value!);
  return toolSuccess({
    suggestions: suggestions.map(safeCandidatePreview)
  }, `Found ${suggestions.length} suggestion(s).`);
}

export async function callProposeFromObservationTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const confirmationError = requireMutationConfirmation(args);

  if (confirmationError) {
    return confirmationError;
  }

  const unsupported = unsupportedKeys(args, [
    "observation",
    "destination",
    "scope",
    "sourceTrust",
    "limit",
    "confirm"
  ]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const observation = normalizeRequiredTextArg(args.observation);

  if (!observation) {
    return toolError("invalid_arguments", "Observation text is required.");
  }

  const options = suggestOptionsArg(args);

  if (!options.ok) {
    return options.error;
  }

  const suggestions = await suggestFromObservation(observation, {
    ...options.value!,
    root
  });
  const proposalReport = await proposeSuggestionCandidates(suggestions, root);

  return toolSuccess({
    suggestions: suggestions.map(safeCandidatePreview),
    proposalReport
  }, `Proposed ${proposalReport.records.length} memory record(s) from observation.`);
}

export async function callPreviewMemoryDiffTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, PREVIEW_ALLOWED_ARGS);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const input = previewInputArg(args);

  if (!input.ok) {
    return input.error;
  }

  const preview = await previewMemoryDiff(input.value!, root);
  return toolSuccess({
    preview
  }, `Previewed memory proposal for ${preview.destination}.`);
}

export async function callRequestHumanReviewTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const unsupported = unsupportedKeys(args, ["id", "auth", "readAccess"]);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const id = normalizeRequiredTextArg(args.id);

  if (!id || !/^mem_[A-Za-z0-9_-]+$/.test(id)) {
    return toolError("invalid_arguments", "Invalid memory id argument.");
  }

  const reviewContext = await getReviewContext(id, root);

  if (reviewContext.candidate.status !== "pending") {
    return toolError("invalid_arguments", "Human review prompt requires a pending record.");
  }

  return toolSuccess({
    record: safeMcpRecordSummary(reviewContext.candidate),
    prompt: safeHumanReviewPrompt(reviewContext)
  }, `Prepared human review prompt for ${id}.`);
}

async function loadSuggestions(
  source: McpSuggestSource,
  root: string,
  options: Omit<Parameters<typeof suggestFromObservation>[1], "root"> = {}
) {
  const suggestOptions = {
    ...options,
    root
  };

  if (source.kind === "transcript") {
    return suggestFromTranscript(source.path, suggestOptions);
  }

  if (source.kind === "git_diff") {
    return suggestFromGitDiff(source.range, suggestOptions);
  }

  if (source.kind === "existing_memory_file") {
    return suggestFromExistingMemoryFile(source.path, suggestOptions);
  }

  return suggestFromObservation(source.observation, suggestOptions);
}
