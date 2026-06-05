import {
  numberFlag,
  rootFlag,
  sourceTrustFlag,
  stringFlag
} from "./cli-args.js";
import type { ParsedArgs } from "./cli-args.js";
import { printJsonOrText } from "./cli-output.js";
import {
  proposeSuggestionCandidates,
  safeCandidatePreview,
  suggestFromExistingMemoryFile,
  suggestFromGitDiff,
  suggestFromObservation,
  suggestFromTranscript
} from "./suggest.js";
import type {
  SuggestionCandidate,
  SuggestionProposalReport
} from "./suggest.js";

type SuggestSource =
  | { kind: "transcript"; path: string }
  | { kind: "git_diff"; range: string | undefined }
  | { kind: "existing_memory_file"; path: string }
  | { kind: "observation"; observation: string };

interface SuggestCommandResult {
  suggestionCount: number;
  suggestions: Array<Record<string, unknown>>;
  proposed: boolean;
  proposalReport?: SuggestionProposalReport;
}

export async function handleSuggest(parsed: ParsedArgs): Promise<void> {
  const limit = numberFlag(parsed, "limit") ?? 20;

  if (limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }

  const source = suggestSource(parsed);
  const root = rootFlag(parsed);
  const options = {
    root,
    destination: stringFlag(parsed, "destination"),
    sourceTrust: sourceTrustFlag(parsed),
    scope: stringFlag(parsed, "scope"),
    limit
  };
  const suggestions = await loadSuggestions(source, options);
  const propose = proposalRequested(parsed);
  let result: SuggestCommandResult;

  if (propose) {
    requireProposalConfirmation(parsed);
    const proposalReport = await proposeSuggestionCandidates(suggestions, root);

    result = {
      suggestionCount: suggestions.length,
      suggestions: suggestions.map(safeCandidatePreview),
      proposed: true,
      proposalReport
    };
  } else {
    rejectUnexpectedConfirm(parsed);
    result = {
      suggestionCount: suggestions.length,
      suggestions: suggestions.map(safeCandidatePreview),
      proposed: false
    };
  }

  printJsonOrText(parsed, result, renderSuggestResult(result));
}

function suggestSource(parsed: ParsedArgs): SuggestSource {
  const sources: SuggestSource[] = [];
  const transcript = stringFlag(parsed, "from-transcript");
  const memoryFile = stringFlag(parsed, "from-memory-file");
  const observation = stringFlag(parsed, "observation");

  if (Object.hasOwn(parsed.flags, "from-transcript")) {
    if (!transcript) {
      throw new Error("--from-transcript requires a path.");
    }

    sources.push({ kind: "transcript", path: transcript });
  }

  if (Object.hasOwn(parsed.flags, "from-git-diff")) {
    const value = parsed.flags["from-git-diff"];

    if (value !== true && typeof value !== "string") {
      throw new Error("--from-git-diff takes an optional range.");
    }

    sources.push({
      kind: "git_diff",
      range: typeof value === "string" ? value : undefined
    });
  }

  if (Object.hasOwn(parsed.flags, "from-memory-file")) {
    if (!memoryFile) {
      throw new Error("--from-memory-file requires a path.");
    }

    sources.push({ kind: "existing_memory_file", path: memoryFile });
  }

  if (Object.hasOwn(parsed.flags, "observation")) {
    if (!observation) {
      throw new Error("--observation requires text.");
    }

    sources.push({ kind: "observation", observation });
  }

  if (sources.length !== 1) {
    throw new Error(
      "Suggest requires exactly one source: --from-transcript, --from-git-diff, --from-memory-file, or --observation."
    );
  }

  return sources[0];
}

async function loadSuggestions(
  source: SuggestSource,
  options: {
    root?: string;
    destination?: string;
    sourceTrust?: "trusted" | "unknown" | "untrusted";
    scope?: string;
    limit: number;
  }
): Promise<SuggestionCandidate[]> {
  if (source.kind === "transcript") {
    return suggestFromTranscript(source.path, options);
  }

  if (source.kind === "git_diff") {
    return suggestFromGitDiff(source.range, options);
  }

  if (source.kind === "existing_memory_file") {
    return suggestFromExistingMemoryFile(source.path, options);
  }

  return suggestFromObservation(source.observation, options);
}

function proposalRequested(parsed: ParsedArgs): boolean {
  if (!Object.hasOwn(parsed.flags, "propose")) {
    return false;
  }

  if (parsed.flags.propose !== true) {
    throw new Error("--propose does not take a value.");
  }

  return true;
}

function requireProposalConfirmation(parsed: ParsedArgs): void {
  if (parsed.flags.confirm !== true) {
    throw new Error("--propose requires --confirm.");
  }
}

function rejectUnexpectedConfirm(parsed: ParsedArgs): void {
  if (Object.hasOwn(parsed.flags, "confirm") && parsed.flags.confirm !== true) {
    throw new Error("--confirm does not take a value.");
  }
}

function renderSuggestResult(result: SuggestCommandResult): string {
  const lines = [`Found ${result.suggestionCount} suggestion(s).`];
  const suggestions = result.suggestions;

  for (const [index, suggestion] of suggestions.entries()) {
    lines.push("", renderSuggestion(index + 1, suggestion as Record<string, unknown>));
  }

  if (result.proposalReport) {
    lines.push(
      "",
      `Proposed ${result.proposalReport.records.length} memory record(s).`,
      `Blocked ${result.proposalReport.blocked.length} suggestion(s).`
    );

    for (const success of result.proposalReport.records) {
      lines.push(`- proposed ${success.record.id}`);
    }

    for (const blocked of result.proposalReport.blocked) {
      lines.push(`- blocked suggestion ${blocked.index + 1}: ${blocked.error.message}`);
    }
  }

  return lines.join("\n");
}

function renderSuggestion(index: number, suggestion: Record<string, unknown>): string {
  const memory = suggestion.memory_preview;

  return [
    `${index}. ${String(memory ?? "")}`,
    `   kind: ${String(suggestion.kind ?? "unknown")}`,
    `   source: ${String(suggestion.source ?? "unknown")}`,
    `   trust: ${String(suggestion.sourceTrust ?? "unknown")}`,
    `   destination: ${String(suggestion.destination ?? "MEMORY.md")}`,
    `   reason: ${String(suggestion.reason ?? "n/a")}`
  ].join("\n");
}
