# Phase 7H Permissioned Scope-Filtered Reads Council

**Date:** 2026-05-21
**Scope:** Narrow opt-in permissioned scope-filtered read constraint on
read-context only across source, tests, and docs.

## Goal

Implement and document Phase 7H as the smallest safe scope-permission
constraint: when, and only when, a caller supplies an explicit actor label and
allowed scopes, read-context output may be narrowed by permitted scope after the
existing Phase 7A destination, TTL, relationship, and normal scope-filtering
rules pass.

Existing reads stay unchanged when no explicit permission constraint is
supplied. Denials are no-content and no-side-effect. Phase 7H is not real
authentication, hosted authorization, OAuth, permission policy storage,
permissioned expiry filtering, permissioned conflict/supersession filtering,
scanning, redaction, live-store behavior, auth-backed permission enforcement,
or a security claim.

The execution-pipeline triad for this pass is: plan the narrow Phase 7H
contract, execute source/test/docs updates in scoped files, then adversarially
review for overclaims, side-effect ambiguity, content leakage, and accidental
future-feature capture. The council roles below act as local review sub-agents
for the slice.

Acceptance criteria:

- README and PRD describe Phase 7H as opt-in, read-context-only, and unchanged
  for existing reads unless an explicit actor label and allowed scopes are
  supplied.
- ADR-0025 defines the constraint order, no-content denials, no-side-effect
  denials, exact non-goals, Phase 7I expiry deferral, and Phase 7J
  conflict/supersession deferral.
- Source and contract code implement the opt-in constraint for read-context
  API, CLI, and MCP `mempr.context` only.
- Runtime tests cover default unchanged behavior, allowed-scope narrowing,
  missing/disallowed constraint denials, no content leakage, no side effects,
  and unchanged context-status behavior.
- ADR index includes ADR-0025 and keeps auth-backed permission enforcement
  deferred.
- Council evidence records initial scope, drafted-docs critique, and final
  preflight passes.
- Diff/rg checks do not claim runtime auth, policy storage, OAuth, live stores,
  scanning/redaction, expiry/conflict permission filtering, or security.

## Council Pass 1: Initial Scope

### Decision Being Tested

Phase 7H should implement a narrow opt-in permissioned scope-filtered
read-context constraint rather than implement real authentication-backed
authorization or absorb expiry/conflict permissioning.

### Council Review

Contrarian: The phrase "permissioned scope-filtered reads" can easily sound
like MemPR now authenticates actors or enforces policy. The docs must put
"opt-in", "read-context only", "existing reads unchanged", and "not real
authentication/authorization" close to every Phase 7H summary.

First Principles: The actual goal is not authentication. It is to prevent a
caller-supplied scope constraint from broadening read-context output, bypassing
Phase 7A blockers, or leaking denied content.

Expansionist: A crisp scope-only constraint gives later implementation a useful
minimum: scope can narrow context after blockers, while expiry and conflict
constraints remain separate phases.

Outsider: A maintainer should be able to tell that `context-status`, warnings,
export preview, confirmed export, list/history/inspect, and MCP metadata are
not covered by Phase 7H.

Executor: Implement the source constraint, add runtime and contract tests,
create ADR-0025, update README, PRD, ADR index, and this council note. Run
focused tests, full tests, rg, and diff checks after drafting.

### Consensus

Proceed with an opt-in Phase 7H runtime contract. Treat the permission
constraint as explicit, read-context-only, scope-narrowing only, after existing
blockers. Keep 7I for expiry and 7J for conflict/supersession.

## Council Pass 2: Drafted Docs Critique

### Decision Being Tested

The drafted source, tests, README, PRD, ADR-0025, ADR index, and council note
are precise enough to avoid implying authentication, hosted authorization, or
auth-backed permission enforcement.

### Council Review

Contrarian: The draft must avoid saying "permissions ship" or "authorization
checks run." It also needs denial privacy strong enough to avoid an existence
oracle.

