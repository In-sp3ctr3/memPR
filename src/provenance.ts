import { sha256Text } from "./redaction.js";
import { normalizeRepoRelativePath } from "./repo-paths.js";
import { safeReadRepoFile } from "./repo-file-reader.js";
import type {
  MemorySourceType,
  MemorySourceVerification,
  SourceVerificationMethod,
  SourceVerificationStatus
} from "./types.js";

export interface VerifySourceInput {
  root: string;
  sourceType: MemorySourceType;
  sourceUri: string;
  quote?: string;
  sourceLineStart?: number;
  sourceLineEnd?: number;
  sourceHash?: string;
  gitCommit?: string;
  verifySource?: boolean;
}

export function legacySourceVerification(): MemorySourceVerification {
  return {
    status: "unverified",
    method: "none",
    checked_at: null,
    reason: "Record was created before source verification metadata existed."
  };
}

export function normalizeMemorySourceVerification(value: unknown): MemorySourceVerification {
  if (!isRecord(value)) {
    return legacySourceVerification();
  }

  const status = typeof value.status === "string" ? value.status : undefined;
  const method = typeof value.method === "string" ? value.method : undefined;
  const checkedAt = value.checked_at === null || typeof value.checked_at === "string"
    ? value.checked_at
    : null;
  const reason = typeof value.reason === "string" && value.reason.trim()
    ? value.reason.trim()
    : legacySourceVerification().reason;

  if (!isVerificationStatus(status) || !isVerificationMethod(method)) {
    return legacySourceVerification();
  }

  const verification: MemorySourceVerification = {
    status,
    method,
    checked_at: checkedAt,
    reason
  };

  if (typeof value.path === "string" && value.path.trim()) {
    verification.path = value.path.trim();
  }

  if (typeof value.start_line === "number" && Number.isInteger(value.start_line) && value.start_line > 0) {
    verification.start_line = value.start_line;
  }

  if (typeof value.end_line === "number" && Number.isInteger(value.end_line) && value.end_line > 0) {
    verification.end_line = value.end_line;
  }

  if (typeof value.content_hash === "string" && value.content_hash.trim()) {
    verification.content_hash = value.content_hash.trim();
  }

  if (typeof value.quote_hash === "string" && value.quote_hash.trim()) {
    verification.quote_hash = value.quote_hash.trim();
  }

  if (typeof value.git_commit === "string" && value.git_commit.trim()) {
    verification.git_commit = value.git_commit.trim();
  }

  return verification;
}

export async function verifyMemorySource(
  input: VerifySourceInput
): Promise<MemorySourceVerification> {
  const checkedAt = new Date().toISOString();
  const sourceHash = normalizeSourceHash(input.sourceHash);
  const gitCommit = normalizeOptionalText(input.gitCommit);

  if (input.sourceType === "manual") {
    return verification({
      status: "not_applicable",
      method: "manual",
      checkedAt,
      reason: "Manual source has no verifiable backing document.",
      gitCommit
    });
  }

  if (input.sourceType === "url") {
    return verification({
      status: "unverified",
      method: sourceHash ? "url_hash" : "none",
      checkedAt,
      reason: "URL sources are not fetched by the local verifier.",
      contentHash: sourceHash,
      gitCommit
    });
  }

  if (input.sourceType === "conversation") {
    const hasReference = Boolean(normalizeOptionalText(input.sourceUri));
    const hasQuote = Boolean(normalizeOptionalText(input.quote));
    return verification({
      status: "unverified",
      method: hasReference && hasQuote ? "conversation_ref" : "none",
      checkedAt,
      reason: "Conversation sources require an external transcript verifier.",
      quoteHash: hasQuote && input.quote ? sha256Text(input.quote) : undefined,
      gitCommit
    });
  }

  if (input.sourceType !== "file") {
    return verification({
      status: "unverified",
      method: "none",
      checkedAt,
      reason: "Source type is not supported by the local verifier.",
      gitCommit
    });
  }

  return verifyFileSource(input, checkedAt, sourceHash, gitCommit);
}

