import type { MemoryRisk, PolicyResult, ProposeMemoryInput } from "./types.js";

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(api[_-]?key|password|secret|token)\b\s*[:=]\s*\S+/i
];

const UNSAFE_INSTRUCTION_PATTERNS = [
  /\balways\b.*\b(skip|disable|bypass|ignore)\b.*\b(security|test|check|review)\b/i,
  /\b(skip|disable|bypass|ignore)\b.*\b(security|permission|safety)\b/i
];

const SENSITIVE_PATTERNS = [
  /\bdiagnosed with\b/i,
  /\bmedical condition\b/i,
  /\bsocial security\b/i,
  /\bcredit card\b/i,
  /\bbank account\b/i,
  /\blegal case\b/i
];

export function classifyMemory(input: ProposeMemoryInput): PolicyResult {
  const explicitRisk = input.risk;
  const text = `${input.memory}\n${input.quote ?? ""}`;

  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      risk: "high",
      decision: "reject",
      reason: "Looks like a secret or credential."
    };
  }

  if (UNSAFE_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      risk: "high",
      decision: "reject",
      reason: "Unsafe procedural memory."
    };
  }

  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      risk: "high",
      decision: "review",
      reason: "Sensitive personal or regulated information."
    };
  }

  const risk = explicitRisk ?? inferRisk(input);

  if (risk === "low") {
    return {
      risk,
      decision: "auto_accept",
      reason: "Low-risk operational memory."
    };
  }

  return {
    risk,
    decision: "review",
    reason: "Needs review before becoming durable memory."
  };
}

function inferRisk(input: ProposeMemoryInput): MemoryRisk {
  if (input.scope === "repo" || input.scope === "project") {
    return "low";
  }

  if (input.ttl) {
    return "medium";
  }

  return "medium";
}

