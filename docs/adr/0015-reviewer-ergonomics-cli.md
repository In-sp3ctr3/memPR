# ADR-0015: Reviewer Ergonomics CLI

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

MemPR uses Memory PR language, but the shipped runtime is still a local memory
record lifecycle: `pending`, `accepted`, and `rejected`. Phase 4 should make
maintainer review easier without claiming a full pull-request lifecycle or
introducing hosted collaboration concepts.

The current `list`, `accept`, and `reject` commands are enough to operate the
state machine, but they make review clumsy once pending records include TTL,
risk, destination, and relationship metadata. Reviewers need a queue, a local
record view, and one explicit decision command that wraps the existing status
transitions.

Phase 4 is therefore reviewer ergonomics, not merge infrastructure.

## Decision

Phase 4 adds three local CLI affordances:

- `inbox [--risk low|medium|high] [--destination <path>] [--json]` lists
  pending records only. It supports risk and destination filtering and returns
  structured output when JSON is requested.
- `diff <id> [--json]` shows a local review view for one memory record. The
  view includes the record's proposed memory details and direct relationship
  context for `supersedes` and `conflicts_with`.
- `review <id> --accept|--reject --reason <text> [--json]` chooses an explicit
  review mode and delegates to the same status-transition rules used by
  `accept` and `reject`.

Existing `accept <id> [--reason <text>]` and `reject <id> [--reason <text>]`
remain supported for compatibility and scripts.

Relationship context in `diff <id>` may include memory content. That is allowed
because `diff` is an explicit local review command for a specific record.
Non-leaky behavior still applies to export blocking errors, malformed metadata
errors, malformed config errors, and other terminal failures that do not
represent an intentional review view.

## Non-Goals

Phase 4 does not add:

- actor or reviewer identity
- comments or reviewer note threads
- merge, close, reopen, or rollback lifecycle commands
- hosted review UI or collaboration
- interactive prompts or confirmations
- destination-specific adapters
- read-side governance or automatic conflict resolution

## Options Considered

### Option A: Keep Only `list`, `accept`, And `reject`

Pros:

- No new command surface.
- Existing scripts remain unchanged.

Cons:

- Pending review stays awkward as metadata grows.
- Relationship context is hard to inspect without reading raw ledger files.
- The CLI still lacks an obvious "show me what needs review" path.

### Option B: Add Full PR Lifecycle Commands

Pros:

- Aligns more literally with Memory PR language.
- Could support future comments, close states, and merge semantics.

Cons:

- Overclaims the current product.
- Requires identity, comments, and lifecycle design that Phase 4 is not
  shipping.
- Risks confusing record acceptance with code-review merge semantics.

### Option C: Add Local Reviewer Ergonomics

Pros:

- Gives maintainers the missing queue, detail view, and explicit decision verb.
- Reuses the existing `pending` / `accepted` / `rejected` state machine.
- Keeps compatibility with `accept` and `reject`.
- Preserves the privacy boundary between intentional local review and
  non-leaky errors.

Cons:

- The Memory PR metaphor remains only partial.
- Future hosted review or comment systems will need a separate ADR.

## Consequences

- Runtime docs can describe Phase 4 as reviewer ergonomics, not a full PR
  lifecycle.
- `inbox` becomes the preferred pending-review queue while `list` remains the
  general inspection command.
- `diff` is allowed to show memory content and relationship context because the
  reviewer requested a local record view.
- `review --accept|--reject` becomes the ergonomic decision command without
  replacing legacy `accept` and `reject`.
- JSON support must be consistent with the existing CLI global JSON behavior.

## Verification

Phase 4 verification should cover:

- `inbox` lists only pending records.
- `inbox` filters by risk and destination.
- `inbox --json` returns structured pending records.
- `diff <id>` shows one record and direct relationship context.
- `diff <id> --json` returns structured review details.
- `review <id> --accept --reason <text>` applies the same acceptance rules as
  `accept`.
- `review <id> --reject --reason <text>` applies the same rejection rules as
  `reject`.
- `accept` and `reject` continue to work.
- `diff` can show relationship memory content, while export/blocking errors
  remain non-leaky.

## Deferred Risks

- reviewer identity and attribution
- comment threads or reviewer notes
- hosted or multi-user review UI
- merge, close, reopen, rollback, or supersession retirement lifecycle
- interactive prompts and confirmations
- relationship graph analysis and read-side filtering

## Review Triggers

- adding reviewer identity, comments, or hosted review
- adding merge, close, reopen, rollback, or other PR lifecycle commands
- changing whether `diff` may show related memory content
- changing JSON output contracts for reviewer commands
- replacing `accept` and `reject` instead of preserving compatibility
