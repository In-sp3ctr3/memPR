import type { LiveAdapterId } from "./live-adapters.js";
import type { ArgResult } from "./mcp-tool-arg-types.js";
import { toolError } from "./mcp-tool-results.js";
import {
  MEMORY_RISKS,
  MEMORY_SOURCE_TRUST,
  MEMORY_SOURCE_TYPES,
  MEMORY_STATUSES
} from "./types.js";
import type {
  MemoryRisk,
  MemorySourceTrust,
  MemorySourceType,
  MemoryStatus
} from "./types.js";

export function normalizeToolArguments(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return {};
  }

  return isRecord(value) ? value : undefined;
}

export function unsupportedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): string[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).filter((key) => !allowed.has(key));
}

export function requiredStringArg(
  args: Record<string, unknown>,
  key: string
): string | undefined {
  const unsupported = unsupportedKeys(args, [key]);

  if (unsupported.length > 0) {
    return undefined;
  }

  const value = args[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

export function normalizeRequiredTextArg(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

export function optionalTextArg(args: Record<string, unknown>, key: string): ArgResult<string> {
  const value = args[key];

  if (value === undefined) {
    return { ok: true };
  }

  const normalized = normalizeRequiredTextArg(value);

  if (!normalized) {
    return {
      ok: false,
      error: toolError("invalid_arguments", `Invalid ${key} argument.`)
    };
  }

  return {
    ok: true,
    value: normalized
  };
}

export function optionalBooleanArg(
  args: Record<string, unknown>,
  key: string
): ArgResult<boolean> {
  const value = args[key];

  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "boolean") {
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

export function optionalNumberArg(
  args: Record<string, unknown>,
  key: string
): ArgResult<number> {
  const value = args[key];

  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
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

export function optionalLiveAdapterArg(args: Record<string, unknown>): ArgResult<LiveAdapterId> {
  const value = args.adapter;

  if (value === undefined) {
    return {
      ok: true,
      value: "fake"
    };
  }

  if (
    value === "fake"
    || value === "mem0"
    || value === "langgraph"
    || value === "llm-wiki"
    || value === "custom"
  ) {
    return {
      ok: true,
      value
    };
  }

  return {
    ok: false,
    error: toolError("invalid_arguments", "Invalid adapter argument.")
  };
}

export function isMemoryStatus(value: unknown): value is MemoryStatus {
  return typeof value === "string" && MEMORY_STATUSES.includes(value as MemoryStatus);
}

export function isMemoryRisk(value: unknown): value is MemoryRisk {
  return typeof value === "string" && MEMORY_RISKS.includes(value as MemoryRisk);
}

export function isMemorySourceType(value: unknown): value is MemorySourceType {
  return typeof value === "string" && MEMORY_SOURCE_TYPES.includes(value as MemorySourceType);
}

export function isMemorySourceTrust(value: unknown): value is MemorySourceTrust {
  return typeof value === "string" && MEMORY_SOURCE_TRUST.includes(value as MemorySourceTrust);
}

export function isSafeRecordId(id: string): boolean {
  return id.length > 0
    && id !== "."
    && id !== ".."
    && !id.includes("%")
    && !id.includes("/")
    && !id.includes("\\")
    && !id.includes(":")
    && !id.includes("..");
}

export function isSafeMcpDestination(destination: string): boolean {
  if (
    destination.length === 0
    || destination.startsWith("/")
    || destination.includes("\\")
    || destination.includes("\0")
    || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination)
  ) {
    return false;
  }

  const segments = destination.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
