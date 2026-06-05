import { basename, isAbsolute } from "node:path";
import { reportableRecordId } from "./safety.js";
import type { MemoryRecord } from "./types.js";

export const MEMPR_MANAGED_BLOCK_START = "<!-- mempr:start -->";
export const MEMPR_MANAGED_BLOCK_END = "<!-- mempr:end -->";
const RESERVED_DESTINATION_SEGMENTS = new Set([
  ".mempr",
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage"
]);
const RESERVED_TOP_LEVEL_DESTINATION_SEGMENTS = new Set([
  "src",
  "test"
]);
const RESERVED_ROOT_DESTINATIONS = new Set([
  ".gitignore",
  "package.json",
  "package-lock.json",
  "tsconfig.json"
]);
const MARKDOWN_DESTINATION_PATTERN = /\.(?:md|markdown)$/i;
const WINDOWS_HOSTILE_FILENAME_CHARS = /[<>:"|?*]/;
const WINDOWS_RESERVED_BASENAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_DESTINATION_LENGTH = 240;
const MAX_DESTINATION_SEGMENT_LENGTH = 120;

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

  if (/[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error("Invalid export destination: control characters are not allowed.");
  }

  const destination = value.trim();

  if (!destination) {
    throw new Error("Destination path is required.");
  }

  if (destination.length > MAX_DESTINATION_LENGTH) {
    throw new Error("Invalid export destination: path is too long.");
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

  if (RESERVED_ROOT_DESTINATIONS.has(destination)) {
    throw new Error("Invalid export destination: reserved repository files are not supported.");
  }

  if (segments.some((segment) => segment === "..")) {
    throw new Error("Invalid export destination: traversal segments are not allowed.");
  }

  if (segments.some((segment) => segment === "." || segment === "")) {
    throw new Error("Invalid export destination: path segments must be explicit names.");
  }

  if (segments.some((segment) => segment.length > MAX_DESTINATION_SEGMENT_LENGTH)) {
    throw new Error("Invalid export destination: path segment is too long.");
  }

  if (segments.some((segment) => WINDOWS_HOSTILE_FILENAME_CHARS.test(segment))) {
    throw new Error("Invalid export destination: filename contains unsupported characters.");
  }

  if (segments.some((segment) => WINDOWS_RESERVED_BASENAMES.test(stripMarkdownExtension(segment)))) {
    throw new Error("Invalid export destination: filename uses a reserved Windows basename.");
  }

  const firstSegment = segments[0];

  if (
    firstSegment.startsWith(".")
    || RESERVED_DESTINATION_SEGMENTS.has(firstSegment)
    || segments.some((segment) => RESERVED_DESTINATION_SEGMENTS.has(segment))
  ) {
    throw new Error("Invalid export destination: reserved repository paths are not supported.");
  }

  if (RESERVED_TOP_LEVEL_DESTINATION_SEGMENTS.has(firstSegment)) {
    throw new Error("Invalid export destination: source and test directories are not export targets.");
  }

  if (segments.length > 1 && firstSegment !== "docs") {
    throw new Error("Invalid export destination: nested exports are limited to docs/.");
  }

  if (!MARKDOWN_DESTINATION_PATTERN.test(destination)) {
    throw new Error("Invalid export destination: only Markdown files are supported.");
  }

  return destination;
}

function stripMarkdownExtension(segment: string): string {
  return segment.replace(/\.(?:md|markdown)$/i, "");
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

export function markdownJsonScalar(value: string): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
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
    pushRecordLines(lines, record);
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

    lines.push(`### ${markdownJsonScalar(group.heading)}`);
    lines.push("");

    for (const record of group.records) {
      pushRecordLines(lines, record);
    }

    firstGroup = false;
  }
}

function pushRecordLines(lines: string[], record: MemoryRecord): void {
  lines.push(`- memory: ${markdownJsonScalar(record.memory)}`);
  lines.push(`  - scope: ${markdownJsonScalar(scopeHeadingLabel(record.scope))}`);
  lines.push(`  - source: ${markdownJsonScalar(record.source.uri)}`);
  lines.push(`  - source_trust: ${markdownJsonScalar(record.source_trust)}`);
  lines.push(`  - source_verified: ${markdownJsonScalar(record.source.verification?.status ?? "unverified")}`);
  lines.push(`  - source_verification_method: ${markdownJsonScalar(record.source.verification?.method ?? "none")}`);

  if (
    record.source.verification?.start_line !== undefined
    && record.source.verification.end_line !== undefined
  ) {
    lines.push(
      `  - source_lines: ${markdownJsonScalar(`${record.source.verification.start_line}-${record.source.verification.end_line}`)}`
    );
  }

  if (record.kind && record.kind !== "fact") {
    lines.push(`  - kind: ${markdownJsonScalar(record.kind)}`);
  }

  if (record.tags?.length > 0) {
    lines.push(`  - tags: ${markdownJsonArray(record.tags)}`);
  }

  if (record.confidence !== null && record.confidence !== undefined) {
    lines.push(`  - confidence: ${markdownJsonScalar(String(record.confidence))}`);
  }

  if (record.priority !== null && record.priority !== undefined) {
    lines.push(`  - priority: ${markdownJsonScalar(String(record.priority))}`);
  }

  if (record.applies_to_paths?.length > 0) {
    lines.push(`  - applies_to_paths: ${markdownJsonArray(record.applies_to_paths)}`);
  }

  lines.push(`  - id: ${markdownJsonScalar(reportableRecordId(record.id))}`);
}

function markdownJsonArray(values: readonly string[]): string {
  return `[${values.map(markdownJsonScalar).join(", ")}]`;
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
  const startIndexes = markerIndexes(existing, MEMPR_MANAGED_BLOCK_START);
  const endIndexes = markerIndexes(existing, MEMPR_MANAGED_BLOCK_END);

  if (startIndexes.length === 0 && endIndexes.length === 0) {
    return [existing.trimEnd(), block.trimEnd()].filter(Boolean).join("\n\n") + "\n";
  }

  if (startIndexes.length === 1 && endIndexes.length === 1 && endIndexes[0] > startIndexes[0]) {
    const startIndex = startIndexes[0];
    const endIndex = endIndexes[0];
    const before = existing.slice(0, startIndex).trimEnd();
    const after = existing.slice(endIndex + MEMPR_MANAGED_BLOCK_END.length).trim();
    return [before, block.trimEnd(), after].filter(Boolean).join("\n\n") + "\n";
  }

  throw new Error(
    "Cannot update MemPR managed block: ambiguous or malformed managed block markers found."
  );
}

function markerIndexes(value: string, marker: string): number[] {
  const indexes: number[] = [];
  let index = value.indexOf(marker);

  while (index !== -1) {
    indexes.push(index);
    index = value.indexOf(marker, index + marker.length);
  }

  return indexes;
}
