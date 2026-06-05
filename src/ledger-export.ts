import { lstat } from "node:fs/promises";
import {
  appendEvent,
  createEventId
} from "./events.js";
import {
  replaceManagedBlock,
  selectExportAdapter
} from "./export-adapters.js";
import {
  normalizeDestinationForOperation,
  safeResolveRepoPath
} from "./destination-safety.js";
import {
  formatExportBlockingIssue,
  readContextIssues,
  readContextWarnings
} from "./read-context.js";
import type { ReadContextWarning } from "./read-context.js";
import {
  readRecords,
  resolveLedgerPaths
} from "./ledger-store.js";
import { reportableRecordId } from "./safety.js";
import { safeReadOptionalRepoFile } from "./repo-file-reader.js";
import { assertReadAccess } from "./read-policy.js";
import type { ReadAccessOptions } from "./read-policy.js";
import { atomicWriteFile, withStoreLock } from "./storage.js";
import type { LedgerPaths } from "./types.js";

export interface MarkdownExportPreview {
  destination: string;
  adapter: {
    id: string;
    title: string;
  };
  recordIds: string[];
  recordCount: number;
  destinationExists: boolean;
  warnings: ReadContextWarning[];
  safe_content_preview: string;
}

export interface ExportMarkdownOptions {
  dryRun?: boolean;
  readAccess?: ReadAccessOptions;
}

interface MarkdownExportPlan {
  root: string;
  destination: string;
  outputPath: string;
  adapterId: string;
  adapterTitle: string;
  recordIds: string[];
  recordCount: number;
  destinationExists: boolean;
  warnings: ReadContextWarning[];
  content: string;
}

export function exportMarkdown(destination?: string, root?: string): Promise<string>;
export function exportMarkdown(
  destination: string | undefined,
  root: string | undefined,
  options: ExportMarkdownOptions & { dryRun: true }
): Promise<MarkdownExportPreview>;
export function exportMarkdown(
  destination: string | undefined,
  root: string | undefined,
  options: ExportMarkdownOptions
): Promise<string | MarkdownExportPreview>;
export async function exportMarkdown(
  destination = "MEMORY.md",
  root = process.cwd(),
  options: ExportMarkdownOptions = {}
): Promise<string | MarkdownExportPreview> {
  const surface = options.dryRun === true ? "export_preview" : "export";
  const targetDestination = normalizeDestinationForOperation(destination, surface);
  const adapter = selectExportAdapter(targetDestination);
  const paths = resolveLedgerPaths(root);

  if (options.dryRun === true) {
    await assertReadAccess(paths.root, {
      action: "read",
      surface: "export_preview",
      resource: "export_preview",
      destination: targetDestination
    }, options.readAccess ?? {});
    const plan = await buildMarkdownExportPlan(paths, targetDestination, adapter, "preview");
    return markdownExportPreview(plan);
  }

  return withStoreLock(paths.directory, async () => {
    const plan = await buildMarkdownExportPlan(paths, targetDestination, adapter, "write");

    await writeExportDestination(plan);
    await appendEvent({
      id: createEventId(),
      type: "memory_exported",
      created_at: new Date().toISOString(),
      destination: plan.destination,
      record_ids: plan.recordIds
    }, paths.root);
    return plan.outputPath;
  });
}

export async function previewMarkdownExport(
  destination = "MEMORY.md",
  root = process.cwd(),
  readAccess: ReadAccessOptions = {}
): Promise<MarkdownExportPreview> {
  const targetDestination = normalizeDestinationForOperation(destination, "export_preview");
  await assertReadAccess(root, {
    action: "read",
    surface: "export_preview",
    resource: "export_preview",
    destination: targetDestination
  }, readAccess);
  const adapter = selectExportAdapter(targetDestination);
  const paths = resolveLedgerPaths(root);
  const plan = await buildMarkdownExportPlan(paths, targetDestination, adapter, "preview");
  return markdownExportPreview(plan);
}

async function buildMarkdownExportPlan(
  paths: LedgerPaths,
  targetDestination: string,
  adapter: ReturnType<typeof selectExportAdapter>,
  mode: "preview" | "write"
): Promise<MarkdownExportPlan> {
  const records = await readRecords(paths);
  const accepted = records.filter((record) => {
    return record.status === "accepted" && record.destination === targetDestination;
  });
  const issues = readContextIssues(accepted);

  if (issues.length > 0) {
    throw new Error(formatExportBlockingIssue(issues[0]));
  }

  const outputPath = await safeResolveRepoPath(paths.root, targetDestination, {
    forWrite: mode === "write"
  });
  const destinationFile = await readSafeExistingDestination(paths.root, targetDestination);
  const block = adapter.renderManagedBlock(accepted, targetDestination);
  const content = replaceManagedBlock(destinationFile.content, block);
  const recordIds = accepted.map((record) => record.id);
  const warnings = readContextWarnings(accepted);

  return {
    root: paths.root,
    destination: targetDestination,
    outputPath,
    adapterId: adapter.id,
    adapterTitle: adapter.title,
    recordIds,
    recordCount: recordIds.length,
    destinationExists: destinationFile.exists,
    warnings,
    content
  };
}

function markdownExportPreview(plan: MarkdownExportPlan): MarkdownExportPreview {
  return {
    destination: plan.destination,
    adapter: {
      id: plan.adapterId,
      title: plan.adapterTitle
    },
    recordIds: plan.recordIds.map(reportableRecordId),
    recordCount: plan.recordCount,
    destinationExists: plan.destinationExists,
    warnings: plan.warnings,
    safe_content_preview: plan.content
  };
}

async function writeExportDestination(plan: MarkdownExportPlan): Promise<void> {
  const outputPath = await safeResolveRepoPath(plan.root, plan.destination, {
    createParent: true,
    forWrite: true
  });
  const existingMode = await existingFileMode(outputPath);

  await atomicWriteFile(
    outputPath,
    plan.content,
    existingMode === undefined
      ? { createParent: false }
      : { mode: existingMode, createParent: false }
  );
}

async function existingFileMode(path: string): Promise<number | undefined> {
  try {
    const stats = await lstat(path);

    if (stats.isSymbolicLink()) {
      return undefined;
    }

    return stats.mode & 0o777;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function readSafeExistingDestination(
  root: string,
  destination: string
): Promise<{ exists: boolean; content: string }> {
  try {
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
  } catch (error) {
    throw error;
  }
}
