import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { normalizeLocalFileDestination } from "./export-adapters.js";
import {
  verifySignedReadRequest
} from "./identity.js";
import type {
  ReadAuthInput,
  SignedReadRequest
} from "./identity.js";
import type { ReadPermissionSurface } from "./read-permissions.js";

const LEDGER_DIR = ".mempr";
const READ_POLICY_FILE = "read-policy.json";

export const MEMPR_READ_POLICY_VERSION = 1;
export const MEMPR_READ_POLICY_DENIED_MESSAGE = "Read denied by MemPR read policy.";

export type ReadPolicyEffect = "allow" | "deny";
export type ReadPolicyAction = "read";

export interface ReadPolicyRule {
  id?: string;
  effect: ReadPolicyEffect;
  principals?: readonly string[];
  actions?: readonly ReadPolicyAction[];
  surfaces?: readonly ReadPermissionSurface[];
  resources?: readonly string[];
  destinations?: readonly string[];
  scopes?: readonly string[];
  recordIds?: readonly string[];
}

export interface ReadPolicy {
  version: typeof MEMPR_READ_POLICY_VERSION;
  rules: readonly ReadPolicyRule[];
}

export interface ReadAuthorizationRequest extends SignedReadRequest {
  auth?: ReadAuthInput | null;
}

export interface ReadAccessOptions extends ReadAuthInput {
  auth?: ReadAuthInput | null;
}

export type ReadAccessIssueCode =
  | "read_identity_missing"
  | "read_identity_invalid"
  | "read_policy_denied"
  | "read_policy_malformed";

export type ReadPolicyLoadResult =
  | { exists: false; ok: false }
  | { exists: true; ok: true; policy: ReadPolicy }
  | { exists: true; ok: false };

export type ReadAuthorizationDecision =
  | { ok: true; policyExists: false }
  | { ok: true; policyExists: true; principalId: string }
  | { ok: false; policyExists: true };

export type ReadAccessDecision =
  | { ok: true; allowed: true; policyExists: false }
  | { ok: true; allowed: true; policyExists: true; principalId: string }
  | {
      ok: false;
      allowed: false;
      policyExists: true;
      code: ReadAccessIssueCode;
      message: string;
      correlationId: string;
    };

export class ReadDeniedError extends Error {
  readonly code: ReadAccessIssueCode;
  readonly correlationId: string;

  constructor(code: ReadAccessIssueCode, correlationId = createReadCorrelationId()) {
    super(MEMPR_READ_POLICY_DENIED_MESSAGE);
    this.name = "ReadDeniedError";
    this.code = code;
    this.correlationId = correlationId;
  }
}

const READ_POLICY_SURFACES: readonly ReadPermissionSurface[] = [
  "records_list",
  "record_inspect",
  "record_history",
  "read_context",
  "read_context_status",
  "export_preview",
  "consistency_status",
  "policy_summary"
] as const;

export async function loadReadPolicy(root = process.cwd()): Promise<ReadPolicyLoadResult> {
  const file = join(root, LEDGER_DIR, READ_POLICY_FILE);
  let raw: string;

  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { exists: false, ok: false };
    }

    return { exists: true, ok: false };
  }

  try {
    return {
      exists: true,
      ok: true,
      policy: normalizeReadPolicy(JSON.parse(raw))
    };
  } catch {
    return { exists: true, ok: false };
  }
}

export async function authorizeRead(
  root: string,
  request: ReadAuthorizationRequest
): Promise<ReadAuthorizationDecision> {
  const decision = await evaluateReadAccess(root, request, request.auth);

  if (!decision.ok) {
    return { ok: false, policyExists: true };
  }

  if (!decision.policyExists) {
    return {
      ok: true,
      policyExists: false
    };
  }

  return {
    ok: true,
    policyExists: true,
    principalId: decision.principalId
  };
}

export async function assertReadAccess(
  root: string,
  request: SignedReadRequest,
  options: ReadAccessOptions | null | undefined = {}
): Promise<void> {
  const decision = await evaluateReadAccess(root, request, options);

  if (!decision.allowed) {
    throw new ReadDeniedError(decision.code, decision.correlationId);
  }
}

export async function evaluateReadAccess(
  root: string,
  request: SignedReadRequest,
  options: ReadAccessOptions | null | undefined = {}
): Promise<ReadAccessDecision> {
  const policyResult = await loadReadPolicy(root);

  if (!policyResult.exists) {
    return {
      ok: true,
      allowed: true,
      policyExists: false
    };
  }

  if (!policyResult.ok) {
    return readAccessDenied("read_policy_malformed");
  }

  const auth = normalizeReadAccessOptions(options);

  if (!normalizeOptionalText(auth?.principalId) || !normalizeOptionalText(auth?.signature)) {
    return readAccessDenied("read_identity_missing");
  }

  const verification = await verifySignedReadRequest(root, request, auth);

  if (!verification.ok) {
    return readAccessDenied("read_identity_invalid");
  }

  if (!evaluateReadPolicy(policyResult.policy, request, verification.principal.id)) {
    return readAccessDenied("read_policy_denied");
  }

  return {
    ok: true,
    allowed: true,
    policyExists: true,
    principalId: verification.principal.id
  };
}

export function evaluateReadPolicy(
  policy: ReadPolicy,
  request: SignedReadRequest,
  principalId: string
): boolean {
  if (!READ_POLICY_SURFACES.includes(request.surface)) {
    return false;
  }

  const deny = policy.rules.some((rule) => {
    return rule.effect === "deny" && readPolicyRuleMatches(rule, request, principalId);
  });

  if (deny) {
    return false;
  }

  return policy.rules.some((rule) => {
    return rule.effect === "allow" && readPolicyRuleMatches(rule, request, principalId);
  });
}

