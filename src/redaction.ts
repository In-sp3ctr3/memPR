import {
  isRedactionMarker,
  legacySecretFindingCode,
  redactSecretTextForReport,
  REDACTED_SECRET,
  REDACTION_MARKERS,
  scanPersistentFields,
  sha256Text
} from "./safety.js";

export {
  REDACTED_SECRET,
  REDACTION_MARKERS,
  sha256Text
} from "./safety.js";

export type SensitiveFieldName =
  | "memory"
  | "source.uri"
  | "source.quote"
  | "quote"
  | "content"
  | string;

export interface ScannableTextField {
  field: SensitiveFieldName;
  text: string;
}

export type SecretFindingCode =
  | "private_key"
  | "openai_key"
  | "github_token"
  | "aws_access_key"
  | "google_api_key"
  | "slack_token"
  | "authorization_header"
  | "keyed_secret";

export interface SecretFinding {
  field: SensitiveFieldName;
  code: SecretFindingCode;
}

export interface SecretScanOptions {
  allowRedactionMarkers?: boolean;
}

export function scanSecretLikeText(
  fields: readonly ScannableTextField[],
  options: SecretScanOptions = {}
): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const field of fields) {
    const persistentFindings = scanPersistentFields([field])
      .filter((finding) => finding.code === "secret_like_content");

    for (const persistentFinding of persistentFindings) {
      const legacyCode = legacySecretFindingCode(field.text) ?? "keyed_secret";

      if (
        options.allowRedactionMarkers
        && legacyCode === "keyed_secret"
        && keyedSecretValueIsRedactionMarker(field.text)
      ) {
        continue;
      }

      findings.push({
        field: field.field,
        code: legacyCode
      });
    }
  }

  return findings;
}

export function hasSecretLikeText(
  fields: readonly ScannableTextField[],
  options: SecretScanOptions = {}
): boolean {
  return scanSecretLikeText(fields, options).length > 0;
}

export function redactSecretLikeText(text: string): string {
  return redactSecretTextForReport(text);
}

export function redactedPreview(text: string, maxChars = 160): string {
  const normalizedMax = normalizeMaxChars(maxChars);
  const safe = redactSecretLikeText(text).replace(/\s+/g, " ").trim();

  if (safe.length <= normalizedMax) {
    return safe;
  }

  if (normalizedMax <= 3) {
    return ".".repeat(normalizedMax);
  }

  return `${safe.slice(0, normalizedMax - 3)}...`;
}

function keyedSecretValueIsRedactionMarker(text: string): boolean {
  const match = text.match(/\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|pwd|refresh[_-]?token|secret|token)\b\s*[:=]\s*['"]?([^'"\s]+)/i);
  return match ? isRedactionMarker(match[1]) : false;
}

function normalizeMaxChars(maxChars: number): number {
  if (!Number.isFinite(maxChars) || maxChars < 0) {
    return 160;
  }

  return Math.floor(maxChars);
}
