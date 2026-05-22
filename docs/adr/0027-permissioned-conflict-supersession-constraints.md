# ADR-0027: Permissioned Conflict/Supersession Constraints

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0013 and ADR-0014 established conflict and supersession metadata as review
and export governance, not automatic resolution. ADR-0018 carried accepted
relationship blockers into local read-context assembly with export parity.
ADR-0025 and ADR-0026 then added narrow opt-in read-context permission
constraints for caller-supplied scope and expiry narrowing.

Phase 7J is the next permissioned-read constraint, but it must not weaken the
existing relationship blockers or pretend MemPR has graph policy,
authentication, stored authorization, redaction, or active retirement. Existing
accepted same-destination conflict/supersession pairs remain hard blockers
before any permission filter can run.

This ADR covers only opt-in read-context relationship exclusion flags based on
each returned record's own relationship metadata.

## Decision

Phase 7J defines narrow opt-in permissioned conflict/supersession constraints
for read-context only.

The Phase 7J contract is:

- Existing `context`, `mempr.context`, and read-context API calls remain
  unchanged unless a caller explicitly supplies `excludeConflicts` or
  `excludeSupersedes`.
- API callers may supply the fields only inside the nested read-permission
  constraint object: `readPermission.excludeConflicts` and
  `readPermission.excludeSupersedes`. The explicit read-permission object still
  requires the Phase 7H actor label and allowed scopes.
- CLI callers use `--read-exclude-conflicts` and
  `--read-exclude-supersedes` with the explicit read actor and allowed-scope
  flags to opt in.
- MCP `mempr.context` callers may supply
  `readPermission.excludeConflicts` and
  `readPermission.excludeSupersedes` only inside the explicit
  `readPermission` object alongside `actor` and `allowedScopes`. Top-level MCP
  relationship flags, MCP resources such as `mempr://context/{destination}`,
  `mempr.context.status`, and `mempr://contexts` are outside Phase 7J.
- The normal read-context blockers run first: exact destination selection,
  accepted-only eligibility, hard expired-record blockers, and accepted
  relationship blockers. If an accepted same-destination relationship pair is
  blocking context assembly, Phase 7J must not hide or downgrade that blocker.
- Existing scope filtering, Phase 7H allowed-scope narrowing, and Phase 7I
  `validUntil` narrowing run before Phase 7J relationship narrowing.
- Filtering uses own-record metadata only. When `excludeConflicts` is true,
  remove otherwise eligible records whose own `conflicts_with` array is
  non-empty. When `excludeSupersedes` is true, remove otherwise eligible
  records whose own `supersedes` array is non-empty.
- Phase 7J must not inspect incoming links, traverse relationship graphs,
  infer that another record supersedes the current record, perform cycle
  analysis, resolve conflicts, retire accepted records, or redact memory
  content.
- `excludeConflicts` and `excludeSupersedes` are booleans. Malformed,
  unsupported, or non-boolean values fail closed with no returned memory
  content and no side effects when an explicit Phase 7J constraint is supplied.
- Records removed solely by Phase 7J must not be exposed through memory text,
  source quotes, assembled records, rendered context, destination-file content,
  export preview content, full record payloads, warning entries, or hidden
  record existence evidence.
- Phase 7J denial and parse-failure paths have no side effects: no
  destination-file writes, parent-directory creation, ledger mutation, event
  append, `memory_exported` event, or other MemPR domain event.

Phase 7J explicitly does not add:

- real authentication
- hosted authorization
- OAuth behavior or OAuth scope enforcement
- permission policy storage or evaluation
- auth-backed permission enforcement
- graph traversal or incoming-link relationship policy
- automatic conflict resolution
- active retirement of superseded accepted records
- scanning or redaction
- live-store reads or writes
- export preview, confirmed export, `context-status`, MCP resource,
  list/inspect/history, raw ledger/event, or arbitrary resource behavior
- security, safety, truth, non-sensitivity, redaction, audit, or compliance
  claims

## Options Considered

### Option A: Auth-Backed Relationship Permissions

Pros:

- Would eventually support actor-specific relationship policies.
- Could express stronger governance than local caller-supplied flags.

Cons:

- Requires identity, auth/session trust, permission policy storage, evaluation,
  audit/logging boundaries, and denial contracts that MemPR has not designed.
- Risks turning local metadata into misleading authorization evidence.
- Exceeds the safe Phase 7J slice.

### Option B: Relationship Graph Filtering

Pros:

- Could remove records indirectly superseded by another record.
- Could support richer conflict views later.

Cons:

- Requires graph traversal, incoming-link semantics, cycle handling, and clear
  resolution policy.
- Could hide hard accepted relationship blockers if ordered incorrectly.
- Blurs filtering with active retirement or conflict resolution.

### Option C: Own-Record Opt-In Exclusion Flags

Pros:

- Keeps default reads unchanged.
- Preserves hard expired-record and accepted relationship blockers before any
  filtering.
- Gives API, CLI, and MCP one precise shape for excluding records that declare
  relationship metadata on themselves.
- Avoids graph traversal, redaction, auth, stored policy, writes/events, export
  behavior changes, and security claims.

Cons:

