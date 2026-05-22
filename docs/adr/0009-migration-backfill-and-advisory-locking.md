# ADR-0009: Event Backfill and Advisory Store Locking

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** MemPR maintainers

## Context

ADR-0007 added `.mempr/events.jsonl` as an append-only event foundation while
keeping `.mempr/ledger.jsonl` as the materialized current view. ADR-0008 added
atomic current-view writes and drift detection.

Repositories can still have a non-empty `ledger.jsonl` with no event history
because they were created before events shipped, or because event backfill has
not run yet. Concurrent writers can also interleave writes unless the store
uses a shared mutation guard.

Phase 2C narrows that gap, but it still does not make MemPR a compliance-grade
transaction log.

## Decision

Add an event backfill/migration path that converts a legacy non-empty
`ledger.jsonl` into replay-equivalent event history only when it is safe to do
so.

The migration must:

- backfill when the event file is missing or empty and the current ledger has
  records
- be available through `mempr migrate [--dry-run] [--json]`
- produce event replay parity with the current ledger after backfill
- be idempotent after a successful backfill
- refuse or report a conflict when existing event history diverges from the
  current ledger
- avoid overwriting divergent existing event history

Add an advisory file lock around MemPR store mutations.

The lock must:

- use a lock file inside `.mempr`
- block a mutation while another lock file already exists
- fail without removing the existing lock if the lock remains unavailable
- clean up after both successful and failed guarded operations

## Options Considered

### Option A: Make Events Immediately Authoritative

Pros:

- Simplifies future reads around one source of truth.
- Reduces dependence on rewritten `ledger.jsonl`.

Cons:

- Requires broader migration, repair, and rollback semantics.
- Raises user expectations about audit durability before hashes, actor identity,
  and crash recovery exist.

### Option B: Backfill Safely and Keep Current View Authoritative

Pros:

- Gives legacy stores a path to replay parity.
- Keeps migration behavior narrow and testable.
- Preserves existing divergent history for manual diagnosis.

Cons:

- The system still has two files and no cross-file transaction.
- Event history can still be incomplete after crashes or manual edits.

### Option C: Database-Backed Transaction Log

Pros:

- Stronger transaction semantics.
- More room for indexes and richer migrations.

Cons:

- Conflicts with the local-first plain-file v0.1 posture.
- Adds operational weight before the event model is stable.

## Consequences

- Legacy file stores can gain event replay parity without rewriting their
  current ledger.
- Existing event history is treated as evidence, not scratch space.
- Mutating commands are guarded by advisory locking, but this is cooperative
  protection only.
- Lock files may require manual cleanup after an abandoned process or timeout.

## Non-Goals

- Compliance-grade audit logging.
- Tamper-proof events.
- Cross-file transactions.
- Crash-proof durability across `ledger.jsonl`, `events.jsonl`, and exports.
- Stale-lock lease recovery.
- Actor/reviewer identity, policy versions, hashes, or signatures.

## Verification

Phase 2C verification lives in:

- `test/migration.test.js`
- `test/locking.test.js`
- `test/cli.test.js`

The tests cover migration idempotency, missing/empty event backfill, divergent
history refusal, CLI migration/dry-run behavior, lock blocking, and lock cleanup.

## Review Triggers

- making event replay authoritative for reads
- changing migration conflict behavior
- changing lock filename or stale-lock policy
- adding lease-based lock recovery
- adding hashes, signatures, actor identity, or policy versions
