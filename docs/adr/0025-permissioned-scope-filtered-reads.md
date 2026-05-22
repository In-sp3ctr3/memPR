# ADR-0025: Permissioned Scope-Filtered Reads

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0023 bound the permissioned-read governance boundary. ADR-0024 defined the
future caller, actor, reviewer, auth model, permission dimensions, missing and
denied behavior, and evidence privacy as a static contract foundation.

Phase 7H is the next ownership step, but it must stay narrow. The existing
read-context surfaces already have optional scope filtering, and that can be
mistaken for access control. Phase 7H defines and implements the only
scope-related permission constraint MemPR can safely ship before real
authentication, permission policy storage, hosted authorization,
scanning/redaction, and live-store behavior exist.

This ADR covers a local, caller-supplied read-context scope constraint. It is
not authentication, authorization, stored policy evaluation, OAuth behavior, or
a security claim.

## Decision

Phase 7H defines a narrow opt-in permissioned scope-filtered read constraint for
read-context only.

The Phase 7H contract is:

- Existing `context` and `mempr.context` reads remain unchanged unless a caller
  explicitly supplies an actor label and allowed scopes. MCP resource reads
  such as `mempr://context/{destination}` stay unchanged in Phase 7H because
  they have no permission-argument path.
- The constraint applies only to read-context output. It does not apply to
  `context-status`, Phase 7E warning-only metadata, export preview, confirmed
  export, `list`, `inspect`, `history`, raw ledger/event projections, live
  stores, or arbitrary resource passthrough.
- The normal Phase 7A order still runs first: exact destination selection,
  accepted-only eligibility, TTL blockers, and accepted relationship blockers.
  Normal scope filtering then reduces the eligible read-context set. The
  explicit permission constraint may only narrow that set further by permitted
  scope.
- The permission constraint must not broaden records, include other
  destinations, include pending or rejected records, bypass stale-record
  blockers, bypass accepted relationship blockers, resolve conflicts, soften
  expiry behavior, or query live stores.
- Missing permission, failed permission, malformed permission data, and explicit
  deny are no-content denials when an explicit permission constraint is
  supplied.
- Denials must not return memory text, source quotes, assembled records,
  rendered context, destination-file content, export preview content, full
  record payloads, or hidden record existence.
- Denials must have no side effects: no destination-file writes, parent
  directory creation, ledger mutation, event append, `memory_exported` event, or
  other MemPR domain event.
- Allowed denial evidence is limited to non-secret metadata such as stable
  denial code, requested action/resource/destination/scope, correlation ID, and
  policy/permission version identifiers.

Phase 7H explicitly does not add:

- real authentication
- hosted authorization
- OAuth behavior or OAuth scope enforcement
- permission policy storage or evaluation
- permissioned expiry filtering
- permissioned conflict or supersession filtering
- scanning or redaction
- live-store reads or writes
- auth-backed permission enforcement beyond the opt-in scope constraint
- security, safety, truth, non-sensitivity, redaction, audit, or compliance
  claims

Future Phase 7I must separately decide permissioned expiry constraints. Future
Phase 7J must separately decide permissioned conflict/supersession constraints.

## Options Considered

### Option A: Implement Full Auth-Backed Permissioned Scope Filtering Now

Pros:

- Would give the Phase 7H name immediate runtime behavior.
- Could start exercising denial payloads and permission narrowing in tests.

Cons:

- Requires authentication, actor/session trust, permission policy storage,
  runtime evaluation, logging boundaries, and denial-schema tests that MemPR has
  not designed yet.
- Risks turning local scope filters or MCP metadata into misleading
  authorization claims.
- Exceeds the safe scope for this phase by implying real authorization.

### Option B: Leave Scope Permissioning Fully Deferred

Pros:

- Avoids any chance that readers think Phase 7H shipped enforcement.
- Keeps the ADR backlog shorter.

Cons:

- Leaves "scope-filtered permissioned reads" undefined, even though scope is
  already a common selector on read-context output.
- Gives future implementation work no precise no-content denial and
  no-side-effect rule.
- Does not distinguish scope constraints from future expiry and conflict
  constraints.

### Option C: Implement A Narrow Opt-In Read-Context Scope Constraint

Pros:

- Clarifies that existing reads do not change unless an explicit permission
  constraint is supplied.
- Pins the minimum safe behavior: scope can only narrow read-context output
  after current blockers pass.
- Defines no-content/no-side-effect denials before any implementation can leak
  inaccessible content.
