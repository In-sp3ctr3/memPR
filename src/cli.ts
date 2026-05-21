#!/usr/bin/env node
import {
  exportMarkdown,
  listRecords,
  proposeMemory,
  renderRecord,
  updateRecordStatus
} from "./ledger.js";
import type { MemoryRisk, MemoryStatus } from "./types.js";

interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  switch (parsed.command) {
    case "propose":
      await handlePropose(parsed);
      return;
    case "list":
      await handleList(parsed);
      return;
    case "accept":
      await handleStatus(parsed, "accepted");
      return;
    case "reject":
      await handleStatus(parsed, "rejected");
      return;
    case "export":
      await handleExport(parsed);
      return;
    case "help":
    case undefined:
      printHelp();
      return;
    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
}

async function handlePropose(parsed: ParsedArgs): Promise<void> {
  const memory = stringFlag(parsed, "memory");

  if (!memory) {
    throw new Error("Missing --memory.");
  }

  const record = await proposeMemory(
    {
      memory,
      source: stringFlag(parsed, "source"),
      sourceType: stringFlag(parsed, "source-type"),
      quote: stringFlag(parsed, "quote"),
      scope: stringFlag(parsed, "scope"),
      risk: riskFlag(parsed),
      destination: stringFlag(parsed, "destination"),
      ttl: stringFlag(parsed, "ttl") ?? null
    },
    rootFlag(parsed)
  );

  printJsonOrText(parsed, record, renderRecord(record));
}

async function handleList(parsed: ParsedArgs): Promise<void> {
  const status = statusFlag(parsed);
  const records = await listRecords({ status }, rootFlag(parsed));
  const text = records.length === 0
    ? "No memory records found."
    : records.map(renderRecord).join("\n\n");

  printJsonOrText(parsed, records, text);
}

async function handleStatus(
  parsed: ParsedArgs,
  status: MemoryStatus
): Promise<void> {
  const id = parsed.positionals[0];

  if (!id) {
    throw new Error(`Missing memory id for ${status}.`);
  }

  const record = await updateRecordStatus(
    id,
    status,
    stringFlag(parsed, "reason"),
    rootFlag(parsed)
  );

  printJsonOrText(parsed, record, renderRecord(record));
}

async function handleExport(parsed: ParsedArgs): Promise<void> {
  const destination = stringFlag(parsed, "destination") ?? "MEMORY.md";
  const outputPath = await exportMarkdown(destination, rootFlag(parsed));
  printJsonOrText(parsed, { destination: outputPath }, `Exported ${outputPath}`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];

    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const raw = value.slice(2);
    const equalsIndex = raw.indexOf("=");

    if (equalsIndex >= 0) {
      flags[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }

    const next = rest[index + 1];

    if (next && !next.startsWith("--")) {
      flags[raw] = next;
      index += 1;
    } else {
      flags[raw] = true;
    }
  }

  return { command, positionals, flags };
}

function printJsonOrText(parsed: ParsedArgs, value: unknown, text: string): void {
  if (parsed.flags.json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  console.log(text);
}

function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
}

function rootFlag(parsed: ParsedArgs): string | undefined {
  return stringFlag(parsed, "root");
}

function riskFlag(parsed: ParsedArgs): MemoryRisk | undefined {
  const value = stringFlag(parsed, "risk");

  if (!value) {
    return undefined;
  }

  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new Error("--risk must be low, medium, or high.");
}

function statusFlag(parsed: ParsedArgs): MemoryStatus | undefined {
  const value = stringFlag(parsed, "status");

  if (!value) {
    return undefined;
  }

  if (value === "pending" || value === "accepted" || value === "rejected") {
    return value;
  }

  throw new Error("--status must be pending, accepted, or rejected.");
}

function printHelp(): void {
  console.log(`mempr

Usage:
  mempr propose --memory <text> [--source <uri>] [--scope repo]
  mempr list [--status pending|accepted|rejected]
  mempr accept <id> [--reason <text>]
  mempr reject <id> [--reason <text>]
  mempr export [--destination MEMORY.md]

Options:
  --root <path>          Run against another workspace.
  --json                 Print JSON output.
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`mempr: ${message}`);
  process.exitCode = 1;
});

