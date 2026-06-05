import {
  getRecordHistory,
  previewMarkdownExport
} from "./ledger.js";
import {
  reportableDestination,
  safeResolveRepoPath
} from "./destination-safety.js";
import type {
  MarkdownExportPreview,
  RecordHistory
} from "./ledger.js";
import { redactedPreview } from "./redaction.js";
import { sanitizeStringValueForBoundary } from "./safety.js";
import type {
  MemoryRecord,
  MemorySourceVerification
} from "./types.js";
import { safeReadOptionalRepoFile } from "./repo-file-reader.js";

export interface DiffExportReport {
  destination: string;
  ok: boolean;
  blocked: boolean;
  exitCode: 0 | 1 | 2;
  diff: string;
  preview?: MarkdownExportPreview;
  error?: string;
}

export interface GuardReport {
  destination: string;
  ok: boolean;
  blocked: boolean;
  exitCode: 0 | 1 | 2;
  reason: "matches" | "missing" | "differs" | "blocked";
  preview?: MarkdownExportPreview;
  error?: string;
}

export interface BlameStatusChange {
  created_at: string;
  previous_status: string;
  next_status: string;
  reason: string | null;
}

export interface BlameReport {
  id: string;
  memory_preview: string;
  status: string;
  created_at: string;
  updated_at: string;
  source: MemoryRecord["source"];
  source_verification: MemorySourceVerification | undefined;
  policy_version: string;
  decision_reason: string;
  reviewer: string | null;
  approved_by: string | null;
  status_changes: BlameStatusChange[];
}

export async function diffExport(
  destination: string,
  root = process.cwd()
): Promise<DiffExportReport> {
  const previewResult = await safePreview(destination, root);

  if (!previewResult.ok) {
    return {
      destination: reportableDestination(destination),
      ok: false,
      blocked: true,
      exitCode: 2,
      diff: "",
      error: previewResult.error
    };
  }

  const preview = previewResult.preview;
  const current = await readExisting(root, preview.destination);
  const diff = unifiedLineDiff(
    current.content,
    preview.safe_content_preview,
    preview.destination
  );

  return {
    destination: preview.destination,
    ok: diff === "",
    blocked: false,
    exitCode: diff === "" ? 0 : 1,
    diff,
    preview
  };
}

export async function guardExport(
  destination: string,
  root = process.cwd()
): Promise<GuardReport> {
  const previewResult = await safePreview(destination, root);

  if (!previewResult.ok) {
    return {
      destination: reportableDestination(destination),
      ok: false,
      blocked: true,
      exitCode: 2,
      reason: "blocked",
      error: previewResult.error
    };
  }

  const preview = previewResult.preview;
  const current = await readExisting(root, preview.destination);
  const ok = current.exists && current.content === preview.safe_content_preview;
  const reason = ok
    ? "matches"
    : current.exists
      ? "differs"
      : "missing";

  return {
    destination: preview.destination,
    ok,
    blocked: false,
    exitCode: ok ? 0 : 1,
    reason,
    preview
  };
}

export async function blameMemory(
  id: string,
  root = process.cwd()
): Promise<BlameReport> {
  const history = await getRecordHistory(id, root);
  return blameReportFromHistory(history);
}

export function renderDiffExportReport(report: DiffExportReport): string {
  if (report.blocked) {
    return `MemPR diff-export blocked for ${report.destination}: ${report.error}`;
  }

  if (report.ok) {
    return `MemPR diff-export clean: ${report.destination} matches accepted memory export.`;
  }

  return report.diff;
}

export function renderGuardReport(report: GuardReport): string {
  if (report.blocked) {
    return `MemPR guard blocked: ${report.destination} cannot be previewed. ${report.error}`;
  }

  if (report.ok) {
    return `MemPR guard passed: ${report.destination} matches accepted memory export.`;
  }

  if (report.reason === "missing") {
    return `MemPR guard failed: ${report.destination} is missing. Run mempr export --destination ${report.destination}.`;
  }

  return `MemPR guard failed: ${report.destination} is out of date. Run mempr export --destination ${report.destination}.`;
}

