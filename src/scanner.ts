import { createCorrelationId } from "./diagnostics.js";
import type { MemoryRecord } from "./types.js";

export const REDACTION_MARKERS = [
  "[redacted]",
  "<redacted>",
  "***redacted***",
  "redacted",
  "[mempr:redacted]",
  "<mempr:redacted>"
] as const;

export type MemoryScanSeverity = "block" | "warn";
export type MemoryScanFindingCode =
  | "secret_like_content"
  | "sensitive_content";

export interface MemoryScanFinding {
  code: MemoryScanFindingCode;
  severity: MemoryScanSeverity;
  message: string;
  destination: string;
  recordIds: string[];
  fields: string[];
  correlationId: string;
}

export interface AcceptedMemoryScanResult {
  ok: boolean;
  issues: MemoryScanFinding[];
  warnings: MemoryScanFinding[];
  redactionMarkerCount: number;
}

export interface AcceptedMemoryScanOptions {
  allowRedactionMarkers?: boolean;
}

interface ScannerPattern {
  field: string;
  test(text: string, options: Required<AcceptedMemoryScanOptions>): boolean;
}

const SECRET_PATTERNS: readonly ScannerPattern[] = [
  literalSecretPattern("memory", /-----BEGIN [A-Z ]*PRIVATE KEY-----/i),
  literalSecretPattern("memory", /\bsk-[A-Za-z0-9_-]{20,}\b/),
  literalSecretPattern("memory", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/),
  literalSecretPattern("memory", /\bAKIA[0-9A-Z]{16}\b/),
  literalSecretPattern("memory", /\bAIza[0-9A-Za-z_-]{35}\b/),
  literalSecretPattern("memory", /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/),
  literalSecretPattern("memory", /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{20,}\b/i),
  keyedSecretPattern("memory")
];

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /\bdiagnosed with\b/i,
  /\b(prescribed|patient|hipaa)\b/i,
  /\bmedical condition\b/i,
  /\b(social security|ssn|social security number)\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(date of birth|dob)\b\s*[:=]/i,
  /\b(passport|driver'?s license|tax id|itin)\b/i,
  /\bcredit card\b/i,
  /\b(card number|routing number|iban)\b/i,
  /\bbank account\b/i,
  /\b(home address|personal phone)\b/i,
  /\blegal case\b/i,
  /\b(attorney-client|lawsuit|criminal record|arrested)\b/i
];

export function scanAcceptedMemoryRecords(
  records: readonly MemoryRecord[],
  options: AcceptedMemoryScanOptions = {}
): AcceptedMemoryScanResult {
  const resolvedOptions = {
    allowRedactionMarkers: options.allowRedactionMarkers !== false
  };
  const issues: MemoryScanFinding[] = [];
  const warnings: MemoryScanFinding[] = [];
  let redactionMarkerCount = 0;

  for (const record of records) {
    if (record.status !== "accepted") {
      continue;
    }

    const fields = scannableRecordFields(record);
    redactionMarkerCount += fields.filter(({ text }) => containsRedactionMarker(text)).length;

    const secretFields = fields
      .filter(({ text }) => hasSecretLikeContent(text, resolvedOptions))
      .map(({ field }) => field);

    if (secretFields.length > 0) {
      issues.push({
        code: "secret_like_content",
        severity: "block",
        message: "Accepted memory record contains blocked content.",
        destination: record.destination,
        recordIds: [record.id],
        fields: uniqueSorted(secretFields),
        correlationId: createCorrelationId()
      });
      continue;
    }

    const sensitiveFields = fields
      .filter(({ text }) => hasSensitiveContent(text))
      .map(({ field }) => field);

    if (sensitiveFields.length > 0) {
      warnings.push({
        code: "sensitive_content",
        severity: "warn",
        message: "Accepted memory record may contain sensitive personal or regulated information.",
        destination: record.destination,
        recordIds: [record.id],
        fields: uniqueSorted(sensitiveFields),
        correlationId: createCorrelationId()
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    redactionMarkerCount
  };
}

function scannableRecordFields(record: MemoryRecord): Array<{ field: string; text: string }> {
  const fields = [
    {
      field: "memory",
      text: record.memory
    }
  ];

  if (typeof record.source.quote === "string" && record.source.quote.trim()) {
    fields.push({
      field: "source.quote",
      text: record.source.quote
    });
  }

  return fields;
}

function hasSecretLikeContent(
  text: string,
  options: Required<AcceptedMemoryScanOptions>
): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text, options));
}

function hasSensitiveContent(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function literalSecretPattern(field: string, pattern: RegExp): ScannerPattern {
  return {
    field,
    test: (text) => pattern.test(text)
  };
}

function keyedSecretPattern(field: string): ScannerPattern {
  const pattern = /\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|pwd|refresh[_-]?token|secret|token)\b\s*[:=]\s*['"]?([^'"\s]+)/gi;

  return {
    field,
    test: (text, options) => {
      pattern.lastIndex = 0;

      for (const match of text.matchAll(pattern)) {
        const value = match[2];

        if (options.allowRedactionMarkers && isRedactionMarker(value)) {
          continue;
        }

        return true;
      }

      return false;
    }
  };
}

function containsRedactionMarker(text: string): boolean {
  const normalized = normalizeMarker(text);
  return REDACTION_MARKERS.some((marker) => normalized.includes(normalizeMarker(marker)));
}

function isRedactionMarker(value: string): boolean {
  const normalized = normalizeMarker(value);
  return REDACTION_MARKERS.some((marker) => normalized === normalizeMarker(marker));
}

function normalizeMarker(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