function normalizeReadPolicy(value: unknown): ReadPolicy {
  if (!isRecord(value)) {
    throw new Error("Invalid read policy.");
  }

  if (
    value.version !== MEMPR_READ_POLICY_VERSION
    && value.version !== String(MEMPR_READ_POLICY_VERSION)
  ) {
    throw new Error("Unsupported read policy version.");
  }

  if (!Array.isArray(value.rules)) {
    throw new Error("Invalid read policy rules.");
  }

  return {
    version: MEMPR_READ_POLICY_VERSION,
    rules: value.rules.map(normalizeReadPolicyRule)
  };
}

function normalizeReadPolicyRule(value: unknown): ReadPolicyRule {
  if (!isRecord(value)) {
    throw new Error("Invalid read policy rule.");
  }

  const unsupported = unsupportedKeys(value, [
    "id",
    "effect",
    "principals",
    "actions",
    "surfaces",
    "resources",
    "destinations",
    "scopes",
    "recordIds"
  ]);

  if (unsupported.length > 0) {
    throw new Error("Unsupported read policy rule field.");
  }

  if (value.effect !== "allow" && value.effect !== "deny") {
    throw new Error("Invalid read policy effect.");
  }

  return {
    id: normalizeOptionalText(value.id),
    effect: value.effect,
    principals: normalizeMatcherList(value.principals),
    actions: normalizeActions(value.actions),
    surfaces: normalizeSurfaces(value.surfaces),
    resources: normalizeMatcherList(value.resources),
    destinations: normalizeDestinations(value.destinations),
    scopes: normalizeMatcherList(value.scopes),
    recordIds: normalizeMatcherList(value.recordIds)
  };
}

function readPolicyRuleMatches(
  rule: ReadPolicyRule,
  request: SignedReadRequest,
  principalId: string
): boolean {
  return matcherMatches(rule.principals, principalId)
    && matcherMatches(rule.actions, request.action)
    && matcherMatches(rule.surfaces, request.surface)
    && matcherMatches(rule.resources, request.resource)
    && destinationMatches(rule.destinations, request.destination ?? null)
    && requestedValuesMatch(rule.scopes, request.scopes ?? [])
    && requestedValuesMatch(rule.recordIds, request.recordIds ?? []);
}

function matcherMatches(
  values: readonly string[] | undefined,
  requested: string
): boolean {
  if (!values || values.length === 0 || values.includes("*")) {
    return true;
  }

  return values.includes(requested);
}

function destinationMatches(
  destinations: readonly string[] | undefined,
  destination: string | null
): boolean {
  if (!destinations || destinations.length === 0 || destinations.includes("*")) {
    return true;
  }

  return destination !== null && destinations.includes(destination);
}

function requestedValuesMatch(
  allowed: readonly string[] | undefined,
  requested: readonly string[]
): boolean {
  if (!allowed || allowed.length === 0 || allowed.includes("*")) {
    return true;
  }

  if (requested.length === 0) {
    return false;
  }

  return requested.every((value) => allowed.includes(value));
}

function normalizeActions(value: unknown): ReadPolicyAction[] | undefined {
  const values = normalizeMatcherList(value);

  if (!values) {
    return undefined;
  }

  for (const action of values) {
    if (action !== "read" && action !== "*") {
      throw new Error("Invalid read policy action.");
    }
  }

  return values as ReadPolicyAction[];
}

function normalizeSurfaces(value: unknown): ReadPermissionSurface[] | undefined {
  const values = normalizeMatcherList(value);

  if (!values) {
    return undefined;
  }

  for (const surface of values) {
    if (surface !== "*" && !READ_POLICY_SURFACES.includes(surface as ReadPermissionSurface)) {
      throw new Error("Invalid read policy surface.");
    }
  }

  return values as ReadPermissionSurface[];
}

function normalizeDestinations(value: unknown): string[] | undefined {
  const values = normalizeMatcherList(value);

  if (!values) {
    return undefined;
  }

  return values.map((destination) => {
    return destination === "*" ? destination : normalizeLocalFileDestination(destination);
  });
}

function normalizeMatcherList(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const rawValues = typeof value === "string"
    ? value.split(",")
    : Array.isArray(value)
      ? value
      : [];

  if (rawValues.length === 0 && !Array.isArray(value) && typeof value !== "string") {
    throw new Error("Invalid read policy matcher.");
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of rawValues) {
    const text = normalizeOptionalText(rawValue);

    if (!text) {
      throw new Error("Invalid read policy matcher value.");
    }

    if (seen.has(text)) {
      continue;
    }

    seen.add(text);
    normalized.push(text);
  }

  return normalized;
}

function normalizeReadAccessOptions(
  options: ReadAccessOptions | null | undefined
): ReadAuthInput | null | undefined {
  if (!options) {
    return options;
  }

  return options.auth ?? options;
}

function readAccessDenied(code: ReadAccessIssueCode): ReadAccessDecision {
  return {
    ok: false,
    allowed: false,
    policyExists: true,
    code,
    message: MEMPR_READ_POLICY_DENIED_MESSAGE,
    correlationId: createReadCorrelationId()
  };
}

function createReadCorrelationId(): string {
  return `read-${randomUUID()}`;
}

function unsupportedKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): string[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
