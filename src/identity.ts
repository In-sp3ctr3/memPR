import { createPublicKey, verify } from "node:crypto";
import {
  assertNoPersistentSecretLikeContent,
  hasPersistentSecretLikeContent
} from "./safety.js";
import {
  safeReadOptionalStoreFile
} from "./store-paths.js";
import type { ReadPermissionSurface } from "./read-permissions.js";

const PRINCIPALS_FILE = "principals.json";

export const MEMPR_PRINCIPALS_VERSION = 1;
export const MEMPR_READ_AUTH_PAYLOAD_VERSION = "mempr-read-auth-v1";

export type PrincipalKind = "local_key";
export type PrincipalAlgorithm = "ed25519";
export type PrincipalStatus = "active" | "disabled";

export interface LocalKeyPrincipal {
  id: string;
  kind: PrincipalKind;
  algorithm: PrincipalAlgorithm;
  publicKey: string;
  status: PrincipalStatus;
}

export interface ReadAuthInput {
  principalId?: string | null;
  signature?: string | null;
  signedAt?: string | null;
  nonce?: string | null;
}

export interface SignedReadRequest {
  action: "read";
  surface: ReadPermissionSurface;
  resource: string;
  destination?: string | null;
  scopes?: readonly string[];
  recordIds?: readonly string[];
  filters?: Record<string, string | null | undefined>;
}

export type PrincipalLoadResult =
  | { exists: true; ok: true; principals: readonly LocalKeyPrincipal[] }
  | { exists: true; ok: false }
  | { exists: false; ok: false };

export type SignedReadVerificationResult =
  | {
      ok: true;
      principal: LocalKeyPrincipal;
      payload: string;
    }
  | { ok: false };

interface PrincipalStoreFile {
  version?: unknown;
  principals?: unknown;
}

interface CanonicalJsonObject {
  [key: string]: CanonicalJsonValue;
}

type CanonicalJsonValue =
  | string
  | number
  | boolean
  | null
  | CanonicalJsonValue[]
  | CanonicalJsonObject;

export async function loadPrincipals(root = process.cwd()): Promise<PrincipalLoadResult> {
  try {
    const file = await safeReadOptionalStoreFile(root, PRINCIPALS_FILE);

    if (!file.exists) {
      return { exists: false, ok: false };
    }

    return {
      exists: true,
      ok: true,
      principals: parsePrincipalStore(JSON.parse(file.content) as PrincipalStoreFile)
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { exists: false, ok: false };
    }

    return { exists: true, ok: false };
  }
}

