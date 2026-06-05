import { proposeMemory } from "./ledger.js";
import { MemoryProposalBlockedError } from "./errors.js";
import {
  PROPOSE_ALLOWED_ARGS,
  blockedProposalToolError,
  isMemoryRisk,
  isMemorySourceTrust,
  isMemorySourceType,
  normalizeRequiredTextArg,
  optionalBooleanArg,
  optionalDestinationArg,
  optionalIdArrayArg,
  optionalNumberArg,
  optionalTextArg,
  optionalTtlArg,
  requireMutationConfirmation,
  toolError,
  toolSuccess,
  unsupportedKeys
} from "./mcp-tool-args.js";
import type { ToolResult } from "./mcp-tool-args.js";
import { MEMORY_KINDS } from "./types.js";
import type {
  MemoryKind,
  ProposeMemoryInput
} from "./types.js";

export async function callProposeTool(
  args: Record<string, unknown>,
  root: string
): Promise<ToolResult> {
  const confirmationError = requireMutationConfirmation(args);

  if (confirmationError) {
    return confirmationError;
  }

  const unsupported = unsupportedKeys(args, PROPOSE_ALLOWED_ARGS);

  if (unsupported.length > 0) {
    return toolError("invalid_arguments", "Unsupported argument(s).");
  }

  const memory = normalizeRequiredTextArg(args.memory);

  if (!memory) {
    return toolError("invalid_arguments", "Memory text is required.");
  }

  const source = optionalTextArg(args, "source");
  const quote = optionalTextArg(args, "quote");
  const scope = optionalTextArg(args, "scope");
  const ttl = optionalTtlArg(args);
  const destination = optionalDestinationArg(args);
  const supersedes = optionalIdArrayArg(args, "supersedes");
  const conflictsWith = optionalIdArrayArg(args, "conflictsWith");
  const verifySource = optionalBooleanArg(args, "verifySource");
  const sourceLineStart = optionalNumberArg(args, "sourceLineStart");
  const sourceLineEnd = optionalNumberArg(args, "sourceLineEnd");
  const sourceHash = optionalTextArg(args, "sourceHash");
  const gitCommit = optionalTextArg(args, "gitCommit");
  const tags = optionalStringArrayArg(args, "tags");
  const appliesToPaths = optionalStringArrayArg(args, "appliesToPaths");
  const retentionClass = optionalTextArg(args, "retentionClass");
  const confidence = optionalBoundedNumberArg(args, "confidence", 0, 1);
  const priority = optionalBoundedIntegerArg(args, "priority", 1, 5);

  if (!source.ok) {
    return source.error;
  }

  if (!quote.ok) {
    return quote.error;
  }

  if (!scope.ok) {
    return scope.error;
  }

  if (!ttl.ok) {
    return ttl.error;
  }

  if (!destination.ok) {
    return destination.error;
  }

  if (!supersedes.ok) {
    return supersedes.error;
  }

  if (!conflictsWith.ok) {
    return conflictsWith.error;
  }

  if (!verifySource.ok) {
    return verifySource.error;
  }

  if (!sourceLineStart.ok) {
    return sourceLineStart.error;
  }

  if (!sourceLineEnd.ok) {
    return sourceLineEnd.error;
  }

  if (!sourceHash.ok) {
    return sourceHash.error;
  }

  if (!gitCommit.ok) {
    return gitCommit.error;
  }

  if (!tags.ok) {
    return tags.error;
  }

  if (!appliesToPaths.ok) {
    return appliesToPaths.error;
  }

  if (!retentionClass.ok) {
    return retentionClass.error;
  }

  if (!confidence.ok) {
    return confidence.error;
  }

  if (!priority.ok) {
    return priority.error;
  }

  if (
    (sourceLineStart.value === undefined) !== (sourceLineEnd.value === undefined)
  ) {
    return toolError(
      "invalid_arguments",
      "sourceLineStart and sourceLineEnd must be supplied together."
    );
  }

  if (
    (sourceLineStart.value !== undefined && sourceLineStart.value < 1)
    || (sourceLineEnd.value !== undefined && sourceLineEnd.value < 1)
  ) {
    return toolError("invalid_arguments", "Source line range must use positive integers.");
  }

  if (
    sourceLineStart.value !== undefined
    && sourceLineEnd.value !== undefined
    && sourceLineEnd.value < sourceLineStart.value
  ) {
    return toolError(
      "invalid_arguments",
      "sourceLineEnd must be greater than or equal to sourceLineStart."
    );
  }

  if (sourceHash.value !== undefined && !/^[0-9a-f]{64}$/i.test(sourceHash.value)) {
    return toolError("invalid_arguments", "sourceHash must be a SHA-256 hex string.");
  }

  if (args.risk !== undefined && !isMemoryRisk(args.risk)) {
    return toolError("invalid_arguments", "Invalid risk argument.");
  }

  if (args.sourceType !== undefined && !isMemorySourceType(args.sourceType)) {
    return toolError("invalid_arguments", "Invalid sourceType argument.");
  }

  if (args.sourceTrust !== undefined && !isMemorySourceTrust(args.sourceTrust)) {
    return toolError("invalid_arguments", "Invalid sourceTrust argument.");
  }

  if (args.kind !== undefined && !isMemoryKind(args.kind)) {
    return toolError("invalid_arguments", "Invalid kind argument.");
  }

  const input: ProposeMemoryInput = {
    memory
  };

  if (source.value !== undefined) {
    input.source = source.value;
  }

  if (typeof args.sourceType === "string") {
    input.sourceType = args.sourceType;
  }

  if (isMemorySourceTrust(args.sourceTrust)) {
    input.sourceTrust = args.sourceTrust;
  }

  if (quote.value !== undefined) {
    input.quote = quote.value;
  }

  if (verifySource.value !== undefined) {
    input.verifySource = verifySource.value;
  }

  if (sourceLineStart.value !== undefined && sourceLineEnd.value !== undefined) {
    input.sourceLineStart = sourceLineStart.value;
    input.sourceLineEnd = sourceLineEnd.value;
  }

  if (sourceHash.value !== undefined) {
    input.sourceHash = sourceHash.value.toLowerCase();
  }

  if (gitCommit.value !== undefined) {
    input.gitCommit = gitCommit.value;
  }

  if (isMemoryKind(args.kind)) {
    input.kind = args.kind;
  }

  if (tags.value !== undefined) {
    input.tags = tags.value;
  }

  if (confidence.value !== undefined) {
    input.confidence = confidence.value;
  }

  if (retentionClass.value !== undefined) {
    input.retentionClass = retentionClass.value;
  }

  if (priority.value !== undefined) {
    input.priority = priority.value;
  }

  if (appliesToPaths.value !== undefined) {
    input.appliesToPaths = appliesToPaths.value;
  }

  if (scope.value !== undefined) {
    input.scope = scope.value;
  }

  if (isMemoryRisk(args.risk)) {
    input.risk = args.risk;
  }

  if (ttl.value !== undefined) {
    input.ttl = ttl.value;
  }

  if (destination.value !== undefined) {
    input.destination = destination.value;
  }

  if (supersedes.value !== undefined) {
    input.supersedes = supersedes.value;
  }

  if (conflictsWith.value !== undefined) {
    input.conflictsWith = conflictsWith.value;
  }

  try {
    const record = await proposeMemory(input, root);
    return toolSuccess({
      record
    }, `Proposed memory ${record.id}.`);
  } catch (error) {
    if (error instanceof MemoryProposalBlockedError) {
      return blockedProposalToolError(error);
    }

    throw error;
  }
}