- Keeps authentication, policy storage, expiry filtering, conflict filtering,
  scanning/redaction, live stores, OAuth, and security claims out of Phase 7H
  while still giving the local read-context API, CLI, and MCP tool a testable
  no-content/no-side-effect behavior.

Cons:

- Does not give users real authentication-backed permission enforcement.
- Adds another phase document that future implementers must keep honest.
- The word "permissioned" can still be overread unless docs repeat the
  limitations.

## Consequences

- Phase 7H becomes the canonical ownership decision for scope-constrained
  read-context permissions.
- Existing read behavior remains unchanged without an explicit actor label and
  allowed scopes.
- The explicit constraint may only reduce returned read-context records by
  permitted scope after Phase 7A blockers and normal scope filtering pass.
- Missing, failed, malformed, or denied permission outcomes must return no
  content and produce no side effects.
- Permissioned expiry constraints and permissioned conflict/supersession
  constraints remain separate future decisions for Phase 7I and Phase 7J.
- ADR review is required before adding authentication, hosted authorization,
  OAuth, permission storage, scanning/redaction, live-store behavior, denial
  evidence changes, broader auth-backed permission enforcement, or security
  claims.

## Verification

Phase 7H verification should prove:

- README and PRD identify Phase 7H as a narrow opt-in read-context-only scope
  constraint and not general permissioned-read enforcement.
- README and PRD say existing reads remain unchanged unless an explicit actor
  label and allowed scopes are supplied.
- README, PRD, and this ADR define no-content and no-side-effect denial
  outcomes.
- README, PRD, and this ADR explicitly exclude authentication, hosted
  authorization, OAuth, permission policy storage, permissioned expiry
  filtering, permissioned conflict/supersession filtering, scanning/redaction,
  live-store behavior, auth-backed permission enforcement, and security claims.
- ADR index includes ADR-0025 and keeps full auth-backed permissioned read
  enforcement, Phase 7I expiry constraints, and Phase 7J conflict/supersession
  constraints deferred.
- The council evidence note records council passes before scope selection,
  after drafting, and at final preflight.
- Source, contract, and runtime tests prove default behavior, allowed-scope
  narrowing, denied no-content behavior, no-write side effects, and unchanged
  context-status behavior.

## Deferred Risks

- Runtime actor identity storage and trust
- Auth/session handling
- Permission policy storage and evaluation
- Denied-response schema localization and logging
- Permission decision audit boundaries
- Auth-backed permission enforcement tests beyond the opt-in scope constraint
- Auth-backed expiry policy beyond Phase 7I's caller-supplied `validUntil`
  read-context constraint
- Graph traversal, incoming-link analysis, or active retirement beyond Phase
  7J's caller-supplied own-record relationship exclusion constraint
- Scanning and redaction for returned context and denial evidence
- Live memory-store reads
- Remote MCP HTTP/OAuth transport
- Accepted sensitive content already present in records
- Truth, safety, non-sensitivity, or compliance-grade claims

## Review Triggers

- Changing the explicit permission constraint on any read-context runtime surface
- Changing existing reads when no explicit permission constraint is supplied
- Applying permission constraints to status, warning-only metadata, export
  preview, confirmed export, history, list/inspect, ledger/event projections,
  live stores, or arbitrary resource passthrough
- Returning memory text, source quotes, assembled records, rendered context,
  destination-file content, export preview content, full record payloads, or
  hidden record existence in a denial
- Letting permission constraints bypass exact destination matching,
  accepted-only eligibility, TTL blockers, accepted relationship blockers,
  no-write/no-event boundaries, or evidence privacy
- Adding authentication, hosted authorization, OAuth, permission policy storage,
  scanning/redaction, live-store behavior, broader auth-backed enforcement, or
  security claims
- Changing Phase 7I expiry filtering behavior
- Changing Phase 7J conflict/supersession exclusion behavior

## Supporting Evidence

- [ADR-0018 read-side context governance](0018-read-side-context-governance.md)
- [ADR-0021 read-context status observability](0021-read-context-status-observability.md)
- [ADR-0022 read-context expiry warnings](0022-read-context-expiry-warnings.md)
- [ADR-0023 permissioned read-governance boundary](0023-permissioned-read-governance-boundary.md)
- [ADR-0024 read actor and permission contract](0024-read-actor-permission-contract.md)
- [Phase 7H permissioned scope-filtered reads council](../council/2026-05-21-phase-7h-permissioned-scope-filtered-reads-pass.md)
