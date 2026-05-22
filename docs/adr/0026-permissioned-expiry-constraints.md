# ADR-0026: Permissioned Expiry Constraints

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0022 added read-only stale/upcoming-expiry warnings. ADR-0023 and
ADR-0024 defined the permissioned-read boundary and future actor/permission
contract. ADR-0025 then shipped the first narrow opt-in read-context permission
constraint: caller-supplied scope narrowing, not real authentication or policy
storage.

Phase 7I is the next permissioned-read constraint, but it must stay just as
narrow. Existing read-context assembly already treats expired accepted target
records as hard blockers, and Phase 7E warning metadata can show unexpired
records approaching expiry. A permissioned expiry constraint must not convert
those blockers into filters, hide stale evidence, broaden reads, or imply real
authorization.

This ADR covers only an opt-in read-context expiry constraint using existing
record `expires_at` metadata. It does not cover conflict/supersession
permissioning; Phase 7J owns that separate decision.

## Decision

Phase 7I defines a narrow opt-in permissioned expiry constraint for
read-context only.

The Phase 7I contract is:

- Existing `context`, `mempr.context`, and read-context API calls remain
  unchanged unless a caller explicitly supplies `validUntil`.
- API callers may supply `validUntil` only inside the nested read-permission
  constraint object, for example `readPermission.validUntil`. The explicit read
  permission object still requires the Phase 7H actor label and allowed scopes;
  the API must not treat unrelated top-level expiry fields as Phase 7I
  permission constraints.
- CLI callers use `--read-valid-until <ttl>` with the explicit read actor and
  allowed-scope flags to opt in. The flag belongs to read-context permissioning
  only and must not affect propose TTLs, export, `context-status`, or other
  commands.
- MCP `mempr.context` callers may supply `readPermission.validUntil` only
  inside the explicit `readPermission` object alongside `actor` and
  `allowedScopes`. Top-level MCP `validUntil` arguments, MCP resources such as
  `mempr://context/{destination}`, `mempr.context.status`, and
  `mempr://contexts` are outside Phase 7I.
- `validUntil` is parsed to the same canonical expiry timestamp shape as
  existing TTL metadata. Invalid, malformed, or unsupported `validUntil`
  values must fail closed with no returned memory content and no side effects
  when an explicit Phase 7I constraint is supplied.
- The normal read-context blockers run first: exact destination selection,
  accepted-only eligibility, hard expired-record blockers, and accepted
  relationship blockers. If any accepted target record is already expired, the
  existing `expired_record` blocker still wins and the expiry permission
  constraint must not hide or downgrade it.
- Existing scope filtering runs after hard blockers. Phase 7H allowed-scope
  narrowing, when supplied, still applies as a scope constraint.
- Only after those steps pass may Phase 7I narrow the returned read-context
  records by expiry. A record is included by the Phase 7I expiry constraint
  only when it has no expiry (`expires_at: null`) or its canonical `expires_at`
  is strictly greater than `validUntil`.
- Phase 7I may only remove records from an otherwise successful read-context
  response. It must not broaden records, include other destinations, include
  pending or rejected records, bypass stale-record blockers, bypass accepted
  relationship blockers, resolve or suppress conflicts, query live stores, or
  alter warning/status/export behavior.
- Records removed solely by the Phase 7I constraint must not be exposed through
  memory text, source quotes, assembled records, rendered context, full record
  payloads, destination-file content, export preview content, or hidden record
  existence evidence. Read-context warning metadata for records removed by the
  explicit constraint must be omitted or reduced to non-content evidence that
  does not reveal inaccessible record payloads.
- Phase 7I denial and parse-failure paths have no side effects: no
  destination-file writes, parent-directory creation, ledger mutation, event
  append, `memory_exported` event, or other MemPR domain event.

Phase 7I explicitly does not add:

- real authentication
- hosted authorization
- OAuth behavior or OAuth scope enforcement
- permission policy storage or evaluation
- auth-backed permission enforcement
- permissioned conflict or supersession filtering
- scanning or redaction
- live-store reads or writes
- security, safety, truth, non-sensitivity, redaction, audit, or compliance
  claims

Future Phase 7J must separately decide permissioned conflict/supersession
constraints before relationship permission filtering can be claimed.

## Options Considered

### Option A: Implement Auth-Backed Expiry Permissions Now

Pros:

- Would make expiry permission decisions feel complete.
- Could eventually support actor-specific freshness policies.

Cons:

- Requires authentication, actor/session trust, permission policy storage,
  runtime evaluation, audit/logging boundaries, and denial-schema work that
  MemPR has not designed.
- Risks turning local caller-supplied metadata into misleading authorization
  claims.
- Exceeds the safe Phase 7I scope and would blur the Phase 7F/7G boundary.

### Option B: Treat `validUntil` As Another Hard Blocker

Pros:

- Simple to explain as "block if anything is not valid long enough."
- Avoids partial returned context.

Cons:

- Would mix permission narrowing with existing hard expired-record blockers.
- Could let a caller hide which existing blocker should have failed first.
- Makes Phase 7I look like freshness enforcement rather than an opt-in
  read-context filter.

### Option C: Opt-In Read-Context Expiry Narrowing After Existing Blockers

