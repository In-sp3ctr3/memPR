import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { normalizeLocalFileDestination } from "./export-adapters.js";
import { safeReadRepoFile } from "./repo-file-reader.js";
import { normalizeOptionalText } from "./text-normalization.js";
import {
  MEMORY_SOURCE_TRUST,
  MEMORY_SOURCE_TYPES
} from "./types.js";
import type {
  MemoryKind,
  MemorySourceTrust,
  MemorySourceType
} from "./types.js";
import type {
  CandidateContext,
  ResolvedSuggestOptions,
  SuggestionCandidate,
  SuggestOptions
} from "./suggest-types.js";

const DEFAULT_LIMIT = 20;
const GIT_COMMAND_TIMEOUT_MS = 5_000;

export function candidatesFromLine(
  line: string,
  context: CandidateContext,
  options: ResolvedSuggestOptions
): SuggestionCandidate[] {
  const normalizedLine = stripSpeakerPrefix(line);
  const candidates: SuggestionCandidate[] = [];

  for (const extractor of lineExtractors()) {
    const match = normalizedLine.match(extractor.pattern);

    if (!match) {
      continue;
    }

    const memory = normalizeMemoryText(extractor.memory(match));

    if (!memory) {
      continue;
    }

    candidates.push(makeCandidate(memory, {
      ...context,
      reason: extractor.reason
    }, options));
  }

  return candidates;
}

export function makeCandidate(
  memory: string,
  context: CandidateContext,
  options: ResolvedSuggestOptions
): SuggestionCandidate {
  return {
    memory,
    kind: inferKind(memory),
    source: context.source,
    sourceType: context.sourceType,
    sourceTrust: options.sourceTrust,
    quote: context.quote,
    scope: options.scope,
    destination: options.destination,
    tags: ["suggested", context.sourceKind],
    confidence: context.defaultConfidence,
    reason: context.reason
  };
}

export function transcriptLines(content: string): string[] {
  const parsed = parseJson(content);

  if (parsed !== undefined) {
    return flattenJsonStrings(parsed);
  }

  return content.split(/\r?\n/);
}

export function lockfileCandidate(
  lockfile: "package-lock.json" | "pnpm-lock.yaml" | "yarn.lock",
  options: ResolvedSuggestOptions
): SuggestionCandidate {
  const packageManagers = {
    "package-lock.json": "npm",
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "Yarn"
  };

  return makeCandidate(
    `This repo uses ${packageManagers[lockfile]} for package management.`,
    {
      sourceKind: "git_diff",
      source: lockfile,
      sourceType: "file",
      reason: `Detected ${lockfile} in git diff.`,
      defaultConfidence: 0.85
    },
    options
  );
}

export async function packageScriptCandidates(
  root: string,
  range: string | undefined,
  options: ResolvedSuggestOptions
): Promise<SuggestionCandidate[]> {
  const scripts = new Set<string>();
  let packageJsonContent: string;

  try {
    packageJsonContent = (await safeReadRepoFile(root, "package.json", {
      label: "package.json",
      maxBytes: 256 * 1024
    })).content;
  } catch {
    return [];
  }

  const diff = await gitDiffForPath(root, range, "package.json");

  for (const line of diff.split(/\r?\n/)) {
    const match = line.match(/^\+\s*"([^"]+)"\s*:/);

    if (match && (match[1] === "test" || match[1] === "build")) {
      scripts.add(match[1]);
    }
  }

  try {
    const parsed = JSON.parse(packageJsonContent);

    if (typeof parsed === "object" && parsed !== null && "scripts" in parsed) {
      const scriptBlock = (parsed as { scripts?: unknown }).scripts;

      if (typeof scriptBlock === "object" && scriptBlock !== null) {
        for (const script of ["test", "build"]) {
          if (typeof (scriptBlock as Record<string, unknown>)[script] === "string") {
            scripts.add(script);
          }
        }
      }
    }
  } catch {
    // Diff parsing still provides deterministic suggestions when package.json is malformed.
  }

  return [...scripts].sort().map((script) => {
    return makeCandidate(`This repo defines npm script "${script}".`, {
      sourceKind: "git_diff",
      source: "package.json",
      sourceType: "file",
      reason: `Detected package.json script "${script}" in git diff.`,
      defaultConfidence: 0.8
    }, options);
  });
}

export async function pythonVersionCandidate(
  root: string,
  options: ResolvedSuggestOptions
): Promise<SuggestionCandidate> {
  let version = "";

  try {
    version = (await safeReadRepoFile(root, ".python-version", {
      label: ".python-version",
      maxBytes: 4096
    })).content.trim();
  } catch {
    version = "";
  }

  const memory = version
    ? `This repo uses Python ${version}.`
    : "This repo declares a Python version in .python-version.";

  return makeCandidate(memory, {
    sourceKind: "git_diff",
    source: ".python-version",
    sourceType: "file",
    reason: "Detected .python-version in git diff.",
    defaultConfidence: 0.8
  }, options);
}

export async function isInsideGitRepo(root: string): Promise<boolean> {
  const result = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  return result.ok && result.stdout.trim() === "true";
}

export async function changedGitFiles(root: string, range: string | undefined): Promise<string[]> {
  const files = new Set<string>();
  const commands = range
    ? [["diff", "--name-only", "--diff-filter=AM", range]]
    : [
      ["diff", "--name-only", "--diff-filter=AM"],
      ["diff", "--cached", "--name-only", "--diff-filter=AM"],
      ["ls-files", "--others", "--exclude-standard"]
    ];

  for (const args of commands) {
    const result = await runGit(root, args);

    if (!result.ok) {
      continue;
    }

    for (const file of result.stdout.split(/\r?\n/)) {
      const normalized = file.trim();

      if (normalized) {
        files.add(normalized);
      }
    }
  }

  return [...files].sort();
}

