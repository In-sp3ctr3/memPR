# Phase 7K Read-Context Permission-Denied Evidence Council

**Date:** 2026-05-21
**Scope:** Docs and ADR pass for optional structured non-secret evidence on
read-context permission-denied results only.

## Goal

Document Phase 7K as the narrow permission-denied evidence contract for
read-context permission failures. The slice allows optional structured metadata
only for read-context permission-denial issue codes, while preserving the
no-content and no-side-effect denial boundary from Phase 7H, Phase 7I, and
Phase 7J.

Acceptance criteria:

- ADR-0028 accepts Phase 7K as optional structured non-secret evidence on
  read-context permission-denied failures only.
- Allowed fields stay limited to action, resource, surface, destination,
  requested scopes, permission contract version, `contentReturned: false`,
  `sideEffects: none`, or equivalent non-secret metadata.
- Docs explicitly exclude actor labels, allowed scopes, permission grants,
  policy internals, record IDs, memory text, source quotes, full records,
  hidden record existence, authentication, policy storage/evaluation,
  writes/events, redaction/scanning, live stores, audit/security claims, and
  compliance claims.
- Default reads, hard blockers, and non-permission blockers remain unchanged.
- `context-status`, export, list/inspect/history, MCP resources, warning-only
  metadata, raw ledger/event projections, live stores, and write/event surfaces
  remain unaffected except when faithfully carrying a read-context denial
  result.
- README, PRD, and ADR index acknowledge Phase 7K's accepted evidence slice,
  while broader auth-backed permissioned-read enforcement remains deferred.

## Council Pass 1: Initial Scope

### Decision Being Tested

Phase 7K should define only optional non-secret evidence for read-context
permission-denied issue codes, not a general permission decision payload.

### Council Review

Contrarian: Denial evidence is a leak vector. Actor labels, allowed scopes,
record IDs, policy traces, or inaccessible-record counts would let a caller
learn what they were not allowed to know.

First Principles: The invariant is still no content and no side effects. The
only problem to solve is how a caller can distinguish "permission denied" from
other read-context failures without receiving content or policy internals.

Expansionist: A tiny structured envelope helps clients handle denials
consistently and gives future tests a stable surface.

Outsider: A maintainer should not need permission-system context to understand
the result. Fields like action, resource, surface, destination, requested
scopes, `contentReturned: false`, and `sideEffects: none` are plain enough.

Executor: Write ADR-0028, update README, PRD, and ADR index only, and keep
source/test behavior for other workers.

### Consensus

Proceed with a narrow optional evidence contract. Do not include actor labels,
allowed scopes, grants, policy internals, record IDs, hidden existence, memory
content, writes/events, scanning/redaction claims, live stores, audit claims,
or security claims.

## Council Pass 2: Drafted Docs Critique

### Decision Being Tested

The drafted docs are precise enough to prevent Phase 7K from changing default
reads, hard blockers, status/export/list/history/resources, or non-permission
failures.

### Council Review

Contrarian: The phrase "permission-denied evidence" can be mistaken for an
authorization trace. The docs need a visible exclusion list and must say
denial evidence is optional.

First Principles: Phase 7K must attach only to read-context
permission-denial issue codes. Expired-record blockers, accepted relationship
blockers, destination errors, and non-permission parse failures keep their
existing contracts.

Expansionist: The allowed field list should include both semantic fields
(`action`, `resource`, `destination`) and explicit negative proof fields
(`contentReturned: false`, `sideEffects: none`) so clients can safely branch.

Outsider: The unaffected surfaces need to be named. "Everything else" is too
easy to misread, especially for `context-status`, export, list/history, and MCP
resources.

Executor: Add a dedicated PRD subsection and update verification/phase
checklists so stale "denied-response is future" wording becomes "broader
auth-backed denied responses remain future."

### Consensus

The docs are acceptable if they consistently say read-context
permission-denial issue codes only, optional evidence, allowed non-secret
fields only, default reads unchanged, hard/non-permission blockers unchanged,
and unrelated surfaces unaffected except for faithful carriage of a
read-context denial result.

## Council Pass 3: Final Preflight

### Decision Being Tested

The Phase 7K documentation is ready to land without widening permission,
security, auth, redaction, storage, live-store, or audit claims.

### Council Review

Contrarian: Final checks must catch any mention of actor labels, allowed
scopes, grants, policy internals, record IDs, memory text, hidden record
existence, or security/compliance claims as allowed denial evidence.

First Principles: The contract is an evidence envelope, not a permission
engine. It does not decide access, authenticate actors, store policy, or change
which records are eligible.

Expansionist: This is a useful platform step because future auth-backed work
can build from a known minimum without re-litigating non-secret denial fields.

Outsider: The maintainer answer should be simple: "Permission-denied read
context can say what was requested and that no content or side effects
happened. It cannot reveal who, what was allowed, why policy denied, or which
records exist."

Executor: Run scoped `rg` checks for Phase 7K, denied-response wording, and
excluded fields, then `git diff --check` on the allowed docs paths.

### Consensus

Phase 7K is ready if verification confirms it remains an optional
read-context-only permission-denied evidence contract, keeps all content and
side effects out of denials, preserves default reads and blockers, and keeps
auth, policy storage/evaluation, scanning/redaction, live stores,
audit/security, and compliance claims deferred.

## Final Consensus

Accept ADR-0028. Phase 7K allows optional structured non-secret metadata only
on read-context permission-denied issue results. Allowed evidence is limited to
the requested action, resource, surface, destination, requested scopes,
permission contract version, `contentReturned: false`, `sideEffects: none`, or
equivalent non-secret fields. It must not include actor labels, allowed scopes,
permission grants, policy internals, record IDs, memory text, source quotes,
full records, hidden record existence, authentication, policy storage or
evaluation, writes/events, redaction/scanning, live stores, or
audit/security/compliance claims. Default reads, hard blockers,
non-permission blockers, context-status, export, list/inspect/history, MCP
resources, warning-only metadata, raw ledger/event projections, live stores,
and write/event surfaces remain unchanged except when faithfully carrying a
read-context denial result.

## Verification Evidence

- Documentation-only scope honored; no source or tests were changed by this
  worker.
- README, PRD, ADR index, ADR-0028, and this council note were updated.
- Focused docs `rg` checks should confirm Phase 7K is scoped to read-context
  permission-denial issue codes and that broader auth-backed denied-response
  contracts remain deferred.
- Final whitespace checks should run on the allowed docs paths.

## Residual Risks

- Runtime source and tests must still be implemented or reviewed by source/test
  workers to match the documented Phase 7K evidence envelope.
- Future auth-backed permission enforcement may need richer admin-only
  diagnostics, which should require a new ADR and security review.
- Readers may still overread structured evidence as authorization proof unless
  future docs keep the no-auth/no-policy-storage/no-security-claim language
  visible.
- Accepted records can still contain sensitive content because scanning and
  redaction remain deferred.
