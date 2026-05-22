# ADR-0013: Conflict Supersession Review Gating

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0012 explicitly deferred conflict detection and supersession while Phase 3C
focused on export-time stale blocking. Phase 3D needs the smallest useful next
step: preserve declared conflict and supersession relationships on records and
make those relationships interrupt automatic acceptance.

The risk is overclaiming. A field named `supersedes` can sound like active
retirement, and a field named `conflicts_with` can sound like automatic conflict
resolution or read-side filtering. Phase 3D is a write-side review gate only.

## Decision

Memory records store two metadata arrays:

- `supersedes`: existing record IDs this proposal claims to replace.
- `conflicts_with`: existing record IDs this proposal claims to conflict with.

New proposals may declare existing record IDs in either array. Legacy records
missing either field normalize on read as:

- `supersedes: []`
- `conflicts_with: []`

Validation happens before append. A proposal is rejected before any record or
event is written when:

- any referenced record ID is unknown
- the same record ID appears in both `supersedes` and `conflicts_with`

Conflict and supersession metadata is policy-relevant only as a review gate. If
either array is non-empty, the proposal must not be automatically accepted. It
requires maintainer review even when the memory would otherwise be low risk.

Secret-like content and unsafe security-weakening standing instructions still
fail closed as rejections. Conflict or supersession metadata must not downgrade
those cases into review.

Phase 3D does not automatically resolve conflicts, filter conflicting records
from reads, or actively retire superseded accepted records. Existing accepted
records remain accepted until a maintainer changes their status through the
normal review lifecycle.

## Options Considered

### Option A: Keep Conflict And Supersession Deferred

Pros:

- Avoids adding schema fields before read governance exists.
- Keeps policy behavior simpler.

Cons:

- Maintainers cannot preserve explicit relationship intent on new proposals.
- Low-risk auto-accept could silently accept a proposal that claims to replace
  or contradict existing memory.

### Option B: Store Metadata And Require Review

Pros:

- Captures useful relationship evidence at write time.
- Prevents automatic acceptance of potentially disruptive memory changes.
- Keeps Phase 3D small and compatible with Phase 3C's deferred read-side scope.

Cons:

- Maintainers still have to resolve the relationship manually.
- Users may expect superseded accepted records to disappear unless docs are
  explicit.

### Option C: Resolve Conflicts And Retire Superseded Records Automatically

Pros:

- Produces a cleaner current view for some workflows.
- Moves closer to read-side governance.

Cons:

- Too broad for Phase 3D.
- Requires conflict semantics, read adapter behavior, and retirement policy that
  are not designed yet.
- Risks hiding accepted memory changes behind automatic lifecycle mutation.

## Consequences

- Records and proposal events carry `supersedes` and `conflicts_with` arrays.
- Legacy records remain readable through empty-array normalization.
- Relationship references must point at known records and must not overlap.
- Any declared relationship forces maintainer review unless safety policy
  rejects the proposal first.
- Docs must avoid saying that Phase 3D resolves, filters, or retires memory.

## Verification

Phase 3D verification should cover:

- new-record storage for empty and non-empty metadata arrays
- legacy normalization for missing fields
- rejection before append for unknown references
- rejection before append for overlapping supersedes/conflicts references
- review gating for otherwise low-risk proposals with relationship metadata
- continued rejection for secret-like or unsafe proposals with metadata

## Deferred Risks

- read-side conflict filtering
- active retirement of superseded accepted records
- conflict-resolution UI or diff workflow
- graph/cycle analysis across supersession chains
- destination adapter behavior for conflicting memories

## Review Triggers

- changing `supersedes` or `conflicts_with` schema shape
- making relationship metadata affect export or read filtering
- automatically changing existing record status because of supersession
- adding conflict-resolution or retirement behavior
- changing validation order or error evidence for reference failures
