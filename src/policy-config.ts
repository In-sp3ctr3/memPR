import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MEMORY_RISKS } from "./types.js";
import type { MemoryRisk } from "./types.js";

const POLICY_CONFIG_PATH = join(".mempr", "policy.json");
const POLICY_CONFIG_FIELDS = [
  "denyTerms",
  "sensitiveTerms",
  "autoAcceptScopes",
  "defaultRisk",
  "ttlRisk"
] as const;

export type PolicyConfigField = (typeof POLICY_CONFIG_FIELDS)[number];

export interface PolicyConfig {
  denyTerms: string[];
  sensitiveTerms: string[];
  autoAcceptScopes: string[];
  defaultRisk: MemoryRisk;
  ttlRisk: MemoryRisk;
}

export interface PolicyConfigDefaults {
  readonly denyTerms: readonly string[];
  readonly sensitiveTerms: readonly string[];
  readonly autoAcceptScopes: readonly string[];
  readonly defaultRisk: MemoryRisk;
  readonly ttlRisk: MemoryRisk;
}

export type PolicyConfigInput = Partial<{
  [K in PolicyConfigField]: unknown;
}>;

export const DEFAULT_POLICY_CONFIG: PolicyConfigDefaults = Object.freeze({
  denyTerms: Object.freeze([]),
  sensitiveTerms: Object.freeze([]),
  autoAcceptScopes: Object.freeze(["repo", "project"]),
  defaultRisk: "medium",
  ttlRisk: "medium"
});

export async function loadPolicyConfig(root = process.cwd()): Promise<PolicyConfig> {
  const path = join(resolve(root), POLICY_CONFIG_PATH);
  let content: string;

  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return clonePolicyConfig(DEFAULT_POLICY_CONFIG);
    }

    throw error;
  }

  if (!content.trim()) {
    return clonePolicyConfig(DEFAULT_POLICY_CONFIG);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error(`Invalid policy config at ${POLICY_CONFIG_PATH}: invalid JSON.`);
  }

  return normalizePolicyConfig(parsed);
}

export function normalizePolicyConfig(value: unknown): PolicyConfig {
  if (!isPlainObject(value)) {
    throw policyConfigError("$", "expected an object");
  }

  const hasUnknownField = Object.keys(value).some((field) => !isPolicyConfigField(field));

  if (hasUnknownField) {
    throw policyConfigError("$", "unknown field");
  }

  return {
    denyTerms: normalizeStringList(value.denyTerms, "denyTerms"),
    sensitiveTerms: normalizeStringList(value.sensitiveTerms, "sensitiveTerms"),
    autoAcceptScopes: normalizeStringList(value.autoAcceptScopes, "autoAcceptScopes"),
    defaultRisk: normalizeRisk(value.defaultRisk, "defaultRisk"),
    ttlRisk: normalizeRisk(value.ttlRisk, "ttlRisk")
  };
}

function normalizeStringList(value: unknown, path: PolicyConfigField): string[] {
  if (value === undefined) {
    return [...DEFAULT_POLICY_CONFIG[path]];
  }

  if (!Array.isArray(value)) {
    throw policyConfigError(path, "expected an array");
  }

  return value.map((entry, index) => {
    const entryPath = `${path}[${index}]`;

    if (typeof entry !== "string") {
      throw policyConfigError(entryPath, "expected a string");
    }

    const normalized = entry.trim();

    if (!normalized) {
      throw policyConfigError(entryPath, "expected a non-empty string");
    }

    return normalized;
  });
}

function normalizeRisk(value: unknown, path: "defaultRisk" | "ttlRisk"): MemoryRisk {
  if (value === undefined) {
    return DEFAULT_POLICY_CONFIG[path];
  }

  if (isOneOf(MEMORY_RISKS, value)) {
    return value;
  }

  throw policyConfigError(path, "expected one of low, medium, high");
}

function clonePolicyConfig(config: PolicyConfigDefaults): PolicyConfig {
  return {
    denyTerms: [...config.denyTerms],
    sensitiveTerms: [...config.sensitiveTerms],
    autoAcceptScopes: [...config.autoAcceptScopes],
    defaultRisk: config.defaultRisk,
    ttlRisk: config.ttlRisk
  };
}

function policyConfigError(path: string, message: string): Error {
  return new Error(`Invalid policy config at ${path}: ${message}.`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isPolicyConfigField(value: string): value is PolicyConfigField {
  return POLICY_CONFIG_FIELDS.includes(value as PolicyConfigField);
}

function isOneOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}
