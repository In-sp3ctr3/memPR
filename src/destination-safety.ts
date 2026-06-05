import { lstat, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { normalizeLocalFileDestination } from "./export-adapters.js";
import {
  assertNoPersistentSecretLikeContent,
  hasPersistentSecretLikeContent
} from "./persistence-safety.js";
import { redactedPreview } from "./redaction.js";

const UNSAFE_REPORTABLE_DESTINATION_PATTERN = /[\u0000-\u001F\u007F]/;
const REDACTED_DESTINATION = "[MEMPR_REDACTED_DESTINATION]";

export type DestinationOperationSurface =
  | "export"
  | "export_preview"
  | "context"
  | "context_status"
  | "live_sync"
  | "mcp_resource";

export function normalizeDestinationForOperation(
  destination: string | null | undefined,
  _surface: DestinationOperationSurface
): string {
  const normalized = normalizeExportDestination(destination);

  assertNoPersistentSecretLikeContent(
    [{ field: "destination", text: normalized }],
    "Destination contains secret-like content."
  );

  return normalized;
}

export function normalizeExportDestination(value: string | null | undefined): string {
  return normalizeLocalFileDestination(value);
}

export function normalizeReadContextDestination(value: string | null | undefined): string {
  return normalizeLocalFileDestination(value);
}

export function assertSafeExportDestination(value: string): string {
  return normalizeExportDestination(value);
}

export interface SafeResolveRepoPathOptions {
  createParent?: boolean;
  forWrite?: boolean;
}

export async function safeResolveRepoPath(
  root: string,
  destination: string,
  options: SafeResolveRepoPathOptions = {}
): Promise<string> {
  const normalized = normalizeExportDestination(destination);
  const rootRealpath = await realpath(resolve(root));
  const outputPath = resolve(rootRealpath, normalized);

  assertPathInsideRoot(rootRealpath, outputPath);

  if (options.createParent === true) {
    await ensureSafeParentDirectory(rootRealpath, normalized);
  } else {
    await validateExistingParentChain(rootRealpath, normalized);
  }

  const destinationStat = await lstatIfExists(outputPath);

  if (destinationStat?.isSymbolicLink() && options.forWrite !== true) {
    throw new Error("Invalid export destination: symlinked destination cannot be previewed.");
  }

  if (destinationStat?.isFile() && destinationStat.nlink !== 1) {
    throw new Error("Invalid export destination: existing destination must be a single-link regular file.");
  }

  return outputPath;
}

export function isSecretLikeDestination(destination: string): boolean {
  return hasPersistentSecretLikeContent([{ field: "destination", text: destination }]);
}

export function reportableDestination(destination: string): string {
  if (UNSAFE_REPORTABLE_DESTINATION_PATTERN.test(destination)) {
    return REDACTED_DESTINATION;
  }

  return isSecretLikeDestination(destination) ? redactedPreview(destination) : destination.trim();
}

async function lstatIfExists(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function ensureSafeParentDirectory(
  rootRealpath: string,
  normalizedDestination: string
): Promise<void> {
  const parentSegments = parentSegmentsFor(normalizedDestination);
  let current = rootRealpath;

  for (const segment of parentSegments) {
    current = join(current, segment);
    assertPathInsideRoot(rootRealpath, current);

    const existing = await lstatIfExists(current);

    if (existing) {
      await assertSafeDirectorySegment(rootRealpath, current, existing);
      continue;
    }

    await mkdir(current);
    const created = await lstatIfExists(current);

    if (!created) {
      throw new Error("Invalid export destination: destination parent could not be resolved.");
    }

    await assertSafeDirectorySegment(rootRealpath, current, created);
  }
}

async function validateExistingParentChain(
  rootRealpath: string,
  normalizedDestination: string
): Promise<void> {
  const parentSegments = parentSegmentsFor(normalizedDestination);
  let current = rootRealpath;

  for (const segment of parentSegments) {
    current = join(current, segment);
    assertPathInsideRoot(rootRealpath, current);

    const existing = await lstatIfExists(current);

    if (!existing) {
      return;
    }

    await assertSafeDirectorySegment(rootRealpath, current, existing);
  }
}

function parentSegmentsFor(normalizedDestination: string): string[] {
  const parent = dirname(normalizedDestination);

  if (parent === "." || parent === "") {
    return [];
  }

  return parent.split(/[\\/]+/).filter(Boolean);
}

async function assertSafeDirectorySegment(
  rootRealpath: string,
  path: string,
  segmentStat: Awaited<ReturnType<typeof lstat>>
): Promise<void> {
  if (segmentStat.isSymbolicLink()) {
    throw new Error("Invalid export destination: parent directories must be real directories.");
  }

  if (!segmentStat.isDirectory()) {
    throw new Error("Invalid export destination: parent path is not a directory.");
  }

  const segmentRealpath = await realpath(path);
  assertPathInsideRoot(rootRealpath, segmentRealpath);
}

function assertPathInsideRoot(root: string, path: string): void {
  const candidate = resolve(path);
  const rootPath = resolve(root);
  const pathRelativeToRoot = relative(rootPath, candidate);

  if (
    pathRelativeToRoot === ""
    || (
      !pathRelativeToRoot.startsWith("..")
      && !isAbsolute(pathRelativeToRoot)
    )
  ) {
    return;
  }

  throw new Error("Invalid export destination: resolved path escapes the repository root.");
}
