import { createHash } from "node:crypto";

export const REDACTED_SECRET = "[MEMPR_REDACTED_SECRET]";
export const REDACTED_MARKER = "[MEMPR_REDACTED_MANAGED_BLOCK_MARKER]";
export const REDACTED_CONTROL_CHARACTER = "[MEMPR_REDACTED_CONTROL_CHARACTER]";

export const REDACTION_MARKERS = [
  "[redacted]",
  "<redacted>",
  "***redacted***",
  "redacted",
  "[mempr:redacted]",
  "<mempr:redacted>",
  REDACTED_SECRET
] as const;

export const MANAGED_BLOCK_MARKERS = [
  "<!-- mempr:start -->",
  "<!-- mempr:end -->"
] as const;

const STRUCTURAL_CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const TEXT_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const ANSI_ESCAPE_SEQUENCE = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g;

export interface ScannableField {
  field: string;
  text: string;
  origin?: "user" | "remote" | "legacy" | "system";
}

export type SecretScanFindingCode =
  | "secret_like_content"
  | "managed_block_marker"
  | "control_character";

export interface SecretScanFinding {
  field: string;
  code: SecretScanFindingCode;
  preview: string;
  hash: string;
}

interface SecretPattern {
  legacyCode:
    | "private_key"
    | "openai_key"
    | "github_token"
    | "aws_access_key"
    | "google_api_key"
    | "slack_token"
    | "authorization_header"
    | "keyed_secret";
  pattern: RegExp;
}

export const BUILTIN_SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    legacyCode: "private_key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/i
  },
  {
    legacyCode: "openai_key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/
  },
  {
    legacyCode: "github_token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/
  },
  {
    legacyCode: "aws_access_key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    legacyCode: "google_api_key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/
  },
  {
    legacyCode: "slack_token",
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/
  },
  {
    legacyCode: "authorization_header",
    pattern: /\b(?:authorization\s*:\s*)?(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{20,}\b/i
  },
  {
    legacyCode: "keyed_secret",
    pattern: /\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|pwd|refresh[_-]?token|secret|token)\b\s*[:=]\s*['"]?[^'"\s]{8,}/i
  }
];

const REDACT_AUTHORIZATION_PATTERN = /\b((?:authorization\s*:\s*)?(?:bearer|basic)\s+)([A-Za-z0-9._~+/=-]{8,})\b/gi;
const REDACT_KEYED_SECRET_PATTERN = /\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|pwd|refresh[_-]?token|secret|token)\b(\s*[:=]\s*)['"]?([^'"\s]+)(['"]?)/gi;

export class PersistentSecretLikeContentError extends Error {
  readonly code = "MEMPR_PERSISTENT_SECRET_FIELD";
  readonly findings: SecretScanFinding[];

  constructor(message: string, findings: readonly SecretScanFinding[]) {
    super(sanitizeErrorMessage(message));
    this.name = "PersistentSecretLikeContentError";
    this.findings = [...findings];
  }
}

export function scanPersistentFields(
  fields: readonly ScannableField[]
): SecretScanFinding[] {
  const findings: SecretScanFinding[] = [];

  for (const field of fields) {
    const text = field.text;

    for (const pattern of BUILTIN_SECRET_PATTERNS) {
      pattern.pattern.lastIndex = 0;

      if (pattern.pattern.test(text)) {
        findings.push(createFinding(field, "secret_like_content"));
        break;
      }
    }

    if (MANAGED_BLOCK_MARKERS.some((marker) => text.includes(marker))) {
      findings.push(createFinding(field, "managed_block_marker"));
    }

    if (hasBlockedControlCharacter(field)) {
      findings.push(createFinding(field, "control_character"));
    }
  }

  return findings;
}

export function assertNoPersistentSecretLikeContent(
  fields: readonly ScannableField[],
  message: string
): void {
  const findings = scanPersistentFields(fields);

  if (findings.length > 0) {
    throw new PersistentSecretLikeContentError(message, findings);
  }
}

export function hasPersistentSecretLikeContent(
  value: string | readonly ScannableField[]
): boolean {
  const fields = typeof value === "string"
    ? [{ field: "value", text: value }]
    : value;

  return scanPersistentFields(fields).length > 0;
}

export function redactTextForReport(value: string): string {
  return sanitizeStringValueForBoundary(value);
}

export function sanitizeStringValueForBoundary(value: string): string {
  let redacted = redactSecretTextForReport(value);

  for (const marker of MANAGED_BLOCK_MARKERS) {
    redacted = redacted.replaceAll(marker, REDACTED_MARKER);
  }

  return redacted
    .replace(ANSI_ESCAPE_SEQUENCE, REDACTED_CONTROL_CHARACTER)
    .replace(/[\u0000-\u001F\u007F]/g, REDACTED_CONTROL_CHARACTER);
}

