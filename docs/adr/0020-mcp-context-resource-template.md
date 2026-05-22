# ADR-0020: MCP Context Resource Template

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0018 accepted Phase 7A local read-context assembly. ADR-0019 exposed that
same assembly path through the read-only local stdio MCP `mempr.context` tool.

The MCP surface already supports constrained `mempr://` resource projections.
Phase 7C needs a resource/template read surface for the same read-context
assembly without creating a second read policy, an export preview alias,
arbitrary file passthrough, a live-store reader, or a permission system.

## Decision

Phase 7C exposes read-context assembly through constrained read-only local stdio
MCP resources/templates.

The accepted resource template is:

- `mempr://context/{destination}`

Implementations may also list concrete reviewed resources for known local
destinations, such as:

- `mempr://context/MEMORY.md`

The `{destination}` segment is a MemPR destination selector. It is not a
filesystem path passthrough, URL passthrough, repository-resource passthrough,
raw ledger/event resource, or generic MCP resource bridge.

Resource/template reads must reuse the Phase 7A contract:

- A caller requests one exact destination selector.
- Eligible records are limited to `accepted` records whose `destination`
  exactly equals that selector.
- Export-parity TTL blockers run before any context is returned.
- Export-parity accepted same-destination conflict and supersession blockers
  run before any context is returned.
- Optional scope filtering, if a resource-read variant supports it later, can
  reduce returned records only after TTL and relationship blockers pass.
- Blocking evidence can include record IDs, counts, destination, and
  relationship type. It must not include memory text or source quotes.
- Resource/template reads must not write destination files, create parent
  directories, mutate `.mempr/ledger.jsonl`, append `.mempr/events.jsonl`, emit
  `memory_exported`, or create any other MemPR domain event.

Phase 7C resource/template reads are distinct from related MCP and export
surfaces:

- `mempr://context/{destination}` returns the accepted read-context projection
  through MCP resource/template reads.
- `mempr.context` returns the same accepted read-context projection through an
  MCP tool call.
- `mempr.export.preview` previews the exact local destination-file content a
  committing export would write, without writing it.
- Confirmed `mempr.export` writes accepted memory into the destination file
  only after `confirm: true`.

Resource/template reads do not add actor identity, reviewer identity,
authorization, permissioning, enforcement, security, or compliance evidence.
Returned context is not proof that accepted memory is true, safe, complete,
non-sensitive, authorized, or redacted. Accepted sensitive content can still
appear because Phase 7C does not add scanning or redaction.

## Options Considered

### Option A: Keep Context Resources Deferred

Pros:

- Avoids expanding the MCP resource surface.
- Minimizes the chance that users confuse resources with permissioned reads.

Cons:

- Leaves MCP clients with only a tool-call shape for read-context assembly.
- Undercuts the existing constrained `mempr://` projection model.
- Encourages clients to overuse export preview when they only need accepted
  records.

### Option B: Reuse `mempr.export.preview` Resources

Pros:

- Avoids another URI family.
- Reuses existing preview behavior.

Cons:

- Blurs accepted context records with would-write destination-file content.
- Risks turning export preview into a retrieval API.
- Can expose outside-managed-block destination text in cases where preview
  reads existing files, which is not the read-context job.

### Option C: Add `mempr://context/{destination}`

Pros:

- Gives MCP clients a resource/template read shape for the existing Phase 7A
  context assembly contract.
- Keeps the URI under the constrained `mempr://` namespace.
- Makes the destination selector explicit without allowing arbitrary file,
  URL, repository, or raw event/ledger passthrough.
- Keeps tool context, resource context, preview, and confirmed export
  separately documented.

Cons:

- Adds one more MCP discovery/read surface to document and test.
- The URI shape can be mistaken for filesystem passthrough unless docs and
  validation keep saying it is a MemPR destination selector.
- Successful reads can still return accepted sensitive content because scanning
  and redaction remain deferred.

## Consequences

- MCP `resources/templates/list` may advertise `mempr://context/{destination}`
  as the Phase 7C read-context template.
- MCP `resources/list` may advertise concrete context resources such as
  `mempr://context/MEMORY.md` when appropriate.
- MCP `resources/read` for context must reuse Phase 7A exact-destination,
  accepted-only, TTL-blocker, relationship-blocker, and no-side-effect rules.
- `mempr://context/{destination}`, `mempr.context`, `mempr.export.preview`, and
  confirmed `mempr.export` must remain distinct in docs and tests.
- Destination selector validation must not drift into arbitrary file, URL,
  repository, raw ledger, raw event, or generic resource passthrough.
- Scope filters remain selectors after destination-level blockers, not access
  controls.

## Verification

Phase 7C tests and docs should prove:

- `resources/templates/list` exposes the constrained
  `mempr://context/{destination}` template.
- `resources/list` may expose reviewed concrete resources such as
  `mempr://context/MEMORY.md`.
- `resources/read` for context reuses Phase 7A exact destination,
  accepted-only eligibility, TTL blocking, accepted relationship blocking, and
  no write/event/destination-file side effects.
- The URI destination is treated as a MemPR destination selector, not arbitrary
  file/resource passthrough.
- Context resource reads are distinguished from the `mempr.context` tool,
  `mempr.export.preview`, and confirmed `mempr.export`.
- Blocked results expose non-secret evidence only.
- Docs repeat that identity, authorization, permissioning, enforcement,
  security, truth validation, safety validation, scanning, redaction, live
  stores, and remote MCP HTTP/OAuth remain deferred.

## Deferred Risks

- permissioned read-side governance
- actor or reviewer identity
- authorization, permission semantics, and enforcement
- remote MCP HTTP/OAuth transport
- live memory-store reads
- retrieval ranking or vector search
- read-context sensitive-data scanning
- read-context redaction
- truth, safety, or compliance-grade claims

## Review Triggers

- changing context resources from read-only to write-capable
- adding confirmation or events to context resource reads
- changing exact destination selector semantics
- returning pending, rejected, or other-destination records
- changing TTL or accepted relationship blocker parity with Phase 7A/export
- treating resource URI destinations as arbitrary file, URL, repository, raw
  ledger, raw event, or generic resource passthrough
- adding destination-file, directory, ledger, or event side effects
- treating scope filtering as identity, authorization, permissioning,
  enforcement, or security
- exposing context resources over HTTP/OAuth or live stores
- adding scanning, redaction, truth scoring, or safety scoring

## Supporting Evidence

- [ADR-0017 MCP local agent surface](0017-mcp-local-agent-surface.md)
- [ADR-0018 read-side context governance](0018-read-side-context-governance.md)
- [ADR-0019 MCP read-context surface](0019-mcp-read-context-surface.md)
- [Phase 7C MCP context resource council](../council/2026-05-21-phase-7c-mcp-context-resource-pass.md)