export function renderBlameReport(report: BlameReport): string {
  const lines = [
    `MemPR blame ${safeValue(report.id)}`,
    `memory_preview: ${safeValue(report.memory_preview)}`,
    `status: ${safeValue(report.status)}`,
    `created_at: ${safeValue(report.created_at)}`,
    `updated_at: ${safeValue(report.updated_at)}`,
    `source: ${safeValue(report.source.uri)}`,
    `source_verification: ${renderSourceVerification(report.source_verification)}`,
    `policy_version: ${safeValue(report.policy_version)}`,
    `decision_reason: ${safeValue(report.decision_reason)}`,
    `reviewer: ${safeValue(report.reviewer ?? "none")}`,
    `approved_by: ${safeValue(report.approved_by ?? "none")}`,
    "status_changes:"
  ];

  if (report.status_changes.length === 0) {
    lines.push("  none");
    return lines.join("\n");
  }

  for (const change of report.status_changes) {
    lines.push(
      `  - ${safeValue(change.created_at)}: ${safeValue(change.previous_status)} -> ${safeValue(change.next_status)}`
        + ` (${safeValue(change.reason ?? "no reason")})`
    );
  }

  return lines.join("\n");
}

function blameReportFromHistory(history: RecordHistory): BlameReport {
  const record = history.record;

  return {
    id: record.id,
    memory_preview: redactedPreview(record.memory),
    status: record.status,
    created_at: record.created_at,
    updated_at: record.updated_at,
    source: record.source,
    source_verification: record.source.verification,
    policy_version: record.policy_version,
    decision_reason: record.decision_reason,
    reviewer: record.reviewer,
    approved_by: record.approved_by,
    status_changes: history.events
      .filter((event) => event.type === "memory_status_changed")
      .map((event) => {
        return {
          created_at: event.created_at,
          previous_status: event.previous_status,
          next_status: event.next_status,
          reason: event.reason
        };
      })
  };
}

async function safePreview(
  destination: string,
  root: string
): Promise<
  | { ok: true; preview: MarkdownExportPreview; outputPath: string }
  | { ok: false; error: string; outputPath: string | null }
> {
  try {
    const preview = await previewMarkdownExport(destination, root);
    const outputPath = await safeResolveRepoPath(root, preview.destination);
    return {
      ok: true,
      preview,
      outputPath
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      outputPath: null
    };
  }
}

async function readExisting(root: string, destination: string): Promise<{ exists: boolean; content: string }> {
  const file = await safeReadOptionalRepoFile(root, destination, {
    label: "Export destination",
    maxBytes: 5 * 1024 * 1024
  });

  if (!file.exists) {
    return {
      exists: false,
      content: ""
    };
  }

  return {
    exists: true,
    content: file.content
  };
}

function unifiedLineDiff(
  current: string,
  expected: string,
  destination: string
): string {
  if (current === expected) {
    return "";
  }

  const currentLines = current.split("\n");
  const expectedLines = expected.split("\n");
  const max = Math.max(currentLines.length, expectedLines.length);
  const lines = [
    `--- ${destination} (current)`,
    `+++ ${destination} (mempr preview)`,
    "@@"
  ];

  for (let index = 0; index < max; index += 1) {
    const left = currentLines[index];
    const right = expectedLines[index];

    if (left === right) {
      if (left !== undefined) {
        lines.push(` ${left}`);
      }
      continue;
    }

    if (left !== undefined) {
      lines.push(`-${left}`);
    }

    if (right !== undefined) {
      lines.push(`+${right}`);
    }
  }

  return lines.join("\n");
}

function renderSourceVerification(
  verification: MemorySourceVerification | undefined
): string {
  if (!verification) {
    return "unknown";
  }

  return `${safeValue(verification.status)} via ${safeValue(verification.method)}: ${safeValue(verification.reason)}`;
}

function safeValue(value: string): string {
  return sanitizeStringValueForBoundary(value);
}
