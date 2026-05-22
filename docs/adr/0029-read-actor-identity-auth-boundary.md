# ADR-0029: Read Actor Identity/Auth Boundary

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0024 defined the future read actor and permission contract. ADR-0025,
ADR-0026, and ADR-0027 then added narrow opt-in read-context constraints for
caller-supplied scope, expiry, and own-record relationship narrowing. ADR-0028
defined optional non-secret evidence for read-context permission-denied issue
results.

Those phases intentionally use a `readPermission.actor` field, but MemPR still
has no actor identity storage, authentication, session model, OAuth transport,
or permission policy store. Phase 7L closes the documentation gap between the
field name and the current runtime boundary: the actor value is caller-asserted
metadata for an explicit read-context permission constraint. It is not an
authenticated identity.

## Decision

Phase 7L accepts an explicit actor identity/auth boundary for current
read-context permission constraints and records it in the static
`MEMPR_READ_PERMISSION_CONTRACT`.

The Phase 7L contract is:

- `readPermission.actor`, CLI `--actor`, and CLI `--read-actor` are
  caller-asserted labels supplied by the caller as part of an explicit
  read-context permission constraint.
- The actor label is not authenticated, verified, trusted as identity,
  persisted as actor identity, or treated as proof of caller, user, process,
  session, service-account, delegated-subject, or reviewer identity.
- MemPR does not infer an actor from environment variables, OS usernames,
  process users, git config, MCP client metadata, MCP tool annotations, MCP
  roots, MCP sessions, CLI sessions, application sessions, HTTP sessions,
  OAuth tokens, OAuth scopes, or transport/client labels.
- Missing actor fails closed only when an explicit read-context permission
  constraint is supplied and that constraint requires an actor label. Default
  `context` and `mempr.context` reads without explicit read-permission
  constraints remain unchanged.
- The actor label does not select, load, store, or evaluate permission policy.
  Current read-context constraints remain caller-supplied narrowing inputs,
  not auth-backed grants or policy decisions.
- Phase 7L adds no actor identity storage, auth/session storage,
  permission-policy storage, permission-policy evaluation, allow lists, deny
  lists, grants, writes, events, destination-file side effects,
  redaction/scanning, live-store reads, remote HTTP/OAuth behavior,
  audit/security guarantees, or compliance guarantees.
- `context-status`, Phase 7E warning-only metadata, MCP resources/templates,
  export preview, confirmed export, `list`, `inspect`, `history`, raw
  ledger/event projections, arbitrary resources, live stores, and write/event
  surfaces remain unchanged.

Phase 7L does not weaken the fail-closed behavior of explicit Phase 7H, Phase
7I, or Phase 7J read-context permission constraints. It narrows the meaning of
the actor field: a missing actor can deny an explicit constrained read, but a
present actor label still does not authenticate the caller or prove
authorization.

Broader auth-backed permission enforcement remains deferred until future ADRs
define actor identity storage and trust, authentication/session handling,
permission policy storage and evaluation, OAuth/HTTP posture, denied-response
privacy beyond the accepted Phase 7K evidence slice, redaction/scanning,
live-store boundaries, audit/logging boundaries, and runtime verification.

## Options Considered

### Option A: Infer Actor Identity From The Local Environment

Pros:

- Could avoid requiring callers to pass `readPermission.actor` explicitly.
- Might feel convenient for local CLI usage.

Cons:

- OS usernames, process users, environment variables, git config, MCP metadata,
  client labels, sessions, and OAuth scopes are spoofable or transport-specific
  without a MemPR trust model.
- Risks turning local metadata into misleading identity or authorization
  evidence.
- Would require storage, audit, and security decisions that MemPR has not made.

### Option B: Treat `readPermission.actor` As Authenticated Identity

Pros:

- Would make the existing permission constraint shape look closer to a full
  permission model.
- Could simplify future examples by using actor-specific language.

Cons:

- Overclaims current behavior. MemPR does not authenticate or store actors.
- Makes caller-supplied labels look like authorization proof.
- Conflicts with ADR-0025 through ADR-0028, which exclude authentication,
  policy storage/evaluation, writes/events, redaction/scanning, live stores,
  and security/compliance claims.

### Option C: Document The Caller-Asserted Actor Boundary

Pros:

- Keeps existing opt-in constraints usable without implying identity.
- Preserves the fail-closed behavior for malformed explicit constraints while
  keeping default reads unchanged.