- Does not remove records that are only referenced by another record.
- Does not resolve conflicts or retire superseded records.
- Requires repeated documentation so "permissioned" is not overread as real
  authorization.

## Consequences

- Phase 7J becomes the canonical ownership decision for opt-in read-context
  conflict/supersession exclusion constraints.
- Existing read-context behavior remains unchanged without explicit
  `excludeConflicts` or `excludeSupersedes`.
- Relationship exclusion runs only after hard blockers, scope filtering, and
  expiry narrowing pass.
- Relationship exclusion is based only on the current record's own
  `conflicts_with` and `supersedes` arrays.
- `context-status`, MCP resources, export preview, confirmed export,
  list/inspect/history, raw ledger/event projections, live stores, and
  arbitrary resources remain outside Phase 7J.
- ADR review is required before adding authentication, hosted authorization,
  OAuth, permission storage/evaluation, scanning/redaction, live-store
  behavior, graph traversal, incoming-link filtering, active retirement,
  export/status/resource behavior changes, broader auth-backed enforcement, or
  security claims.

## Verification

Phase 7J verification should prove:

- README and PRD identify Phase 7J as a narrow opt-in read-context-only
  conflict/supersession constraint.
- README, PRD, and this ADR document the API shape:
  `readPermission.excludeConflicts`, `readPermission.excludeSupersedes`, CLI
  `--read-exclude-conflicts`, CLI `--read-exclude-supersedes`, and MCP
  `readPermission` fields only inside the explicit read-permission constraint.
- README, PRD, and this ADR say default reads remain unchanged when both flags
  are absent.
- README, PRD, and this ADR preserve the ordering: hard expired-record and
  accepted relationship blockers first, scope filtering and `validUntil`
  narrowing next, then Phase 7J relationship narrowing.
- README, PRD, and this ADR state the own-record metadata rule and explicitly
  exclude graph traversal, incoming-link analysis, automatic resolution, active
  retirement, and redaction.
- README, PRD, and this ADR say malformed fields fail closed with no memory
  content and no side effects.
- README, PRD, and this ADR keep `context-status`, MCP resources, export
  preview, confirmed export, list/inspect/history, raw ledger/event
  projections, arbitrary resources, and live stores unchanged.
- README, PRD, and this ADR explicitly exclude authentication, hosted
  authorization, OAuth, permission policy storage/evaluation, auth-backed
  enforcement, writes/events, scanning, redaction, live stores, and
  security/compliance claims.
- ADR index includes ADR-0027 and removes stale Phase 7J deferral language
  only where this slice now owns the decision.
- The council evidence note records at least three explicit decision-council
  passes and final consensus.

## Deferred Risks

- Runtime actor identity storage and trust
- Auth/session handling
- Permission policy storage and evaluation
- Denied-response schema localization and logging
- Permission decision audit boundaries
- Auth-backed permission enforcement beyond caller-supplied read constraints
- Graph traversal, incoming-link analysis, and cycle handling
- Automatic relationship resolution and active retirement
- Scanning and redaction for returned context and denial evidence
- Live memory-store reads
- Remote MCP HTTP/OAuth transport
- Accepted sensitive content already present in records
- Truth, safety, non-sensitivity, or compliance-grade claims

## Review Triggers

- Changing the `excludeConflicts` or `excludeSupersedes` wire shape
- Accepting top-level MCP relationship flags
- Applying Phase 7J constraints outside read-context API, CLI `context`, or MCP
  `mempr.context`
- Running relationship narrowing before hard expired-record blockers, accepted
  relationship blockers, scope filtering, or `validUntil` narrowing
- Filtering on incoming links, traversing relationship graphs, resolving
  conflicts, retiring accepted records, or redacting content
- Returning memory text, source quotes, assembled records, rendered context,
  destination-file content, export preview content, full record payloads, or
  hidden record existence for records removed by Phase 7J
- Letting Phase 7J bypass exact destination matching, accepted-only
  eligibility, no-write/no-event boundaries, or evidence privacy
- Changing `context-status`, MCP resources, export preview, confirmed export,
  list/inspect/history, raw ledger/event, arbitrary resource, or live-store
  behavior for Phase 7J
- Adding authentication, hosted authorization, OAuth, permission policy
  storage/evaluation, scanning/redaction, live-store behavior, broader
  auth-backed enforcement, or security claims

## Supporting Evidence

- [ADR-0013 conflict supersession review gating](0013-conflict-supersession-review-gating.md)
- [ADR-0014 accepted relationship export governance](0014-accepted-relationship-export-governance.md)
- [ADR-0018 read-side context governance](0018-read-side-context-governance.md)
- [ADR-0023 permissioned read-governance boundary](0023-permissioned-read-governance-boundary.md)
- [ADR-0024 read actor and permission contract](0024-read-actor-permission-contract.md)
- [ADR-0025 permissioned scope-filtered reads](0025-permissioned-scope-filtered-reads.md)
- [ADR-0026 permissioned expiry constraints](0026-permissioned-expiry-constraints.md)
- [Phase 7J permissioned conflict/supersession constraints council](../council/2026-05-21-phase-7j-permissioned-conflict-supersession-constraints-pass.md)
