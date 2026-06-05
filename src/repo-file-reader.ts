import {
  open,
  lstat,
  realpath,
  stat
} from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { normalizeRepoRelativePath } from "./repo-paths.js";

const DEFAULT_MAX_REPO_FILE_BYTES = 1024 * 1024;

export interface SafeReadRepoFileOptions {
  label?: string;
  maxBytes?: number;
  allowSymlink?: boolean;
}

export interface SafeReadRepoFileResult {
  path: string;
  content: string;
  size: number;
}

export interface SafeReadOptionalRepoFileResult extends SafeReadRepoFileResult {
  exists: true;
}

export async function safeReadRepoFile(
  root: string,
  repoRelativePath: string,
  options: SafeReadRepoFileOptions = {}
): Promise<SafeReadRepoFileResult> {
  const label = options.label ?? "Repository file";
  const normalized = normalizeRepoRelativePath(repoRelativePath, label);
  const rootRealpath = await safeRealpath(resolve(root), label);
  const candidatePath = resolve(rootRealpath, normalized);

  assertInsideRoot(rootRealpath, candidatePath, label);
  await assertSafeParentChain(rootRealpath, normalized, label);

  let filePath = candidatePath;
  let fileStat = await safeLstat(candidatePath, label);

  if (fileStat.isSymbolicLink()) {
    if (options.allowSymlink !== true) {
      throw new Error(`${label} must be a regular file.`);
    }

    filePath = await safeRealpath(candidatePath, label);
    assertInsideRoot(rootRealpath, filePath, label);
    fileStat = await safeStat(filePath, label);
  } else {
    filePath = await safeRealpath(candidatePath, label);
    assertInsideRoot(rootRealpath, filePath, label);
    fileStat = await safeStat(filePath, label);
  }

  assertSingleLinkRegularFile(fileStat, label);

  const maxBytes = normalizeMaxBytes(options.maxBytes);

  const size = Number(fileStat.size);

  if (size > maxBytes) {
    throw new Error(`${label} exceeds the maximum allowed size.`);
  }

  return {
    path: normalized,
    content: await safeReadRegularFile(filePath, maxBytes, label),
    size
  };
}

export async function safeReadOptionalRepoFile(
  root: string,
  repoRelativePath: string,
  options: SafeReadRepoFileOptions = {}
): Promise<SafeReadOptionalRepoFileResult | { exists: false; path: string }> {
  const label = options.label ?? "Repository file";
  const normalized = normalizeRepoRelativePath(repoRelativePath, label);

  try {
    const result = await safeReadRepoFile(root, normalized, {
      ...options,
      label
    });

    return {
      ...result,
      exists: true
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        exists: false,
        path: normalized
      };
    }

    throw error;
  }
}

function normalizeMaxBytes(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_REPO_FILE_BYTES;
  }

  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_MAX_REPO_FILE_BYTES;
  }

  return Math.floor(value);
}

function assertInsideRoot(root: string, path: string, label: string): void {
  const pathRelativeToRoot = relative(root, path);

  if (
    pathRelativeToRoot === ""
    || (
      !pathRelativeToRoot.startsWith("..")
      && !isAbsolute(pathRelativeToRoot)
    )
  ) {
    return;
  }

  throw new Error(`${label} must stay inside the repository root.`);
}

async function assertSafeParentChain(
  rootRealpath: string,
  normalizedPath: string,
  label: string
): Promise<void> {
  const parent = dirname(normalizedPath);

  if (parent === "." || parent === "") {
    return;
  }

  let current = rootRealpath;

  for (const segment of parent.split(/[\\/]+/).filter(Boolean)) {
    current = join(current, segment);
    assertInsideRoot(rootRealpath, current, label);

    const segmentStat = await safeLstat(current, label);

    if (segmentStat.isSymbolicLink()) {
      throw new Error(`${label} parent directories must be real directories.`);
    }

    if (!segmentStat.isDirectory()) {
      throw new Error(`${label} parent directories must be real directories.`);
    }

    const segmentRealpath = await safeRealpath(current, label);
    assertInsideRoot(rootRealpath, segmentRealpath, label);
  }
}

async function safeRealpath(path: string, label: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    throw safeFileError(label, error);
  }
}

async function safeLstat(path: string, label: string): Promise<Stats> {
  try {
    return await lstat(path);
  } catch (error) {
    throw safeFileError(label, error);
  }
}

async function safeStat(path: string, label: string): Promise<Stats> {
  try {
    return await stat(path);
  } catch (error) {
    throw safeFileError(label, error);
  }
}

async function safeReadRegularFile(
  path: string,
  maxBytes: number,
  label: string
): Promise<string> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    const fileStat = await handle.stat() as Stats;

    assertSingleLinkRegularFile(fileStat, label);

    if (Number(fileStat.size) > maxBytes) {
      throw new Error(`${label} exceeds the maximum allowed size.`);
    }

    return await handle.readFile({ encoding: "utf8" });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${label} `)) {
      throw error;
    }

    throw safeFileError(label, error);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function assertSingleLinkRegularFile(
  fileStat: Stats,
  label: string
): void {
  if (!fileStat.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }

  if (fileStat.nlink !== 1) {
    throw new Error(`${label} must be a single-link regular file.`);
  }
}

function safeFileError(label: string, error: unknown): Error {
  const code = typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    ? error.code
    : undefined;
  const safeError = new Error(`${label} could not be read safely.`);

  if (code) {
    Object.assign(safeError, { code });
  }

  return safeError;
}