export function sanitizeRenderedTextForBoundary(value: string): string {
  let redacted = redactSecretTextForReport(value);

  for (const marker of MANAGED_BLOCK_MARKERS) {
    redacted = redacted.replaceAll(marker, REDACTED_MARKER);
  }

  return redacted
    .replace(ANSI_ESCAPE_SEQUENCE, REDACTED_CONTROL_CHARACTER)
    .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, REDACTED_CONTROL_CHARACTER);
}

export function redactSecretTextForReport(value: string): string {
  let redacted = value.replace(REDACT_KEYED_SECRET_PATTERN, (_match, key, separator, token, closingQuote) => {
    if (isRedactionMarker(String(token))) {
      return `${key}${separator}${REDACTED_SECRET}${closingQuote}`;
    }

    return `${key}${separator}${REDACTED_SECRET}${closingQuote}`;
  });

  redacted = redacted.replace(REDACT_AUTHORIZATION_PATTERN, (_match, prefix) => {
    return `${prefix}${REDACTED_SECRET}`;
  });

  for (const pattern of BUILTIN_SECRET_PATTERNS) {
    if (pattern.legacyCode === "authorization_header" || pattern.legacyCode === "keyed_secret") {
      continue;
    }

    pattern.pattern.lastIndex = 0;
    redacted = redacted.replace(pattern.pattern, REDACTED_SECRET);
  }

  return redacted;
}

export function hashTextForReport(value: string): string {
  return sha256Text(value);
}

export function stableRedactedHash(value: string): string {
  return sha256Text(value);
}

export function redactedPreviewForReport(text: string, maxChars = 160): string {
  const normalizedMax = normalizeMaxChars(maxChars);
  const safe = redactTextForReport(text).replace(/\s+/g, " ").trim();

  if (safe.length <= normalizedMax) {
    return safe;
  }

  if (normalizedMax <= 3) {
    return ".".repeat(normalizedMax);
  }

  return `${safe.slice(0, normalizedMax - 3)}...`;
}

export function isGeneratedMemprRecordId(id: string): boolean {
  return /^mem_[a-z0-9]+_[a-f0-9]{6,}$/i.test(id);
}

export function reportableRecordId(id: string): string {
  if (isGeneratedMemprRecordId(id) && !hasPersistentSecretLikeContent(id)) {
    return id;
  }

  return `[MEMPR_RECORD_ID_HASH:${sha256Text(id).slice(0, 16)}]`;
}

export function reportableDestination(destination: string): string {
  const normalized = destination.trim();

  if (normalized && !hasPersistentSecretLikeContent(normalized)) {
    return normalized;
  }

  return `[MEMPR_DESTINATION_HASH:${sha256Text(destination).slice(0, 16)}]`;
}

export function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "MemPR operation failed.";
  const safe = redactedPreviewForReport(message, 240);

  return safe || "MemPR operation failed.";
}

export function sanitizeJsonForBoundary<T>(value: T): T {
  return sanitizeBoundaryValue(value) as T;
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function legacySecretFindingCode(text: string):
  | SecretPattern["legacyCode"]
  | undefined {
  for (const pattern of BUILTIN_SECRET_PATTERNS) {
    pattern.pattern.lastIndex = 0;

    if (pattern.pattern.test(text)) {
      return pattern.legacyCode;
    }
  }

  return undefined;
}

export function isRedactionMarker(value: string): boolean {
  const normalized = normalizeMarker(value);
  return REDACTION_MARKERS.some((marker) => normalized === normalizeMarker(marker));
}

function createFinding(
  field: ScannableField,
  code: SecretScanFindingCode
): SecretScanFinding {
  return {
    field: field.field,
    code,
    preview: redactedPreviewForReport(field.text),
    hash: sha256Text(field.text)
  };
}

function hasBlockedControlCharacter(field: ScannableField): boolean {
  const pattern = isStructuralField(field.field)
    ? STRUCTURAL_CONTROL_CHARS
    : TEXT_CONTROL_CHARS;

  pattern.lastIndex = 0;
  return pattern.test(field.text);
}

function isStructuralField(field: string): boolean {
  return /(?:^|\.|\[)(?:id|record_id|recordIds|destination|scope|scopes|allowedScopes|source\.uri|uri|path|paths|appliesToPaths|applies_to_paths|ttl|expires_at|validUntil|nonce|principalId|signedAt)(?:$|\.|\])/i
    .test(field);
}

function sanitizeBoundaryValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeStringValueForBoundary(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeBoundaryValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        return [key, sanitizeBoundaryValue(entry)];
      })
    );
  }

  return value;
}

function normalizeMaxChars(maxChars: number): number {
  if (!Number.isFinite(maxChars) || maxChars < 0) {
    return 160;
  }

  return Math.floor(maxChars);
}

function normalizeMarker(value: string): string {
  return value.trim().toLowerCase();
}
