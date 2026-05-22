# ADR-0008: Current-View Atomic Writes and Drift Detection

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** MemPR maintainers

## Context

ADR-0007 introduced `.mempr/events.jsonl` while keeping `.mempr/ledger.jsonl` as
the current materialized view. That creates a dual-write risk: the current view
and event stream can drift if one write succeeds and the other fails.

Phase 2B reduces that risk and makes drift visible without claiming full
transactional safety.

## Decision

Use an atomic temp-file-plus-rename helper for current-view `ledger.jsonl`
writes, and add a consistency check that compares current ledger records against
event replay.

The check is exposed through:

- `checkLedgerConsistency(root?)`
- `mempr check [--json]`

The consistency check reports structured issue codes instead of raw record
contents.

Current issue codes include:

- `ledger_read_failed`
- `event_file_missing`
- `event_malformed`
- `event_read_failed`
- `event_replay_failed`
- `ledger_replay_mismatch`

## Options Considered

### Option A: Implement Full Transactional Locking Now

Pros:

- Stronger protection against concurrent writes.
- Cleaner story for dual-write consistency.

Cons:

- Pulls locking semantics, crash recovery, and platform details into the same
  slice as drift reporting.
- Higher implementation risk before migration semantics are settled.

### Option B: Add Atomic Current-View Writes and Drift Detection First

Pros:

- Reduces partial current-view writes.
- Gives users and tests a way to detect event/current-view drift.
- Keeps event replay diagnostic rather than authoritative.

Cons:

- Dual writes can still drift.
- No cross-file transaction exists yet.
- Concurrent writers can still race.

## Consequences

- `ledger.jsonl` writes now use atomic replace semantics.
- `mempr check` exits non-zero when drift is detected.
- Drift reports use codes, counts, and record IDs instead of memory text.
- Event replay remains diagnostic; the current view is still read from
  `ledger.jsonl`.

## Deferred Risks

- file locking
- directory fsync and crash-proof durability
- cross-file transaction or journal
- authoritative replay-derived current view
- actor/reviewer identity
- policy versions
- content hashes and signatures
- repair tooling for drift

## Review Triggers

- changing `mempr check` output or exit behavior
- changing consistency issue codes
- making events authoritative
- adding file locking or repair commands
- changing the write order between ledger and events
