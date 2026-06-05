import { listLiveAdapters } from "./live-adapters.js";
import type { LiveAdapterId } from "./live-adapters.js";
import type { ReadAccessOptions } from "./read-policy.js";
import type { ReadContextPermissionConstraint } from "./read-permissions.js";
import type { MemoryKind, MemoryRisk, MemorySourceTrust, MemoryStatus } from "./types.js";
import { MEMORY_KINDS } from "./types.js";

export interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

const BOOLEAN_FLAGS = new Set([
  "accept",
  "confirm",
  "dry-run",
  "from-events",
  "json",
  "override-relationships",
  "read-exclude-conflicts",
  "read-exclude-supersedes",
  "retire-superseded",
  "reject",
  "verify-source"
]);

export interface SourceVerificationFlags {
  sourceLineStart?: number;
  sourceLineEnd?: number;
  sourceHash?: string;
  gitCommit?: string;
  verifySource?: boolean;
}

export interface ProposalModelFlags {
  kind?: MemoryKind;
  tags?: string[];
  confidence?: number;
  retentionClass?: string;
  priority?: number;
  appliesToPaths?: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];

    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const raw = value.slice(2);
    const equalsIndex = raw.indexOf("=");

    if (equalsIndex >= 0) {
      flags[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }

    if (BOOLEAN_FLAGS.has(raw)) {
      flags[raw] = true;
      continue;
    }

    const next = rest[index + 1];

    if (next && !next.startsWith("--")) {
      flags[raw] = next;
      index += 1;
    } else {
      flags[raw] = true;
    }
  }

  return { command, positionals, flags };
}

export function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
}

export function commaSeparatedFlag(parsed: ParsedArgs, name: string): string[] | undefined {
  if (!Object.hasOwn(parsed.flags, name)) {
    return undefined;
  }

  const value = parsed.flags[name];

  if (typeof value !== "string") {
    throw new Error(`--${name} requires comma-separated memory ids.`);
  }

  return value.split(",");
}

export function scopeFilterFlag(parsed: ParsedArgs): string[] | undefined {
  const hasScope = Object.hasOwn(parsed.flags, "scope");
  const hasScopes = Object.hasOwn(parsed.flags, "scopes");

  if (!hasScope && !hasScopes) {
    return undefined;
  }

  const value = hasScope ? parsed.flags.scope : parsed.flags.scopes;

  if (typeof value !== "string") {
    throw new Error("--scope requires comma-separated scopes.");
  }

  const raw = value.trim();

  if (!raw) {
    return undefined;
  }

  return raw.split(",");
}

export function readPermissionFlag(
  parsed: ParsedArgs
): ReadContextPermissionConstraint | undefined {
  const hasActor = Object.hasOwn(parsed.flags, "actor") || Object.hasOwn(parsed.flags, "read-actor");
  const hasAllowedScopes = Object.hasOwn(parsed.flags, "allowed-scopes");
  const hasValidUntil = Object.hasOwn(parsed.flags, "read-valid-until");
  const hasExcludeConflicts = Object.hasOwn(parsed.flags, "read-exclude-conflicts");
  const hasExcludeSupersedes = Object.hasOwn(parsed.flags, "read-exclude-supersedes");

  if (
    !hasActor
    && !hasAllowedScopes
    && !hasValidUntil
    && !hasExcludeConflicts
    && !hasExcludeSupersedes
  ) {
    return undefined;
  }

  const constraint: ReadContextPermissionConstraint = {};

  if (hasActor) {
    const actor = Object.hasOwn(parsed.flags, "actor")
      ? parsed.flags.actor
      : parsed.flags["read-actor"];

    if (typeof actor !== "string") {
      throw new Error("--actor requires an actor label.");
    }

    constraint.actor = actor;
  }

  if (hasAllowedScopes) {
    const allowedScopes = parsed.flags["allowed-scopes"];

    if (typeof allowedScopes !== "string") {
      throw new Error("--allowed-scopes requires comma-separated scopes.");
    }

    constraint.allowedScopes = allowedScopes.split(",");
  }

  if (hasValidUntil) {
    const validUntil = parsed.flags["read-valid-until"];

    if (typeof validUntil !== "string") {
      throw new Error("--read-valid-until requires an expiry value.");
    }

    constraint.validUntil = validUntil;
  }

  if (hasExcludeConflicts) {
    if (parsed.flags["read-exclude-conflicts"] !== true) {
      throw new Error("--read-exclude-conflicts does not take a value.");
    }

    constraint.excludeConflicts = true;
  }

  if (hasExcludeSupersedes) {
    if (parsed.flags["read-exclude-supersedes"] !== true) {
      throw new Error("--read-exclude-supersedes does not take a value.");
    }

    constraint.excludeSupersedes = true;
  }

  return constraint;
}

