import {
  MEMORY_KINDS
} from "./types.js";
import type {
  MemoryKind
} from "./types.js";
import { normalizeRepoRelativePath } from "./repo-paths.js";

export interface MemoryModelInput {
  kind?: unknown;
  tags?: unknown;
  confidence?: unknown;
  retentionClass?: unknown;
  priority?: unknown;
  appliesToPaths?: unknown;
}

export interface NormalizedMemoryModel {
  kind: MemoryKind;
  tags: string[];
  confidence: number | null;
  retention_class: string | null;
  priority: number | null;
  applies_to_paths: string[];
}

export function normalizeMemoryModelInput(input: MemoryModelInput): NormalizedMemoryModel {
  return {
    kind: normalizeMemoryKind(input.kind),
    tags: normalizeTags(input.tags),
    confidence: normalizeConfidence(input.confidence),
    retention_class: normalizeRetentionClass(input.retentionClass),
    priority: normalizePriority(input.priority),
    applies_to_paths: normalizeAppliesToPaths(input.appliesToPaths)
  };
}

export function normalizeStoredMemoryModel(record: {
  kind?: unknown;
  tags?: unknown;
  confidence?: unknown;
  retention_class?: unknown;
  priority?: unknown;
  applies_to_paths?: unknown;
}): NormalizedMemoryModel {
  return normalizeMemoryModelInput({
    kind: record.kind,
    tags: record.tags,
    confidence: record.confidence,
    retentionClass: record.retention_class,
    priority: record.priority,
    appliesToPaths: record.applies_to_paths
  });
}

export function normalizeMemoryKind(value: unknown): MemoryKind {
  if (value === null || value === undefined) {
    return "fact";
  }

  if (typeof value === "string" && isMemoryKind(value)) {
    return value;
  }

  throw new Error(`Memory kind must be one of ${MEMORY_KINDS.join(", ")}.`);
}

export function normalizeTags(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  const rawTags = typeof value === "string"
    ? value.split(",")
    : Array.isArray(value) ? value : undefined;

  if (!rawTags) {
    throw new Error("Tags must be a comma-separated string or an array of strings.");
  }

  return uniqueSorted(rawTags.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new Error(`Tag ${index + 1} must be a string.`);
    }

    return entry.trim().toLowerCase();
  }).filter(Boolean));
}

export function normalizeConfidence(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Confidence must be a number between 0 and 1.");
  }

  return value;
}

export function normalizePriority(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < 1
    || value > 5
  ) {
    throw new Error("Priority must be an integer from 1 to 5.");
  }

  return value;
}

export function normalizeRetentionClass(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Retention class must be a string.");
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Retention class must be non-empty.");
  }

  return normalized;
}

export function normalizeAppliesToPaths(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  const rawPaths = typeof value === "string"
    ? value.split(",")
    : Array.isArray(value) ? value : undefined;

  if (!rawPaths) {
    throw new Error("Applies-to paths must be a comma-separated string or an array of strings.");
  }

  return uniqueSorted(rawPaths.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new Error(`Applies-to path ${index + 1} must be a string.`);
    }

    return normalizeRepoRelativePath(entry, "Applies-to path");
  }));
}

export function normalizeReviewer(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Reviewer must be a string.");
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Reviewer must be non-empty.");
  }

  return normalized;
}

function isMemoryKind(value: string): value is MemoryKind {
  return MEMORY_KINDS.includes(value as MemoryKind);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
