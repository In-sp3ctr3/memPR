# Phase 3B Source Trust and Policy Version Pass

Date: 2026-05-21

## Decision Being Tested

MemPR should record `source_trust` and `policy_version` on memory records while
keeping source trust metadata-only and policy version as an algorithm/version
marker, not a proof, config hash, trust score, TTL rule, or conflict model.

## Council Review

### Contrarian

The dangerous failure is semantic overclaiming. A maintainer could see
`source_trust: trusted` and assume MemPR verified the source, or see
`policy_version` and assume decisions are cryptographically replayable. Malformed
values are also a privacy boundary because ledger errors could accidentally echo
memory text or quoted source material.

### First Principles

The real goal is provenance explainability for future review. The minimum
coherent workflow is to store caller-supplied trust vocabulary, default missing
trust to `unknown`, stamp new decisions with the current policy implementation
marker, and normalize legacy records without migration.

### Expansionist

This creates a stable foundation for later trust-aware policy, config hashes,
policy replay diagnostics, source identity, and export warnings. Keeping Phase
3B metadata-only makes those later decisions reviewable instead of hidden inside
this pass.

### Outsider

The docs must use plain language: source trust does not change whether memory is
accepted, rejected, reviewed, or exported yet. Policy version says which MemPR
policy implementation made the decision; it does not prove the memory is true or
the local config was unchanged.

### Executor

Ship focused tests in `test/source-trust-policy-version.test.js`, update the
record schema assertions, add ADR-0011, and revise PRD/README claims. Do not add
TTL enforcement, trust scoring, config hashing, conflict detection, or
supersession behavior.

## Consensus

Proceed with the narrow metadata-recording pass. Treat `trusted`, `unknown`, and
`untrusted` as recorded source hints only. Treat `policy_version` as a policy
implementation marker only.

## Implementation Move

- Verify new proposal defaults and policy-version stamping.
- Verify API and CLI `source_trust` inputs.
- Verify unchanged policy outcome for trusted and untrusted sources.
- Verify legacy missing fields normalize to `unknown`.
- Verify malformed metadata fails without echoing memory text or quotes.
- Document all non-goals in ADR-0011, PRD, README, and the ADR index.

## Deferred Risks

- No source identity verification.
- No source-trust scoring or policy effects.
- No policy config hash or replay proof.
- No TTL enforcement or stale export blocking.
- No conflict detection or supersession model.
