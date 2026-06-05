import {
  normalizeRequiredTextArg,
  optionalDestinationArg,
  optionalNumberArg,
  optionalTextArg,
  toolError
} from "./mcp-tool-args.js";
import type { ArgResult } from "./mcp-tool-args.js";
export {
  PREVIEW_ALLOWED_ARGS,
  previewInputArg
} from "./mcp-preview-args.js";
import type {
  MemorySourceTrust
} from "./types.js";
import { MEMORY_SOURCE_TRUST } from "./types.js";

export type McpSuggestSource =
  | { kind: "transcript"; path: string }
  | { kind: "git_diff"; range: string | undefined }
  | { kind: "existing_memory_file"; path: string }
  | { kind: "observation"; observation: string };

export const SUGGEST_ALLOWED_ARGS = [
  "fromTranscript",
  "fromGitDiff",
  "fromMemoryFile",
  "observation",
  "destination",
  "scope",
  "sourceTrust",
  "limit",
  "auth",
  "readAccess"
];

export function suggestSourceArg(args: Record<string, unknown>): ArgResult<McpSuggestSource> {
  const sources: McpSuggestSource[] = [];

  if (args.fromTranscript !== undefined) {
    const path = normalizeRequiredTextArg(args.fromTranscript);

    if (!path) {
      return invalidSource();
    }

    sources.push({ kind: "transcript", path });
  }

  if (args.fromGitDiff !== undefined) {
    if (args.fromGitDiff !== true && typeof args.fromGitDiff !== "string") {
      return invalidSource();
    }

    sources.push({
      kind: "git_diff",
      range: typeof args.fromGitDiff === "string" && args.fromGitDiff.trim()
        ? args.fromGitDiff.trim()
        : undefined
    });
  }

  if (args.fromMemoryFile !== undefined) {
    const path = normalizeRequiredTextArg(args.fromMemoryFile);

    if (!path) {
      return invalidSource();
    }

    sources.push({ kind: "existing_memory_file", path });
  }

  if (args.observation !== undefined) {
    const observation = normalizeRequiredTextArg(args.observation);

    if (!observation) {
      return invalidSource();
    }

    sources.push({ kind: "observation", observation });
  }

  if (sources.length !== 1) {
    return invalidSource();
  }

  return {
    ok: true,
    value: sources[0]
  };
}

export function suggestOptionsArg(args: Record<string, unknown>): ArgResult<{
  root: string;
  destination?: string;
  scope?: string;
  sourceTrust?: MemorySourceTrust;
  limit?: number;
}> {
  const destination = optionalDestinationArg(args);
  const scope = optionalTextArg(args, "scope");
  const limit = optionalNumberArg(args, "limit");

  if (!destination.ok) {
    return destination;
  }

  if (!scope.ok) {
    return scope;
  }

  if (!limit.ok) {
    return limit;
  }

  if (limit.value !== undefined && (!Number.isInteger(limit.value) || limit.value < 1)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid limit argument.")
    };
  }

  if (args.sourceTrust !== undefined && !isMemorySourceTrust(args.sourceTrust)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid sourceTrust argument.")
    };
  }

  const value: {
    root: string;
    destination?: string;
    scope?: string;
    sourceTrust?: MemorySourceTrust;
    limit?: number;
  } = {
    root: ""
  };

  if (destination.value !== undefined) {
    value.destination = destination.value;
  }

  if (scope.value !== undefined) {
    value.scope = scope.value;
  }

  if (isMemorySourceTrust(args.sourceTrust)) {
    value.sourceTrust = args.sourceTrust;
  }

  if (limit.value !== undefined) {
    value.limit = limit.value;
  }

  return {
    ok: true,
    value
  };
}

function invalidSource(): ArgResult<McpSuggestSource> {
  return {
    ok: false,
    error: toolError(
      "invalid_arguments",
      "Exactly one suggestion source is required."
    )
  };
}

function isMemorySourceTrust(value: unknown): value is MemorySourceTrust {
  return typeof value === "string" && MEMORY_SOURCE_TRUST.includes(value as MemorySourceTrust);
}
