import { createHash } from "node:crypto";

export const HASH_ALGORITHM = "sha256";
export const HASH_PREFIX = "sha256:";

export function sha256Hex(content: string): string {
  return createHash(HASH_ALGORITHM).update(content, "utf8").digest("hex");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function hashJson(value: unknown): string {
  return `${HASH_PREFIX}${sha256Hex(canonicalJson(value))}`;
}

export function hashText(value: string): string {
  return `${HASH_PREFIX}${sha256Hex(value)}`;
}

export function withoutHashFields<T>(value: T): T {
  return stripKeys(value, new Set([
    "event_hash",
    "previous_event_hash",
    "content_hash",
    "record_hash",
    "records_hash"
  ])) as T;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (!isRecord(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};

  for (const key of Object.keys(value).sort()) {
    const entry = value[key];

    if (entry !== undefined) {
      output[key] = canonicalize(entry);
    }
  }

  return output;
}

function stripKeys(value: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripKeys(entry, keys));
  }

  if (!isRecord(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (!keys.has(key)) {
      output[key] = stripKeys(entry, keys);
    }
  }

  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
