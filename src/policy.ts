import { DEFAULT_POLICY_CONFIG } from "./policy-config.js";
import type { PolicyConfig } from "./policy-config.js";
import { MEMORY_RISKS } from "./types.js";
import type { MemoryRisk, PolicyResult, ProposeMemoryInput } from "./types.js";

export const CURRENT_POLICY_VERSION = "mempr-policy-v1";

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
  /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{20,}\b/i,
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|pwd|refresh[_-]?token|secret|token)\b\s*[:=]\s*['"]?[^'"\s]{8,}/i
];

const UNSAFE_INSTRUCTION_PATTERNS = [
  /\balways\b.*\b(skip|disable|bypass|ignore)\b.*\b(security|test|check|review)\b/i,
  /\b(skip|disable|bypass|ignore)\b.*\b(security|permission|safety)\b/i,
  /\b(always|whenever|from now on|in future)\b.*\b(ignore|bypass|override|disregard)\b.*\b(system|developer|policy|safety|security|review|permission|instruction|guardrail)s?\b/i,
  /\b(always|without review|without permission)\b.*\b(auto[- ]?accept|auto[- ]?approve)\b.*\b(memory|memories|change|changes|review|reviews|security|permission)s?\b/i,
  /\b(auto[- ]?accept|auto[- ]?approve)\b.*\b(all|any)\b.*\b(memory|memories|change|changes|review|reviews)\b/i,
  /\b(treat|mark)\b.*\b(untrusted|external|user supplied|user-supplied)\b.*\b(as trusted|trusted)\b/i,
  /\b(exfiltrate|leak|reveal|print|send)\b.*\b(secret|credential|api[_ -]?key|token|password)s?\b/i,
  /\b(store|save|remember)\b.*\b(secret|credential|api[_ -]?key|token|password)s?\b.*\b(memory|durable|forever)\b/i
];

const SENSITIVE_PATTERNS = [
  /\bdiagnosed with\b/i,
  /\b(prescribed|patient|hipaa)\b/i,
  /\bmedical condition\b/i,
  /\b(social security|ssn|social security number)\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(date of birth|dob)\b\s*[:=]/i,
  /\b(passport|driver'?s license|tax id|itin)\b/i,
  /\bcredit card\b/i,
  /\b(card number|routing number|iban)\b/i,
  /\bbank account\b/i,
  /\b(home address|personal phone)\b/i,
  /\blegal case\b/i,
  /\b(attorney-client|lawsuit|criminal record|arrested)\b/i
];

interface ResolvedPolicyConfig {
  denyTerms: readonly string[];
  sensitiveTerms: readonly string[];
  autoAcceptScopes: readonly string[];
  defaultRisk: MemoryRisk;
  ttlRisk: MemoryRisk;
}

export function classifyMemory(
  input: ProposeMemoryInput,
  config?: Partial<PolicyConfig>
): PolicyResult {
  const explicitRisk = input.risk;
  const text = `${input.memory}\n${input.quote ?? ""}`;
  const policyConfig = resolvePolicyConfig(config);

  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
    return policyResult({
      risk: "high",
      decision: "reject",
      reason: "Looks like a secret or credential."
    });
  }

  if (UNSAFE_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return policyResult({
      risk: "high",
      decision: "reject",
      reason: "Unsafe security-weakening standing instruction."
    });
  }

  if (matchesAnyTerm(text, policyConfig.denyTerms)) {
    return policyResult({
      risk: "high",
      decision: "reject",
      reason: "Blocked by configured memory policy."
    });
  }

  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) {
    return policyResult({
      risk: "high",
      decision: "review",
      reason: "Sensitive personal or regulated information."
    });
  }

  if (matchesAnyTerm(text, policyConfig.sensitiveTerms)) {
    return policyResult({
      risk: "high",
      decision: "review",
      reason: "Requires review by configured memory policy."
    });
  }

  const risk = explicitRisk ?? inferRisk(input, policyConfig);

  if (input.sourceTrust === "untrusted" && risk === "low") {
    return policyResult({
      risk: "medium",
      decision: "review",
      reason: "Untrusted source requires reviewer confirmation."
    });
  }

  if (risk === "low") {
    return policyResult({
      risk,
      decision: "auto_accept",
      reason: "Low-risk operational memory."
    });
  }

  return policyResult({
    risk,
    decision: "review",
    reason: "Needs review before becoming durable memory."
  });
}

function policyResult(result: Omit<PolicyResult, "policyVersion">): PolicyResult {
  return {
    ...result,
    policyVersion: CURRENT_POLICY_VERSION
  };
}

function inferRisk(input: ProposeMemoryInput, config: ResolvedPolicyConfig): MemoryRisk {
  if (matchesExactTerm(input.scope ?? "user", config.autoAcceptScopes)) {
    return "low";
  }

  if (input.ttl) {
    return config.ttlRisk;
  }

  return config.defaultRisk;
}

function resolvePolicyConfig(config: Partial<PolicyConfig> | undefined): ResolvedPolicyConfig {
  return {
    denyTerms: normalizeTerms(config?.denyTerms ?? DEFAULT_POLICY_CONFIG.denyTerms),
    sensitiveTerms: normalizeTerms(config?.sensitiveTerms ?? DEFAULT_POLICY_CONFIG.sensitiveTerms),
    autoAcceptScopes: normalizeTerms(
      config?.autoAcceptScopes ?? DEFAULT_POLICY_CONFIG.autoAcceptScopes
    ),
    defaultRisk: normalizeConfigRisk(config?.defaultRisk ?? DEFAULT_POLICY_CONFIG.defaultRisk),
    ttlRisk: normalizeConfigRisk(config?.ttlRisk ?? DEFAULT_POLICY_CONFIG.ttlRisk)
  };
}

function matchesAnyTerm(text: string, terms: readonly string[]): boolean {
  const normalizedText = text.toLowerCase();
  return terms.some((term) => normalizedText.includes(term));
}

function matchesExactTerm(text: string, terms: readonly string[]): boolean {
  const normalizedText = text.trim().toLowerCase();
  return terms.includes(normalizedText);
}

function normalizeTerms(values: readonly string[]): string[] {
  const normalized: string[] = [];

  for (const value of values) {
    const term = value.trim().toLowerCase();

    if (term) {
      normalized.push(term);
    }
  }

  return normalized;
}

function normalizeConfigRisk(value: unknown): MemoryRisk {
  if (typeof value === "string" && MEMORY_RISKS.includes(value as MemoryRisk)) {
    return value as MemoryRisk;
  }

  throw new Error("Policy config risk must be low, medium, or high.");
}
