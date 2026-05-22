# ADR-0032: R1-R2 audit integrity and source trust

Status: Accepted

## Context

MemPR needed stronger local audit integrity without claiming tamper-proof or
compliance-grade audit safety. Source trust also needed to stop being purely
decorative for obviously untrusted inputs.

## Decision

- New events are schema-versioned as `mempr-event-v2`.
- Events carry canonical SHA-256 hashes for the event payload and record/record
  list payloads where applicable.
- Events link to the previous event hash to form a local hash chain.
- Proposal events capture a canonical `policy_config_hash`.
- `mempr check` verifies event integrity and reports hash-chain mismatch without
  echoing event content.
- `mempr repair --from-events --confirm` rebuilds the current ledger from verified
  event replay.
- `sourceTrust: "untrusted"` prevents low-risk auto-accept and requires review.
- `sourceTrust: "trusted"` never bypasses deny, secret, sensitive, relationship,
  TTL, read-policy, or other blockers.

## Consequences

- Legacy events without hashes remain readable, but new events become
  hash-aware.
- The ledger remains the local current view; the event stream is the repair
  authority only after integrity verification passes.
- Hashes are local tamper evidence, not non-repudiation, legal retention, or a
  compliance-grade audit log.

## Verification

- Event schema/hash-chain tests.
- Event tamper detection in consistency checks.
- API and CLI repair-from-events tests.
- Source-trust API/CLI tests for `trusted`, `unknown`, and `untrusted`.