export function resolveSuggestOptions(options: SuggestOptions): ResolvedSuggestOptions {
  const limit = options.limit ?? DEFAULT_LIMIT;

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Suggestion limit must be a positive integer.");
  }

  const sourceTrust = options.sourceTrust ?? "unknown";

  if (!isMemorySourceTrust(sourceTrust)) {
    throw new Error("Suggestion source trust must be trusted, unknown, or untrusted.");
  }

  const scope = normalizeOptionalText(options.scope) ?? "repo";
  const destination = normalizeLocalFileDestination(options.destination ?? "MEMORY.md");

  return {
    root: resolve(options.root ?? process.cwd()),
    destination,
    sourceTrust,
    scope,
    limit
  };
}

export function dedupeCandidates(candidates: readonly SuggestionCandidate[]): SuggestionCandidate[] {
  const seen = new Set<string>();
  const unique: SuggestionCandidate[] = [];

  for (const candidate of candidates) {
    const key = [
      candidate.memory.toLowerCase(),
      candidate.source,
      candidate.destination
    ].join("\0");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}

export function limitCandidates(
  candidates: readonly SuggestionCandidate[],
  limit: number
): SuggestionCandidate[] {
  return candidates.slice(0, limit);
}

export function isMemorySourceType(value: unknown): value is MemorySourceType {
  return typeof value === "string" && MEMORY_SOURCE_TYPES.includes(value as MemorySourceType);
}

function lineExtractors(): Array<{
  pattern: RegExp;
  memory(match: RegExpMatchArray): string;
  reason: string;
}> {
  return [
    {
      pattern: /\bremember that\s+(.+)$/i,
      memory: (match) => match[1],
      reason: "Matched \"remember that\" memory cue."
    },
    {
      pattern: /\bnote that\s+(.+)$/i,
      memory: (match) => match[1],
      reason: "Matched \"note that\" memory cue."
    },
    {
      pattern: /\bfor this repo,\s*(.+)$/i,
      memory: (match) => match[1],
      reason: "Matched repo-scoped memory cue."
    },
    {
      pattern: /\b(this repo uses\s+.+)$/i,
      memory: (match) => match[1],
      reason: "Matched repo tooling fact."
    },
    {
      pattern: /\b(we use\s+.+)$/i,
      memory: (match) => match[1],
      reason: "Matched team usage fact."
    },
    {
      pattern: /\b(do not use\s+.+)$/i,
      memory: (match) => match[1],
      reason: "Matched durable negative instruction."
    },
    {
      pattern: /\b(always run\s+.+)$/i,
      memory: (match) => match[1],
      reason: "Matched durable procedure instruction."
    },
    {
      pattern: /\b(tests are run with\s+.+)$/i,
      memory: (match) => match[1],
      reason: "Matched test command fact."
    },
    {
      pattern: /\bpackage manager is\s+(.+)$/i,
      memory: (match) => `This repo uses ${match[1]} for package management`,
      reason: "Matched package-manager fact."
    }
  ];
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function flattenJsonStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonStrings);
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(flattenJsonStrings);
  }

  return [];
}

function stripSpeakerPrefix(line: string): string {
  return line
    .replace(/^\s*(?:user|assistant|system|developer|agent|human)\s*:\s*/i, "")
    .trim();
}

export function normalizeMemoryText(value: string): string {
  const trimmed = stripOuterQuotes(value)
    .replace(/\s+/g, " ")
    .trim();

  if (!trimmed) {
    return "";
  }

  const cased = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(cased) ? cased : `${cased}.`;
}

function stripOuterQuotes(value: string): string {
  return value.trim().replace(/^["'`]+|["'`]+$/g, "");
}

function inferKind(memory: string): MemoryKind {
  if (/^(always|never|do not|don't|must|run)\b/i.test(memory)) {
    return "instruction";
  }

  if (/\btests are run with\b/i.test(memory)) {
    return "procedure";
  }

  return "fact";
}

async function gitDiffForPath(
  root: string,
  range: string | undefined,
  path: string
): Promise<string> {
  const commands = range
    ? [["diff", range, "--", path]]
    : [
      ["diff", "--", path],
      ["diff", "--cached", "--", path]
    ];
  const chunks: string[] = [];

  for (const args of commands) {
    const result = await runGit(root, args);

    if (result.ok && result.stdout) {
      chunks.push(result.stdout);
    }
  }

  return chunks.join("\n");
}

async function runGit(
  cwd: string,
  args: string[]
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const child = spawn("git", args, {
    cwd,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const close = once(child, "close") as Promise<[number | null]>;
  let closed = await Promise.race([
    close.then((result) => ({ closed: true as const, result })),
    delay(GIT_COMMAND_TIMEOUT_MS).then(() => ({ closed: false as const }))
  ]);

  if (!closed.closed) {
    child.kill("SIGTERM");
    closed = await Promise.race([
      close.then((result) => ({ closed: true as const, result })),
      delay(500).then(() => ({ closed: false as const }))
    ]);
  }

  if (!closed.closed) {
    child.kill("SIGKILL");
    closed = await Promise.race([
      close.then((result) => ({ closed: true as const, result })),
      delay(500).then(() => ({ closed: false as const }))
    ]);
  }

  if (!closed.closed) {
    return {
      ok: false,
      stdout,
      stderr
    };
  }

  const [code] = closed.result;

  return {
    ok: code === 0,
    stdout,
    stderr
  };
}

function isMemorySourceTrust(value: unknown): value is MemorySourceTrust {
  return typeof value === "string" && MEMORY_SOURCE_TRUST.includes(value as MemorySourceTrust);
}
