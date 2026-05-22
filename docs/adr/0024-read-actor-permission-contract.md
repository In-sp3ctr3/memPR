# ADR-0024: Read Actor And Permission Contract

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0023 made the permissioned-read boundary explicit: current read-context
assembly, MCP read resources, read-context status, and expiry warnings are useful
local primitives, but they are not actor identity, authentication,
authorization, permissioning, enforcement, scanning, redaction, HTTP/OAuth, live
store reads, or security proof.

The next safe Phase 7G slice is not enforcement. It is a shared vocabulary and
contract foundation for future permissioned reads so later ADRs do not attach
authorization semantics to current scope filters, status readiness, warnings, or
MCP metadata.

## Decision

Phase 7G defines the future read actor and permission contract foundation as a
static source contract plus docs and tests. It adds no command behavior, API
operation, MCP tool/resource, permission check, auth decision, event, ledger
mutation, destination-file side effect, scanning behavior, redaction behavior,
HTTP/OAuth behavior, live-store behavior, actor storage, permission storage, or
runtime enforcement.

The Phase 7G vocabulary is:

- `caller`: the immediate client, process, tool, or transport peer invoking a
  MemPR read surface.
- `actor`: the future authenticated principal on whose behalf the read is
  evaluated. A later actor model may include humans, local agents, service
  accounts, or delegated subjects, but Phase 7G does not store or authenticate
  them.
- `reviewer`: a future human approval or governance role. Reviewer identity is
  separate from read actor identity and is not required by the current read
  surfaces.

The future auth model is:

- Authentication must establish the actor before any permission decision is
  evaluated.
- Current local stdio MCP metadata, scope metadata, and tool annotations are
  protocol/client metadata only. They are not identity, authentication,
  authorization, permission grants, OAuth scopes, or enforcement evidence.
- Remote HTTP/OAuth remains a separate decision. OAuth scopes, if introduced
  later, must not be treated as sufficient record-level permissions without a
  MemPR permission model.

Future permission decisions must be explicit across these dimensions:

- `action`: what the caller is attempting, such as reading context, reading
  status, reading warning metadata, or inspecting a record projection.
- `resource`: the MemPR read surface or projection being requested.
- `destination`: the exact MemPR destination selector for the requested read.
- `scope`: the record scope or requested scope filter.

Scope is one permission dimension only. Scope alone must not identify an actor,
grant access, bypass Phase 7A blockers, bypass exact-destination selection, or
prove security.

Future permission evaluation must fail closed:

- explicit deny beats allow
- missing identity denies
- missing permission denies
- unknown action or resource denies
- ambiguous destination denies
- malformed permission data denies

Future permission checks must not weaken current TTL blockers,
accepted-relationship blockers, exact-destination requirements,
no-write/no-event boundaries, or evidence privacy rules.

Missing and denied outcomes must be no-content outcomes. They must not return
memory text, source quotes, assembled records, rendered context,
destination-file content, export preview content, full record payloads, or
hidden record existence as proof.

Allowed denial evidence is limited to non-secret metadata such as stable error
code, requested action/resource/destination/scope, correlation ID, and
policy/permission version identifiers. Actor identifiers and permission details
must be minimized and must not expose secrets or inaccessible content.

Current `context`, `context-status`, Phase 7E warning, and MCP read behavior is
unchanged by this ADR. Permissioned reads remain deferred.

## Options Considered

### Option A: Implement Read Permissions Now

Pros:

- Would make read access identity-aware sooner.
- Could align future product language with real enforcement.

Cons:

- Requires identity storage, authentication, session handling, permission policy
  storage, denied-response contracts, scanning/redaction choices, HTTP/OAuth
  posture, live-store boundaries, and runtime tests that do not exist yet.
- Risks weakening the clean Phase 7A-7F boundary by treating current scope
  filters or MCP metadata as authorization.
- Requires runtime identity, authorization, and enforcement changes outside
  this static contract foundation.

### Option B: Leave Actor And Permission Semantics Fully Deferred

Pros:

- Adds no new decision artifact.
- Avoids designing around an implementation that is not ready.

Cons:

- Leaves future work without shared definitions for caller, actor, reviewer,
  action, resource, destination, scope, denied behavior, or evidence privacy.