Pros:

- Preserves current hard expired-record and relationship blocker behavior.
- Keeps default reads unchanged when `validUntil` is absent.
- Gives API, CLI, and MCP one precise shape: nested/API/MCP
  `readPermission.validUntil` and CLI `--read-valid-until <ttl>`, all within
  the explicit read-permission constraint that still requires actor and allowed
  scopes.
- Lets expiry constraints narrow successful read-context records without
  claiming authentication, stored policy, scanning/redaction, live stores, or
  security.
- Keeps Phase 7J conflict/supersession constraints separate.

Cons:

- Does not provide real actor-specific authorization.
- Requires careful warning/evidence handling so omitted records are not exposed
  as denial evidence.
- The word "permissioned" still needs repeated boundary language.

## Consequences

- Phase 7I becomes the canonical ownership decision for permissioned
  read-context expiry constraints.
- Existing read-context behavior remains unchanged without explicit
  `validUntil`.
- The `validUntil` comparison is strict: records with `expires_at` equal to
  `validUntil` are not included by the Phase 7I constraint.
- Records without expiry remain eligible after other blockers and scope filters
  pass.
- Hard expired-record blockers and accepted relationship blockers remain
  stronger than the Phase 7I filter.
- `context-status`, Phase 7E warning-only metadata outside filtered
  read-context responses, export preview, confirmed export, list/inspect,
  history, raw ledger/event resources, MCP context resources, live stores, and
  arbitrary resource passthrough remain outside Phase 7I.
- ADR review is required before adding authentication, hosted authorization,
  OAuth, permission storage/evaluation, scanning/redaction, live-store behavior,
  broader auth-backed permission enforcement, relationship permission filters,
  or security claims.

## Verification

Phase 7I verification should prove:

- README and PRD identify Phase 7I as a narrow opt-in read-context-only expiry
  constraint.
- README, PRD, and this ADR document the API shape: nested/API
  `readPermission.validUntil`, CLI `--read-valid-until <ttl>`, and MCP
  `readPermission.validUntil` only, inside the explicit read-permission
  constraint.
- README, PRD, and this ADR say default reads remain unchanged when
  `validUntil` is absent.
- README, PRD, and this ADR preserve the ordering: hard expired-record blockers
  and accepted relationship blockers first, existing scope filtering next, then
  Phase 7I expiry narrowing.
- README, PRD, and this ADR state the inclusion rule: no expiry, or
  `expires_at > validUntil`.
- README, PRD, and this ADR explicitly exclude authentication, hosted
  authorization, OAuth, permission policy storage/evaluation, auth-backed
  enforcement, permissioned conflict/supersession filtering, scanning,
  redaction, live stores, and security/compliance claims.
- ADR index includes ADR-0026 and keeps Phase 7J conflict/supersession
  constraints separate.
- The council evidence note records initial scope, drafted-docs critique, and
  final preflight passes.
- Source and runtime tests match the documented shape without widening writes,
  events, resources, status, export, auth, policy storage, scanning/redaction,
  or live-store claims.

## Deferred Risks

- Runtime actor identity storage and trust
- Auth/session handling
- Permission policy storage and evaluation
- Denied-response schema localization and logging
- Permission decision audit boundaries
- Auth-backed permission enforcement beyond caller-supplied read constraints
- Graph traversal, incoming-link analysis, or active retirement beyond Phase
  7J's caller-supplied own-record relationship exclusion constraint
- Scanning and redaction for returned context and denial evidence
- Live memory-store reads
- Remote MCP HTTP/OAuth transport
- Accepted sensitive content already present in records
- Truth, safety, non-sensitivity, or compliance-grade claims

## Review Triggers

- Changing the `validUntil` wire shape or accepting top-level MCP
  `validUntil`
- Applying Phase 7I constraints outside read-context API, CLI `context`, or MCP
  `mempr.context`
- Running expiry permission narrowing before hard expired-record or accepted
  relationship blockers
- Changing the inclusion rule from no expiry or `expires_at > validUntil`
- Returning memory text, source quotes, assembled records, rendered context,
  destination-file content, export preview content, full record payloads, or
  hidden record existence for records removed by the Phase 7I constraint
- Letting Phase 7I bypass exact destination matching, accepted-only
  eligibility, no-write/no-event boundaries, or evidence privacy
- Adding authentication, hosted authorization, OAuth, permission policy
  storage/evaluation, scanning/redaction, live-store behavior, broader
  auth-backed enforcement, or security claims
- Changing Phase 7J conflict/supersession exclusion behavior

## Supporting Evidence

- [ADR-0018 read-side context governance](0018-read-side-context-governance.md)
- [ADR-0022 read-context expiry warnings](0022-read-context-expiry-warnings.md)
- [ADR-0023 permissioned read-governance boundary](0023-permissioned-read-governance-boundary.md)
- [ADR-0024 read actor and permission contract](0024-read-actor-permission-contract.md)
- [ADR-0025 permissioned scope-filtered reads](0025-permissioned-scope-filtered-reads.md)
- [Phase 7I permissioned expiry constraints council](../council/2026-05-21-phase-7i-permissioned-expiry-constraints-pass.md)
