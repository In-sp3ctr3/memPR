import { MemoryProposalBlockedError } from "./errors.js";
import {
  MEMPR_MANAGED_BLOCK_END,
  MEMPR_MANAGED_BLOCK_START
} from "./export-adapters.js";
import {
  normalizeProposalInput,
  normalizeSourceType,
  reviewLinkedAutoAccept
} from "./ledger-records.js";
import { proposeMemory } from "./ledger.js";
import { loadPolicyConfig } from "./policy-config.js";
import { classifyMemory } from "./policy.js";
import { redactedPreviewForReport } from "./safety.js";
import { safeReadRepoFile } from "./repo-file-reader.js";
import {
  candidatesFromLine,
  changedGitFiles,
  dedupeCandidates,
  isInsideGitRepo,
  limitCandidates,
  lockfileCandidate,
  makeCandidate,
  normalizeMemoryText,
  packageScriptCandidates,
  pythonVersionCandidate,
  resolveSuggestOptions,
  transcriptLines
} from "./suggest-candidate-helpers.js";
import type { ProposeMemoryInput } from "./types.js";
import { verifyMemorySource } from "./provenance.js";
import type {
  MemoryDiffPreview,
  SuggestionCandidate,
  SuggestionProposalBlocked,
  SuggestionProposalReport,
  SuggestionProposalSuccess,
  SuggestOptions
} from "./suggest-types.js";

export { isMemorySourceType } from "./suggest-candidate-helpers.js";
export type {
  MemoryDiffPreview,
  SuggestionCandidate,
  SuggestionProposalBlocked,
  SuggestionProposalReport,
  SuggestionProposalSuccess,
  SuggestionSourceKind,
  SuggestOptions
} from "./suggest-types.js";

export async function suggestFromTranscript(
  path: string,
  options: SuggestOptions = {}
): Promise<SuggestionCandidate[]> {
  const resolved = resolveSuggestOptions(options);
  const source = await readSuggestionFile(resolved.root, path, "Transcript path");
  const content = source.content;
  const lines = transcriptLines(content);
  const candidates = lines.flatMap((line) => {
    return candidatesFromLine(line, {
      sourceKind: "transcript",
      source: source.path,
      sourceType: "file",
      quote: line,
      reason: "Matched transcript memory cue.",
      defaultConfidence: 0.7
    }, resolved);
  });

  return limitCandidates(dedupeCandidates(candidates), resolved.limit);
}

export async function suggestFromGitDiff(
  range: string | undefined,
  options: SuggestOptions = {}
): Promise<SuggestionCandidate[]> {
  const resolved = resolveSuggestOptions(options);

  if (!await isInsideGitRepo(resolved.root)) {
    return [];
  }

  const changedFiles = await changedGitFiles(resolved.root, range);
  const changed = new Set(changedFiles);
  const candidates: SuggestionCandidate[] = [];

  for (const lockfile of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"] as const) {
    if (changed.has(lockfile) && await isSafeGitDiffSource(resolved.root, lockfile, "Git diff source")) {
      candidates.push(lockfileCandidate(lockfile, resolved));
    }
  }

  if (changed.has("package.json") && await isSafeGitDiffSource(
    resolved.root,
    "package.json",
    "package.json",
    256 * 1024
  )) {
    candidates.push(...await packageScriptCandidates(resolved.root, range, resolved));
  }

  if (changed.has(".python-version") && await isSafeGitDiffSource(
    resolved.root,
    ".python-version",
    ".python-version",
    4096
  )) {
    candidates.push(await pythonVersionCandidate(resolved.root, resolved));
  }

  if (changed.has("go.mod") && await isSafeGitDiffSource(resolved.root, "go.mod", "go.mod")) {
    candidates.push(makeCandidate("This repo uses Go modules.", {
      sourceKind: "git_diff",
      source: "go.mod",
      sourceType: "file",
      reason: "Detected go.mod in git diff.",
      defaultConfidence: 0.8
    }, resolved));
  }

  return limitCandidates(dedupeCandidates(candidates), resolved.limit);
}

async function isSafeGitDiffSource(
  root: string,
  path: string,
  label: string,
  maxBytes = 1024 * 1024
): Promise<boolean> {
  try {
    await safeReadRepoFile(root, path, {
      label,
      maxBytes
    });
    return true;
  } catch {
    return false;
  }
}

