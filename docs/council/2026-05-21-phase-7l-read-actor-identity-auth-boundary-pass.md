# Phase 7L Read Actor Identity/Auth Boundary Council

**Date:** 2026-05-21
**Scope:** Static contract, tests, ADR, and product-doc pass for the actor
identity/auth boundary on current read-context permission constraints.

## Goal

Document Phase 7L as the boundary that keeps `readPermission.actor` honest. The
field exists on explicit read-context permission constraints, but it is
caller-asserted metadata only. It is not authenticated identity, not inferred
from the environment or transport, not stored as actor identity, and not used
for policy storage or evaluation.

Acceptance criteria:

- ADR-0029 accepts Phase 7L as a static contract and documentation actor
  identity/auth boundary.
- README and PRD say `readPermission.actor`, CLI `--actor`, and CLI
  `--read-actor` are caller-asserted labels, not authenticated identity.
- Docs explicitly reject actor inference from env vars, OS usernames, process
  users, git config, MCP client metadata, MCP tool annotations, MCP roots, MCP
  sessions, CLI/application/HTTP sessions, OAuth tokens, OAuth scopes, or
  transport/client labels.
- Missing actor fails closed only when an explicit read-context permission
  constraint is supplied and that constraint requires the actor field. Default
  reads remain unchanged without explicit read-permission constraints.
- Docs say Phase 7L adds no actor identity storage, auth/session storage,
  permission policy storage/evaluation, writes/events, destination-file side
  effects, redaction/scanning, live stores, HTTP/OAuth behavior,
  audit/security guarantees, or compliance guarantees.
- Broader auth-backed permission enforcement remains deferred.

## Council Pass 1: Scope Selection

### Decision Being Tested

Phase 7L should clarify that the current actor field is caller-asserted
metadata, not authenticated identity, while recording that boundary in the
static read-permission contract and without adding auth-backed runtime
enforcement.

### Council Review

Contrarian: The word "actor" is dangerous because readers may assume identity.
If the docs say "missing actor fails closed" without the explicit-constraint
qualifier, maintainers may believe all default reads now require an actor.

First Principles: The real boundary is proof. MemPR can prove that a caller
supplied a string in a permission constraint; it cannot prove who the caller or
actor is.

Expansionist: Keeping the current label explicit but untrusted gives future
auth-backed enforcement a migration path. Later work can replace or validate
the label instead of pretending it was already a principal.

Outsider: A normal reader needs one plain sentence: `readPermission.actor` is a
caller-asserted label, not login identity.

Executor: Add ADR-0029, update the static read-permission contract, README,
PRD, ADR index, tests, and this council note.

### Consensus

Proceed with a static contract boundary. Keep default reads unchanged, keep
explicit constraint fail-closed behavior, and make the
no-auth/no-inference/no-storage claims visible.

## Council Pass 2: Drafted Docs Critique

### Decision Being Tested

The drafted Phase 7L docs are precise enough to avoid implying authentication,
identity inference, policy evaluation, storage, or new side effects.

### Council Review

Contrarian: It is not enough to say "not authenticated." The docs must name
common accidental identity sources: env vars, OS users, process users, git
config, MCP metadata/sessions, client labels, application sessions, HTTP
sessions, OAuth tokens, and OAuth scopes.

First Principles: The fail-closed rule belongs only to explicit read-context
permission constraints. Missing actor is not a global blocker for
`context`, `mempr.context`, status, resources, export, list, inspect, or
history.

Expansionist: The ADR should preserve the existing `readPermission.actor`
shape because tests and client contracts already use it, while making future
authenticated enforcement a separate ADR.

Outsider: The phrase "caller-asserted" should appear near every summary of the
actor field, not only deep in the ADR.

Executor: Add a Phase 7L row to the ADR index, add Phase 7L paragraphs/bullets
to README and PRD, and add verification text that grep can check.

### Consensus

The docs are acceptable if they consistently pair actor with caller-asserted,
explicitly reject inference/storage/policy evaluation, and scope missing-actor
fail closed behavior to explicit read-context permission constraints.

## Council Pass 3: Final Preflight

### Decision Being Tested

The Phase 7L documentation is ready to land without widening auth,
authorization, storage, redaction, live-store, write/event, security, or
compliance claims.

### Council Review

Contrarian: Final checks must catch any accidental wording that turns actor
labels into proof, says MemPR authenticates actors, or implies policy lookup by
actor.

First Principles: Phase 7L is a boundary slice, not an auth feature. It records
what MemPR does not know and does not infer.

Expansionist: This makes future work stronger because auth-backed enforcement
will need to make the trust transition explicit instead of quietly inheriting a
spoofable label.

Outsider: A maintainer should leave with two rules: pass an actor label only
when opting into a read-context permission constraint, and do not treat that
label as identity.

Executor: Run scoped docs `rg` checks for Phase 7L, caller-asserted actor
language, inference exclusions, explicit-constraint-only fail closed behavior,
and deferred auth-backed enforcement, then run `git diff --check`.

### Consensus

Phase 7L is ready if verification confirms the docs say actor labels are
caller-asserted and unauthenticated, actor inference/storage/policy evaluation
are absent, missing actor fails closed only for explicit read-context
permission constraints, and broader auth-backed enforcement remains deferred.

## Final Consensus

Accept ADR-0029. Phase 7L records the current actor identity/auth boundary in
the static read-permission contract and docs:
`readPermission.actor`, `--actor`, and `--read-actor` are caller-asserted
labels supplied only for explicit read-context permission constraints. They are
not authenticated identity, not inferred from env/OS/MCP/client/session/OAuth
metadata, not stored as actor identity, and not used for policy storage or
evaluation. Missing actor fails closed only for explicit constrained
read-context requests; default reads and unrelated surfaces remain unchanged.
No writes/events, redaction/scanning, live stores, security guarantees, or
compliance guarantees are added. Broader auth-backed enforcement remains
deferred.

## Verification Evidence

- Source contract, tests, README, PRD, ADR index, ADR-0029, and this council
  note were updated.
- Focused docs `rg` checks should confirm Phase 7L says
  `readPermission.actor` is caller-asserted, no actor is inferred from
  env/OS/MCP/client/session/OAuth metadata, missing actor fails closed only for
  explicit read-context permission constraints, and auth-backed enforcement
  remains deferred.
- Final whitespace checks should run on the allowed docs paths.

## Residual Risks

- Future auth-backed runtime enforcement still needs a later implementation
  and security review.
- Future auth-backed permission enforcement must migrate from caller-asserted
  labels to verified principals through a new ADR and security review.
- Readers may still overread the actor field unless future docs keep the
  caller-asserted/no-auth language close to every example.
