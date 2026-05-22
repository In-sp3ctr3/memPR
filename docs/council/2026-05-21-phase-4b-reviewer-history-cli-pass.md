# Phase 4B Reviewer History CLI Council

**Date:** 2026-05-21
**Scope:** Phase 4B reviewer history CLI documentation.

## Goal

Document `history <id> [--json]` as a read-only local reviewer timeline backed
by `.mempr/events.jsonl`, without overclaiming rollback, repair, identity,
signatures, hashes, comments, lifecycle, or audit-grade proof.

## Acceptance Criteria

- `history <id> [--json]` is documented as read-only.
- The timeline is backed by `.mempr/events.jsonl`.
- Output includes current target record state.
- Output summarizes proposal, status-change, export, and migration/backfill
  event participation for the target record.
- The target record memory may appear because history is explicit local review.
- Unrelated migrated/exported record content is not dumped.
- Missing or malformed event history is an empty or limited timeline with
  non-secret issue details, not rollback or repair.
- Deferred scope is explicit: no rollback/revert, actor/reviewer identity,
  signatures, hashes, comments, merge/close lifecycle, or audit-grade proof.

## Council Pass 1: Before Drafting

### Contrarian

The biggest documentation failure would be making `history` sound like an
authoritative audit log or recovery command. Event files can be incomplete, so
the docs must not imply proof, rollback, repair, or truth.

### First Principles

The real job is record-local explanation: given one memory ID, show the current
record state and the local events that mention that record.

### Expansionist

A focused timeline creates a future path for stronger audit work later because
it separates event participation shape from identity, signatures, hashes, and
repair semantics.

### Outsider

`history` should feel like "what happened to this record?" not "fix my store."
If events are missing, a normal maintainer should see limited history, not a
surprising mutation.

### Executor

Add ADR-0016, index it, update README and PRD command/phase/test language, and
verify wording for privacy, rollback, repair, and audit overclaims.

## Council Pass 2: After Drafting

### Contrarian

The draft needs to avoid saying export or migration entries show full payloads.
Those events can reference many records, so the command should summarize target
participation and withhold unrelated memory content.

### First Principles

The current record state belongs in the output because event history may be
missing or partial; users need to distinguish present state from observed
timeline evidence.

### Expansionist

JSON output should be stable enough for automation, but not so broad that it
locks MemPR into exposing raw event internals as a public contract.

### Outsider

The README should place `history` next to reviewer commands and contrast it
plainly with `check` and `migrate`, so users know it inspects rather than fixes.

### Executor

Revise any broad "audit trail" language to "timeline" or "event
participation," keep non-goals close to the feature description, then run
workspace checks.

## Council Pass 3: Final Review

### Contrarian

The remaining risk is implementation drift: a later implementation could
accidentally print unrelated migrated records or treat missing history as a
reason to mutate files. Tests must pin those edges.

### First Principles

Phase 4B is done when a maintainer can inspect one record's local timeline
without changing the store and without receiving unrelated memory content.

### Expansionist

ADR-0016 gives future audit-grade work clean review triggers: identity, hashes,
signatures, rollback, and raw event disclosure each require a separate decision.

### Outsider

The docs now make a simple distinction: `diff` is for review context, `history`
is for event timeline, `check` is for consistency, and `migrate` is for
backfill.

### Executor

Finalize after recording grep, diff, whitespace, markdown-tool availability, and
test evidence.

## Integration Council Pass

### Contrarian

Docs that say malformed history returns a limited timeline are misleading unless
the CLI actually returns current record state with a sanitized issue.

### First Principles

The maintainer asked for one record's available history. A broken event file
does not erase the current record, and it should not force repair or migration.

### Expansionist

Adding a small `issues` array to history JSON creates room for future event
health details without exposing raw event payloads.

### Outsider

The text output should make the limitation obvious: there was an event issue,
and no events are available for this record.

### Executor

Return `{ record, events, issues }`, add malformed-event tests, and update PRD
and README wording from expected Phase 4B behavior to shipped behavior.

## Consensus

Phase 4B should add a narrow, read-only `history <id> [--json]` command. It
should show current target record state and summarized event participation from
`.mempr/events.jsonl`, allow the target memory to appear in explicit local
history, avoid unrelated migrated/exported memory dumps, and treat missing or
malformed history as limited evidence rather than repair or rollback.

## Residual Risks

- Event history may still be partial, missing, malformed, or divergent.
- Future implementation must preserve the privacy boundary around export and
  migration events.
- Audit-grade guarantees remain deferred until identity, signatures, hashes,
  stronger transactions, and tamper evidence are designed.