export function readAccessFlag(parsed: ParsedArgs): ReadAccessOptions {
  const principalId = stringFlag(parsed, "read-principal") ?? stringFlag(parsed, "principal");
  const signature = stringFlag(parsed, "read-signature") ?? stringFlag(parsed, "signature");
  const signedAt = stringFlag(parsed, "read-signed-at") ?? stringFlag(parsed, "signed-at");
  const nonce = stringFlag(parsed, "read-nonce") ?? stringFlag(parsed, "nonce");
  const hasReadAccessFlag = [
    "read-principal",
    "principal",
    "read-signature",
    "signature",
    "read-signed-at",
    "signed-at",
    "read-nonce",
    "nonce"
  ].some((flag) => Object.hasOwn(parsed.flags, flag));

  if (!hasReadAccessFlag) {
    return {};
  }

  for (const flag of [
    "read-principal",
    "principal",
    "read-signature",
    "signature",
    "read-signed-at",
    "signed-at",
    "read-nonce",
    "nonce"
  ]) {
    if (Object.hasOwn(parsed.flags, flag) && typeof parsed.flags[flag] !== "string") {
      throw new Error(`--${flag} requires a value.`);
    }
  }

  return {
    auth: {
      principalId,
      signature,
      signedAt,
      nonce
    }
  };
}

export function reviewActionFlag(parsed: ParsedArgs, name: "accept" | "reject"): boolean {
  if (!Object.hasOwn(parsed.flags, name)) {
    return false;
  }

  if (parsed.flags[name] !== true) {
    throw new Error(`--${name} does not take a value.`);
  }

  return true;
}

export function hasRelationshipResolutionFlags(parsed: ParsedArgs): boolean {
  return parsed.flags["retire-superseded"] === true
    || parsed.flags["override-relationships"] === true;
}

export function liveAdapterFlag(parsed: ParsedArgs): LiveAdapterId {
  const value = stringFlag(parsed, "adapter") ?? "fake";
  const adapters = new Set(listLiveAdapters().map((adapter) => adapter.id));

  if (adapters.has(value as LiveAdapterId)) {
    return value as LiveAdapterId;
  }

  throw new Error(`--adapter must be one of ${[...adapters].join(", ")}.`);
}

export function numberFlag(parsed: ParsedArgs, name: string): number | undefined {
  const value = stringFlag(parsed, name);

  if (value === undefined) {
    return undefined;
  }

  const numeric = Number(value);

  if (!Number.isInteger(numeric)) {
    throw new Error(`--${name} must be an integer.`);
  }

  return numeric;
}

export function rootFlag(parsed: ParsedArgs): string | undefined {
  return stringFlag(parsed, "root");
}

export function riskFlag(parsed: ParsedArgs): MemoryRisk | undefined {
  const value = stringFlag(parsed, "risk");

  if (!value) {
    return undefined;
  }

  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new Error("--risk must be low, medium, or high.");
}

export function statusFlag(parsed: ParsedArgs): MemoryStatus | undefined {
  const value = stringFlag(parsed, "status");

  if (!value) {
    return undefined;
  }

  if (value === "pending" || value === "accepted" || value === "rejected" || value === "retired") {
    return value;
  }

  throw new Error("--status must be pending, accepted, rejected, or retired.");
}

export function sourceTrustFlag(parsed: ParsedArgs): MemorySourceTrust | undefined {
  const hasSourceTrust = Object.hasOwn(parsed.flags, "source-trust");
  const rawValue = parsed.flags["source-trust"];

  if (!hasSourceTrust) {
    return undefined;
  }

  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    throw new Error("--source-trust must be trusted, unknown, or untrusted.");
  }

  const value = rawValue.trim();

  if (value === "trusted" || value === "unknown" || value === "untrusted") {
    return value;
  }

  throw new Error("--source-trust must be trusted, unknown, or untrusted.");
}