First Principles: Scope permissioning is only coherent if exact destination,
accepted-only eligibility, TTL blockers, and relationship blockers still run
before any permission constraint can affect output.

Expansionist: Separating 7H from 7I and 7J keeps future permissioned expiry and
conflict behavior from sneaking into a scope-only phase.

Outsider: The docs are readable if "what changes now?" has the answer "only
read-context can be narrowed when the caller supplies an actor label and
allowed scopes; current reads do not change otherwise."

Executor: Ensure every summary names no-content/no-side-effect denials and the
non-goals: authentication, hosted authorization, OAuth, policy storage,
expiry/conflict filtering, scanning/redaction, live stores, and security
claims.

### Consensus

The draft is acceptable only if Phase 7H is consistently framed as a narrow
caller-supplied scope constraint and not a real authentication-backed
permission system. The PRD and ADR must make future 7I/7J boundaries explicit.

## Council Pass 3: Final Preflight

### Decision Being Tested

The Phase 7H implementation and documentation are ready to ship as a
constrained scope slice with no accidental auth, policy-storage, or security
claim.

### Council Review

Contrarian: Final checks must catch any wording that says Phase 7H adds auth,
OAuth, policy storage, expiry/conflict permission filtering, or security-grade
enforcement.

First Principles: The final decision is a narrow invariant: an explicit
caller-supplied constraint may only remove read-context records by scope and
must never leak denied content or create side effects.

Expansionist: The result creates a clean runway for runtime permission work
without mixing in expiry, conflict, redaction, live stores, or hosted
authorization.

Outsider: A reader should leave knowing that `context-status` and warnings are
not permissioned read results, and that existing reads still behave as before.

Executor: Run build, focused runtime/contract tests, full `npm test`, focused
`rg`, `git diff --check`, and scoped `git diff --stat` checks. Report residual
risks around missing real auth, policy storage, scanning/redaction, live stores,
and 7I/7J.

### Consensus

Phase 7H is ready if verification confirms source, tests, and docs repeat the
opt-in/read-context-only/no-content/no-side-effect boundary, default reads stay
unchanged, and auth-backed enforcement remains deferred.

## Verification Evidence

- `npm run build` passed.
- `npm run lint` passed.
- Focused read-context and MCP contract/runtime tests passed.
- `npm test` passed.
- `git diff --check -- README.md docs/prd.md docs/adr/README.md docs/adr/0025-permissioned-scope-filtered-reads.md docs/council/2026-05-21-phase-7h-permissioned-scope-filtered-reads-pass.md src/read-permissions.ts src/ledger.ts src/cli.ts src/mcp-contract.ts src/mcp-server.ts test/context.test.js test/mcp-contract.test.js test/mcp-readonly.test.js test/read-permissions.test.js test/cli.test.js`
  passed with no whitespace errors for tracked diffs.
- `rg -n "[ \t]+$" README.md docs/prd.md docs/adr/README.md docs/adr/0025-permissioned-scope-filtered-reads.md docs/council/2026-05-21-phase-7h-permissioned-scope-filtered-reads-pass.md`
  found no trailing whitespace in tracked or untracked target docs.
- Focused claim-boundary `rg` checks found no Phase 7H claim that it ships
  authentication, hosted authorization, OAuth, permission policy storage,
  auth-backed permission enforcement, permissioned expiry filtering, or
  permissioned conflict/supersession filtering.

## Residual Risks

- Readers may still overread "permissioned" as real auth-backed enforcement
  unless future docs keep "opt-in" and "not authentication/authorization"
  visible.
- Full permission enforcement still needs actor identity, auth/session
  handling, permission policy storage/evaluation, and logging boundaries.
- Denial evidence could become an existence oracle if future code exposes
  hidden record IDs, source quotes, memory text, or full payloads.
- Accepted records can still contain sensitive content because scanning and
  redaction remain deferred.
- Permissioned expiry and conflict/supersession behavior remain future 7I/7J
  decisions, not Phase 7H behavior.
