# Phase 7G Read Actor/Permission Contract Council

**Date:** 2026-05-21
**Scope:** Read actor and permission contract foundation for future permissioned
reads. Static contract plus docs/tests; no runtime enforcement.

## Goal

Define the future read actor and permission vocabulary without changing current
read behavior. Phase 7G must name caller/actor/reviewer identity, auth model,
permission dimensions, missing/denied behavior, evidence privacy, and remaining
prerequisites before permissioned reads can ship.

The execution-pipeline triad for this pass is: plan the static contract
foundation, execute source/docs/test updates, then adversarially review for
runtime overclaims, privacy leaks, and accidental enforcement scope. The council
roles below act as the local review sub-agents for the slice.

Acceptance criteria:

- README and PRD describe Phase 7G as a future contract foundation, not
  permission enforcement.
- ADR-0024 defines caller, actor, reviewer, auth model,
  action/resource/destination/scope permission dimensions, missing/denied
  behavior, evidence privacy, deferred prerequisites, and review triggers.
- ADR index includes ADR-0024 and keeps permissioned read enforcement deferred.
- Current `context`, `context-status`, Phase 7E warning, and MCP read behavior
  are explicitly unchanged.
- Source/test changes are limited to static contract metadata and boundary
  regressions.
- Diff and rg checks verify no runtime-enforcement claims.

## Council Pass 1: Scope Selection

### Decision Being Tested

Phase 7G should define a static read actor/permission contract foundation
rather than implement enforcement or leave actor semantics vague.

### Council Review

Contrarian: A permission contract can sound like permissions exist. The docs
must say "future" and "no enforcement" close to every Phase 7G summary.

First Principles: The missing primitive is not a permission check; it is a
stable definition of who is asking, on whose behalf, what action is requested,
which resource/destination/scope is involved, and what a denial may reveal.

Expansionist: A crisp contract now makes later permissioned reads easier to
implement safely because identity, auth, permission policy, and denied evidence
will already have entry criteria.

Outsider: A maintainer should be able to read the README and learn that nothing
about `context`, `context-status`, warnings, or MCP reads changes today.

Executor: Create ADR-0024, update README, PRD, ADR index, and this council
note, add a standalone source contract, and add tests that pin deferred
enforcement. Keep runtime read paths untouched.

### Consensus

Phase 7G is a static contract foundation. It should define
caller/actor/reviewer vocabulary, auth-before-authorization, permission
dimensions, deny-by-default missing/denied behavior, and evidence privacy while
preserving the Phase 7F non-enforcement boundary.

## Council Pass 2: Drafted Docs Review

### Decision Being Tested

The drafted README, PRD, ADR-0024, ADR index, and council updates are precise
enough to avoid implying current permissioned read behavior.

### Council Review

Contrarian: The strongest leak risk is denied-response evidence. If future
denials reveal hidden record IDs, memory text, source quotes, or full payloads,
permissioning becomes an oracle. The ADR needs a no-content denial rule.

First Principles: Authentication and authorization are distinct. A future actor
must be authenticated before a permission decision, and scope must remain a
dimension, not an identity.

Expansionist: The contract should cover `action`, `resource`, `destination`,
and `scope` because future reads will need more than a destination path or
record scope to decide access.

Outsider: The docs should not ask readers to infer that local stdio MCP
metadata is untrusted for permissioning. Say plainly that it is protocol
metadata only.

Executor: Patch the PRD matrix, behavior section, CLI/read-governance
requirements, security deferred controls, MCP section, acceptance criteria,
test/verification notes, implementation Phase 7 plan, open questions, ADR
index, ADR-0024, source contract, and tests until each repeats
"no runtime enforcement" in the relevant place.

### Consensus

The draft is acceptable only if it defines missing/denied outcomes as
deny-by-default, no-content responses and explicitly says Phase 7G changes no
current `context`, `context-status`, warning, or MCP read behavior.

## Council Pass 3: Final Preflight

### Decision Being Tested

The Phase 7G contract/docs/tests are ready to ship as a foundation slice with
no runtime permission claims.

### Council Review

Contrarian: Final checks must catch accidental runtime wiring and any wording
that says Phase 7G "adds permissions" without "future" or "contract-only"
context.

First Principles: The final state should make one narrow decision: future
permissioned reads have a vocabulary and evaluation shape, but enforcement is
still deferred.

Expansionist: This gives future ADRs a clean checklist for identity, auth,
policy storage, denial privacy, scanning/redaction, HTTP/OAuth, live stores,
audit/logging, and tests.

Outsider: The result is understandable if a reader can answer: who is the
future actor, what dimensions matter, what happens when identity or permission
is missing, what evidence can be shown, and what does not change today.

Executor: Run `rg`, focused diff, targeted tests, and full-suite checks, then
report residual risks.

### Consensus

Phase 7G is ready when docs and source define actor/permission foundations,
current read surfaces remain unchanged, permission enforcement remains
deferred, and tests confirm the contract is static.

## Residual Risks

- Readers may still overread "permission contract" as shipped permissioning
  unless future docs keep the contract-only language visible.
- Future denied-response schemas could accidentally leak inaccessible record
  existence unless evidence privacy remains a review gate.
- Current accepted records can still contain sensitive content because scanning
  and redaction remain deferred.
- Local stdio MCP metadata remains unsuitable as identity or authorization
  evidence.
- HTTP/OAuth, live-store reads, audit logging, and permission policy storage
  remain undecided.
