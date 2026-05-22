# ADR-0016: Reviewer History CLI

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0015 added local reviewer ergonomics with `inbox`, `diff`, and `review`.
Those commands help a maintainer find a pending record, inspect it, and decide
whether to accept or reject it. They do not yet answer a related local review
question: what has MemPR already observed for this record in the event stream?

MemPR already writes proposal, status-change, export, and migration/backfill
events to `.mempr/events.jsonl`, but those events are not an audit-grade proof
system. They can be missing for legacy stores, incomplete after manual edits or
crashes, and are not signed or tied to actor identity.

Phase 4B should therefore add a narrow reviewer timeline command without
turning event history into rollback, repair, or proof infrastructure.

## Decision

Phase 4B adds:

- `history <id> [--json]`

The command is read-only. It reads the current record view from
`.mempr/ledger.jsonl` and event participation from `.mempr/events.jsonl`.

For the target record, `history` shows:

- the current memory record state
- the proposal event if present
- status-change events for that record
- export events that include that record ID
- migration/backfill participation when the target record appears in a
  `ledger_migrated` event

Timeline entries should summarize event participation instead of dumping whole
event payloads. For example, an export entry can show the event ID, timestamp,
destination, and whether the target record ID was included. A migration entry
can show the event ID, timestamp, migration source, and target record ID.

`history <id>` may show the target record's memory text because the maintainer
explicitly requested local history for that record. It must not dump unrelated
record memory from migration events, exported record sets, or other event
payloads.

If `.mempr/events.jsonl` is missing, empty, malformed, or lacks entries for the
target record, the command should present an empty or limited timeline with an
appropriate non-secret issue summary. It must not mutate files, backfill events,
repair drift, roll back records, or imply that missing history is itself a
revert operation.

## Non-Goals

Phase 4B does not add:

- rollback, revert, undo, restore, or repair commands
- actor or reviewer identity
- signatures, hashes, tamper evidence, or audit-grade proof
- comments or reviewer note threads
- merge, close, reopen, or full pull-request lifecycle states
- migration execution from `history`
- exported or migrated content dumps for records other than the target record

## Options Considered

### Option A: Rely On `check` And Raw Event Files

Pros:

- No new CLI surface.
- Keeps event inspection as a power-user workflow.

Cons:

- Reviewers still need to read raw JSONL to understand one record's timeline.
- Raw migration and export events can contain unrelated record IDs or content.
- `check` answers replay consistency, not record-level history.

### Option B: Add A Full Audit Or Rollback Command

Pros:

- Could eventually support stronger operational recovery.
- Makes the event stream feel more authoritative.

Cons:

- Overclaims the current event model.
- Requires identity, hashes, signatures, conflict semantics, and repair rules.
- Risks turning missing history into an unsafe automatic mutation path.

### Option C: Add Read-Only Reviewer History

Pros:

- Gives maintainers a focused local timeline for one record.
- Reuses the existing event stream without making it authoritative.
- Preserves the privacy boundary by summarizing unrelated event participation.
- Leaves migration, drift detection, and repair concerns with their own commands
  and future ADRs.

Cons:

- Timeline completeness depends on available local events.
- Future audit-grade history will need a separate design.

## Consequences

- `history` becomes the local record timeline command for reviewers.
- `diff` remains the local content/context review command; `history` is the
  event-participation view.
- Missing or malformed event history is represented as limited evidence, not
  repaired.
- JSON output must be structured enough for automation while still avoiding
  unrelated migrated/exported memory content.
- Runtime docs must keep `history` separate from `migrate`, `check`, rollback,
  and audit-proof claims.

## Verification

Phase 4B verification should cover:

- `history <id>` shows current target record state.
- `history <id>` includes the target proposal event when present.
- `history <id>` includes status-change events for the target record.
- `history <id>` includes export participation without dumping unrelated
  exported record memory.
- `history <id>` includes migration/backfill participation without dumping
  unrelated migrated record memory.
- `history <id> --json` returns a structured current-state plus timeline shape.
- Missing event history returns an empty timeline without mutation.
- Malformed event history returns an empty or limited timeline with a
  non-secret issue summary.
- Unknown IDs fail clearly without event repair or rollback side effects.

## Deferred Risks

- event history can still be incomplete, malformed, or divergent
- no actor/reviewer attribution
- no signatures, hashes, or tamper-proof receipts
- no rollback/revert lifecycle
- no comment or close/merge lifecycle
- future event schema changes may require timeline compatibility rules

## Review Triggers

- making `history` mutate files, backfill events, or repair drift
- adding rollback, revert, restore, or undo commands
- adding actor/reviewer identity to event output
- adding signatures, hashes, or audit-grade proof claims
- changing whether target record memory may be shown in local history
- exposing full migration/export payloads from `history`
