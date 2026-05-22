# Phase 7C MCP Context Resource Council

**Date:** 2026-05-21
**Scope:** Constrained read-only local stdio MCP resource/template exposure for
Phase 7A read-context assembly.

## Goal

Expose Phase 7A read-context assembly through constrained local stdio MCP
resources/templates without creating arbitrary file/resource passthrough, a new
read policy, a permission system, a safety/redaction layer, a live store reader,
or another export path.

The execution-pipeline triad for this pass is: plan the narrow resource/template
contract, execute docs that bind that contract, then adversarially review URI
semantics, side effects, export confusion, permission/security overclaims, and
deferred read-governance gaps.

Phase 7C must document `mempr://context/{destination}` as a constrained
read-only local stdio MCP resource template, with an optional concrete
`mempr://context/MEMORY.md` resource. It must reuse Phase 7A exact destination,
accepted-only eligibility, export-parity TTL and accepted relationship blockers,
and no writes, events, or destination-file side effects.

## Council Pass 1: Resource Shape

### Decision Being Tested

Phase 7C should expose read-context assembly as a constrained MCP
resource/template named `mempr://context/{destination}` instead of a new tool or
an export-preview alias.

### Council Review

Contrarian: A context resource can look like a filesystem path. If the URI is
documented loosely, callers may expect arbitrary `MEMORY.md` reads or repository
file passthrough.

First Principles: The actual job is to expose the existing accepted
read-context projection through MCP resource reads. The destination is the same
MemPR selector used by Phase 7A, not a path dereference.

Expansionist: A resource template gives MCP clients a discovery-friendly way to
bind context destinations without adding a second read policy or another tool.

Outsider: The distinction is plain if docs say: this resource returns MemPR
accepted context for a destination; it does not read that destination file.

Executor: Create ADR-0020, add the ADR index row, and update README/PRD wording
around MCP resources/templates.

### Consensus

Use `mempr://context/{destination}` as the Phase 7C resource template. A
concrete `mempr://context/MEMORY.md` resource may be listed for the default
destination, but the URI destination remains a MemPR destination selector.

## Council Pass 2: Parity And Side Effects

### Decision Being Tested

Context resource reads must reuse Phase 7A exact-destination eligibility,
accepted-only records, export-parity blockers, and no-side-effect behavior.

### Council Review

Contrarian: If resource reads skip TTL or relationship blockers, MCP clients can
bypass the safer `mempr.context` tool by switching to resources.

First Principles: The invariant belongs to the destination's accepted state, not
to the transport shape. Tool calls and resource reads must agree on blockers.

Expansionist: Shared parity keeps future permissioned reads or live-store
adapters from inheriting two conflicting local semantics.

Outsider: A user should not need to know whether a client used an MCP tool or
resource to understand why stale or contradictory context was blocked.

Executor: Require Phase 7A exact destination, accepted-only eligibility,
TTL/relationship blocker parity before any returned context, non-secret blocker
evidence, and no destination-file, directory, ledger, or event side effects.

### Consensus

Resource/template reads are read-only views over Phase 7A assembly. They cannot
bypass destination-level blockers and cannot write files, create directories,
mutate ledger state, append events, or emit `memory_exported`.

## Council Pass 3: Boundary Wording

### Decision Being Tested

Docs must distinguish resource/template reads from `mempr.context`,
`mempr.export.preview`, and confirmed `mempr.export`, while repeating the
security and safety non-claims.

### Council Review

Contrarian: "Resource" may sound like raw file access, and "context" may sound
safe. Both are misleading if accepted sensitive content can still appear.

First Principles: Phase 7C reads local MemPR projections. It does not prove
truth, authorize a caller, redact content, query live stores, or write durable
output.

Expansionist: Clear distinctions make the MCP surface easier to teach:
resources and `mempr.context` return accepted context records, preview returns
would-write file content, and confirmed export writes after confirmation.

Outsider: The most useful sentence is simple: the URI names a MemPR destination
selector, not a file to open.

Executor: Repeat the boundaries in README, PRD, ADR-0020, and this council
note: no identity/authorization/permissioning/enforcement/security; returned
context is not truth/safety/non-sensitive/redaction proof; accepted sensitive
content can still appear; scanning, redaction, live stores, and HTTP/OAuth stay
deferred.

### Consensus

Phase 7C is constrained read-only local stdio MCP resource/template exposure for
read-context assembly. It is separate from the `mempr.context` tool,
`mempr.export.preview`, and confirmed `mempr.export`. The resource URI
destination is a MemPR destination selector, not arbitrary file/resource
passthrough. No identity, authorization, permissioning, enforcement, security,
truth validation, safety validation, scanning, redaction, live stores, or remote
MCP HTTP/OAuth are added.

## Residual Risks

- Accepted sensitive content can still appear in successful context resource
  output.
- URI-shaped destinations may still be mistaken for file/resource passthrough
  unless tests and docs keep the selector boundary visible.
- Local stdio callers can read accepted context without identity or
  authorization proof.
- Scope filtering, if later exposed on resource reads, may be mistaken for
  permissioning unless it remains post-blocker selection only.
- HTTP/OAuth, live store reads, scanning, redaction, retrieval ranking, truth
  scoring, safety scoring, and compliance-grade claims remain future work.
