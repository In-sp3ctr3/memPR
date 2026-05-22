import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { FileHandle } from "node:fs/promises";

const STORE_LOCK_FILE = "store.lock";
const STORE_LOCK_TIMEOUT_MS = 5_000;
const STORE_LOCK_RETRY_MS = 50;

export async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const directory = dirname(targetPath);
  const tempPath = join(
    directory,
    `.${basename(targetPath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  );

  await mkdir(directory, { recursive: true });

  try {
    await writeFile(tempPath, content, { flag: "wx" });
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
  const lockPath = join(directory, STORE_LOCK_FILE);
  const owner = `${process.pid}-${randomBytes(6).toString("hex")}`;
  let operationError: unknown;

  await mkdir(directory, { recursive: true });
  await acquireStoreLock(lockPath, owner);

  try {
    return await operation();
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await releaseStoreLock(lockPath, owner);
    } catch (error) {
      if (!operationError) {
        throw error;
      }
    }
  }
}

async function acquireStoreLock(lockPath: string, owner: string): Promise<void> {
  const deadline = Date.now() + STORE_LOCK_TIMEOUT_MS;

  while (true) {
    try {
      await createStoreLock(lockPath, owner);
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

async function createStoreLock(lockPath: string, owner: string): Promise<void> {
  let handle: FileHandle | undefined;
  let lockCreated = false;

  try {
    handle = await open(lockPath, "wx");
    lockCreated = true;
    await handle.writeFile(`${JSON.stringify({
      owner,
      pid: process.pid,
      created_at: new Date().toISOString()
    })}\n`, "utf8");
  } catch (error) {
    await handle?.close().catch(() => undefined);
    handle = undefined;

    if (lockCreated) {
      await rm(lockPath, { force: true }).catch(() => undefined);
    }

    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function releaseStoreLock(lockPath: string, owner: string): Promise<void> {
  let lockContent: string;

  try {
    lockContent = await readFile(lockPath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }

  if (!lockContent.includes(`"owner":"${owner}"`)) {
    throw new Error(
      "MemPR store lock ownership changed before release; leaving the current lock in place."
    );
  }

  await rm(lockPath, { force: true });
}

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
