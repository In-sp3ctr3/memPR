import { createHash, randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import type { AcceptedMemoryScanResult } from "./scanner.js";
import type { LedgerConsistencyStatus } from "./ledger.js";
import {
  hasSecretLikeText,
  redactedPreview
} from "./redaction.js";
import {
  reportableRecordId,
  sanitizeJsonForBoundary
} from "./safety.js";
import {
  safeAppendStoreFile,
  safeReadOptionalStoreFile
} from "./store-paths.js";
import type { MemoryRecord } from "./types.js";

const DIAGNOSTICS_DIR = ".mempr";
const DIAGNOSTICS_FILE = "diagnostics.jsonl";
const REDACTED = "[redacted]";

export interface DiagnosticsPaths {
  root: string;
  directory: string;
  diagnosticsFile: string;
}

export interface DiagnosticEntry {
  id: string;
  type: "support_bundle_created";
  created_at: string;
  bundle: DiagnosticsSupportBundle;
}

export interface DiagnosticsSupportBundle {
  correlationId: string;
  createdAt: string;
  root: string;
  summary: {
    records: number;
    accepted: number;
    pending: number;
    rejected: number;
    scanBlockers: number;
    scanWarnings: number;
    redactionMarkers: number;
    consistencyOk: boolean;
  };
  records: RedactedRecordSummary[];
  scan: RedactedScanSummary;
  consistency: RedactedConsistencySummary;
}

export interface RedactedRecordSummary {
  id: string;
  status: string;
  risk: string;
  decision: string;
  scope: string;
  destination: string;
  sourceType: string;
  sourceUriHash: string;
  hasQuote: boolean;
  memory: typeof REDACTED;
  quote: typeof REDACTED | null;
  createdAt: string;
  updatedAt: string;
}

export interface RedactedScanSummary {
  ok: boolean;
  issues: RedactedScanFinding[];
  warnings: RedactedScanFinding[];
  redactionMarkerCount: number;
}

export interface RedactedScanFinding {
  code: string;
  severity: string;
  destination: string;
  recordIds: string[];
  fields: string[];
  correlationId: string;
}

export interface RedactedConsistencySummary {
  ok: boolean;
  currentCount: number;
  replayedCount: number | null;
  issues: Array<Record<string, unknown>>;
}

export function resolveDiagnosticsPaths(root = process.cwd()): DiagnosticsPaths {
  const resolvedRoot = resolve(root);

  return {
    root: resolvedRoot,
    directory: join(resolvedRoot, DIAGNOSTICS_DIR),
    diagnosticsFile: join(resolvedRoot, DIAGNOSTICS_DIR, DIAGNOSTICS_FILE)
  };
}

export function createCorrelationId(): string {
  return `diag_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function createDiagnosticsSupportBundle(
  input: {
    root?: string;
    records: readonly MemoryRecord[];
    scan: AcceptedMemoryScanResult;
    consistency: LedgerConsistencyStatus;
    correlationId?: string;
    createdAt?: string;
  }
): DiagnosticsSupportBundle {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const correlationId = input.correlationId ?? createCorrelationId();

  return redactDiagnosticsSupportBundle({
    correlationId,
    createdAt,
    root: REDACTED,
    summary: {
      records: input.records.length,
      accepted: countStatus(input.records, "accepted"),
      pending: countStatus(input.records, "pending"),
      rejected: countStatus(input.records, "rejected"),
      scanBlockers: input.scan.issues.length,
      scanWarnings: input.scan.warnings.length,
      redactionMarkers: input.scan.redactionMarkerCount,
      consistencyOk: input.consistency.ok
    },
    records: input.records.map(redactedRecordSummary),
    scan: redactedScanSummary(input.scan),
    consistency: redactedConsistencySummary(input.consistency)
  });
}

export async function appendDiagnosticEntry(
  bundle: DiagnosticsSupportBundle,
  root = process.cwd()
): Promise<string> {
  const paths = resolveDiagnosticsPaths(root);
  const redactedBundle = redactDiagnosticsSupportBundle(bundle);
  const entry: DiagnosticEntry = {
    id: redactedBundle.correlationId,
    type: "support_bundle_created",
    created_at: redactedBundle.createdAt,
    bundle: redactedBundle
  };

  await safeAppendStoreFile(paths.root, DIAGNOSTICS_FILE, `${JSON.stringify(entry)}\n`);
  return paths.diagnosticsFile;
}

export async function readDiagnostics(root = process.cwd()): Promise<DiagnosticEntry[]> {
  const paths = resolveDiagnosticsPaths(root);
  const file = await safeReadOptionalStoreFile(paths.root, DIAGNOSTICS_FILE);
  const content = file.exists ? file.content : "";

  if (!content.trim()) {
    return [];
  }

  return content
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as DiagnosticEntry;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Malformed diagnostic record on line ${index + 1}: ${detail}`);
      }
    });
}

