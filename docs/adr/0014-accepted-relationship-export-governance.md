# ADR-0014: Accepted Relationship Export Governance

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0013 added declared `supersedes` and `conflicts_with` metadata as a
write-side review gate. That gate prevents automatic acceptance, but it does
not prevent a maintainer from accepting both sides of a relationship.

Export writes accepted memory into a destination that future agents may read as
context. That makes export a trust boundary. Phase 3E tightens that boundary
for the specific case where the accepted export set for one destination contains
both sides of a declared conflict or supersession relationship.

The risk is overclaiming again. Export blocking is not automatic conflict
resolution, read-side filtering, graph analysis, or active retirement. It is a
fail-closed check before writing accepted memory to a destination.

## Decision

For each `mempr export --destination <path>` request, MemPR evaluates accepted
records for that exact destination. Export must block when the target accepted
set contains both sides of either relationship:

- Conflict: an accepted target record's `conflicts_with` includes another
  accepted target record ID.
- Supersession: an accepted target record's `supersedes` includes another
  accepted target record ID that is still accepted in the same destination.

Blocking is destination-scoped. Linked records that are `pending`, `rejected`,
or accepted for another destination do not block the requested export.

Relationship export errors may include the relationship type and involved
record IDs so maintainers can inspect or remediate the records. They must not
include memory text, source quotes, or other memory content.

Phase 3E does not choose a winner, remove one side from export, rewrite
relationships, filter reads, analyze relationship graphs or cycles, or retire
superseded accepted records. Maintainers must resolve the condition by changing
record status, destination, or relationship metadata through existing review
workflows.

## Options Considered

### Option A: Keep Relationship Metadata Export-Neutral

Pros:

- Keeps export behavior simpler.
- Avoids blocking maintainers who intentionally accepted both records.

Cons:

- Lets a destination receive accepted memories that explicitly say they conflict
  or that one replaces the other.
- Keeps the export boundary weaker than the relationship metadata implies.

### Option B: Block Accepted Relationship Pairs Per Destination

Pros:

- Prevents known contradictory or superseded accepted pairs from being written
  into the same destination.
- Keeps enforcement local to the export boundary and exact destination.
- Provides ID/type evidence without leaking memory content.

Cons:

- Export can fail until a maintainer resolves accepted relationship pairs.
- Does not decide which record should remain accepted.

### Option C: Automatically Resolve Or Retire Relationships

Pros:

- Could produce a cleaner exported view without manual intervention.
- Moves closer to read-side governance and lifecycle automation.

Cons:

- Too broad for Phase 3E.
- Requires conflict semantics, graph behavior, adapter policy, and retirement
  rules that are not designed yet.
- Risks silently changing accepted memory lifecycle through export.

## Consequences

- Export remains the trust boundary for accepted memory written into a
  destination.
- Accepted records with declared conflict or supersession links can coexist in
  the ledger, but they cannot both be exported to the same destination while the
  relationship still points between them.
- Pending, rejected, and other-destination linked records remain inspectable
  without blocking unrelated exports.
- Error evidence stays limited to record IDs and relationship type.
- Docs must avoid saying Phase 3E resolves, filters, analyzes, or retires
  memory.

## Verification

Phase 3E verification should cover:

- export blocking when accepted target records contain a `conflicts_with` link
  to each other
- export blocking when accepted target records contain a `supersedes` link to
  another accepted target record
- non-blocking behavior for linked `pending`, `rejected`, and
  other-destination records
- non-leaky error evidence containing record IDs and relationship type only
- continued export of unrelated accepted records after the relationship
  condition is remediated

## Deferred Risks

- automatic conflict resolution
- read-side conflict or supersession filtering
- relationship graph and cycle analysis
- active retirement of superseded accepted records
- destination-specific adapter policy for relationship conflicts

## Review Triggers

- changing export blocking criteria for `supersedes` or `conflicts_with`
- adding automatic conflict resolution or supersession retirement
- making relationship metadata affect reads
- changing relationship export error evidence or privacy rules
- adding graph or cycle analysis for relationship metadata
