import { createCorrelationId } from "./diagnostics.js";
import { normalizeLocalFileDestination } from "./export-adapters.js";
import { memoryRecordStringFields } from "./persistence-safety.js";
import {
  REDACTION_MARKERS,
  redactedPreview
} from "./redaction.js";
import {
  isRedactionMarker,
  reportableRecordId,
  scanPersistentFields
} from "./safety.js";
import type { MemoryRecord } from "./types.js";

export { REDACTION_MARKERS };

export type MemoryScanSeverity = "block" | "warn";
export type MemoryScanFindingCode =
  | "secret_like_content"
  | "sensitive_content"
  | "managed_block_marker_content"
  | "invalid_destination";

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

    const fields = memoryRecordStringFields(record);
    redactionMarkerCount += fields.filter(({ text }) => containsRedactionMarker(text)).length;

    const persistentFindings = scanPersistentFields(fields)
      .filter((finding) => {
        if (!resolvedOptions.allowRedactionMarkers || finding.code !== "secret_like_content") {
          return true;
        }

        const field = fields.find((entry) => entry.field === finding.field);
        return field ? !keyedSecretValueIsRedactionMarker(field.text) : true;
      });
    const markerFields = persistentFindings
      .filter((finding) => finding.code === "managed_block_marker")
      .map(({ field }) => field);
    const secretFields = persistentFindings
      .filter((finding) => finding.code !== "managed_block_marker")
      .map(({ field }) => field);

    if (secretFields.length > 0) {
      issues.push({
        code: "secret_like_content",
        severity: "block",
        message: "Accepted memory record contains blocked content.",
        destination: safeFindingDestination(record.destination, secretFields),
        recordIds: [reportableRecordId(record.id)],
        fields: uniqueSorted(secretFields),
        correlationId: createCorrelationId()
      });
      continue;
    }

    if (hasInvalidDestination(record.destination)) {
      issues.push({
        code: "invalid_destination",
        severity: "block",
        message: "Accepted memory record has an invalid destination path.",
        destination: record.destination,
        recordIds: [reportableRecordId(record.id)],
        fields: ["destination"],
        correlationId: createCorrelationId()
      });
      continue;
    }

    if (markerFields.length > 0) {
      issues.push({
        code: "managed_block_marker_content",
        severity: "block",
        message: "Accepted memory record contains MemPR managed block markers.",
        destination: record.destination,
        recordIds: [reportableRecordId(record.id)],
        fields: uniqueSorted(markerFields),
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
        recordIds: [reportableRecordId(record.id)],
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

function hasSensitiveContent(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasInvalidDestination(destination: string): boolean {
  try {
    normalizeLocalFileDestination(destination);
    return false;
  } catch {
    return true;
  }
}

function safeFindingDestination(destination: string, fields: readonly string[]): string {
  return fields.includes("destination") ? redactedPreview(destination) : destination;
}

function containsRedactionMarker(text: string): boolean {
  const normalized = normalizeMarker(text);
  return REDACTION_MARKERS.some((marker) => normalized.includes(normalizeMarker(marker)));
}

function keyedSecretValueIsRedactionMarker(text: string): boolean {
  const match = text.match(/\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|pwd|refresh[_-]?token|secret|token)\b\s*[:=]\s*['"]?([^'"\s]+)/i);
  return match ? isRedactionMarker(match[1]) : false;
}

function normalizeMarker(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
