# Remaining Backlog Solidification Council

**Date:** 2026-05-22
**Scope:** Consolidate all known deferred MemPR work after Phase 7L into an
ordered backlog with dependencies, review gates, and claim boundaries.

## Goal

Turn the deferred backlog from a loose list of future risks into a durable
project map. The result must distinguish original completed slices from future
work, avoid inventing an automatic `7M`, and make it clear which items require
new ADRs before implementation.

Acceptance criteria:

- PRD section 19 names the remaining backlog after Phase 7L.
- ADR index points future ADRs at the consolidated backlog streams.
- The backlog orders identity, policy, enforcement, diagnostics, scanning,
  live adapters, HTTP/OAuth, and release hardening with explicit dependencies.
- Scope-change items are separated from normal backlog work.
- No deferred item is described as shipped behavior.

## Council Pass 1: Inventory And Status Hygiene

### Decision Being Tested

The backlog should be rounded up from the PRD, ADR index, and Phase 7 deferred
lists without treating all deferred ideas as already planned slices.

### Council Review

Contrarian: If the backlog becomes another giant future-features paragraph, it
will be stale immediately. If it becomes `7M`, `7N`, and so on by default, it
will imply permissioned-read implementation was already approved.

First Principles: The project needs one status truth: what is shipped, what is
planned backlog, what is blocked by ADRs, and what would change product scope.

Expansionist: A consolidated backlog can make the next planning pass faster
because every deferred risk has an owner stream and dependency.

Outsider: A new maintainer should not need to infer that auth, redaction,
remote MCP, and live adapters are separate projects.

Executor: Replace loose "later deliverables" with named R-streams and point ADR
backlog readers at the PRD.

### Consensus

Create an explicit post-7L backlog. Do not call the next item `7M` until a new
phase map chooses that name.

## Council Pass 2: Dependency Ordering

### Decision Being Tested

The backlog order should prevent insecure implementation sequencing.

### Council Review

Contrarian: Permission enforcement before identity and policy storage creates
fake security. Remote HTTP/OAuth before local trust semantics creates a bigger
attack surface around unclear guarantees.

First Principles: Authorization needs a verified subject, a policy source, an
evaluation rule, an enforcement point, and safe denial evidence. Missing any
one of those should keep runtime enforcement deferred.

Expansionist: Splitting audit proof, identity, policy, enforcement, diagnostics,
and redaction gives the project room to ship smaller credible increments.

Outsider: The backlog should say which work unlocks which other work.

Executor: Order R1 audit proof, R2 source trust, R3 identity, R4 policy, R5
enforcement, R6 diagnostics, R7 scanning, R8 relationships, R9 live adapters,
R10 HTTP/OAuth, and R11 release hardening.

### Consensus

Adopt dependency-ordered R-streams. R3 and R4 must precede auth-backed
enforcement; R10 must not precede the identity/policy/enforcement decisions.

## Council Pass 3: Security And Privacy Boundary

### Decision Being Tested

The backlog descriptions should preserve current non-leaky behavior and avoid
security/compliance overclaims.

### Council Review

Contrarian: Diagnostics, logs, policy traces, scanning, and live adapters are
the easiest places to leak hidden record existence, actor secrets, grants, or
source quotes.

First Principles: MemPR can only claim what it can prove with local records,
tests, and reviewable state. Anything involving identity, auth, redaction, or
remote credentials needs explicit proof boundaries.

Expansionist: Naming privacy constraints now gives future ADRs a checklist:
what must not leak, where side effects are allowed, and which claims remain
off-limits.

Outsider: A user should understand that deferred means "not safe to claim yet,"
not "quietly implemented."

Executor: Add no-content/no-side-effect and no-security-claim language to the
R-streams that could otherwise widen behavior.

### Consensus

Every stream that touches auth, diagnostics, scanning, live adapters, or
remote transport must carry its claim boundary and privacy constraints.

## Council Pass 4: Release And Scope Discipline

### Decision Being Tested

The backlog should separate normal completion work from product-scope changes.

### Council Review

Contrarian: Retrieval ranking, embeddings, hosted service, and multi-user UI
are tempting but could turn MemPR from local write governance into a different
product.

First Principles: Mature release is about credible packaging and support for
the chosen scope, not completing every speculative future capability.

Expansionist: A scope-change bucket lets the project grow later without
smuggling new product identity into the core roadmap.

Outsider: "1.0" should mean the current local-first promise is stable, not that
every deferred research idea shipped.

Executor: Keep R11 as release hardening and put retrieval, hosted, multi-user,
model-assisted, third-party security, and compliance-grade claims behind
product-scope ADRs.

### Consensus

The normal backlog ends at release hardening. Scope-change work requires a
fresh product ADR before implementation.

## Final Consensus

The remaining work after Phase 7L is now solidified as R1-R11:

- R1 audit integrity and replay proof
- R2 source-trust scoring and policy-version proof
- R3 actor, reviewer, and caller identity foundation
- R4 permission policy storage and evaluation
- R5 auth-backed read enforcement
- R6 denied-response diagnostics, logging, and audit boundaries
- R7 scanning and redaction
- R8 relationship lifecycle and graph policy
- R9 live store and workflow adapters
- R10 remote MCP HTTP/OAuth transport
- R11 release hardening and project completion

This is a backlog map, not shipped behavior. Each stream requires its own ADR,
tests, and council review before runtime implementation. Scope-changing work
such as vector search, hosted service, multi-user approvals, model-assisted
classification, third-party security guarantees, or compliance-grade audit
claims is outside the default backlog until a product-scope ADR accepts it.

## Verification Evidence

- PRD section 19 now includes the post-7L R-stream backlog, dependencies, and
  scope-change bucket.
- ADR index deferred backlog now points to the PRD and summarizes R1-R11.
- The old loose "Later Phase 7 deliverables" list has been replaced by the
  consolidated backlog.
- Follow-up checks should confirm no backlog item is described as shipped
  behavior and no automatic `7M` implementation slice is introduced.

## Residual Risks

- R-stream sizes may need to be split further when implementation starts.
- Future council passes may reorder streams after deeper research.
- Public docs must keep saying that auth-backed enforcement, redaction,
  remote MCP, and live adapters are deferred until their ADRs exist.