- Gives future auth-backed work a clean migration boundary: current actor
  labels are input metadata, not trusted principals.
- Avoids env/OS/MCP/client/session/OAuth inference, policy storage/evaluation,
  writes/events, redaction/scanning, live stores, and security/compliance
  claims.

Cons:

- Does not implement authenticated permissioned reads.
- Requires repeated docs language because the word "actor" is easy to overread.
- Future auth work may need a migration from caller-asserted labels to verified
  principals.

## Consequences

- ADR-0029 becomes the canonical boundary for current `readPermission.actor`
  semantics.
- Existing read-context permission constraints may require an actor label to
  opt in, but that requirement does not authenticate, authorize, or store an
  actor.
- Default reads remain unchanged when no explicit read-context permission
  constraint is supplied.
- Missing actor remains fail-closed only for explicit constrained read-context
  requests that require the actor field.
- Future auth-backed permission work must not reuse caller-asserted actor
  labels as proof of identity without a separate identity/auth ADR and runtime
  verification.
- ADR review is required before adding actor inference, actor identity storage,
  auth/session storage, policy storage/evaluation, writes/events,
  redaction/scanning, live-store behavior, HTTP/OAuth enforcement, or
  security/compliance claims.

## Verification

Phase 7L verification should prove:

- README, PRD, and this ADR say `readPermission.actor` is caller-asserted and
  not authenticated.
- README, PRD, and this ADR say MemPR does not infer actor identity from
  environment variables, OS usernames, process users, git config, MCP metadata,
  MCP sessions, client labels, application/CLI/HTTP sessions, OAuth tokens, or
  OAuth scopes.
- README, PRD, and this ADR say missing actor fails closed only when explicit
  read-context permission constraints are supplied.
- README, PRD, and this ADR explicitly exclude actor identity storage,
  auth/session storage, permission policy storage/evaluation, writes/events,
  redaction/scanning, live stores, and security/compliance guarantees.
- ADR index includes ADR-0029 and keeps broader auth-backed enforcement
  deferred.
- The council evidence note records at least three explicit decision-council
  passes and final consensus.
- Scoped docs grep/diff checks find no Phase 7L claim that actor labels are
  authenticated, inferred, stored, policy-evaluated, or security/compliance
  evidence.

## Deferred Risks

- Actor identity storage and trust
- Caller/session authentication
- Permission policy storage and evaluation
- Migration from caller-asserted actor labels to verified principals
- Delegated actor and service-account semantics
- Permission decision logging and audit boundaries
- Broader denied-response contracts beyond ADR-0028
- Scanning and redaction for returned context and denial evidence
- Live memory-store reads
- Remote MCP HTTP/OAuth transport
- Accepted sensitive content already present in records
- Truth, safety, non-sensitivity, security, or compliance-grade claims

## Review Triggers

- Inferring actor identity from environment variables, OS users, process users,
  git config, MCP metadata, MCP sessions, client labels, application/CLI/HTTP
  sessions, OAuth tokens, OAuth scopes, or transport metadata
- Persisting caller-supplied actor labels as actor identity in ledger records,
  events, policy state, logs, or denial evidence
- Treating `readPermission.actor`, `--actor`, or `--read-actor` as
  authentication, authorization, permission grant, policy lookup key, security
  evidence, audit evidence, or compliance evidence
- Failing default reads closed when no explicit read-context permission
  constraint is supplied
- Applying actor requirements to `context-status`, warning-only metadata, MCP
  resources/templates, export preview, confirmed export, `list`, `inspect`,
  `history`, raw ledger/event projections, arbitrary resources, live stores, or
  write/event surfaces
- Adding auth-backed permission enforcement, policy storage/evaluation,
  redaction/scanning, live-store behavior, HTTP/OAuth enforcement, or
  security/compliance claims

## Supporting Evidence

- [ADR-0024 read actor and permission contract](0024-read-actor-permission-contract.md)
- [ADR-0025 permissioned scope-filtered reads](0025-permissioned-scope-filtered-reads.md)
- [ADR-0026 permissioned expiry constraints](0026-permissioned-expiry-constraints.md)
- [ADR-0027 permissioned conflict/supersession constraints](0027-permissioned-conflict-supersession-constraints.md)
- [ADR-0028 read-context permission-denied evidence](0028-read-context-permission-denied-evidence.md)
- [Phase 7L read actor identity/auth boundary council](../council/2026-05-21-phase-7l-read-actor-identity-auth-boundary-pass.md)
