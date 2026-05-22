# ADR-0004: V0.1 Record Schema and Ledger Contract

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** MemPR maintainers

## Context

MemPR v0.1 currently stores memory records in `.mempr/ledger.jsonl`. New
proposals append records, while status updates rewrite the current JSONL file
with updated record state.

Earlier docs used append-only audit language too early. The next implementation
phase needs a stable current contract before moving to append-only events.

## Decision

Harden the v0.1 current-state JSONL record model before implementing an
append-only event stream.

The v0.1 record contract includes:

- `id`
- `memory`
- `source.type`
- `source.uri`
- optional `source.quote`
- `source_trust` (added by ADR-0011)
- `scope`
- `risk`
- `decision`
- `decision_reason`
- `policy_version` (added by ADR-0011)
- `destination`
- `status`
- optional `status_reason`
- `ttl`
- `created_at`
- `updated_at`

The ledger is inspectable local state, not a tamper-proof audit log.

## Options Considered

### Option A: Move Immediately To Append-Only Events

Pros:

- Better audit story.
- Enables replay and export events.

Cons:

- Adds migration and state complexity before v0.1 behavior is fully tested.
- Risks hiding current bugs under a larger rewrite.

### Option B: Harden Current-State Records First

Pros:

- Matches shipped code.
- Gives implementation a stable schema and tests.
- Keeps near-term work small.

Cons:

- Audit guarantees remain limited.
- A later migration is still required.

## Consequences

- Docs must say current-state JSONL until append-only events ship.
- Tests should lock current schema behavior before migration.
- ADR-0007 adds the narrow event-ledger foundation; ADR-0011 adds source-trust
  metadata and policy-version markers. Actor identity, policy config hashes, and
  tamper evidence remain roadmap work.
- Compliance-grade or tamper-proof audit claims are prohibited.

## Deferred Risks

- concurrent writes
- file locking
- event replay
- actor/reviewer identity
- policy config hashes and replay proofs
- content hashes

## Review Triggers

- adding or removing record fields
- changing status update behavior
- adding append-only events
- adding export events
- adding actor/reviewer identity
