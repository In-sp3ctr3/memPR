# ADR-0028: Read-Context Permission-Denied Evidence

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0024 defined denied and missing-identity outcomes as future no-content
permission results. ADR-0025, ADR-0026, and ADR-0027 then added narrow opt-in
read-context permission constraints for caller-supplied scope, expiry, and
own-record relationship narrowing. Those phases already require no-content and
no-side-effect denial behavior, but they leave one edge ambiguous: what
structured evidence may be returned when a read-context permission constraint
denies the request?

Phase 7K closes that narrow evidence gap. It does not expand permission
semantics, add authentication, introduce policy storage, or change default
reads. It only defines optional structured, non-secret metadata for
read-context permission-denied failures.

## Decision

Phase 7K accepts an optional structured permission-denied evidence contract for
read-context permission failures only.

The Phase 7K contract is:

- Apply only to read-context permission-denial issue codes from explicit
  read-context permission constraints. This covers denial or malformed
  outcomes from Phase 7H scope constraints, Phase 7I `validUntil` constraints,
  and Phase 7J relationship constraints when those failures are represented as
  read-context permission denials.
- Default reads remain unchanged when no explicit read-permission constraint is
  supplied.
- Hard blockers and non-permission blockers remain unchanged. Existing
  expired-record blockers, accepted relationship blockers, destination
  validation errors, parse errors outside read permission constraints, and
  other non-permission failures must not be recast as Phase 7K permission
  evidence.
- `context-status`, export, `list`, `inspect`, `history`, MCP status
  resources, MCP context resources/templates, raw ledger/event projections,
  arbitrary resources, warning-only metadata, live stores, and write/event
  surfaces are unaffected except when a surface is faithfully carrying a
  read-context denial result that already belongs to the read-context
  permission-denial contract.
- Denial evidence is optional. A compliant denial may remain minimal, but if it
  includes structured evidence it must stay inside the allowed field set below.

Allowed structured evidence fields are non-secret metadata only:

- requested `action`, such as read context
- requested `resource`, such as the read-context surface or projection
- `surface`, such as API, CLI, MCP tool, or MCP resource carrier
- requested `destination`
- requested scopes or scope filters
- permission contract version
- explicit `contentReturned: false`
- explicit `sideEffects: none`
- stable permission-denied issue code or equivalent non-secret code
- correlation ID or request ID, if available and non-secret

Equivalent names are allowed when they preserve the same meaning and do not add
new information classes.

Phase 7K explicitly excludes:

- actor labels, caller labels, reviewer labels, service-account labels, or
  delegated-subject labels
- allowed scopes, permission grants, allow lists, deny lists, policy internals,
  rule names, rule traces, policy storage details, or evaluation traces
- record IDs, hidden record existence, counts of inaccessible records, memory
  text, source quotes, assembled records, rendered context, destination-file
  content, export preview content, full records, or raw ledger/event payloads
- authentication, actor identity storage, session handling, hosted
  authorization, OAuth behavior, OAuth scope enforcement, permission policy
  storage, or permission policy evaluation
- writes, events, destination-file side effects, parent-directory creation,
  ledger mutation, `memory_exported`, or other MemPR domain events
- redaction, scanning, live-store behavior, graph traversal, incoming-link
  policy, automatic conflict resolution, active retirement, audit/security
  claims, compliance claims, truth validation, safety validation, or
  non-sensitivity proof

Phase 7K changes only the allowed shape of optional no-content denial evidence
for read-context permission-denied failures. It does not change which records
are eligible, which constraints deny, the order of blockers and filters, or any
non-read-context surface.

## Options Considered

### Option A: Keep Denial Evidence Fully Deferred

Pros:

- Avoids adding another contract before full auth-backed permissions exist.
- Keeps denial outputs minimal by default.

Cons:

- Leaves Phase 7H, Phase 7I, and Phase 7J implementations without a precise
  answer for safe structured denial metadata.
- Makes it easier for denial payloads to drift into actor labels, allowed
  scopes, policy details, or record-existence leaks.
- Keeps docs stale by implying there is no accepted denied-response evidence
  slice even after no-content read-context permission denials exist.

### Option B: Add Full Permission Decision Evidence

Pros:

- Could be useful for debugging future auth-backed permission systems.
- Would make denied results more explainable to administrators.

Cons:

- Requires authentication, actor identity, permission policy storage,
  evaluation traces, redaction/scanning, audit/logging boundaries, and security
  review that MemPR has not designed.
- Risks exposing actors, allowed scopes, policy internals, record IDs, or
  hidden record existence.
- Turns a narrow evidence contract into premature authorization infrastructure.

### Option C: Allow Only Non-Secret Read-Context Denial Metadata

Pros:

- Gives implementers a concrete, testable evidence envelope for existing
  read-context permission-denied outcomes.