export async function suggestFromExistingMemoryFile(
  path: string,
  options: SuggestOptions = {}
): Promise<SuggestionCandidate[]> {
  const resolved = resolveSuggestOptions(options);
  const source = await readSuggestionFile(resolved.root, path, "Existing memory file path");
  const content = source.content;
  const candidates: SuggestionCandidate[] = [];
  let inManagedBlock = false;

  for (const line of content.split(/\r?\n/)) {
    if (line.includes(MEMPR_MANAGED_BLOCK_START)) {
      inManagedBlock = true;
      continue;
    }

    if (line.includes(MEMPR_MANAGED_BLOCK_END)) {
      inManagedBlock = false;
      continue;
    }

    if (inManagedBlock) {
      continue;
    }

    const match = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/);
    const memory = match ? normalizeMemoryText(match[1]) : undefined;

    if (!memory) {
      continue;
    }

    candidates.push(makeCandidate(memory, {
      sourceKind: "existing_memory_file",
      source: source.path,
      sourceType: "file",
      quote: line,
      reason: "Imported bullet memory from existing memory file.",
      defaultConfidence: 0.55
    }, resolved));
  }

  return limitCandidates(dedupeCandidates(candidates), resolved.limit);
}

async function readSuggestionFile(
  root: string,
  path: string,
  label: string
): Promise<{ path: string; content: string }> {
  const file = await safeReadRepoFile(root, path, {
    label,
    maxBytes: 1024 * 1024
  });

  return {
    path: file.path,
    content: file.content
  };
}

export async function suggestFromObservation(
  observation: string,
  options: SuggestOptions = {}
): Promise<SuggestionCandidate[]> {
  const resolved = resolveSuggestOptions(options);
  const candidates = candidatesFromLine(observation, {
    sourceKind: "observation",
    source: "observation",
    sourceType: "conversation",
    quote: observation,
    reason: "Matched observation memory cue.",
    defaultConfidence: 0.7
  }, resolved);

  return limitCandidates(dedupeCandidates(candidates), resolved.limit);
}

export async function proposeSuggestionCandidates(
  candidates: readonly SuggestionCandidate[],
  root = process.cwd()
): Promise<SuggestionProposalReport> {
  const records: SuggestionProposalSuccess[] = [];
  const blocked: SuggestionProposalBlocked[] = [];

  for (const [index, candidate] of candidates.entries()) {
    try {
      const record = await proposeMemory(candidateToProposalInput(candidate), root);
      records.push({ index, record });
    } catch (error) {
      if (error instanceof MemoryProposalBlockedError) {
        blocked.push({
          index,
          error: {
            code: "MEMPR_PROPOSAL_BLOCKED",
            message: error.message
          },
          audit: error.audit
        });
        continue;
      }

      throw error;
    }
  }

  return { records, blocked };
}

export async function previewMemoryDiff(
  input: ProposeMemoryInput,
  root = process.cwd()
): Promise<MemoryDiffPreview> {
  const normalized = normalizeProposalInput(input);
  const policyConfig = await loadPolicyConfig(root);
  normalized.sourceVerification = await verifyMemorySource({
    root,
    sourceType: normalizeSourceType(normalized.sourceType, normalized.source),
    sourceUri: normalized.source,
    quote: normalized.quote,
    sourceLineStart: normalized.sourceLineStart,
    sourceLineEnd: normalized.sourceLineEnd,
    sourceHash: normalized.sourceHash,
    gitCommit: normalized.gitCommit,
    verifySource: normalized.verifySource
  });
  const policy = reviewLinkedAutoAccept(classifyMemory(normalized, policyConfig), normalized);

  return {
    candidate: {
      memory: normalized.memory,
      source: normalized.source,
      sourceType: normalized.sourceType,
      sourceTrust: normalized.sourceTrust,
      quote: normalized.quote,
      scope: normalized.scope,
      kind: normalized.kind,
      tags: normalized.tags,
      confidence: normalized.confidence ?? undefined,
      risk: normalized.risk,
      destination: normalized.destination,
      ttl: normalized.ttl,
      supersedes: normalized.supersedes,
      conflictsWith: normalized.conflictsWith
    },
    policy,
    sourceVerification: normalized.sourceVerification,
    destination: normalized.destination,
    wouldWrite: false
  };
}

export function candidateToProposalInput(candidate: SuggestionCandidate): ProposeMemoryInput {
  return {
    memory: candidate.memory,
    source: candidate.source,
    sourceType: candidate.sourceType,
    sourceTrust: candidate.sourceTrust,
    quote: candidate.quote,
    scope: candidate.scope,
    kind: candidate.kind,
    tags: candidate.tags,
    confidence: candidate.confidence ?? undefined,
    risk: candidate.risk,
    destination: candidate.destination
  };
}

export function safeCandidatePreview(candidate: SuggestionCandidate): Record<string, unknown> {
  return {
    memory_preview: redactedPreviewForReport(candidate.memory),
    kind: candidate.kind,
    source: redactedPreviewForReport(candidate.source),
    sourceType: candidate.sourceType,
    sourceTrust: candidate.sourceTrust,
    scope: redactedPreviewForReport(candidate.scope),
    destination: redactedPreviewForReport(candidate.destination),
    tags: candidate.tags.map((tag) => redactedPreviewForReport(tag)),
    confidence: candidate.confidence,
    reason: redactedPreviewForReport(candidate.reason)
  };
}
