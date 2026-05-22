# Phase 7J Permissioned Conflict/Supersession Constraints Council

**Date:** 2026-05-21
**Scope:** Docs and ADR pass for narrow opt-in read-context-only
conflict/supersession exclusion constraints.

## Goal

Document Phase 7J as the smallest safe relationship permission constraint:
when, and only when, a read-context caller supplies explicit relationship
exclude flags, returned records may be narrowed after existing hard
expired-record blockers, accepted relationship blockers, scope filtering, and
expiry narrowing pass.

The integration council settled the API shape for this documentation slice:

- API/nested read permission: optional
  `readPermission.excludeConflicts` and
  `readPermission.excludeSupersedes`
- CLI: `--read-exclude-conflicts` and `--read-exclude-supersedes` with the
  explicit read actor and allowed-scope flags
- MCP `mempr.context`: `readPermission.excludeConflicts` and
  `readPermission.excludeSupersedes` only inside `readPermission`

Phase 7J uses own-record metadata only. `excludeConflicts` removes otherwise
eligible records whose own `conflicts_with` array is non-empty.
`excludeSupersedes` removes otherwise eligible records whose own `supersedes`
array is non-empty. Existing reads stay unchanged when both fields are absent.
Phase 7J is not real authentication, hosted authorization, OAuth, permission
policy storage, auth-backed permission enforcement, graph traversal,
incoming-link policy, automatic conflict resolution, active retirement,
scanning, redaction, live-store behavior, export/status/resource behavior
change, or a security claim.

Acceptance criteria:

- README and PRD describe Phase 7J as opt-in, read-context-only, and unchanged
  when relationship exclude flags are absent.
- ADR-0027 defines the API shape: nested/API/MCP
  `readPermission.excludeConflicts` and
  `readPermission.excludeSupersedes`, plus CLI
  `--read-exclude-conflicts` and `--read-exclude-supersedes`.
- Docs preserve blocker/filter order: hard expired-record blockers and
  accepted relationship blockers first, existing scope and `validUntil`
  narrowing next, then Phase 7J relationship narrowing.
- Docs state the own-record metadata rule and exclude graph traversal,
  incoming-link analysis, automatic resolution, active retirement, and
  redaction.
- Docs state malformed fields fail closed with no returned memory content and
  no side effects.
- Docs explicitly keep `context-status`, MCP resources, export preview,
  confirmed export, list/history/inspect, raw ledger/event projections,
  arbitrary resources, and live stores unaffected.
- Docs explicitly exclude real auth/OAuth, stored permission policy,
  writes/events, scanning/redaction, auth-backed enforcement, and
  security/compliance claims.
- ADR index includes ADR-0027 and removes stale Phase 7J deferrals only where
  this slice now owns the decision.

## Council Pass 1: Initial Scope

### Decision Being Tested

Phase 7J should document opt-in read-context relationship exclusion flags based
on own-record metadata, rather than graph traversal, active retirement, or
auth-backed relationship policy.

### Council Review

Contrarian: Relationship filtering is easy to overclaim. If the docs imply
MemPR knows which record should win, the feature becomes conflict resolution by
another name.

First Principles: The invariant is blocker precedence. Existing accepted
same-destination conflict/supersession pairs block context assembly before a
permission filter can hide them.

Expansionist: A small own-record exclusion flag gives callers useful local
control without committing to graph semantics too early. It also creates a
clear test path for future policy engines.

Outsider: A reader needs concrete behavior. "Exclude conflicts" should say it
removes records with their own `conflicts_with` array, not records merely
referenced by someone else.

Executor: Write ADR-0027, add the council note, update README, PRD, and ADR
index only. Keep status, resources, export preview, confirmed export, and
list/history/inspect explicitly unaffected.

### Consensus

Proceed with own-record, opt-in read-context-only exclusion flags. Do not add
graph traversal, incoming-link analysis, redaction, auth, stored policy,
writes/events, export/status/resource behavior changes, or security claims.

## Council Pass 2: Drafted Docs Critique

### Decision Being Tested