export async function verifySignedReadRequest(
  root: string,
  request: SignedReadRequest,
  auth: ReadAuthInput | null | undefined
): Promise<SignedReadVerificationResult> {
  const principalId = normalizeText(auth?.principalId);
  const signature = normalizeText(auth?.signature);

  if (!principalId || !signature) {
    return { ok: false };
  }

  if (hasUnsafeReadAuthMetadata(auth)) {
    return { ok: false };
  }

  const principalStore = await loadPrincipals(root);

  if (!principalStore.ok) {
    return { ok: false };
  }

  const principal = principalStore.principals.find((candidate) => {
    return candidate.id === principalId && candidate.status === "active";
  });

  if (!principal) {
    return { ok: false };
  }

  const payload = createSignedReadPayload(principalId, request, auth);

  try {
    const publicKey = createPrincipalPublicKey(principal);
    const signatureBytes = decodeBase64(signature);
    const ok = verify(null, Buffer.from(payload), publicKey, signatureBytes);
    return ok ? { ok: true, principal, payload } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export function createSignedReadPayload(
  principalId: string,
  request: SignedReadRequest,
  auth: ReadAuthInput | null | undefined = {}
): string {
  return canonicalJson({
    action: "read",
    destination: request.destination ?? null,
    filters: normalizeFilters(request.filters ?? {}),
    nonce: normalizeText(auth?.nonce) ?? null,
    principalId,
    recordIds: normalizeStringArray(request.recordIds ?? []),
    resource: request.resource,
    scopes: normalizeStringArray(request.scopes ?? []),
    signedAt: normalizeText(auth?.signedAt) ?? null,
    surface: request.surface,
    version: MEMPR_READ_AUTH_PAYLOAD_VERSION
  });
}

export function canonicalJson(value: CanonicalJsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  return `{${Object.keys(value).sort().map((key) => {
    return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
  }).join(",")}}`;
}

function parsePrincipalStore(value: PrincipalStoreFile): LocalKeyPrincipal[] {
  if (!isRecord(value)) {
    throw new Error("Invalid principal store.");
  }

  if (
    value.version !== undefined
    && value.version !== MEMPR_PRINCIPALS_VERSION
    && value.version !== String(MEMPR_PRINCIPALS_VERSION)
  ) {
    throw new Error("Unsupported principal store version.");
  }

  const entries = principalEntries(value.principals);
  const principals: LocalKeyPrincipal[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const principal = normalizePrincipal(entry.id, entry.value);

    if (seen.has(principal.id)) {
      throw new Error("Duplicate principal.");
    }

    seen.add(principal.id);
    principals.push(principal);
  }

  return principals;
}

function principalEntries(value: unknown): Array<{ id?: string; value: unknown }> {
  if (Array.isArray(value)) {
    return value.map((entry) => ({ value: entry }));
  }

  if (isRecord(value)) {
    return Object.entries(value).map(([id, entry]) => ({ id, value: entry }));
  }

  throw new Error("Invalid principals list.");
}

function normalizePrincipal(
  idFromMap: string | undefined,
  value: unknown
): LocalKeyPrincipal {
  if (!isRecord(value)) {
    throw new Error("Invalid principal.");
  }

  const id = normalizeText(value.id) ?? normalizeText(idFromMap);
  const kind = value.kind ?? "local_key";
  const algorithm = value.algorithm ?? "ed25519";
  const status = value.status ?? "active";
  const publicKey = normalizeText(value.publicKey ?? value.publicKeyBase64);

  if (!id || kind !== "local_key" || algorithm !== "ed25519" || !publicKey) {
    throw new Error("Invalid local-key principal.");
  }

  assertNoPersistentSecretLikeContent(
    [{ field: "principal.id", text: id }],
    "Principal contains unsafe content."
  );

  if (status !== "active" && status !== "disabled") {
    throw new Error("Invalid principal status.");
  }

  return {
    id,
    kind,
    algorithm,
    publicKey,
    status
  };
}

function createPrincipalPublicKey(principal: LocalKeyPrincipal): ReturnType<typeof createPublicKey> {
  const publicKey = principal.publicKey.trim();

  if (/-----BEGIN PUBLIC KEY-----/.test(publicKey)) {
    return createPublicKey(publicKey);
  }

  return createPublicKey({
    key: decodeBase64(publicKey),
    format: "der",
    type: "spki"
  });
}

function decodeBase64(value: string): Buffer {
  const normalized = value
    .replace(/^base64:/i, "")
    .replace(/^ed25519:/i, "")
    .trim();

  if (
    !normalized
    || normalized.length % 4 === 1
    || /[^A-Za-z0-9+/=_-]/.test(normalized)
  ) {
    throw new Error("Invalid base64 value.");
  }

  return Buffer.from(normalized.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function normalizeFilters(
  filters: Record<string, string | null | undefined>
): CanonicalJsonObject {
  const normalized: CanonicalJsonObject = {};

  for (const [key, value] of Object.entries(filters).sort(([left], [right]) => {
    return left.localeCompare(right);
  })) {
    if (value === undefined) {
      continue;
    }

    normalized[key] = value ?? null;
  }

  return normalized;
}

function normalizeStringArray(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasUnsafeReadAuthMetadata(auth: ReadAuthInput | null | undefined): boolean {
  const fields = [
    textField("read-auth.principalId", auth?.principalId),
    textField("read-auth.nonce", auth?.nonce),
    textField("read-auth.signedAt", auth?.signedAt)
  ].filter((field): field is { field: string; text: string } => field !== undefined);

  return hasPersistentSecretLikeContent(fields);
}

function textField(field: string, value: string | null | undefined): { field: string; text: string } | undefined {
  const text = normalizeText(value);
  return text ? { field, text } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
