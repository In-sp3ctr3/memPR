# Phase 7B MCP Read-Context Council

**Date:** 2026-05-21
**Scope:** Read-only local stdio MCP exposure for Phase 7A read-context assembly.

## Goal

Expose Phase 7A read-context assembly through local stdio MCP without creating a
new export path, permission boundary, safety claim, redaction layer, or live
store reader.

The execution-pipeline triad for this pass is: plan the narrow MCP read-context
contract, execute docs that bind that contract, then adversarially review
wording for export confusion, side effects, permission/security overclaims, and
deferred read-governance gaps.

Phase 7B must document `mempr.context` as read-only local stdio MCP. It must
reuse Phase 7A exact destination, accepted-only eligibility, export-parity TTL
and accepted relationship blockers before optional scope filtering, and no
writes, events, or destination-file side effects.

## Council Pass 1: Tool Boundary

### Decision Being Tested

Phase 7B should add a distinct read-only MCP tool named `mempr.context` instead
of reusing `mempr.export.preview` or overloading confirmed `mempr.export`.

### Council Review

Contrarian: If context assembly is documented as export preview, local MCP
clients may treat would-write destination content as a retrieval API or expect
managed-block rendering instead of accepted records.

First Principles: The real job is to hand a local caller accepted context
records for one exact destination with the Phase 7A blockers intact.

Expansionist: A separate read-context tool gives future clients a clean local
preflight before any later permissioned read or live-store design.

Outsider: The distinction is plain if the docs say: context returns records,
preview returns destination-file content, confirmed export writes the file.

Executor: Document `mempr.context` as read-only local stdio MCP and link it to a
new ADR-0019 rather than mutating older ADR decisions.

### Consensus

Use `mempr.context` as the canonical Phase 7B MCP read-context surface. Keep it
separate from `mempr.export.preview` and confirmed `mempr.export`.

## Council Pass 2: Blocker Parity And Scope

### Decision Being Tested

MCP read context should reuse the Phase 7A assembly contract exactly, including
blocker order before optional scope filtering.

### Council Review

Contrarian: If scope filters run first, a caller can hide stale or contradictory
accepted records by asking for a narrower scope through MCP.

First Principles: Destination integrity comes before presentation selection.
The destination either has acceptable accepted state or it does not.

Expansionist: Keeping MCP parity with Phase 7A avoids a parallel policy system
and makes future read-governance extensions easier to reason about.

Outsider: A user expects the MCP call and CLI context call to disagree only in
transport shape, not in which blockers matter.

Executor: State exact destination, accepted-only eligibility, export-parity TTL
blocking, accepted relationship blocking, and post-blocker scope filtering in
README, PRD, ADR index, and ADR-0019.

### Consensus

MCP `mempr.context` must reuse Phase 7A exact destination, accepted-only
eligibility, TTL blockers, accepted relationship blockers, and post-blocker
scope filtering. Scope filters cannot bypass destination-level blockers.

## Council Pass 3: Side Effects And Claim Boundaries

### Decision Being Tested

MCP read context can return accepted records locally, but must not imply
permissioning, safety, redaction, live-store readiness, or domain events.

### Council Review

Contrarian: "Read context" can sound safer than it is. Accepted sensitive
content can still appear, and a local stdio tool is not an authorization layer.

First Principles: The tool reads local MemPR state and assembles records. It
does not prove truth, classify safety, redact content, authorize a user, or
write durable output.

Expansionist: Clear side-effect limits let clients call the tool before
confirmed export without accidentally creating files or audit/event noise.

Outsider: If a user asks whether this is safe context, the honest answer is:
it is accepted MemPR context, not proof of truth, non-sensitivity, or redaction.

Executor: Repeat the boundaries everywhere Phase 7B is named: no writes,
events, destination-file side effects, parent directory creation, ledger
mutation, `memory_exported`, HTTP/OAuth, live stores, scanning, or redaction.

### Consensus

Phase 7B is read-only local stdio MCP. It has no writes, events, or
destination-file side effects. Scope filtering is not identity, authorization,
permissioning, enforcement, or security. Returned context is not proof that
accepted memory is true, safe, non-sensitive, or redacted; accepted sensitive
content can still appear. Scanning, redaction, live stores, and remote MCP
HTTP/OAuth remain deferred.

## Residual Risks

- Accepted sensitive content can still appear in successful MCP context output.
- Local stdio callers can request context without identity or authorization
  proof.
- Scope filtering may still be mistaken for permissioning unless docs and tests
  keep repeating the boundary.
- HTTP/OAuth, live store reads, scanning, redaction, retrieval ranking, truth
  scoring, safety scoring, and compliance-grade claims remain future work.