export function sourceVerificationFlags(parsed: ParsedArgs): SourceVerificationFlags {
  const result: SourceVerificationFlags = {};

  if (Object.hasOwn(parsed.flags, "verify-source")) {
    if (parsed.flags["verify-source"] !== true) {
      throw new Error("--verify-source does not take a value.");
    }

    result.verifySource = true;
  }

  const hasStart = Object.hasOwn(parsed.flags, "source-line-start");
  const hasEnd = Object.hasOwn(parsed.flags, "source-line-end");

  if (hasStart !== hasEnd) {
    throw new Error("--source-line-start and --source-line-end must be supplied together.");
  }

  if (hasStart && hasEnd) {
    result.sourceLineStart = positiveIntegerFlag(parsed, "source-line-start");
    result.sourceLineEnd = positiveIntegerFlag(parsed, "source-line-end");

    if (result.sourceLineEnd < result.sourceLineStart) {
      throw new Error("--source-line-end must be greater than or equal to --source-line-start.");
    }
  }

  if (Object.hasOwn(parsed.flags, "source-hash")) {
    const value = stringFlag(parsed, "source-hash");

    if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
      throw new Error("--source-hash must be a 64-character SHA-256 hex string.");
    }

    result.sourceHash = value.toLowerCase();
  }

  if (Object.hasOwn(parsed.flags, "git-commit")) {
    const value = stringFlag(parsed, "git-commit");

    if (!value || !value.trim()) {
      throw new Error("--git-commit requires a non-empty value.");
    }

    result.gitCommit = value.trim();
  }

  return result;
}

export function proposalModelFlags(parsed: ParsedArgs): ProposalModelFlags {
  const result: ProposalModelFlags = {};
  const kind = stringFlag(parsed, "kind");

  if (kind !== undefined) {
    if (isMemoryKind(kind)) {
      result.kind = kind;
    } else {
      throw new Error(`--kind must be one of ${MEMORY_KINDS.join(", ")}.`);
    }
  }

  if (Object.hasOwn(parsed.flags, "tags")) {
    result.tags = commaSeparatedRequiredFlag(parsed, "tags");
  }

  if (Object.hasOwn(parsed.flags, "confidence")) {
    result.confidence = boundedNumberFlag(parsed, "confidence", 0, 1);
  }

  if (Object.hasOwn(parsed.flags, "retention-class")) {
    const value = stringFlag(parsed, "retention-class");

    if (!value || !value.trim()) {
      throw new Error("--retention-class requires a non-empty value.");
    }

    result.retentionClass = value.trim();
  }

  if (Object.hasOwn(parsed.flags, "priority")) {
    result.priority = boundedIntegerFlag(parsed, "priority", 1, 5);
  }

  if (Object.hasOwn(parsed.flags, "applies-to-paths")) {
    result.appliesToPaths = commaSeparatedRequiredFlag(parsed, "applies-to-paths");
  }

  return result;
}

export function reviewerFlag(parsed: ParsedArgs): string | undefined {
  if (!Object.hasOwn(parsed.flags, "reviewer")) {
    return undefined;
  }

  const reviewer = stringFlag(parsed, "reviewer");

  if (!reviewer || !reviewer.trim()) {
    throw new Error("--reviewer requires a non-empty value.");
  }

  return reviewer.trim();
}

function positiveIntegerFlag(parsed: ParsedArgs, name: string): number {
  const value = stringFlag(parsed, name);
  const numeric = Number(value);

  if (!value || !Number.isInteger(numeric) || numeric < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }

  return numeric;
}

function boundedNumberFlag(
  parsed: ParsedArgs,
  name: string,
  min: number,
  max: number
): number {
  const value = stringFlag(parsed, name);
  const numeric = Number(value);

  if (!value || !Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`--${name} must be a number between ${min} and ${max}.`);
  }

  return numeric;
}

function boundedIntegerFlag(
  parsed: ParsedArgs,
  name: string,
  min: number,
  max: number
): number {
  const numeric = boundedNumberFlag(parsed, name, min, max);

  if (!Number.isInteger(numeric)) {
    throw new Error(`--${name} must be an integer between ${min} and ${max}.`);
  }

  return numeric;
}

function commaSeparatedRequiredFlag(parsed: ParsedArgs, name: string): string[] {
  const value = stringFlag(parsed, name);

  if (!value || !value.trim()) {
    throw new Error(`--${name} requires comma-separated values.`);
  }

  return value.split(",");
}

function isMemoryKind(value: string): value is MemoryKind {
  return MEMORY_KINDS.includes(value as MemoryKind);
}
