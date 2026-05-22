# ADR-0011: Source Trust and Policy Version Recording

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** MemPR maintainers

## Context

ADR-0010 added local policy configuration while explicitly deferring source
trust and policy versions. Phase 3B now needs the smallest useful metadata pass:
records should preserve whether a proposer marks a source as trusted,
untrusted, or unknown, and each new policy decision should identify the policy
implementation version that produced it.

The goal is traceability, not trust scoring. A field named `source_trust` can be
misread as a security guarantee, and a field named `policy_version` can be
misread as a proof that policy was correct, unchanged, or fully reproducible.
This ADR limits both meanings.

## Decision

Add two memory record fields:

- `source_trust`: one of `trusted`, `unknown`, or `untrusted`.
- `policy_version`: a string marker for the policy implementation that made the
  decision.

New proposals default `source_trust` to `unknown` when the caller does not
provide a value. CLI and API proposal paths may set `source_trust` to `trusted`,
`unknown`, or `untrusted`.

`source_trust` is metadata only in this slice. It must not change policy
decision, risk, status, export eligibility, or review requirements.

New proposals store the current built-in policy implementation marker in
`policy_version`. The marker identifies the algorithm/version family used by
MemPR when the decision was made. It is not a config hash, not a tamper-proof
receipt, not a replay proof, and not evidence that the recorded memory is true.

Legacy records that are missing either field normalize on read as:

- `source_trust: "unknown"`
- `policy_version: "unknown"`

Malformed source-trust or policy-version metadata must fail closed without
echoing memory text, source quotes, or malformed secret-like values.

## Options Considered

### Option A: Store Source Trust And Immediately Influence Policy

Pros:

- Untrusted sources could require review immediately.
- The field would have visible runtime impact.

Cons:

- Expands Phase 3B into scoring and policy semantics.
- Risks making untested trust assertions part of acceptance decisions.
- Requires a stronger source identity model than MemPR has today.

### Option B: Store Metadata Only And Stamp Policy Version

Pros:

- Improves traceability without pretending to score truth or trust.
- Keeps deterministic Phase 3A policy behavior unchanged.
- Creates a stable field for future trust-aware policy work.

Cons:

- Users may expect `untrusted` to affect decisions unless docs are explicit.
- Future policy migration still needs a fuller version/config story.

### Option C: Store A Full Policy Config Hash

Pros:

- Better replay diagnostics in repositories with local config.
- Could support future audit comparisons.

Cons:

- Too much for the current metadata pass.
- A hash alone does not prove policy was executed correctly.
- Requires config canonicalization and migration decisions.

## Consequences

- Records and proposal events carry source-trust metadata and policy-version
  markers for new writes.
- Existing records can still be listed and normalized without migration.
- Phase 3B does not enforce TTL, score source trust, detect conflicts, or
  supersede memories.
- Docs and tests must avoid claiming that source trust proves a source is safe
  or that policy version proves decision correctness.

## Verification

Phase 3B verification lives in `test/source-trust-policy-version.test.js`.

The tests cover default `source_trust`, API and CLI source-trust values,
metadata-only policy behavior, new-record policy-version stamping, legacy
normalization to `unknown`, and malformed metadata errors that do not echo
memory text or source quotes.

## Review Triggers

- making `source_trust` affect risk, decision, status, export, or review
- changing the source-trust vocabulary
- changing `policy_version` semantics or format
- adding policy config hashing or replay proofs
- adding TTL enforcement, conflict detection, or supersession behavior
