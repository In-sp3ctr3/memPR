# MemPR Phase 2A Event Ledger Council Pass

**Date:** 2026-05-21  
**Phase:** Phase 2A: Append-only event ledger foundation  
**Status:** Implemented and verified

## Subagent Assignments

| Worker | Scope | Files |
| --- | --- | --- |
| Kepler | Event helper model and replay integrity review | `src/events.ts`, `src/types.ts` draft |
| Ramanujan | Ledger event write integration | `src/ledger.ts` |
| Newton | Event verification suite | `test/events.test.js` |

Each worker used the implementation-pipeline loop: plan, execute, adversarial
review, and console verification.

## Council Review

### Contrarian

The main risk is dual-write drift: `ledger.jsonl` is written as the current view
and `events.jsonl` is appended after it. Without atomic writes or file locking,
one can succeed while the other fails. That risk is real and remains deferred.

### First Principles

The slice should prove that MemPR can emit and replay meaningful events without
destabilizing the working CLI. It should not turn events into compliance-grade
audit, migrate storage, or introduce actor identity in the same move.

### Expansionist

A reusable `src/events.ts` boundary gives later phases a place to add migration,
hashing, actor identity, and authoritative replay without scattering event logic
through the ledger.

### Outsider

The event stream must be inspectable and boring. `events.jsonl` mirrors the
developer-friendly shape of `ledger.jsonl`, and tests prove proposal/status
replay matches current records.

### Executor

Implemented:

- `.mempr/events.jsonl`
- `memory_proposed`, `memory_status_changed`, and `memory_exported`
- `appendEvent`, `readEvents`, `replayEvents`, and event path helpers
- ledger event writes for propose, accept/reject, and export
- replay integrity checks for duplicate proposals and dangling references
- docs/ADR updates to label the event stream as a foundation, not a tamper-proof
  audit log

## Verification

Commands run after integration:

- `npm run build`
- `node --test test/events.test.js`
- `npm test`
- `npm run lint`
- event smoke script covering propose, accept, export, readEvents, and replay

Final automated result: 22 tests passing.

## Deferred Risks

- atomic dual-write behavior
- file locking and concurrent writes
- migration from `ledger.jsonl` to replay-derived current view
- actor/reviewer identity
- policy versioning
- content hashes or signatures
- repair tooling for event/current-view drift
