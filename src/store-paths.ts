import {
  O_APPEND,
  O_CREAT,
  O_EXCL,
  O_NOFOLLOW,
  O_NONBLOCK,
  O_RDONLY,
  O_WRONLY
} from "node:constants";
import {
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import type { Stats } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomBytes } from "node:crypto";

export const MEMPR_STORE_DIR = ".mempr";

export const MEMPR_STORE_FILES = [
  "ledger.jsonl",
  "events.jsonl",
  "policy.json",
  "read-policy.json",
  "principals.json",
  "diagnostics.jsonl",
  "store.lock"
] as const;

export type MemprStoreFilename = (typeof MEMPR_STORE_FILES)[number];

export interface MemprStorePaths {
  root: string;
  directory: string;
  exists: boolean;
}

export interface StoreFileReadOptions {
  maxBytes?: number;
}

export interface StoreFileWriteOptions {
  mode?: number;
}

export interface StoreFileReadResult {
  filename: MemprStoreFilename;
  content: string;
  size: number;
}

export interface OptionalStoreFileReadResult extends StoreFileReadResult {
  exists: true;
}

const DEFAULT_MAX_STORE_FILE_BYTES = 10 * 1024 * 1024;
const NOFOLLOW_FLAG = typeof O_NOFOLLOW === "number" ? O_NOFOLLOW : 0;
const NONBLOCK_FLAG = typeof O_NONBLOCK === "number" ? O_NONBLOCK : 0;

export async function resolveSafeMemprStore(root = process.cwd()): Promise<MemprStorePaths> {
  return ensureSafeMemprStoreDirectory(root, { create: false });
}

export async function ensureSafeMemprStoreDirectory(
  root = process.cwd(),
  options: { create?: boolean } = {}
): Promise<MemprStorePaths> {
  const rootRealpath = await safeRealpath(resolve(root), "MemPR root");
  const directory = join(rootRealpath, MEMPR_STORE_DIR);
  const existing = await lstatIfExists(directory, "MemPR store directory");

  if (!existing) {
    if (options.create !== true) {
      return {
        root: rootRealpath,
        directory,
        exists: false
      };
    }

    await safeMkdir(directory, "MemPR store directory");
  }

  const directoryStat = await safeLstat(directory, "MemPR store directory");

  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw safeStoreError("MemPR store directory must be a real directory.");
  }

  const directoryRealpath = await safeRealpath(directory, "MemPR store directory");
  assertInsideRoot(rootRealpath, directoryRealpath, "MemPR store directory");

  return {
    root: rootRealpath,
    directory: directoryRealpath,
    exists: true
  };
}

