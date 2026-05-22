# Phase 3D Conflict Supersession Pass Council

**Date:** 2026-05-21
**Scope:** Conflict/supersession metadata, review gating, and documentation.

## Goal

Document Phase 3D so MemPR can record declared relationship metadata and require
maintainer review without claiming automatic resolution, read-side filtering, or
active retirement of accepted records.

## Council Pass 1: Before Drafting

### Contrarian

The dangerous claim is that `supersedes` means an existing accepted record is
retired. It does not. If docs imply that, maintainers may trust stale or
contradictory memory behavior that has not been implemented.

### First Principles

The minimum coherent workflow is write-side: preserve proposer intent, validate
that referenced records exist, and force human review when a proposal declares a
relationship to existing memory.

### Expansionist

This metadata can later support diffs, read-side conflict filtering,
supersession chains, and adapter warnings. Keeping the shape explicit now makes
those future capabilities easier.

### Outsider

A normal maintainer will ask: if record B supersedes record A, does A disappear?
The answer must be plainly no.

### Executor

Add ADR-0013, update the PRD, update the ADR index and README, then run stale
mention and diff checks for accidental overclaiming.

## Council Pass 2: After Drafting

### Contrarian

Unknown references and overlapping relationship arrays need to be named as
pre-append failures. Otherwise the ledger can preserve misleading metadata that
points nowhere or says the same record is both replaced and conflicted.

### First Principles

Relationship metadata is a reason to interrupt automation, not a reason to
trust the proposal. Safety policy still has to reject secrets and unsafe
standing instructions.

### Expansionist

Review gating gives future UI work a clear hook: records with non-empty
relationship arrays can be grouped for maintainer attention without designing a
full conflict resolver now.

### Outsider

The phrase "conflict detection" is easy to confuse with "conflict resolution."
Docs should say "declared conflict metadata" or "relationship metadata" where
possible.

### Executor

Keep Phase 3D in the policy/schema sections, add test expectations, and leave
read-side governance in Phase 7.

## Council Pass 3: Final Review

### Contrarian

The README should not promise CLI flags or shipped behavior beyond the current
surface unless implementation workers have landed that support. It should focus
on record meaning and limitations.

### First Principles

The invariant is simple: non-empty relationship metadata means no automatic
acceptance; unsafe or secret-like content still rejects.

### Expansionist

The ADR can serve as a later review trigger for retirement or read filtering
without reopening TTL/source-trust decisions.

### Outsider

The limitations section needs to say that accepted records remain accepted until
maintainer action. That is the plainest way to prevent mistaken expectations.

### Executor

Finalize docs after checking stale deferral language, markdown structure, and
diff scope. Do not touch source or tests in this docs/review worker pass.

## Consensus

Phase 3D should be documented as relationship metadata plus review gating. It
validates references before append and blocks auto-accept when relationships are
declared, but it does not resolve conflicts, filter reads, or retire accepted
records.

## Residual Risks

- Implementation and tests may still be in progress outside this docs worker.
- Docs now define expected behavior, but runtime verification must come from the
  Phase 3D implementation worker.
- Future read-side governance still needs separate design for filtering,
  conflict resolution, and supersession retirement.
