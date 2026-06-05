import {
  assertNoPersistentSecretLikeContent as assertNoPersistentSafetyFinding,
  hasPersistentSecretLikeContent as hasPersistentSafetyFinding,
  PersistentSecretLikeContentError
} from "./safety.js";
import type { ScannableField } from "./safety.js";

export { PersistentSecretLikeContentError } from "./safety.js";
export type ScannableTextField = ScannableField;

export interface PersistentProposalFieldsInput {
  memory?: unknown;
  source?: unknown;
  quote?: unknown;
  scope?: unknown;
  destination?: unknown;
  kind?: unknown;
  tags?: unknown;
  retentionClass?: unknown;
  retention_class?: unknown;
  appliesToPaths?: unknown;
  applies_to_paths?: unknown;
  ttl?: unknown;
  supersedes?: unknown;
  conflictsWith?: unknown;
  conflicts_with?: unknown;
  gitCommit?: unknown;
  git_commit?: unknown;
  sourceHash?: unknown;
  source_hash?: unknown;
}

export function proposalPersistentSecretFields(
  input: PersistentProposalFieldsInput
): ScannableField[] {
  return compactFields([
    textField("memory", input.memory),
    textField("source.uri", input.source),
    textField("source.quote", input.quote),
    textField("scope", input.scope),
    textField("destination", input.destination),
    textField("kind", input.kind),
    textField("tags", input.tags),
    textField("retentionClass", input.retentionClass ?? input.retention_class),
    textField("appliesToPaths", input.appliesToPaths ?? input.applies_to_paths),
    textField("ttl", input.ttl),
    textField("supersedes", input.supersedes),
    textField("conflictsWith", input.conflictsWith ?? input.conflicts_with),
    textField("gitCommit", input.gitCommit ?? input.git_commit),
    textField("sourceHash", input.sourceHash ?? input.source_hash)
  ]);
}

export function reviewPersistentSecretFields(input: {
  reason?: unknown;
  reviewer?: unknown;
}): ScannableField[] {
  return compactFields([
    textField("reason", input.reason),
    textField("reviewer", input.reviewer)
  ]);
}

export function memoryRecordStringFields(value: unknown): ScannableField[] {
  return stringFieldsFromValue(value, "");
}

export function assertNoPersistentSecretLikeContent(
  fields: readonly ScannableField[],
  message: string
): void {
  assertNoPersistentSafetyFinding(fields, message);
}

export function hasPersistentSecretLikeContent(
  fields: readonly ScannableField[]
): boolean {
  return hasPersistentSafetyFinding(fields);
}

function textField(field: string, value: unknown): ScannableField | undefined {
  const text = textValue(value);
  return text ? { field, text } : undefined;
}

function compactFields(
  fields: Array<ScannableField | undefined>
): ScannableField[] {
  return fields.filter((field): field is ScannableField => field !== undefined);
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map(textValue)
      .filter((entry): entry is string => entry !== undefined);
    return parts.length > 0 ? parts.join(" ") : undefined;
  }

  return undefined;
}

function stringFieldsFromValue(value: unknown, path: string): ScannableField[] {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized && path ? [{ field: path, text: normalized }] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      return stringFieldsFromValue(entry, `${path}[${index}]`);
    });
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
      return stringFieldsFromValue(entry, path ? `${path}.${key}` : key);
    });
  }

  return [];
}