export async function safeReadStoreFile(
  root: string,
  filename: string,
  options: StoreFileReadOptions = {}
): Promise<StoreFileReadResult> {
  const safeFilename = normalizeStoreFilename(filename);
  const store = await ensureSafeMemprStoreDirectory(root, { create: false });

  if (!store.exists) {
    throw notFoundError("MemPR store file does not exist.");
  }

  const filePath = storeFilePath(store, safeFilename);
  const fileStat = await safeLstat(filePath, "MemPR store file");
  assertRegularStoreFile(fileStat, "MemPR store file");
  enforceMaxBytes(Number(fileStat.size), options.maxBytes, "MemPR store file");

  let handle: FileHandle | undefined;

  try {
    handle = await open(filePath, O_RDONLY | NOFOLLOW_FLAG | NONBLOCK_FLAG);
    const handleStat = await handle.stat();
    assertRegularStoreFile(handleStat, "MemPR store file");
    enforceMaxBytes(Number(handleStat.size), options.maxBytes, "MemPR store file");

    return {
      filename: safeFilename,
      content: await handle.readFile({ encoding: "utf8" }),
      size: Number(handleStat.size)
    };
  } catch (error) {
    throw safeStoreFsError("MemPR store file could not be read safely.", error);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function safeReadOptionalStoreFile(
  root: string,
  filename: string,
  options: StoreFileReadOptions = {}
): Promise<OptionalStoreFileReadResult | { exists: false; filename: MemprStoreFilename }> {
  const safeFilename = normalizeStoreFilename(filename);

  try {
    const result = await safeReadStoreFile(root, safeFilename, options);
    return {
      ...result,
      exists: true
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        exists: false,
        filename: safeFilename
      };
    }

    throw error;
  }
}

export async function safeAppendStoreFile(
  root: string,
  filename: string,
  content: string,
  options: StoreFileWriteOptions = {}
): Promise<void> {
  const safeFilename = normalizeStoreFilename(filename);
  const store = await ensureSafeMemprStoreDirectory(root, { create: true });
  const filePath = storeFilePath(store, safeFilename);
  await assertSafeExistingStoreFile(filePath, "MemPR store file");

  let handle: FileHandle | undefined;

  try {
    handle = await open(
      filePath,
      O_WRONLY | O_APPEND | O_CREAT | NOFOLLOW_FLAG | NONBLOCK_FLAG,
      options.mode
    );
    assertRegularStoreFile(await handle.stat(), "MemPR store file");
    await handle.writeFile(content, "utf8");
  } catch (error) {
    throw safeStoreFsError("MemPR store file could not be written safely.", error);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function safeAtomicWriteStoreFile(
  root: string,
  filename: string,
  content: string,
  options: StoreFileWriteOptions = {}
): Promise<void> {
  const safeFilename = normalizeStoreFilename(filename);
  const store = await ensureSafeMemprStoreDirectory(root, { create: true });
  const targetPath = storeFilePath(store, safeFilename);
  await assertSafeExistingStoreFile(targetPath, "MemPR store file");

  const tempPath = join(
    store.directory,
    `.${safeFilename}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  );

  assertInsideRoot(store.root, tempPath, "MemPR temporary store file");

  let handle: FileHandle | undefined;

  try {
    handle = await open(
      tempPath,
      O_WRONLY | O_CREAT | O_EXCL | NOFOLLOW_FLAG | NONBLOCK_FLAG,
      options.mode
    );
    assertRegularStoreFile(await handle.stat(), "MemPR temporary store file");
    await handle.writeFile(content, "utf8");
    await handle.close();
    handle = undefined;

    if (options.mode !== undefined) {
      await chmod(tempPath, options.mode);
    }

    await rename(tempPath, targetPath);
    assertRegularStoreFile(await safeLstat(targetPath, "MemPR store file"), "MemPR store file");
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw safeStoreFsError("MemPR store file could not be written safely.", error);
  }
}

export async function safeCreateStoreLockFile(
  root: string,
  content: string,
  options: StoreFileWriteOptions = {}
): Promise<void> {
  const store = await ensureSafeMemprStoreDirectory(root, { create: true });
  const lockPath = storeFilePath(store, "store.lock");
  const existing = await lstatIfExists(lockPath, "MemPR store lock");

  if (existing) {
    assertRegularStoreFile(existing, "MemPR store lock");
    throw fileExistsError("MemPR store lock already exists.");
  }

  let handle: FileHandle | undefined;
  let created = false;

  try {
    handle = await open(
      lockPath,
      O_WRONLY | O_CREAT | O_EXCL | NOFOLLOW_FLAG | NONBLOCK_FLAG,
      options.mode
    );
    created = true;
    assertRegularStoreFile(await handle.stat(), "MemPR store lock");
    await handle.writeFile(content, "utf8");
  } catch (error) {
    if (created) {
      await rm(lockPath, { force: true }).catch(() => undefined);
    }

    throw safeStoreFsError("MemPR store lock could not be created safely.", error);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function safeRemoveStoreFile(
  root: string,
  filename: string
): Promise<void> {
  const safeFilename = normalizeStoreFilename(filename);
  const store = await ensureSafeMemprStoreDirectory(root, { create: false });

  if (!store.exists) {
    return;
  }

  const filePath = storeFilePath(store, safeFilename);
  const existing = await lstatIfExists(filePath, "MemPR store file");

  if (!existing) {
    return;
  }

  assertRegularStoreFile(existing, "MemPR store file");
  await rm(filePath, { force: true });
}

function normalizeStoreFilename(filename: string): MemprStoreFilename {
  if (
    basename(filename) !== filename
    || dirname(filename) !== "."
    || !MEMPR_STORE_FILES.includes(filename as MemprStoreFilename)
  ) {
    throw safeStoreError("MemPR store filename is not allowed.");
  }

  return filename as MemprStoreFilename;
}

function storeFilePath(store: MemprStorePaths, filename: MemprStoreFilename): string {
  const path = join(store.directory, filename);
  assertInsideRoot(store.root, path, "MemPR store file");
  return path;
}

async function assertSafeExistingStoreFile(path: string, label: string): Promise<void> {
  const existing = await lstatIfExists(path, label);

  if (!existing) {
    return;
  }

  assertRegularStoreFile(existing, label);
}

function assertRegularStoreFile(stat: Stats, label: string): void {
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
    if (stat.isFile() && stat.nlink !== 1) {
      throw safeStoreError(`${label} must be a single-link regular file.`);
    }

    throw safeStoreError(`${label} must be a regular file.`);
  }
}

function enforceMaxBytes(size: number, maxBytes: number | undefined, label: string): void {
  const limit = normalizeMaxBytes(maxBytes);

  if (size > limit) {
    throw safeStoreError(`${label} exceeds the maximum allowed size.`);
  }
}

function normalizeMaxBytes(maxBytes: number | undefined): number {
  if (maxBytes === undefined || !Number.isFinite(maxBytes) || maxBytes < 0) {
    return DEFAULT_MAX_STORE_FILE_BYTES;
  }

  return Math.floor(maxBytes);
}

function assertInsideRoot(root: string, path: string, label: string): void {
  const relativePath = relative(root, path);

  if (
    relativePath === ""
    || (
      !relativePath.startsWith("..")
      && !isAbsolute(relativePath)
    )
  ) {
    return;
  }

  throw safeStoreError(`${label} must stay inside the repository root.`);
}

async function lstatIfExists(path: string, label: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw safeStoreFsError(`${label} could not be checked safely.`, error);
  }
}

async function safeLstat(path: string, label: string): Promise<Stats> {
  try {
    return await lstat(path);
  } catch (error) {
    throw safeStoreFsError(`${label} could not be checked safely.`, error);
  }
}

async function safeRealpath(path: string, label: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    throw safeStoreFsError(`${label} could not be resolved safely.`, error);
  }
}

async function safeMkdir(path: string, label: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (error) {
    throw safeStoreFsError(`${label} could not be created safely.`, error);
  }
}

function safeStoreFsError(message: string, error: unknown): Error {
  if (isNotFoundError(error)) {
    return notFoundError(message);
  }

  if (isFileExistsError(error)) {
    return fileExistsError(message);
  }

  return safeStoreError(message);
}

function safeStoreError(message: string): Error {
  return new Error(message);
}

function notFoundError(message: string): Error {
  return Object.assign(new Error(message), { code: "ENOENT" });
}

function fileExistsError(message: string): Error {
  return Object.assign(new Error(message), { code: "EEXIST" });
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
