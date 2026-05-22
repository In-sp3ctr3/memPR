import { basename, isAbsolute } from "node:path";
import type { MemoryRecord } from "./types.js";

export const MEMPR_MANAGED_BLOCK_START = "<!-- mempr:start -->";
export const MEMPR_MANAGED_BLOCK_END = "<!-- mempr:end -->";

export interface LocalFileExportAdapter {
  id: string;
  title: string;
  description?: string;
  isCompatible(destination: string): boolean;
  render(records: readonly MemoryRecord[], destination?: string): string;
  matches(destination: string): boolean;
  renderManagedBlock(records: readonly MemoryRecord[], destination: string): string;
}

export const agentsMarkdownAdapter: LocalFileExportAdapter = {
  id: "local-file-agents-markdown",
  title: "AGENTS.md",
  description: "Local Markdown export adapter for agent instruction files.",
  isCompatible: (destination) => basename(destination) === "AGENTS.md",
  render: renderAgentsMarkdownBlock,
  matches: (destination) => basename(destination) === "AGENTS.md",
  renderManagedBlock: renderAgentsMarkdownBlock
};

export const claudeMarkdownAdapter: LocalFileExportAdapter = {
  id: "local-file-claude-markdown",
  title: "CLAUDE.md",
  description: "Local Markdown export adapter for Claude instruction files.",
  isCompatible: (destination) => basename(destination) === "CLAUDE.md",
  render: renderClaudeMarkdownBlock,
  matches: (destination) => basename(destination) === "CLAUDE.md",
  renderManagedBlock: renderClaudeMarkdownBlock
};

export const genericMarkdownAdapter: LocalFileExportAdapter = {
  id: "local-file-generic-markdown",
  title: "Generic Markdown",
  description: "Local Markdown export adapter for ordinary repository files.",
  isCompatible: () => true,
  render: renderGenericMarkdownBlock,
  matches: () => true,
  renderManagedBlock: renderGenericMarkdownBlock
};

export interface ScopeRecordGroup {
  readonly scope: string;
  readonly heading: string;
  readonly records: readonly MemoryRecord[];
}

export const LOCAL_FILE_EXPORT_ADAPTERS: readonly LocalFileExportAdapter[] = [
  agentsMarkdownAdapter,
  claudeMarkdownAdapter,
  genericMarkdownAdapter
];

const PREFERRED_SCOPE_ORDER = new Map<string, number>([
  ["repo", 0],
  ["project", 1],
  ["user", 2]
]);

interface MutableScopeRecordGroup {
  scope: string;
  heading: string;
  records: MemoryRecord[];
  firstIndex: number;
}

export function groupRecordsByScope(records: readonly MemoryRecord[]): ScopeRecordGroup[] {
  const groups = new Map<string, MutableScopeRecordGroup>();

  records.forEach((record, index) => {
    const heading = scopeHeadingLabel(record.scope);
    let group = groups.get(heading);

    if (!group) {
      group = {
        scope: heading,
        heading,
        records: [],
        firstIndex: index
      };
      groups.set(heading, group);
    }

    group.records.push(record);
  });

  return Array.from(groups.values())
    .sort(compareScopeRecordGroups)
    .map(({ scope, heading, records }) => {
      return { scope, heading, records };
    });
}

export function normalizeLocalFileDestination(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    throw new Error("Destination path is required.");
  }

  if (value.includes("\0")) {
    throw new Error("Invalid export destination: null bytes are not allowed.");
  }

  const destination = value.trim();

  if (!destination) {
    throw new Error("Destination path is required.");
  }

  if (destination.includes("\\")) {
    throw new Error("Invalid export destination: use repository-relative paths with forward slashes.");
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination)) {
    throw new Error("Invalid export destination: URL-like schemes are not supported.");
  }

  if (isAbsolute(destination)) {
    throw new Error("Invalid export destination: absolute paths are not supported.");
  }

  const segments = destination.split("/");

  if (segments.some((segment) => segment === "..")) {
    throw new Error("Invalid export destination: traversal segments are not allowed.");
  }

  if (segments.some((segment) => segment === "." || segment === "")) {
    throw new Error("Invalid export destination: path segments must be explicit names.");
  }

  return destination;
}

export function selectExportAdapter(destination: string): LocalFileExportAdapter {
  const normalizedDestination = normalizeLocalFileDestination(destination);
  const adapter = LOCAL_FILE_EXPORT_ADAPTERS.find((candidate) => {
    return candidate.isCompatible(normalizedDestination);
  });

  if (!adapter) {
    throw new Error("No local file export adapter supports this destination.");
  }

  return adapter;
}

