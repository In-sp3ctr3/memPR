# MemPR Phase 2C Migration and Locking Council Pass

**Date:** 2026-05-21  
**Phase:** Phase 2C: Event backfill and advisory locking  
**Status:** Implemented and verified

## Subagent Assignments

| Worker | Scope | Files |
| --- | --- | --- |
| Worker A | Migration/backfill implementation | `src/events.ts`, `src/ledger.ts`, or `src/migration.ts` |
| Worker B | Advisory lock integration | `src/storage.ts`, mutation call sites |
| Worker C | Verification and docs | `test/migration.test.js`, `test/locking.test.js`, `docs/adr/0009-migration-backfill-and-advisory-locking.md` |

Each worker follows the implementation-pipeline loop: plan acceptance criteria,
execute a scoped slice, run adversarial review, and collect console evidence.

## Council Review

### Contrarian

Backfill can accidentally become destructive repair if it overwrites existing
events. The tests require divergent event history to remain unchanged and to be
reported as a conflict instead of silently repaired.

### First Principles

The real goal is replay parity for legacy stores plus lower concurrent-write
risk. This phase should not claim durable audit semantics, because MemPR still
has separate plain files and no cross-file transaction.

### Expansionist

A narrow migration API plus `mempr migrate` creates a future path for repair
reports, hash verification, and eventually authoritative event replay without
forcing all of that into Phase 2C.

### Outsider

Users need plain language: advisory locking means cooperative local protection,
not a database transaction. A stale lock file can block writes and may need
manual cleanup.

### Executor

Worker C added tests for:

- missing and empty event files backfilled from non-empty ledgers
- idempotent backfill
- refusal to overwrite divergent existing events
- CLI migration and dry-run behavior
- migration waiting behind the same store lock as other mutations
- lock cleanup after successful and failed guarded operations
- mutation blocking while a pre-existing lock file exists

Worker C added ADR-0009 to record the boundary: useful migration and advisory
locking, not compliance-grade transactionality.

## Acceptance Criteria

- Backfill is idempotent.
- Missing or empty events with a non-empty ledger can be migrated to replay
  parity.
- Divergent event history is not silently overwritten.
- Advisory locking blocks concurrent mutation when the lock file exists.
- Locks are cleaned up after success and failure.
- Docs state the remaining non-goals clearly.

## Verification Commands

Required integration commands:

- `npm run build`
- `node --test test/migration.test.js test/locking.test.js`
- `npm test`
- `npm run lint`

## Deferred Risks

- cross-file transaction/journal
- directory fsync and crash-proof durability
- stale-lock leases or owner validation
- actor/reviewer identity
- policy versions
- content hashes/signatures
- automated conflict repair
