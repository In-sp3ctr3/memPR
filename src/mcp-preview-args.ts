import {
  isMemoryRisk,
  isMemorySourceTrust,
  isMemorySourceType,
  normalizeRequiredTextArg,
  optionalBooleanArg,
  optionalDestinationArg,
  optionalNumberArg,
  optionalTextArg,
  toolError
} from "./mcp-tool-args.js";
import type { ArgResult } from "./mcp-tool-args.js";
import { MEMORY_KINDS } from "./types.js";
import type {
  MemoryKind,
  ProposeMemoryInput
} from "./types.js";

export const PREVIEW_ALLOWED_ARGS = [
  "memory",
  "source",
  "sourceType",
  "sourceTrust",
  "quote",
  "verifySource",
  "sourceLineStart",
  "sourceLineEnd",
  "sourceHash",
  "gitCommit",
  "kind",
  "tags",
  "confidence",
  "scope",
  "risk",
  "destination",
  "ttl",
  "supersedes",
  "conflictsWith",
  "auth",
  "readAccess"
];

export function previewInputArg(args: Record<string, unknown>): ArgResult<ProposeMemoryInput> {
  const memory = normalizeRequiredTextArg(args.memory);

  if (!memory) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Memory text is required.")
    };
  }

  const source = optionalTextArg(args, "source");
  const quote = optionalTextArg(args, "quote");
  const verifySource = optionalBooleanArg(args, "verifySource");
  const sourceLineStart = optionalNumberArg(args, "sourceLineStart");
  const sourceLineEnd = optionalNumberArg(args, "sourceLineEnd");
  const sourceHash = optionalTextArg(args, "sourceHash");
  const gitCommit = optionalTextArg(args, "gitCommit");
  const scope = optionalTextArg(args, "scope");
  const destination = optionalDestinationArg(args);
  const ttl = optionalTextArg(args, "ttl");
  const tags = optionalStringArrayArg(args, "tags");
  const confidence = optionalConfidenceArg(args);
  const supersedes = optionalStringArrayArg(args, "supersedes");
  const conflictsWith = optionalStringArrayArg(args, "conflictsWith");

  if (!source.ok) {
    return source;
  }

  if (!quote.ok) {
    return quote;
  }

  if (!verifySource.ok) {
    return verifySource;
  }

  if (!sourceLineStart.ok) {
    return sourceLineStart;
  }

  if (!sourceLineEnd.ok) {
    return sourceLineEnd;
  }

  if (!sourceHash.ok) {
    return sourceHash;
  }

  if (!gitCommit.ok) {
    return gitCommit;
  }

  if (!scope.ok) {
    return scope;
  }

  if (!destination.ok) {
    return destination;
  }

  if (!ttl.ok) {
    return ttl;
  }

  if (!tags.ok) {
    return tags;
  }

  if (!confidence.ok) {
    return confidence;
  }

  if (!supersedes.ok) {
    return supersedes;
  }

  if (!conflictsWith.ok) {
    return conflictsWith;
  }

  if (args.sourceType !== undefined && !isMemorySourceType(args.sourceType)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid sourceType argument.")
    };
  }

  if (args.sourceTrust !== undefined && !isMemorySourceTrust(args.sourceTrust)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid sourceTrust argument.")
    };
  }

  if (args.kind !== undefined && !isMemoryKind(args.kind)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid kind argument.")
    };
  }

  if (args.risk !== undefined && !isMemoryRisk(args.risk)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid risk argument.")
    };
  }

  const lineRangeError = validateLineRange(sourceLineStart.value, sourceLineEnd.value);

  if (lineRangeError) {
    return lineRangeError;
  }

  if (sourceHash.value !== undefined && !/^[0-9a-f]{64}$/i.test(sourceHash.value)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "sourceHash must be a SHA-256 hex string.")
    };
  }

  return {
    ok: true,
    value: buildPreviewInput(args, {
      memory,
      source,
      quote,
      verifySource,
      sourceLineStart,
      sourceLineEnd,
      sourceHash,
      gitCommit,
      scope,
      destination,
      ttl,
      tags,
      confidence,
      supersedes,
      conflictsWith
    })
  };
}

