import { join, resolve } from "node:path";
import { normalizeRecord } from "./ledger-records.js";
import {
  assertNoPersistentSecretLikeContent,
  memoryRecordStringFields
} from "./persistence-safety.js";
import {
  safeAtomicWriteStoreFile,
  safeReadOptionalStoreFile
} from "./store-paths.js";
import type { LedgerPaths, MemoryRecord } from "./types.js";

export const LEDGER_DIR = ".mempr";
export const LEDGER_FILE = "ledger.jsonl";

export function resolveLedgerPaths(root = process.cwd()): LedgerPaths {
  const resolvedRoot = resolve(root);

  return {
    root: resolvedRoot,
    directory: join(resolvedRoot, LEDGER_DIR),
    ledgerFile: join(resolvedRoot, LEDGER_DIR, LEDGER_FILE)
  };
}

export async function appendRecord(paths: LedgerPaths, record: MemoryRecord): Promise<void> {
  const records = await readRecords(paths);
  records.push(record);
  await writeRecords(paths, records);
}

export async function readRecords(paths: LedgerPaths): Promise<MemoryRecord[]> {
  const file = await safeReadOptionalStoreFile(paths.root, LEDGER_FILE);
  const content = file.exists ? file.content : "";

  if (!content.trim()) {
    return [];
  }

  return content
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return normalizeRecord(JSON.parse(line) as MemoryRecord);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Malformed ledger record on line ${index + 1}: ${detail}`);
      }
    });
}

export async function writeRecords(paths: LedgerPaths, records: MemoryRecord[]): Promise<void> {
  assertNoPersistentSecretLikeContent(
    memoryRecordStringFields(records),
    "Ledger records contain unsafe persistent content."
  );
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  await safeAtomicWriteStoreFile(paths.root, LEDGER_FILE, content ? `${content}\n` : "");
}