async function verifyFileSource(
  input: VerifySourceInput,
  checkedAt: string,
  sourceHash: string | undefined,
  gitCommit: string | undefined
): Promise<MemorySourceVerification> {
  const pathResult = normalizeFileSourcePath(input.sourceUri);

  if (!pathResult.ok) {
    return verification({
      status: "failed",
      method: "none",
      checkedAt,
      reason: pathResult.reason,
      gitCommit
    });
  }

  const lineRange = normalizeLineRange(input.sourceLineStart, input.sourceLineEnd);
  const hasEvidence = hasSourceEvidence(input, sourceHash, lineRange.ok);

  if (!lineRange.ok) {
    return verification({
      status: "failed",
      method: "none",
      checkedAt,
      reason: lineRange.reason,
      path: pathResult.path,
      gitCommit
    });
  }

  let content: string;

  try {
    content = (await safeReadRepoFile(input.root, pathResult.path, {
      label: "File source path",
      maxBytes: 1024 * 1024
    })).content;
  } catch {
    return verification({
      status: input.verifySource || hasEvidence ? "failed" : "unverified",
      method: "none",
      checkedAt,
      reason: "Source file could not be read.",
      path: pathResult.path,
      startLine: lineRange.startLine,
      endLine: lineRange.endLine,
      gitCommit
    });
  }

  const actualHash = sha256Text(content);
  let excerpt = content;

  if (lineRange.startLine !== undefined && lineRange.endLine !== undefined) {
    excerpt = selectLineRange(content, lineRange.startLine, lineRange.endLine);
  }

  const quote = normalizeOptionalText(input.quote);
  const quoteMatches = quote === undefined
    ? true
    : normalizeQuoteText(excerpt).includes(normalizeQuoteText(quote));
  const hashMatches = sourceHash === undefined ? true : actualHash === sourceHash;

  if (!quote && !sourceHash) {
    return verification({
      status: input.verifySource ? "failed" : "unverified",
      method: "none",
      checkedAt,
      reason: input.verifySource
        ? "No quote or source hash was provided for verification."
        : "No quote or source hash was provided.",
      path: pathResult.path,
      startLine: lineRange.startLine,
      endLine: lineRange.endLine,
      contentHash: actualHash,
      gitCommit
    });
  }

  if (!quoteMatches) {
    return verification({
      status: "failed",
      method: "file_quote",
      checkedAt,
      reason: "Source quote was not found in the selected file content.",
      path: pathResult.path,
      startLine: lineRange.startLine,
      endLine: lineRange.endLine,
      contentHash: actualHash,
      quoteHash: quote ? sha256Text(quote) : undefined,
      gitCommit
    });
  }

  if (!hashMatches) {
    return verification({
      status: "failed",
      method: quote ? "file_quote" : "file_hash",
      checkedAt,
      reason: "Source hash did not match file content.",
      path: pathResult.path,
      startLine: lineRange.startLine,
      endLine: lineRange.endLine,
      contentHash: actualHash,
      quoteHash: quote ? sha256Text(quote) : undefined,
      gitCommit
    });
  }

  return verification({
    status: "verified",
    method: quote ? "file_quote" : "file_hash",
    checkedAt,
    reason: quote
      ? "Source quote matched file content."
      : "Source hash matched file content.",
    path: pathResult.path,
    startLine: lineRange.startLine,
    endLine: lineRange.endLine,
    contentHash: actualHash,
    quoteHash: quote ? sha256Text(quote) : undefined,
    gitCommit
  });
}

function hasSourceEvidence(
  input: VerifySourceInput,
  sourceHash: string | undefined,
  lineRangeOk: boolean
): boolean {
  return normalizeOptionalText(input.quote) !== undefined
    || sourceHash !== undefined
    || (lineRangeOk && input.sourceLineStart !== undefined)
    || (lineRangeOk && input.sourceLineEnd !== undefined);
}

function verification({
  status,
  method,
  checkedAt,
  reason,
  path,
  startLine,
  endLine,
  contentHash,
  quoteHash,
  gitCommit
}: {
  status: SourceVerificationStatus;
  method: SourceVerificationMethod;
  checkedAt: string | null;
  reason: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  contentHash?: string;
  quoteHash?: string;
  gitCommit?: string;
}): MemorySourceVerification {
  const result: MemorySourceVerification = {
    status,
    method,
    checked_at: checkedAt,
    reason
  };

  if (path !== undefined) {
    result.path = path;
  }

  if (startLine !== undefined) {
    result.start_line = startLine;
  }

  if (endLine !== undefined) {
    result.end_line = endLine;
  }

  if (contentHash !== undefined) {
    result.content_hash = contentHash;
  }

  if (quoteHash !== undefined) {
    result.quote_hash = quoteHash;
  }

  if (gitCommit !== undefined) {
    result.git_commit = gitCommit;
  }

  return result;
}

function normalizeFileSourcePath(value: string): { ok: true; path: string } | { ok: false; reason: string } {
  const path = normalizeOptionalText(value);

  if (!path) {
    return { ok: false, reason: "File source path is required." };
  }

  try {
    return {
      ok: true,
      path: normalizeRepoRelativePath(path, "File source path")
    };
  } catch (error) {
    const reason = error instanceof Error
      ? error.message
      : "File source path must be repository-relative.";
    return { ok: false, reason };
  }
}

function normalizeLineRange(
  startLine: number | undefined,
  endLine: number | undefined
): { ok: true; startLine?: number; endLine?: number } | { ok: false; reason: string } {
  if (startLine === undefined && endLine === undefined) {
    return { ok: true };
  }

  if (
    typeof startLine !== "number"
    || typeof endLine !== "number"
    || !Number.isInteger(startLine)
    || !Number.isInteger(endLine)
    || startLine < 1
    || endLine < 1
  ) {
    return {
      ok: false,
      reason: "Source line range must include positive integer start and end lines."
    };
  }

  if (endLine < startLine) {
    return {
      ok: false,
      reason: "Source line end must be greater than or equal to source line start."
    };
  }

  return { ok: true, startLine, endLine };
}

function selectLineRange(content: string, startLine: number, endLine: number): string {
  return content.split(/\r?\n/).slice(startLine - 1, endLine).join("\n");
}

function normalizeQuoteText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSourceHash(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalText(value);
  return normalized?.toLowerCase();
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function isVerificationStatus(value: unknown): value is SourceVerificationStatus {
  return value === "verified"
    || value === "unverified"
    || value === "failed"
    || value === "not_applicable";
}

function isVerificationMethod(value: unknown): value is SourceVerificationMethod {
  return value === "file_quote"
    || value === "file_hash"
    || value === "url_hash"
    || value === "conversation_ref"
    || value === "manual"
    || value === "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
