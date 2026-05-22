# ADR-0023: Permissioned Read-Governance Boundary

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0018 defined local read-context assembly for one exact destination. ADR-0019
and ADR-0020 exposed that same assembly through local stdio MCP tools and
constrained resources/templates. ADR-0021 added content-free destination status,
and ADR-0022 added non-blocking expiry warnings.

Those surfaces are useful prerequisites for future permissioned reads, but they
are not permissioned reads. Scope filtering can reduce returned accepted
records after blockers pass. Status can report destination readiness without
memory text. Warnings can identify accepted records approaching expiry. None of
those behaviors identifies a caller, authenticates a session, authorizes access,
enforces permissions, scans or redacts content, or proves security.

Phase 7F exists to bind that boundary before later implementation work uses the
phrase "read governance" too broadly.

## Decision

Phase 7F is a permissioned read-governance boundary and prerequisite slice. It
adds documentation, contract metadata, and regression tests, but no runtime
permission enforcement.

The Phase 7F contract is:

- Do not add command behavior, API operations, MCP tools/resources, permission
  checks, auth decisions, OAuth scopes, events, ledger mutations,
  destination-file side effects, scanning behavior, redaction behavior,
  HTTP/OAuth behavior, live-store behavior, or runtime scope checks.
- Treat local stdio MCP scope metadata as protocol metadata only, not runtime
  authorization or permission enforcement.
- Treat scope filtering as post-blocker presentation-time selection only.
  Scope filtering is not actor identity, authorization, permission semantics,
  enforcement, security, or compliance evidence.
- Treat read-context status as content-free destination readiness and blocker
  observability only. Status is not authentication, authorization,
  permissioning, enforcement, truth validation, safety validation,
  non-sensitivity proof, redaction proof, or security.
- Treat Phase 7E expiry warnings as non-blocking advisory metadata only.
  Warnings are not freshness proof, authorization, permissioning, enforcement,
  truth validation, safety validation, non-sensitivity proof, redaction proof,
  or security.
- Keep accepted sensitive content as an explicit residual risk until separate
  scanning and redaction decisions exist.

Permissioned reads remain deferred until separate ADRs define at least:

- actor/caller identity and, if read approvals depend on humans, reviewer
  identity
- auth model and transport/session boundary
- permission semantics for subjects, actions, resources, destinations, scopes,
  deny/allow precedence, and missing identity
- whether permissions interact with TTL blockers, relationship blockers, scope
  filters, status, and warnings
- scanning and redaction requirements for returned context and evidence
- remote MCP HTTP/OAuth stance, including whether OAuth scopes are meaningful
  for read authorization
- live-store boundaries, including local ledger authority, downstream IDs,
  remote reads, cache behavior, and arbitrary resource passthrough
- non-leaky evidence/error contracts and verification tests

Until those decisions exist, MemPR docs and UI should describe current
read-context surfaces as local assembly, status, and advisory metadata rather
than permissioned read enforcement.

## Options Considered

### Option A: Implement Permissioned Reads Now

Pros:

- Could provide identity-aware and scope-aware read access sooner.
- Would align the "read governance" phrase with a stronger enforcement model.

Cons:

- Requires actor identity, authentication, permission semantics, enforcement
  boundaries, redaction/scanning choices, and likely remote transport rules that
  MemPR has not designed yet.
- Risks turning local stdio selectors and metadata into misleading security
  claims.
- Would require identity, authorization, and enforcement source/test changes
  outside this boundary slice.

### Option B: Keep Permissioned Reads Deferred Without A Boundary ADR

Pros:

- Adds no new decision artifact.
- Avoids repeating deferred items across docs.

Cons:

- Leaves scope filtering, status readiness, and warning metadata easy to
  misread as permission controls.
- Makes future ADR review triggers less obvious.
- Lets "read governance" drift from local preflight into implied security.

### Option C: Add A Boundary With Contract And Test Guardrails

Pros:

- Makes the non-enforcement boundary explicit before implementation expands.
- Gives future permissioned-read work a checklist of required decisions.
- Keeps current Phase 7A-7E behavior honest: useful local read governance
  primitives, not auth/security controls.
- Lets docs, MCP contract metadata, and regression tests tell the same
  non-enforcement story.

Cons:

- Does not itself give users permissioned reads.
- Adds another ADR, PRD section, metadata assertion, and test set that future
  maintainers must keep aligned.
- The phrase "permissioned read-governance boundary" can still sound stronger
  than it is unless the docs repeat that Phase 7F is prerequisite-only.

## Consequences

- Phase 7F becomes the canonical boundary for permissioned read claims.
- Scope filtering, status, and warnings stay available as local read-context
  primitives but remain outside auth, authorization, enforcement, and security
  claims.
- Future permissioned-read work must start with the prerequisite decisions
  listed above instead of attaching enforcement semantics to existing filters.
- ADR review is required before adding permission checks, OAuth/HTTP read
  behavior, live-store reads, scanning/redaction, runtime scope checks, or
  security claims.
- Phase 7F changes docs, MCP clarification metadata, and regression tests only;
  it does not change read-context eligibility, permission behavior,
  ledger/event behavior, destination-file behavior, or add MCP tools/resources.

## Verification

Phase 7F verification should prove:

- README and PRD identify Phase 7F as prerequisite boundary work, not runtime
  enforcement.
- The PRD current-status matrix keeps permissioned reads deferred.
- The PRD read-governance requirements distinguish scope filtering, status, and
  warnings from identity, authentication, authorization, permissioning,
  enforcement, security, scanning, and redaction.
- The ADR index includes ADR-0023 and keeps full permissioned read-side
  governance in the deferred backlog.
- The council evidence note records council passes before scope selection,
  after drafting, and at final preflight.
- Markdown/rg checks do not find new claims that Phase 7F shipped permissioned
  runtime behavior.
- MCP contract and runtime tests verify that read-context/status/warning
  metadata does not expose premature permission, actor, redaction, scanning,
  safety, security, or enforcement fields or claims.

## Deferred Risks

- actor/caller identity
- reviewer identity for read approvals, if needed
- auth model and transport/session boundary
- permission semantics and missing-identity behavior
- permissioned conflict, expiry, and scope-filtered reads
- scanning and redaction for returned context and evidence
- live memory-store reads
- remote MCP HTTP/OAuth transport
- retrieval ranking or vector search
- truth, safety, non-sensitivity, or compliance-grade claims
- accepted sensitive content already present in records

## Review Triggers

- adding permission checks or access-control decisions to read-context surfaces
- treating scope filtering as authorization, permissioning, enforcement,
  security, or compliance evidence
- treating status readiness or warning metadata as authentication,
  authorization, permissioning, enforcement, safety validation, redaction proof,
  or security
- adding actor identity, reviewer identity, auth sessions, OAuth scopes, or
  remote HTTP transport
- exposing read context from live stores or arbitrary resource passthrough
- adding scanning or redaction to read-context, status, warning, or evidence
  outputs
- changing blocker order so permissions, filters, or warnings can bypass Phase
  7A TTL/relationship blockers
- making security, safety, truth, non-sensitivity, or compliance-grade claims

## Supporting Evidence

- [ADR-0018 read-side context governance](0018-read-side-context-governance.md)
- [ADR-0021 read-context status observability](0021-read-context-status-observability.md)
- [ADR-0022 read-context expiry warnings](0022-read-context-expiry-warnings.md)
- [Phase 7F permissioned read-governance boundary council](../council/2026-05-21-phase-7f-permissioned-read-governance-boundary-pass.md)
