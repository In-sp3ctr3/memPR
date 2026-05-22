# ADR-0007: Event Ledger Foundation

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** MemPR maintainers

## Context

Phase 1 hardened the current-state JSONL record model and review lifecycle. The
next useful audit step is an event stream that records proposals, status
changes, and exports without replacing the current materialized view yet.

ADR-0004 intentionally deferred append-only events until the v0.1 schema and
lifecycle were stable. That trigger has now been reached for a narrow Phase 2A
foundation.

## Decision

Add `.mempr/events.jsonl` as an append-only event foundation while preserving
`.mempr/ledger.jsonl` as the current materialized view.

Phase 2A events are:

- `memory_proposed`
- `memory_status_changed`
- `memory_exported`

The source helper API lives in `src/events.ts` and supports:

- resolving the event path
- creating event IDs
- appending events
- reading event JSONL
- replaying proposal/status events into current `MemoryRecord[]`

This is not yet a compliance-grade audit log and is not tamper-proof.

## Options Considered

### Option A: Replace `ledger.jsonl` With Event Replay Immediately

Pros:

- One canonical source of truth.
- Forces replay correctness early.

Cons:

- Higher migration risk.
- More ways to break the working CLI.
- Pulls file locking and migration into the same slice.

### Option B: Dual-Write Events Beside The Current View

Pros:

- Keeps current CLI behavior stable.
- Creates replay evidence without a storage migration.
- Lets later phases harden atomicity and migration separately.

Cons:

- Dual-write failure can create drift.
- Event stream is not yet authoritative.

## Consequences

- `ledger.jsonl` remains the current view for reads.
- `events.jsonl` records proposal, status-change, and export operations.
- Tests must prove event replay matches current records for propose/status
  flows.
- Export events record exported record IDs and destination metadata.
- Public docs must avoid audit-grade claims.

## Deferred Risks

- atomic dual writes
- file locking and concurrent writes
- migration from current JSONL to replay-derived current view
- actor/reviewer identity
- policy versions
- content hashes or signatures
- event compaction or repair tooling

## Review Triggers

- changing event field names or event types
- making event replay authoritative
- changing current-view read behavior
- adding actor/reviewer identity
- adding hash/signature validation
- changing export event semantics
