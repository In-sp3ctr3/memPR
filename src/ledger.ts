import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { classifyMemory } from "./policy.js";
import type {
  LedgerPaths,
  ListFilters,
  MemoryRecord,
  MemoryStatus,
  ProposeMemoryInput
} from "./types.js";

const LEDGER_DIR = ".mempr";
const LEDGER_FILE = "ledger.jsonl";
const BLOCK_START = "<!-- mempr:start -->";
const BLOCK_END = "<!-- mempr:end -->";

export function resolveLedgerPaths(root = process.cwd()): LedgerPaths {
  const resolvedRoot = resolve(root);

  return {
    root: resolvedRoot,
    directory: join(resolvedRoot, LEDGER_DIR),
    ledgerFile: join(resolvedRoot, LEDGER_DIR, LEDGER_FILE)
  };
}

export async function proposeMemory(
  input: ProposeMemoryInput,
  root = process.cwd()
): Promise<MemoryRecord> {
  if (!input.memory.trim()) {
    throw new Error("Memory text is required.");
  }

  const paths = resolveLedgerPaths(root);
  const policy = classifyMemory(input);
  const now = new Date().toISOString();
  const record: MemoryRecord = {
    id: createId(),
    memory: input.memory.trim(),
    source: {
      type: input.sourceType ?? inferSourceType(input.source),
      uri: input.source ?? "manual",
      quote: input.quote
    },
    scope: input.scope ?? "user",
    risk: policy.risk,
    decision: policy.decision,
    decision_reason: policy.reason,
    destination: input.destination ?? "MEMORY.md",
    status: statusFromDecision(policy.decision),
    ttl: input.ttl ?? null,
    created_at: now,
    updated_at: now
  };

  await appendRecord(paths, record);
  return record;
}

export async function listRecords(
  filters: ListFilters = {},
  root = process.cwd()
): Promise<MemoryRecord[]> {
  const records = await readRecords(resolveLedgerPaths(root));

  if (!filters.status) {
    return records;
  }

  return records.filter((record) => record.status === filters.status);
}

export async function updateRecordStatus(
  id: string,
  status: MemoryStatus,
  reason: string | undefined,
  root = process.cwd()
): Promise<MemoryRecord> {
  const paths = resolveLedgerPaths(root);
  const records = await readRecords(paths);
  const now = new Date().toISOString();
  let updated: MemoryRecord | undefined;

  const nextRecords = records.map((record) => {
    if (record.id !== id) {
      return record;
    }

    updated = {
      ...record,
      status,
      status_reason: reason,
      updated_at: now
    };

    return updated;
  });

  if (!updated) {
    throw new Error(`No memory record found for ${id}.`);
  }

  await writeRecords(paths, nextRecords);
  return updated;
}

export async function exportMarkdown(
  destination = "MEMORY.md",
  root = process.cwd()
): Promise<string> {
  const paths = resolveLedgerPaths(root);
  const records = await readRecords(paths);
  const accepted = records.filter((record) => {
    return record.status === "accepted" && record.destination === destination;
  });
  const outputPath = join(paths.root, destination);
  const existing = await readOptional(outputPath);
  const block = renderMemoryBlock(accepted);
  const next = replaceManagedBlock(existing, block);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, next);
  return outputPath;
}

export function renderRecord(record: MemoryRecord): string {
  return [
    `${record.id} [${record.status}] ${record.memory}`,
    `  scope: ${record.scope}`,
    `  risk: ${record.risk}`,
    `  source: ${record.source.uri}`,
    `  destination: ${record.destination}`,
    `  decision: ${record.decision} (${record.decision_reason})`
  ].join("\n");
}

async function appendRecord(paths: LedgerPaths, record: MemoryRecord): Promise<void> {
  const records = await readRecords(paths);
  records.push(record);
  await writeRecords(paths, records);
}

async function readRecords(paths: LedgerPaths): Promise<MemoryRecord[]> {
  const content = await readOptional(paths.ledgerFile);

  if (!content.trim()) {
    return [];
  }

  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MemoryRecord);
}

async function writeRecords(paths: LedgerPaths, records: MemoryRecord[]): Promise<void> {
  await mkdir(paths.directory, { recursive: true });
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  await writeFile(paths.ledgerFile, content ? `${content}\n` : "");
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

function renderMemoryBlock(records: MemoryRecord[]): string {
  const lines = [
    BLOCK_START,
    "## Accepted Memories",
    ""
  ];

  if (records.length === 0) {
    lines.push("_No accepted memories yet._");
  }

  for (const record of records) {
    lines.push(`- ${record.memory}`);
    lines.push(`  - scope: ${record.scope}`);
    lines.push(`  - source: ${record.source.uri}`);
    lines.push(`  - id: ${record.id}`);
  }

  lines.push("", BLOCK_END, "");
  return lines.join("\n");
}

function replaceManagedBlock(existing: string, block: string): string {
  const startIndex = existing.indexOf(BLOCK_START);
  const endIndex = existing.indexOf(BLOCK_END);

  if (startIndex >= 0 && endIndex > startIndex) {
    const before = existing.slice(0, startIndex).trimEnd();
    const after = existing.slice(endIndex + BLOCK_END.length).trimStart();
    return [before, block.trimEnd(), after].filter(Boolean).join("\n\n") + "\n";
  }

  return [existing.trimEnd(), block.trimEnd()].filter(Boolean).join("\n\n") + "\n";
}

function statusFromDecision(decision: string): MemoryStatus {
  if (decision === "auto_accept") {
    return "accepted";
  }

  if (decision === "reject") {
    return "rejected";
  }

  return "pending";
}

function inferSourceType(source: string | undefined): string {
  if (!source) {
    return "manual";
  }

  if (source.startsWith("http://") || source.startsWith("https://")) {
    return "url";
  }

  return "file";
}

function createId(): string {
  return `mem_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