function optionalStringArrayArg(
  args: Record<string, unknown>,
  key: "tags" | "appliesToPaths"
): { ok: true; value?: string[] } | { ok: false; error: ToolResult } {
  const value = args[key];

  if (value === undefined) {
    return { ok: true };
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return {
      ok: false,
      error: toolError("invalid_arguments", `Invalid ${key} argument.`)
    };
  }

  return {
    ok: true,
    value: value as string[]
  };
}

function optionalBoundedNumberArg(
  args: Record<string, unknown>,
  key: "confidence",
  min: number,
  max: number
): { ok: true; value?: number } | { ok: false; error: ToolResult } {
  const value = args[key];

  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    return {
      ok: false,
      error: toolError("invalid_arguments", `Invalid ${key} argument.`)
    };
  }

  return {
    ok: true,
    value
  };
}

function optionalBoundedIntegerArg(
  args: Record<string, unknown>,
  key: "priority",
  min: number,
  max: number
): { ok: true; value?: number } | { ok: false; error: ToolResult } {
  const value = args[key];

  if (value === undefined) {
    return { ok: true };
  }

  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < min
    || value > max
  ) {
    return {
      ok: false,
      error: toolError("invalid_arguments", `Invalid ${key} argument.`)
    };
  }

  return {
    ok: true,
    value
  };
}

function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && MEMORY_KINDS.includes(value as MemoryKind);
}
