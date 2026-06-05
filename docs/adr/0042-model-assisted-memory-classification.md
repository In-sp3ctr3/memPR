# ADR-0042: Model-Assisted Memory Classification

**Status:** Proposed  
**Date:** 2026-05-22  
**Deciders:** MemPR maintainers

## Context

MemPR currently uses deterministic local policy logic for proposal risk, source
trust effects, scanning blockers, warnings, and review gates. Model-assisted
classification could help triage proposals, detect sensitive content, summarize
source evidence, or suggest scopes, but model output is probabilistic and may
expose memory text to external providers.

This decision must preserve the rule that model output is advice, not authority.

## Decision

MemPR will not let model-assisted classification directly accept, reject, export,
redact, or sync memory. If added, it must be advisory and reviewable.

Model-assisted classification must:

- be opt-in;
- disclose provider and model configuration;
- support no-network fake classifiers for tests;
- run after deterministic blockers that should not require model judgement;
- produce explanation/evidence separate from domain authority;
- never weaken deterministic deny, TTL, relationship, read-policy, or scanner
  blockers;
- avoid sending memory text to external models unless the user explicitly
  configures that provider.

If persisted, classification output must be bounded advisory metadata with
model/provider/version, prompt policy version, timestamp, and confidence wording
that remains non-authoritative. Raw prompts, completions, memory text, and
source quotes must not be written to logs or events unless a separate trace
storage ADR accepts that risk.

## Options Considered

### Option A: Advisory Classification Only

Pros:

- Helps reviewers without surrendering policy authority.
- Keeps deterministic safety gates intact.
- Easier to test with fake classifiers.

Cons:

- Still requires careful provider privacy warnings.
- Adds UI/CLI evidence complexity.

### Option B: Model-Decided Auto-Acceptance

Pros:

- Fewer human review interruptions.

Cons:

- Creates unverifiable policy behavior.
- Can accept poisoned or sensitive memory.

### Option C: No Model Assistance

Pros:

- Keeps the system deterministic and simple.

Cons:

- Reviewers may spend more time classifying ambiguous proposals manually.

## Consequences

- Deterministic gates remain the source of authority.
- Model results need separate event/evidence types if persisted.
- External model providers require explicit privacy and credential decisions.
- CLI/UI wording must make "suggested" unmistakable.

## Deferred Risks

- Prompt injection into classifier prompts.
- Provider data retention.
- Evaluation quality and false confidence.
- Drift across model versions.
- Whether advisory metadata belongs in ledger records, events, or separate
  review artifacts.

## Council Validation

- Round 1, scope fit: model assistance can be a reviewer aid, not policy.
- Round 2, security/privacy: external model calls must be opt-in and never
  hidden behind default local commands.
- Round 3, execution: require fake classifier tests and claim-drift scans before
  any provider adapter.

## Review Triggers

- Any model call in proposal, review, scanning, export, or sync paths.
- Persisted model evidence.
- Model-driven risk, scope, source-trust, or redaction behavior.
- Provider credential or privacy-policy changes.
