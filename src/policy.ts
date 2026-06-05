import { DEFAULT_POLICY_CONFIG } from "./policy-config.js";
import type { PolicyConfig } from "./policy-config.js";
import { normalizeMemoryKind } from "./memory-model.js";
import {
  proposalPersistentSecretFields
} from "./persistence-safety.js";
import {
  scanPersistentFields
} from "./safety.js";
import { normalizeSourceType } from "./ledger-records.js";
import { MEMORY_RISKS } from "./types.js";
import type {
  MemoryKind,
  MemoryRisk,
  MemorySourceVerification,
  PolicyResult,
  ProposeMemoryInput
} from "./types.js";

export const CURRENT_POLICY_VERSION = "mempr-policy-v1";

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
const REVIEW_ONLY_KINDS = new Set<MemoryKind>([
  "instruction",
  "procedure",
  "constraint",
  "warning"
]);
const STRONG_INSTRUCTION_WORDS = /\b(always|never|must|do not|skip|disable|bypass)\b/i;

interface ResolvedPolicyConfig {
  denyTerms: readonly string[];
  sensitiveTerms: readonly string[];
  autoAcceptScopes: readonly string[];
  defaultRisk: MemoryRisk;
  ttlRisk: MemoryRisk;
  autoAcceptRequiresTrustedSource: boolean;
  reviewUnknownSourceTrust: boolean;
  autoAcceptRequiresVerifiedSource: boolean;
}

export function classifyMemory(
  input: ProposeMemoryInput & { sourceVerification?: MemorySourceVerification },
  config?: Partial<PolicyConfig>
): PolicyResult {
  const explicitRisk = input.risk;
  const text = `${input.memory}\n${input.quote ?? ""}`;
  const policyConfig = resolvePolicyConfig(config);

  if (scanPersistentFields(policySecretFields(input)).length > 0) {
    return policyResult({
      risk: "high",
      decision: "block_no_persist",
      reason: "Blocked without persistence because the proposal contains unsafe persistent content."
    });
  }

  if (UNSAFE_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return policyResult({
      risk: "high",
      decision: "reject_audited",
      reason: "Unsafe security-weakening standing instruction."
    });
  }

  if (matchesAnyTerm(text, policyConfig.denyTerms)) {
    return policyResult({
      risk: "high",
      decision: "reject_audited",
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

  const kind = normalizeMemoryKind(input.kind);
  const sourceType = normalizeSourceType(input.sourceType, input.source ?? "manual");
  const sourceVerifiedTrusted = input.sourceTrust === "trusted"
    && input.sourceVerification?.status === "verified";
  const kindRequiresReview = REVIEW_ONLY_KINDS.has(kind) && input.sourceTrust !== "trusted";
  let risk = explicitRisk ?? inferRisk(input, policyConfig);

  if (
    sourceType === "file"
    && input.sourceVerification !== undefined
    && input.sourceVerification.status !== "verified"
  ) {
    return policyResult({
      risk: "medium",
      decision: "review",
      reason: "File source could not be verified and requires reviewer confirmation."
    });
  }

  if (input.sourceVerification?.status === "failed") {
    return policyResult({
      risk: atLeastMedium(risk),
      decision: "review",
      reason: "Source verification failed and requires reviewer confirmation."
    });
  }

  if (input.verifySource === true && input.sourceVerification?.status !== "verified") {
    return policyResult({
      risk: atLeastMedium(risk),
      decision: "review",
      reason: "Source verification did not complete and requires reviewer confirmation."
    });
  }

  if (
    hasSourceEvidence(input)
    && input.sourceVerification?.status !== "verified"
    && input.sourceVerification?.status !== "not_applicable"
  ) {
    return policyResult({
      risk: atLeastMedium(risk),
      decision: "review",
      reason: "Source verification failed and requires reviewer confirmation."
    });
  }

  if (kind === "instruction" && STRONG_INSTRUCTION_WORDS.test(text) && !sourceVerifiedTrusted) {
    risk = atLeastMedium(risk);
  }

  if (
    (kind === "warning" || kind === "constraint")
    && explicitRisk === undefined
    && input.sourceTrust !== "trusted"
  ) {
    risk = atLeastMedium(risk);
  }

  if (kindRequiresReview && risk !== "high") {
    return policyResult({
      risk: atLeastMedium(risk),
      decision: "review",
      reason: "Memory kind requires reviewer confirmation for unknown or untrusted sources."
    });
  }

  if (risk === "low" && input.sourceTrust === "untrusted") {
    return policyResult({
      risk: "medium",
      decision: "review",
      reason: "Untrusted source requires reviewer confirmation."
    });
  }

  if (
    risk === "low"
    && input.sourceTrust !== "trusted"
    && (
      policyConfig.autoAcceptRequiresTrustedSource
      || (input.sourceTrust === "unknown" && policyConfig.reviewUnknownSourceTrust)
    )
  ) {
    return policyResult({
      risk,
      decision: "review",
      reason: "Unknown source trust requires reviewer confirmation."
    });
  }

  if (
    risk === "low"
    && policyConfig.autoAcceptRequiresVerifiedSource
    && input.sourceVerification?.status !== "verified"
  ) {
    return policyResult({
      risk,
      decision: "review",
      reason: "Source verification is required before auto-accept."
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

function policySecretFields(input: ProposeMemoryInput): Array<{ field: string; text: string }> {
  return proposalPersistentSecretFields(input);
}

function hasSourceEvidence(input: ProposeMemoryInput): boolean {
  return (
    (typeof input.quote === "string" && input.quote.trim().length > 0)
    || (typeof input.sourceHash === "string" && input.sourceHash.trim().length > 0)
    || input.sourceLineStart !== undefined
    || input.sourceLineEnd !== undefined
  );
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

function atLeastMedium(risk: MemoryRisk): MemoryRisk {
  return risk === "low" ? "medium" : risk;
}

function resolvePolicyConfig(config: Partial<PolicyConfig> | undefined): ResolvedPolicyConfig {
  return {
    denyTerms: normalizeTerms(config?.denyTerms ?? DEFAULT_POLICY_CONFIG.denyTerms),
    sensitiveTerms: normalizeTerms(config?.sensitiveTerms ?? DEFAULT_POLICY_CONFIG.sensitiveTerms),
    autoAcceptScopes: normalizeTerms(
      config?.autoAcceptScopes ?? DEFAULT_POLICY_CONFIG.autoAcceptScopes
    ),
    defaultRisk: normalizeConfigRisk(config?.defaultRisk ?? DEFAULT_POLICY_CONFIG.defaultRisk),
    ttlRisk: normalizeConfigRisk(config?.ttlRisk ?? DEFAULT_POLICY_CONFIG.ttlRisk),
    autoAcceptRequiresTrustedSource: normalizeConfigBoolean(
      config?.autoAcceptRequiresTrustedSource
      ?? DEFAULT_POLICY_CONFIG.autoAcceptRequiresTrustedSource
    ),
    reviewUnknownSourceTrust: normalizeConfigBoolean(
      config?.reviewUnknownSourceTrust
      ?? DEFAULT_POLICY_CONFIG.reviewUnknownSourceTrust
    ),
    autoAcceptRequiresVerifiedSource: normalizeConfigBoolean(
      config?.autoAcceptRequiresVerifiedSource
      ?? DEFAULT_POLICY_CONFIG.autoAcceptRequiresVerifiedSource
    )
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

function normalizeConfigBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  throw new Error("Policy config boolean values must be true or false.");
}