- Keeps the project vulnerable to accidental permission claims on existing
  `context`, `context-status`, warning, and MCP read surfaces.
- Makes later enforcement ADRs more likely to disagree on missing identity and
  denied-response behavior.

### Option C: Define A Static Actor/Permission Contract Foundation

Pros:

- Gives future permissioned-read ADRs concrete entry criteria.
- Preserves the no-enforcement boundary while making the next design target
  sharper.
- Names privacy constraints before denial errors can become content leaks.
- Gives tests a stable source contract to pin without adding enforcement.
- Keeps current read-context, status, warning, and MCP behavior unchanged.

Cons:

- Does not give users permissioned reads.
- Adds another prerequisite ADR that future maintainers must keep aligned.
- Can still be mistaken for shipped enforcement unless docs and tests repeat
  that Phase 7G is contract-only.

## Consequences

- Phase 7G becomes the canonical vocabulary for future read caller, actor, and
  permission discussions.
- Future permissioned-read work must define identity storage/trust,
  auth/session handling, permission policy storage/evaluation, denied-response
  contracts, scanning/redaction, HTTP/OAuth posture, live-store boundaries,
  audit/logging boundaries, and runtime tests before enforcement ships.
- Current read surfaces remain unchanged: `context`, `context-status`, Phase 7E
  warnings, `mempr.context`, `mempr.context.status`,
  `mempr://context/{destination}`, `mempr://contexts`, and
  `mempr://contexts/{destination}` do not authenticate callers, authorize
  actors, enforce permissions, or change outputs because of this ADR.
- Denied and missing-identity behavior is defined as a future no-content
  contract, not as current runtime behavior.
- Evidence privacy becomes a review trigger for any later permissioned read
  implementation.

## Verification

Phase 7G verification should prove:

- README and PRD identify Phase 7G as a static contract foundation, not runtime
  enforcement.
- The PRD current-status matrix keeps permissioned reads deferred and marks
  actor/permission enforcement as future work.
- The PRD requirements define caller, actor, reviewer, auth model,
  action/resource/destination/scope dimensions, missing/denied behavior, and
  evidence privacy.
- The ADR index includes ADR-0024 and keeps full permissioned read enforcement
  in the deferred backlog.
- The council evidence note records council passes before scope selection, after
  drafting, and at final preflight.
- Source and tests expose only static contract metadata and boundary
  regressions, not runtime permission decisions.
- Markdown and diff checks do not find claims that Phase 7G shipped runtime
  permission behavior.

## Deferred Risks

- actor identity storage and trust
- caller/session authentication
- reviewer identity and approval workflow, if read approvals are needed
- permission policy storage and evaluation
- delegated actor behavior
- denied-response error schema and localization
- permission decision logging or audit boundaries
- scanning and redaction for returned context and denial evidence
- live memory-store reads
- remote MCP HTTP/OAuth transport
- retrieval ranking or vector search
- accepted sensitive content already present in records
- truth, safety, non-sensitivity, or compliance-grade claims

## Review Triggers

- adding actor, caller, reviewer, session, OAuth, or permission fields to runtime
  payloads
- adding permission checks or access-control decisions to read-context, status,
  warning, or MCP read surfaces
- treating local stdio MCP metadata, scope metadata, tool annotations, or OAuth
  scopes as record-level permission grants
- changing missing or denied read behavior
- returning memory text, source quotes, full records, rendered context,
  destination-file preview content, or inaccessible record existence in denial
  evidence
- allowing permissions to bypass TTL blockers, relationship blockers,
  exact-destination matching, no-write/no-event boundaries, or evidence privacy
- exposing permissioned reads over remote HTTP/OAuth or live stores
- making security, safety, truth, non-sensitivity, redaction, or
  compliance-grade claims

## Supporting Evidence

- [ADR-0018 read-side context governance](0018-read-side-context-governance.md)
- [ADR-0021 read-context status observability](0021-read-context-status-observability.md)
- [ADR-0022 read-context expiry warnings](0022-read-context-expiry-warnings.md)
- [ADR-0023 permissioned read-governance boundary](0023-permissioned-read-governance-boundary.md)
- [Phase 7G read actor/permission contract council](../council/2026-05-21-phase-7g-read-actor-permission-contract-pass.md)