function buildPreviewInput(
  args: Record<string, unknown>,
  parsed: ParsedPreviewArgs
): ProposeMemoryInput {
  const input: ProposeMemoryInput = { memory: parsed.memory };

  if (parsed.source.value !== undefined) {
    input.source = parsed.source.value;
  }

  if (isMemorySourceType(args.sourceType)) {
    input.sourceType = args.sourceType;
  }

  if (isMemorySourceTrust(args.sourceTrust)) {
    input.sourceTrust = args.sourceTrust;
  }

  if (parsed.quote.value !== undefined) {
    input.quote = parsed.quote.value;
  }

  if (parsed.verifySource.value !== undefined) {
    input.verifySource = parsed.verifySource.value;
  }

  if (
    parsed.sourceLineStart.value !== undefined
    && parsed.sourceLineEnd.value !== undefined
  ) {
    input.sourceLineStart = parsed.sourceLineStart.value;
    input.sourceLineEnd = parsed.sourceLineEnd.value;
  }

  if (parsed.sourceHash.value !== undefined) {
    input.sourceHash = parsed.sourceHash.value.toLowerCase();
  }

  if (parsed.gitCommit.value !== undefined) {
    input.gitCommit = parsed.gitCommit.value;
  }

  if (isMemoryKind(args.kind)) {
    input.kind = args.kind;
  }

  if (parsed.tags.value !== undefined) {
    input.tags = parsed.tags.value;
  }

  if (parsed.confidence.value !== undefined) {
    input.confidence = parsed.confidence.value;
  }

  if (parsed.scope.value !== undefined) {
    input.scope = parsed.scope.value;
  }

  if (isMemoryRisk(args.risk)) {
    input.risk = args.risk;
  }

  if (parsed.destination.value !== undefined) {
    input.destination = parsed.destination.value;
  }

  if (parsed.ttl.value !== undefined) {
    input.ttl = parsed.ttl.value;
  }

  if (parsed.supersedes.value !== undefined) {
    input.supersedes = parsed.supersedes.value;
  }

  if (parsed.conflictsWith.value !== undefined) {
    input.conflictsWith = parsed.conflictsWith.value;
  }

  return input;
}

function validateLineRange(
  start: number | undefined,
  end: number | undefined
): ArgResult<never> | undefined {
  if ((start === undefined) !== (end === undefined)) {
    return {
      ok: false,
      error: toolError(
        "invalid_arguments",
        "sourceLineStart and sourceLineEnd must be supplied together."
      )
    };
  }

  if ((start !== undefined && start < 1) || (end !== undefined && end < 1)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Source line range must use positive integers.")
    };
  }

  if (start !== undefined && end !== undefined && end < start) {
    return {
      ok: false,
      error: toolError(
        "invalid_arguments",
        "sourceLineEnd must be greater than or equal to sourceLineStart."
      )
    };
  }

  return undefined;
}

function optionalStringArrayArg(
  args: Record<string, unknown>,
  key: string
): ArgResult<string[]> {
  const value = args[key];

  if (value === undefined || value === null) {
    return { ok: true };
  }

  const raw = typeof value === "string"
    ? value.split(",")
    : Array.isArray(value)
      ? value
      : undefined;

  if (raw === undefined) {
    return {
      ok: false,
      error: toolError("invalid_arguments", `Invalid ${key} argument.`)
    };
  }

  const values: string[] = [];

  for (const item of raw) {
    const normalized = normalizeRequiredTextArg(item);

    if (!normalized) {
      return {
        ok: false,
        error: toolError("invalid_arguments", `Invalid ${key} argument.`)
      };
    }

    values.push(normalized);
  }

  return {
    ok: true,
    value: values
  };
}

function optionalConfidenceArg(args: Record<string, unknown>): ArgResult<number> {
  const confidence = optionalNumberArg(args, "confidence");

  if (!confidence.ok) {
    return confidence;
  }

  if (
    confidence.value !== undefined
    && (confidence.value < 0 || confidence.value > 1)
  ) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid confidence argument.")
    };
  }

  return confidence;
}

function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && MEMORY_KINDS.includes(value as MemoryKind);
}

interface ParsedPreviewArgs {
  memory: string;
  source: ParsedArg<string>;
  quote: ParsedArg<string>;
  verifySource: ParsedArg<boolean>;
  sourceLineStart: ParsedArg<number>;
  sourceLineEnd: ParsedArg<number>;
  sourceHash: ParsedArg<string>;
  gitCommit: ParsedArg<string>;
  scope: ParsedArg<string>;
  destination: ParsedArg<string>;
  ttl: ParsedArg<string>;
  tags: ParsedArg<string[]>;
  confidence: ParsedArg<number>;
  supersedes: ParsedArg<string[]>;
  conflictsWith: ParsedArg<string[]>;
}

type ParsedArg<T> = Extract<ArgResult<T>, { ok: true }>;
