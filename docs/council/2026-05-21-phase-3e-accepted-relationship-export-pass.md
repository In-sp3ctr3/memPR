# Phase 3E Accepted Relationship Export Pass Council

**Date:** 2026-05-21
**Scope:** Accepted relationship export blocking and documentation.

## Goal

Document Phase 3E so MemPR treats export as the trust boundary for accepted
memory written into a destination and blocks same-destination accepted conflict
or supersession pairs without claiming automatic resolution.

## Acceptance Criteria

- Export blocks when accepted records for the requested destination contain both
  sides of a declared conflict relationship.
- Export blocks when accepted records for the requested destination contain both
  sides of a declared supersession relationship and the superseded record is
  still accepted in that destination.
- Pending, rejected, and other-destination linked records do not block export.
- Error evidence is limited to record IDs and relationship type.
- Docs do not claim automatic conflict resolution, read-side filtering,
  graph/cycle analysis, or active retirement.

## Council Pass 1: Before Drafting

### Contrarian

The dangerous failure mode is exporting two accepted memories that already
declare they cannot safely coexist in the same destination. If docs only say
relationships require review, maintainers may assume export is still safe after
both sides are accepted.

### First Principles

The minimum coherent rule is destination-local: assemble accepted records for
the requested destination, detect direct declared relationship pairs inside that
set, and fail before writing.

### Expansionist

This preserves a future path to adapter warnings, conflict-resolution UI, and
read-side context assembly because export errors can already report typed record
pairs.

### Outsider

A normal maintainer needs to know why a record accepted elsewhere does not block
this export. The answer is exact destination scope.

### Executor

Add ADR-0014, index it, update README and PRD behavior sections, then verify
the docs for overclaims and leak-prone wording.

## Council Pass 2: After Drafting

### Contrarian

The draft must distinguish conflict links from supersession links. A
`conflicts_with` link means both accepted target records should not be exported
together. A `supersedes` link means export must stop only when the superseded
record is still accepted in the same destination.

### First Principles

Relationship export blocking is evidence-based fail-closed behavior at the
write-to-destination boundary. It is not proof that either memory is true or
false.

### Expansionist

Keeping error evidence to IDs and type gives future tooling enough structure to
offer remediation while preserving the existing privacy posture from TTL errors.

### Outsider

The phrase "both sides" can sound like graph analysis. The docs should define it
as a direct pointer from one accepted target record to another accepted target
record.

### Executor

Check that ADR, PRD, and README all state destination scope, non-leaky evidence,
and deferred resolution behavior in the same terms.

## Council Pass 3: Final Review

### Contrarian

The README limitations section must not bury the fact that accepted relationship
pairs now affect export. Otherwise users may read only the short limitation and
think relationships remain policy-only.

### First Principles

The invariant is simple: no destination should receive accepted records where a
direct accepted relationship says one conflicts with or supersedes another
accepted record in that same destination.

### Expansionist

ADR-0014 becomes the review trigger for future graph/cycle analysis, read-side
filtering, and active retirement without reopening Phase 3D review-gating
semantics.

### Outsider

The maintainer remediation path should be understandable: change status,
destination, or relationship metadata through normal review workflows.

### Executor

Finalize after running docs grep checks, markdown/diff checks, and the practical
test command. Do not edit source or test files in this worker pass.

## Consensus

Phase 3E should be documented as export-time accepted-relationship governance.
It blocks direct accepted conflict and supersession pairs only within the
requested destination, reports IDs/type only, and leaves resolution to
maintainers.

## Residual Risks

- Implementation and tests may be changing concurrently outside this docs
  worker.
- The rule is direct-pair only; relationship graph and cycle behavior remains
  deliberately deferred.
- Destination-specific adapters may need stronger policy once they are designed.