The drafted docs are precise enough to prevent Phase 7J from being mistaken for
relationship resolution, active retirement, or auth-backed permission
enforcement.

### Council Review

Contrarian: The phrase "permissioned conflict/supersession" still sounds
stronger than the slice. Every surface needs nearby "opt-in", "own-record", and
"no auth/stored policy" language.

First Principles: The filter must run after Phase 7H and Phase 7I narrowing.
Otherwise a relationship flag could become a way to alter blocker or scope
evidence.

Expansionist: Keeping malformed fields fail-closed gives future implementers a
stable denial contract before richer permission policy exists.

Outsider: The unaffected surfaces should be named, not implied:
`context-status`, MCP resources, export preview, confirmed export, and
list/history/inspect.

Executor: Revise stale Phase 7J deferrals into implemented-slice language, but
leave future-looking auth, graph, redaction, live-store, and active-retirement
items deferred.

### Consensus

The docs are acceptable if they consistently say default unchanged, nested
`readPermission` fields, actor plus allowed scopes still required, hard
blockers first, scope/expiry before relationship filtering, own-record metadata
only, malformed fields fail closed, and unaffected surfaces stay unaffected.

## Council Pass 3: Final Preflight

### Decision Being Tested

The Phase 7J documentation is ready to land without widening runtime claims or
colliding with adjacent Phase 7H/7I contracts.

### Council Review

Contrarian: Final checks must catch stale "future Phase 7J" language in places
where this slice now exists, and also catch any accidental claim that Phase 7J
adds auth, graph policy, redaction, writes/events, or export changes.

First Principles: The final contract is a narrowing rule over an already
successful read-context result: blockers first, scope and expiry next,
relationship exclusion last.

Expansionist: This gives implementers a bounded runtime target while preserving
space for future graph resolution, active retirement, and auth-backed
relationship policy.

Outsider: A maintainer should be able to answer "what changes now?" with:
"only explicitly constrained read-context responses can omit records that
declare their own conflicts or supersedes metadata; everything else is
unchanged."

Executor: Run scoped `rg` checks for stale Phase 7J deferrals and claim
boundaries, then `git diff --check` on the allowed docs paths. Report any
source or test gap honestly because this worker is docs-only.

### Consensus

Phase 7J is ready if verification confirms the docs stay inside the
read-context-only own-record relationship exclusion boundary, preserve hard
blockers and prior filters, keep malformed fields fail-closed, and avoid
auth/security/storage/graph/redaction/export/status/resource overclaims.

## Final Consensus

Accept ADR-0027. Phase 7J is a narrow opt-in read-context-only constraint using
`readPermission.excludeConflicts` and
`readPermission.excludeSupersedes`, plus matching CLI flags, with actor and
allowed scopes still required. Default reads remain unchanged. Existing hard
expired-record and accepted relationship blockers run first, then scope and
`validUntil` filtering, then own-record relationship exclusion. Malformed
fields fail closed with no memory content and no side effects. The slice does
not add graph traversal, incoming-link analysis, redaction, authentication,
stored permission policy, writes/events, export changes, status/resource
changes, list/history/inspect changes, live-store behavior, or security claims.

## Verification Evidence

- Documentation-only scope honored; no source or tests were changed by this
  worker.
- README, PRD, ADR index, ADR-0027, and this council note were updated.
- Focused docs `rg` checks should confirm stale Phase 7J deferrals were revised
  where this slice now owns the decision, while future auth/graph/redaction/live
  store deferrals remain.
- Final whitespace checks should run on the allowed docs paths.

## Residual Risks

- Runtime source and tests must still be implemented or reviewed by source/test
  workers to match the documented Phase 7J contract.
- Readers may still overread "permissioned" as real auth-backed enforcement
  unless future docs keep the opt-in/non-auth language visible.
- Own-record filtering intentionally does not remove records that are only
  referenced by another record.
- Graph traversal, active retirement, and conflict resolution remain future
  relationship-policy decisions.
- Accepted records can still contain sensitive content because scanning and
  redaction remain deferred.
