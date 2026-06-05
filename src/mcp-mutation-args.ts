import {
  MEMPR_MANAGED_BLOCK_END,
  MEMPR_MANAGED_BLOCK_START,
  normalizeLocalFileDestination
} from "./export-adapters.js";
import { safeReadOptionalRepoFile } from "./repo-file-reader.js";
import type { ArgResult, ToolResult } from "./mcp-tool-arg-types.js";
import { safeErrorMessage, toolError } from "./mcp-tool-results.js";
import {
  isSafeRecordId,
  normalizeRequiredTextArg
} from "./mcp-tool-arg-validators.js";
import { normalizeExpiry } from "./ttl.js";

export const PROPOSE_ALLOWED_ARGS = [
  "memory",
  "source",
  "sourceType",
  "sourceTrust",
  "quote",
  "verifySource",
  "sourceLineStart",
  "sourceLineEnd",
  "sourceHash",
  "gitCommit",
  "kind",
  "tags",
  "confidence",
  "retentionClass",
  "priority",
  "appliesToPaths",
  "scope",
  "risk",
  "ttl",
  "destination",
  "supersedes",
  "conflictsWith",
  "confirm"
] as const;

export function optionalTtlArg(args: Record<string, unknown>): ArgResult<string | null> {
  const value = args.ttl;

  if (value === undefined) {
    return { ok: true };
  }

  if (value === null) {
    return {
      ok: true,
      value: null
    };
  }

  const normalized = normalizeRequiredTextArg(value);

  if (!normalized) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid ttl argument.")
    };
  }

  try {
    return {
      ok: true,
      value: normalizeExpiry(normalized).ttl
    };
  } catch (error) {
    return {
      ok: false,
      error: toolError("invalid_arguments", safeErrorMessage(error))
    };
  }
}

export function optionalDestinationArg(
  args: Record<string, unknown>,
  defaultDestination?: string
): ArgResult<string> {
  const value = args.destination;

  if (value === undefined) {
    return defaultDestination === undefined
      ? { ok: true }
      : { ok: true, value: defaultDestination };
  }

  const destination = normalizeRequiredTextArg(value);

  if (!destination) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid destination argument.")
    };
  }

  try {
    return {
      ok: true,
      value: normalizeLocalFileDestination(destination)
    };
  } catch {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid destination argument.")
    };
  }
}

export function optionalIdArrayArg(
  args: Record<string, unknown>,
  key: "supersedes" | "conflictsWith"
): ArgResult<string[]> {
  const value = args[key];

  if (value === undefined || value === null) {
    return { ok: true };
  }

  const rawIds = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];

  if (rawIds.length === 0 && !Array.isArray(value) && typeof value !== "string") {
    return {
      ok: false,
      error: toolError("invalid_arguments", `Invalid ${key} argument.`)
    };
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const rawId of rawIds) {
    const id = normalizeRequiredTextArg(rawId);

    if (!id || !isSafeRecordId(id)) {
      return {
        ok: false,
        error: toolError("invalid_arguments", `Invalid ${key} argument.`)
      };
    }

    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return {
    ok: true,
    value: ids
  };
}

export function requireMutationConfirmation(args: Record<string, unknown>): ToolResult | undefined {
  if (args.confirm === true) {
    return undefined;
  }

  return toolError(
    "confirmation_required",
    "Mutation requires explicit arguments.confirm === true."
  );
}

export async function validateMcpPreviewDestination(
  destination: string,
  root: string
): Promise<ToolResult | undefined> {
  let existing: string;

  try {
    const file = await safeReadOptionalRepoFile(root, destination, {
      label: "Preview destination",
      maxBytes: 5 * 1024 * 1024
    });

    if (!file.exists) {
      return undefined;
    }

    existing = file.content;
  } catch (error) {
    return toolError("invalid_arguments", "Preview destination could not be read safely.");
  }

  if (hasCompleteMemprManagedBlock(existing)) {
    return undefined;
  }

  return toolError(
    "invalid_arguments",
    "Preview destination must be missing or already contain a complete MemPR managed block."
  );
}

function hasCompleteMemprManagedBlock(content: string): boolean {
  const startIndex = content.indexOf(MEMPR_MANAGED_BLOCK_START);
  const endIndex = content.indexOf(MEMPR_MANAGED_BLOCK_END);
  return startIndex >= 0 && endIndex > startIndex;
}
