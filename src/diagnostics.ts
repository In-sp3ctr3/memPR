import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import type { AcceptedMemoryScanResult } from "./scanner.js";
import type { LedgerConsistencyStatus } from "./ledger.js";
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
  const root = resolve(input.root ?? process.cwd());
  const createdAt = input.createdAt ?? new Date().toISOString();
  const correlationId = input.correlationId ?? createCorrelationId();

  return {
    correlationId,
    createdAt,
    root,
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
  };
}

export async function appendDiagnosticEntry(
  bundle: DiagnosticsSupportBundle,
  root = process.cwd()
): Promise<string> {
  const paths = resolveDiagnosticsPaths(root);
  const entry: DiagnosticEntry = {
    id: bundle.correlationId,
    type: "support_bundle_created",
    created_at: bundle.createdAt,
    bundle
  };

  await mkdir(paths.directory, { recursive: true });
  await appendFile(paths.diagnosticsFile, `${JSON.stringify(entry)}\n`);
  return paths.diagnosticsFile;
}

export async function readDiagnostics(root = process.cwd()): Promise<DiagnosticEntry[]> {
  const paths = resolveDiagnosticsPaths(root);
  const content = await readOptional(paths.diagnosticsFile);

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
    id: record.id,
    status: record.status,
    risk: record.risk,
    decision: record.decision,
    scope: record.scope,
    destination: record.destination,
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
    destination: finding.destination,
    recordIds: [...finding.recordIds],
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
    issues: consistency.issues.map((issue) => ({ ...issue }))
  };
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

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}