export function selectLocalFileExportAdapter(destination: string): LocalFileExportAdapter {
  return selectExportAdapter(destination);
}

export function renderGenericMarkdownBlock(
  records: readonly MemoryRecord[]
): string {
  const lines = [
    MEMPR_MANAGED_BLOCK_START,
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
    lines.push(`  - source_trust: ${record.source_trust}`);
    lines.push(`  - id: ${record.id}`);
  }

  lines.push("", MEMPR_MANAGED_BLOCK_END, "");
  return lines.join("\n");
}

export function renderGenericMarkdownManagedBlock(
  records: readonly MemoryRecord[]
): string {
  return renderGenericMarkdownBlock(records);
}

export function renderAgentsMarkdownBlock(records: readonly MemoryRecord[]): string {
  const lines = [
    MEMPR_MANAGED_BLOCK_START,
    "## MemPR Coding Agent Memories",
    "",
    "Accepted memories for coding agents. Use them as repository context and keep the provenance attached to each item.",
    ""
  ];

  if (records.length === 0) {
    lines.push("_No accepted MemPR memories for coding agents yet._");
  } else {
    pushScopeGroupedRecordLines(lines, records);
  }

  lines.push("", MEMPR_MANAGED_BLOCK_END, "");
  return lines.join("\n");
}

export function renderClaudeMarkdownBlock(records: readonly MemoryRecord[]): string {
  const lines = [
    MEMPR_MANAGED_BLOCK_START,
    "## MemPR Claude Project Context",
    "",
    "Accepted project context for Claude. Keep it concise, specific, and traceable.",
    ""
  ];

  if (records.length === 0) {
    lines.push("_No accepted MemPR memories for Claude yet._");
  } else {
    pushScopeGroupedRecordLines(lines, records);
  }

  lines.push("", MEMPR_MANAGED_BLOCK_END, "");
  return lines.join("\n");
}

function pushScopeGroupedRecordLines(lines: string[], records: readonly MemoryRecord[]): void {
  let firstGroup = true;

  for (const group of groupRecordsByScope(records)) {
    if (!firstGroup) {
      lines.push("");
    }

    lines.push(`### ${group.heading}`);
    lines.push("");

    for (const record of group.records) {
      pushRecordLines(lines, record);
    }

    firstGroup = false;
  }
}

function pushRecordLines(lines: string[], record: MemoryRecord): void {
  lines.push(`- ${record.memory}`);
  lines.push(`  - scope: ${scopeHeadingLabel(record.scope)}`);
  lines.push(`  - source: ${record.source.uri}`);
  lines.push(`  - source_trust: ${record.source_trust}`);
  lines.push(`  - id: ${record.id}`);
}

function compareScopeRecordGroups(
  left: MutableScopeRecordGroup,
  right: MutableScopeRecordGroup
): number {
  const leftPriority = PREFERRED_SCOPE_ORDER.get(left.heading);
  const rightPriority = PREFERRED_SCOPE_ORDER.get(right.heading);

  if (leftPriority !== undefined || rightPriority !== undefined) {
    if (leftPriority === undefined) {
      return 1;
    }

    if (rightPriority === undefined) {
      return -1;
    }

    return leftPriority - rightPriority;
  }

  const headingComparison = compareDisplayLabels(left.heading, right.heading);

  if (headingComparison !== 0) {
    return headingComparison;
  }

  return left.firstIndex - right.firstIndex;
}

function compareDisplayLabels(left: string, right: string): number {
  const foldedLeft = left.toLowerCase();
  const foldedRight = right.toLowerCase();

  if (foldedLeft < foldedRight) {
    return -1;
  }

  if (foldedLeft > foldedRight) {
    return 1;
  }

  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function scopeHeadingLabel(scope: string): string {
  const heading = scope.replace(/\s+/g, " ").trim();
  return heading || "unspecified";
}

export function replaceManagedBlock(existing: string, block: string): string {
  const startIndex = existing.indexOf(MEMPR_MANAGED_BLOCK_START);
  const endIndex = existing.indexOf(MEMPR_MANAGED_BLOCK_END);

  if (startIndex >= 0 && endIndex > startIndex) {
    const before = existing.slice(0, startIndex).trimEnd();
    const after = existing.slice(endIndex + MEMPR_MANAGED_BLOCK_END.length).trim();
    return [before, block.trimEnd(), after].filter(Boolean).join("\n\n") + "\n";
  }

  return [existing.trimEnd(), block.trimEnd()].filter(Boolean).join("\n\n") + "\n";
}