function redactedRecordSummary(record: MemoryRecord): RedactedRecordSummary {
  return {
    id: reportableRecordId(record.id),
    status: record.status,
    risk: record.risk,
    decision: record.decision,
    scope: redactDiagnosticPath(record.scope),
    destination: redactDiagnosticPath(record.destination),
    sourceType: record.source.type,
    sourceUriHash: digest(record.source.uri),
    hasQuote: typeof record.source.quote === "string" && record.source.quote.trim().length > 0,
    memory: REDACTED,
    quote: record.source.quote ? REDACTED : null,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

function redactedScanSummary(scan: AcceptedMemoryScanResult): RedactedScanSummary {
  return {
    ok: scan.ok,
    issues: scan.issues.map(redactedScanFinding),
    warnings: scan.warnings.map(redactedScanFinding),
    redactionMarkerCount: scan.redactionMarkerCount
  };
}

function redactedScanFinding(finding: AcceptedMemoryScanResult["issues"][number]): RedactedScanFinding {
  return {
    code: finding.code,
    severity: finding.severity,
    destination: redactDiagnosticPath(finding.destination),
    recordIds: finding.recordIds.map(reportableRecordId),
    fields: [...finding.fields],
    correlationId: finding.correlationId
  };
}

function redactedConsistencySummary(
  consistency: LedgerConsistencyStatus
): RedactedConsistencySummary {
  return {
    ok: consistency.ok,
    currentCount: consistency.currentCount,
    replayedCount: consistency.replayedCount,
    issues: consistency.issues.map(redactedConsistencyIssue)
  };
}

export function redactDiagnosticString(value: string): string {
  return hasSecretLikeText([{ field: "diagnostics", text: value }])
    ? redactedPreview(value)
    : value;
}

export function redactDiagnosticPath(_value: string): string {
  return REDACTED;
}

function redactDiagnosticsSupportBundle(
  bundle: DiagnosticsSupportBundle
): DiagnosticsSupportBundle {
  return redactDiagnosticValue(bundle) as DiagnosticsSupportBundle;
}

function redactDiagnosticValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactDiagnosticString(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactDiagnosticValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        if (isRedactedDiagnosticKey(key)) {
          return [key, REDACTED];
        }

        return [key, redactDiagnosticValue(entry)];
      })
    );
  }

  return value;
}

function redactedConsistencyIssue(
  issue: LedgerConsistencyStatus["issues"][number]
): Record<string, unknown> {
  const redacted = Object.fromEntries(
    Object.entries(issue).map(([key, entry]) => {
      if (isRecordIdListKey(key) && Array.isArray(entry)) {
        return [
          key,
          entry.map((id) => typeof id === "string" ? reportableRecordId(id) : sanitizeJsonForBoundary(id))
        ];
      }

      if (isRecordIdKey(key) && typeof entry === "string") {
        return [key, reportableRecordId(entry)];
      }

      return [key, sanitizeJsonForBoundary(entry)];
    })
  );

  return redactDiagnosticValue(redacted) as Record<string, unknown>;
}

function isRecordIdListKey(key: string): boolean {
  return [
    "recordIds",
    "changedRecordIds",
    "missingFromReplayIds",
    "missingFromLedgerIds",
    "retiredRecordIds",
    "overrideRecordIds"
  ].includes(key);
}

function isRecordIdKey(key: string): boolean {
  return [
    "recordId",
    "missingRecordId"
  ].includes(key);
}

function isRedactedDiagnosticKey(key: string): boolean {
  return [
    "destination",
    "output_path",
    "outputPath",
    "path",
    "root",
    "scope"
  ].includes(key);
}

function countStatus(
  records: readonly MemoryRecord[],
  status: MemoryRecord["status"]
): number {
  return records.filter((record) => record.status === status).length;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
