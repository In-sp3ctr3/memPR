# Phase 7I Permissioned Expiry Constraints Council

**Date:** 2026-05-21
**Scope:** Source, tests, docs, and ADR pass for a narrow opt-in
read-context-only permissioned expiry constraint using `validUntil`.

## Goal

Document Phase 7I as the smallest safe expiry permission constraint: when, and
only when, a read-context caller supplies `validUntil`, returned records may be
narrowed after existing hard expired-record blockers, accepted relationship
blockers, and scope filtering pass.

The integration council settled the API shape for this implementation pass:

- API/nested read permission: optional `readPermission.validUntil` inside the
  explicit read-permission object
- CLI: `--read-valid-until <ttl>` with the explicit read actor and
  allowed-scope flags
- MCP `mempr.context`: `readPermission.validUntil` only inside
  `readPermission`

Phase 7I includes records only when they have no expiry or
`expires_at > validUntil`. Existing reads stay unchanged when `validUntil` is
absent. Phase 7I is not real authentication, hosted authorization, OAuth,
permission policy storage, auth-backed permission enforcement, scanning,
redaction, live-store behavior, permissioned conflict/supersession filtering,
or a security claim.

The execution-pipeline triad for this pass is: plan the narrow Phase 7I
contract, execute scoped source/test/documentation/ADR updates, then
adversarially review for overclaims, blocker-order mistakes, evidence leakage,
and accidental Phase 7J capture.

Acceptance criteria:

- README and PRD describe Phase 7I as opt-in, read-context-only, and unchanged
  when `validUntil` is absent.
- ADR-0026 defines the API shape: nested/API `readPermission.validUntil`, CLI
  `--read-valid-until <ttl>`, and MCP `readPermission.validUntil` only, inside
  the explicit read-permission constraint.
- Docs preserve blocker order: hard expired-record blockers and accepted
  relationship blockers first, existing scope filtering next, then
  `validUntil` expiry narrowing.
- Docs state the inclusion rule: no expiry or `expires_at > validUntil`.
- Docs state Phase 7I cannot bypass hard expired blockers or Phase 7J
  relationship constraints.
- Docs explicitly exclude real auth/OAuth, permission policy storage,
  writes/events, scanning/redaction, live stores, auth-backed enforcement, and
  security/compliance claims.
- ADR index includes ADR-0026 and keeps Phase 7J conflict/supersession
  constraints separate.
- Diff/rg checks do not claim runtime auth, policy storage, OAuth, live stores,
  scanning/redaction, relationship permission filtering, or security.

## Council Pass 1: Initial Scope

### Decision Being Tested

Phase 7I should document an opt-in `validUntil` read-context expiry constraint
rather than implement or claim real authentication-backed authorization,
freshness proof, policy storage, or conflict/supersession permissioning.

### Council Review

Contrarian: `validUntil` can sound like a security freshness guarantee. The
docs must say it only filters returned read-context records and cannot hide an
already expired accepted target record.

First Principles: The true invariant is ordering. Existing exact-destination,
accepted-only, expired-record, and relationship blockers decide whether context
can be assembled at all. Only after that may `validUntil` remove records from a
successful context response.

Expansionist: A crisp `validUntil` contract creates a useful runway for future
auth-backed policy without pretending local caller metadata is authorization.

Outsider: A reader should know exactly where to put the field: nested
`readPermission.validUntil` for API/MCP and `--read-valid-until <ttl>` for CLI,
with the explicit read actor and allowed scopes still present. They should also
see that `context-status`, MCP resources, export, and live stores are not
affected.

Executor: Create ADR-0026, update README, PRD, ADR index, and this council note
only. Preserve 7J as the separate relationship-permission phase. Run focused
claim-boundary `rg` checks and scoped diffs.

### Consensus

Proceed with a narrow Phase 7I implementation centered on `validUntil`, strict
post-blocker ordering, no-expiry-or-`expires_at > validUntil` inclusion, and no
auth/security/storage/live-store claims.

## Council Pass 2: Drafted Docs Critique

### Decision Being Tested

The drafted README, PRD, ADR-0026, ADR index, and council note are precise
enough to prevent readers from mistaking Phase 7I for auth-backed permission
enforcement or a way to bypass hard blockers.

### Council Review

Contrarian: Any sentence saying Phase 7I "permits" or "authorizes" records
needs a nearby limitation. The filter can narrow output, but it does not prove
the actor, policy, freshness, safety, or non-sensitivity.

First Principles: The API shape matters because top-level MCP `validUntil`
would create another loose permission surface. The docs should repeat
`readPermission.validUntil` only for MCP.

Expansionist: Keeping no-expiry records eligible gives maintainers a clear
semantic distinction: `validUntil` is a minimum canonical expiry cutoff, not a
requirement that every memory have an expiry date.

Outsider: The phrase "after existing scope filtering" should be concrete:
hard blockers first, existing scope filtering second, Phase 7I narrowing last.

Executor: Revise any overclaim, add explicit non-goals, update Phase 7
deliverables/exit criteria, and ensure supporting references include ADR-0026.

### Consensus

The docs are acceptable if they consistently say opt-in, read-context-only,
nested/API/MCP `validUntil`, no expiry or `expires_at > validUntil`, no
side effects, and no Phase 7J relationship filtering.

## Council Pass 3: Final Preflight

### Decision Being Tested

The Phase 7I docs are ready to land without widening runtime claims or
overwriting neighboring Phase 7H/7J boundaries.

### Council Review

Contrarian: Final checks must catch accidental claims that Phase 7I adds real
auth, OAuth, policy storage, scanning, redaction, live stores, or security.

First Principles: The final contract is an ordering and narrowing rule, not a
permission engine: blockers first, scope next, expiry narrowing last.

Expansionist: The result gives implementation workers a testable API shape
while preserving future room for auth-backed policy and Phase 7J relationship
constraints.

Outsider: A maintainer should be able to answer "what changes now?" with:
"only read-context output can be narrowed by `validUntil` when explicitly
supplied; default reads and status/export/resources do not change."

Executor: Run scoped whitespace/diff checks, claim-boundary `rg`, and final
`git diff --stat` for the five allowed docs paths. Report any source mismatch
honestly.

### Consensus

Phase 7I is ready if verification confirms the docs stay inside the
read-context-only `validUntil` boundary, preserve hard blockers and Phase 7J,
and avoid auth/security/storage/live-store overclaims.

## Verification Evidence

- `npm run build` passed.
- `npm run lint` passed.
- Focused read-context, MCP, CLI, and read-permission tests passed: 59/59.
- `npm test` passed: 168/168.
- Claim-boundary `rg` checks found no stale placeholder Phase 7I wording.
- Final `git diff --check` passed for the Phase 7I source, test, and docs
  paths.

## Residual Risks

- Runtime source and tests must continue to match the documented Phase 7I
  contract as follow-on slices evolve.
- Readers may still overread "permissioned" as real auth-backed enforcement
  unless future docs keep the opt-in/non-auth language visible.
- Warning evidence for records filtered by `validUntil` could become an
  existence leak if future edits stop narrowing or suppressing it.
- Full permission enforcement still needs actor identity, auth/session
  handling, permission policy storage/evaluation, and audit/logging boundaries.
- Accepted records can still contain sensitive content because scanning and
  redaction remain deferred.
- Permissioned conflict/supersession behavior is owned by Phase 7J and remains
  separate from Phase 7I expiry behavior.
