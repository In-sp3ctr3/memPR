# Phase 7D Read-Context Status Council

**Date:** 2026-05-21
**Scope:** Read-only destination-level read-context status and observability
without memory text.

## Goal

Document Phase 7D as a content-free readiness/status layer for Phase 7A
read-context assembly. It should let a caller learn whether recorded
destinations, or one exact requested destination, are ready; which
destination-level blockers exist; and which accepted record IDs/counts/issues
are involved, without returning memory text, source quotes, assembled records,
export preview content, or confirmed export output.

The execution-pipeline triad for this pass is: plan the narrow status contract,
execute README/PRD/ADR/council docs that bind it, then adversarially review
status-vs-context confusion, blocker parity, side effects, privacy boundaries,
and deferred security/read-governance claims.

Phase 7D must reuse Phase 7A exact destination matching, accepted-only
readiness eligibility, accepted-only TTL and relationship blocker parity, and
the no writes, events, or destination-file side-effect boundary. The shipped
surfaces are CLI `context-status`, API `summarizeReadContextStatus`, MCP tool
`mempr.context.status`, MCP resource `mempr://contexts`, and MCP template
`mempr://contexts/{destination}`. It must distinguish status from
`mempr context`, `mempr.context`, `mempr://context/{destination}`, ledger
`mempr://status`, `mempr.export.preview`, and confirmed `mempr.export`.

## Council Pass 1: Status Boundary

### Decision Being Tested

Phase 7D should add read-context status/observability instead of another
content-returning context read.

### Council Review

Contrarian: A "status" surface can become a quiet data leak if it returns full
records or snippets to make issues easier to debug.

First Principles: The actual job is readiness. A caller needs to know whether
the destination passes the Phase 7A preflight, not what the memory says.

Expansionist: A content-free status contract gives future dashboards and local
MCP clients a safer way to monitor destination health without pulling context.

Outsider: The simplest explanation is: context reads return memory; context
status returns readiness and blockers.

Executor: Create ADR-0021 and update README/PRD to state that status reports
aggregate readiness, destination readiness/blockers, counts, accepted record
IDs, and issue metadata without memory text or source quotes.

### Consensus

Phase 7D is read-only context-status observability through `context-status`,
`summarizeReadContextStatus`, `mempr.context.status`, `mempr://contexts`, and
`mempr://contexts/{destination}`. It is not `mempr context`, `mempr.context`,
`mempr://context/{destination}`, ledger `mempr://status`, export preview,
confirmed export, a scanner, or an authorization system.

## Council Pass 2: Blocker Parity And Evidence

### Decision Being Tested

Status must reuse Phase 7A destination eligibility and blockers while exposing
only non-secret evidence.

### Council Review

Contrarian: If aggregate status collapses destinations or lets filters run
before blockers, callers can make a destination look ready by excluding the
stale or contradictory accepted record.

First Principles: Readiness is destination-level. Each summarized destination
is either blocked by accepted TTL/relationship issues or it is ready. Aggregate
status is only a list of those exact destination summaries.

Expansionist: Shared parity lets future observability, context reads, and
export checks explain the same blockers with the same record IDs.

Outsider: A maintainer should see which IDs block a destination without seeing
the memory content that caused the proposal.

Executor: Require exact destination summaries, accepted-only readiness
eligibility, accepted-only TTL blockers, accepted same-destination relationship
blockers, counts, accepted record IDs, issue metadata, and no memory text or
quotes.

### Consensus

Status is a content-free projection of the Phase 7A preflight. It may expose
aggregate readiness, destination readiness, total/accepted/pending/rejected
counts, accepted record IDs, relationship type, blocker record IDs, issue
codes, and issue messages. It must not expose memory text, source quotes,
assembled records, rendered context, or preview content.

## Council Pass 3: Side Effects And Boundary Claims

### Decision Being Tested

Status must preserve no-write/no-event behavior and avoid security, safety, and
permissioning overclaims.

### Council Review

Contrarian: "Ready" can sound like "safe," "authorized," or "redacted." That
would be false because accepted sensitive content can still exist in accepted
records.

First Principles: Phase 7D observes local accepted-record state. It does not
create identity, permissions, enforcement, safety scoring, truth validation, or
content scanning.

Expansionist: The status layer is useful precisely because it stays small:
later permissioned reads, live stores, scanning, or HTTP/OAuth can be designed
against a clear baseline instead of a vague "context is safe" claim.

Outsider: Users need one warning repeated plainly: status does not return
memory text, but that does not mean the underlying accepted records are
non-sensitive.

Executor: Repeat boundaries in README, PRD, ADR-0021, and this note: no
identity/authorization/permissioning/enforcement/security; not truth, safety,
non-sensitivity, or redaction proof; accepted sensitive content can still
exist; scanning, redaction, live stores, and remote MCP HTTP/OAuth remain
deferred.

### Consensus

Phase 7D must have no writes, no domain events, no destination-file side
effects, no parent directory creation, no ledger mutation, and no
`memory_exported` event append. A ready status only means the summarized
destination passes Phase 7A blockers. It does not prove truth, safety,
non-sensitivity, redaction, authorization, permissioning, enforcement, or
security.

## Residual Risks

- Record IDs and issue metadata are less sensitive than memory text, but they
  still reveal local ledger structure.
- Users may still read "ready" as "safe" unless docs and tests keep the
  non-claim wording visible.
- Accepted sensitive content can still exist in accepted records.
- Future status filters could be misunderstood as permissions unless they stay
  metadata selectors after destination blockers.
- Scanning, redaction, live stores, permissioned reads, retrieval ranking, and
  remote MCP HTTP/OAuth remain future work.
