import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  safeCreateStoreLockFile,
  safeReadOptionalStoreFile,
  safeRemoveStoreFile
} from "./store-paths.js";

const STORE_LOCK_FILE = "store.lock";
const STORE_LOCK_TIMEOUT_MS = 5_000;
const STORE_LOCK_RETRY_MS = 50;

export interface AtomicWriteFileOptions {
  mode?: number;
  createParent?: boolean;
}

export async function atomicWriteFile(
  targetPath: string,
  content: string,
  options: AtomicWriteFileOptions = {}
): Promise<void> {
  const directory = dirname(targetPath);
  const tempPath = join(
    directory,
    `.${basename(targetPath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  );

  if (options.createParent !== false) {
    await mkdir(directory, { recursive: true });
  }

  try {
    await writeFile(tempPath, content, {
      flag: "wx",
      mode: options.mode
    });

    if (options.mode !== undefined) {
      await chmod(tempPath, options.mode);
    }

    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function withStoreLock<T>(
  directory: string,
  operation: () => Promise<T>
): Promise<T> {
  const root = storeRootFromDirectory(directory);
  const owner = `${process.pid}-${randomBytes(6).toString("hex")}`;
  let operationError: unknown;

  await acquireStoreLock(root, owner);

  try {
    return await operation();
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await releaseStoreLock(root, owner);
    } catch (error) {
      if (!operationError) {
        throw error;
      }
    }
  }
}

async function acquireStoreLock(root: string, owner: string): Promise<void> {
  const deadline = Date.now() + STORE_LOCK_TIMEOUT_MS;

  while (true) {
    try {
      await safeCreateStoreLockFile(root, `${JSON.stringify({
        owner,
        pid: process.pid,
        created_at: new Date().toISOString()
      })}\n`);
      return;
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw error;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          "Timed out waiting for the MemPR store lock. Another process may still be writing. Wait and retry; if no MemPR process is running, remove .mempr/store.lock and retry."
        );
      }

      await delay(Math.min(STORE_LOCK_RETRY_MS, Math.max(1, deadline - Date.now())));
    }
  }
}

async function releaseStoreLock(root: string, owner: string): Promise<void> {
  const lock = await safeReadOptionalStoreFile(root, STORE_LOCK_FILE);

  if (!lock.exists) {
    return;
  }

  if (!lock.content.includes(`"owner":"${owner}"`)) {
    throw new Error(
      "MemPR store lock ownership changed before release; leaving the current lock in place."
    );
  }

  await safeRemoveStoreFile(root, STORE_LOCK_FILE);
}

function storeRootFromDirectory(directory: string): string {
  const resolvedDirectory = resolve(directory);

  if (basename(resolvedDirectory) !== ".mempr") {
    throw new Error("MemPR store lock directory must be .mempr.");
  }

  return dirname(resolvedDirectory);
}

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