- Preserves no-content and no-side-effect denial behavior.
- Avoids actor labels, grants, policy internals, record IDs, memory content,
  hidden existence leaks, writes/events, redaction/scanning claims, live stores,
  and audit/security overclaims.
- Keeps all non-permission blockers and unrelated surfaces unchanged.

Cons:

- Does not implement authentication, policy storage, or full permission
  evaluation.
- Requires repeated documentation so optional metadata is not mistaken for
  authorization proof.
- May need a future ADR if auth-backed enforcement requires richer admin-only
  diagnostics.

## Consequences

- Phase 7K becomes the canonical evidence contract for read-context
  permission-denied issue results.
- Phase 7H, Phase 7I, and Phase 7J denial paths may include structured
  evidence only when it is non-secret and inside the allowed field classes.
- Default reads, hard blockers, non-permission blockers, status, export,
  list/inspect/history, MCP resources, raw ledger/event projections,
  warning-only metadata, live stores, and writes/events remain unchanged
  except for faithful carriage of a read-context denial result.
- Broader denied-response contracts remain deferred for authentication-backed
  permissioned reads, hosted authorization, policy storage/evaluation,
  audit/logging, redaction/scanning, live stores, and security/compliance
  claims.
- ADR review is required before adding actor labels, allowed scopes,
  permission grants, policy internals, record IDs, hidden existence evidence,
  memory text, source quotes, full records, authentication, policy storage,
  writes/events, scanning/redaction, live-store behavior, or audit/security
  claims to denied read evidence.

## Verification

Phase 7K verification should prove:

- README and PRD identify Phase 7K as an optional structured evidence contract
  for read-context permission-denied issue codes only.
- README, PRD, and this ADR list allowed fields:
  action/resource/surface/destination/requested scopes/permission contract
  version/contentReturned:false/sideEffects:none or equivalent non-secret
  metadata.
- README, PRD, and this ADR explicitly exclude actor labels, allowed scopes,
  permission grants, policy internals, record IDs, memory text, source quotes,
  full records, hidden record existence, authentication, policy
  storage/evaluation, writes/events, redaction/scanning, live stores, and
  audit/security/compliance claims.
- README, PRD, and this ADR say default reads, hard blockers,
  non-permission blockers, context-status, export, list/inspect/history, MCP
  resources, and warning-only metadata are unchanged except when faithfully
  carrying a read-context denial result.
- ADR index includes ADR-0028 and removes stale wording that omits the accepted
  Phase 7K evidence slice, while keeping broader auth-backed permission
  enforcement deferred.
- The council evidence note records at least three explicit decision-council
  passes and final consensus.
- Scoped docs grep/diff checks find no claims that Phase 7K adds
  authentication, stored policy evaluation, record disclosure, writes/events,
  scanning/redaction, live stores, or security/compliance guarantees.

## Deferred Risks

- Runtime actor identity storage and trust
- Auth/session handling
- Permission policy storage and evaluation
- Admin-only diagnostics for future auth-backed permission denials
- Denied-response localization beyond the narrow evidence field set
- Permission decision logging or audit boundaries
- Scanning and redaction for returned context and denial evidence
- Live memory-store reads
- Remote MCP HTTP/OAuth transport
- Accepted sensitive content already present in records
- Truth, safety, non-sensitivity, security, or compliance-grade claims

## Review Triggers

- Adding actor, caller, reviewer, service-account, or delegated-subject labels
  to denial evidence
- Returning allowed scopes, permission grants, policy internals, policy storage
  details, policy evaluation traces, record IDs, memory text, source quotes,
  full records, hidden record existence, or inaccessible-record counts in
  denial evidence
- Applying Phase 7K evidence outside read-context permission-denial issue codes
- Recasting hard blockers or non-permission blockers as permission-denied
  evidence
- Changing default reads when no explicit read-permission constraint is supplied
- Changing `context-status`, export, list/inspect/history, MCP resources,
  warning-only metadata, raw ledger/event projections, live stores, or
  writes/events except to faithfully carry a read-context denial result
- Adding authentication, hosted authorization, OAuth, permission policy storage
  or evaluation, scanning/redaction, live-store behavior, audit/security
  claims, or compliance claims

## Supporting Evidence

- [ADR-0024 read actor and permission contract](0024-read-actor-permission-contract.md)
- [ADR-0025 permissioned scope-filtered reads](0025-permissioned-scope-filtered-reads.md)
- [ADR-0026 permissioned expiry constraints](0026-permissioned-expiry-constraints.md)
- [ADR-0027 permissioned conflict/supersession constraints](0027-permissioned-conflict-supersession-constraints.md)
- [Phase 7K read-context permission-denied evidence council](../council/2026-05-21-phase-7k-read-context-permission-denied-evidence-pass.md)
