# ADR-0019: MCP Read-Context Surface

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0018 accepted Phase 7A local read-context assembly. That contract assembles
accepted records for one exact destination, reuses export-parity TTL and
accepted relationship blockers before optional scope filtering, and has no
destination-file, directory, ledger, or event side effects.

ADR-0017 accepted a local stdio-first MCP surface and later phases added
confirmed MCP export mutation plus read-only MCP export preview. Phase 7B needs
to expose Phase 7A read-context assembly to local MCP clients without turning
context assembly into export preview, confirmed export, a permission system, a
live store reader, or a safety/redaction layer.

## Decision

Phase 7B exposes read-context assembly through local stdio MCP as read-only
`mempr.context`.

The tool contract is:

- Transport remains local `stdio`; no HTTP/OAuth transport or authorization is
  added.
- The tool operation is read-only and does not require or accept
  `confirm: true`.
- A caller may request one exact destination and optional scope filters.
- Eligible records are limited to `accepted` records whose `destination`
  exactly equals the requested destination.
- Export-parity TTL blockers run before any context is returned and before
  optional scope filtering.
- Export-parity accepted same-destination conflict and supersession blockers
  run before any context is returned and before optional scope filtering.
- Optional scope filtering can reduce returned records only after TTL and
  accepted relationship blockers pass.
- The tool returns assembled accepted records and non-secret blocker metadata;
  it does not return destination-file preview content.
- The tool must not write destination files, create parent directories, mutate
  `.mempr/ledger.jsonl`, append `.mempr/events.jsonl`, emit
  `memory_exported`, or create any other MemPR domain event.

`mempr.context` is distinct from both MCP export surfaces:

- `mempr.context` assembles accepted read context records for one destination.
- `mempr.export.preview` previews the exact local destination content a
  committing export would write, without writing it.
- Confirmed `mempr.export` writes accepted memory into the destination file
  only after `confirm: true`.

Scope filtering remains local presentation-time selection. It is not actor
identity, reviewer identity, authorization, permissioning, enforcement,
security, or compliance evidence.

Returned context is not proof that accepted memory is true, safe, complete,
non-sensitive, authorized, or redacted. Accepted sensitive content can still
appear because Phase 7B does not add scanning or redaction.

## Options Considered

### Option A: Keep MCP Read Context Deferred

Pros:

- Avoids adding another MCP tool to document and test.
- Reduces the chance that a local MCP caller mistakes context assembly for
  permissioned reads.

Cons:

- Leaves local MCP clients without the same no-write context assembly available
  to CLI/API callers.
- Encourages clients to misuse export preview when they need accepted records
  rather than would-write destination content.

### Option B: Reuse `mempr.export.preview` For Read Context

Pros:

- Avoids a new tool name.
- Reuses an existing read-only MCP entry point.

Cons:

- Blurs two different outputs: read-context records versus destination-file
  preview content.
- Risks treating export preview as a retrieval API.
- Makes it harder to keep accepted-record assembly side effects and evidence
  separate from managed-block export rendering.

### Option C: Add Read-Only `mempr.context`

Pros:

- Mirrors the Phase 7A CLI/API context assembly contract.
- Keeps export preview and confirmed export clearly separate.
- Reuses accepted-only exact destination eligibility and export-parity
  blockers without a second read-governance policy.
- Preserves the local stdio MCP boundary and no-write/no-event behavior.

Cons:

- Adds one more MCP tool and documentation surface.
- Can be mistaken for permissioned read governance unless boundaries stay
  explicit.
- Can still return accepted sensitive content because scanning and redaction
  remain deferred.

## Consequences

- Phase 7B gives local MCP clients a read-only context assembly surface.
- MCP read context shares Phase 7A exact-destination, accepted-only, blocker
  order, and no-side-effect rules.
- `mempr.context`, `mempr.export.preview`, and confirmed `mempr.export` must
  remain separately documented and tested.
- Scope filters remain selectors after destination-level blockers, not access
  controls.
- Docs and tests must keep truth validation, safety validation, scanning,
  redaction, live stores, identity, authorization, permissioning, enforcement,
  and security claims out of Phase 7B.

## Verification

Phase 7B tests and docs should prove:

- `tools/list` exposes `mempr.context` as read-only with no required human
  confirmation and no domain event.
- `tools/call` for `mempr.context` reuses Phase 7A exact destination,
  accepted-only eligibility, TTL blocking, accepted relationship blocking, and
  post-blocker scope filtering.
- MCP read context does not write destination files, create parent directories,
  mutate ledger state, append events, or emit `memory_exported`.
- Blocked results expose non-secret evidence only.
- Docs distinguish `mempr.context` from `mempr.export.preview` and confirmed
  `mempr.export`.

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

- changing `mempr.context` from read-only to write-capable
- adding confirmation or events to `mempr.context`
- changing exact destination eligibility
- returning pending, rejected, or other-destination records
- changing TTL or accepted relationship blocker parity with Phase 7A/export
- moving scope filtering before blockers
- adding destination-file, directory, ledger, or event side effects
- treating scope filtering as identity, authorization, permissioning,
  enforcement, or security
- exposing read context over HTTP/OAuth or live stores
- adding scanning, redaction, truth scoring, or safety scoring

## Supporting Evidence

- [ADR-0017 MCP local agent surface](0017-mcp-local-agent-surface.md)
- [ADR-0018 read-side context governance](0018-read-side-context-governance.md)
- [Phase 7B MCP read-context council](../council/2026-05-21-phase-7b-mcp-read-context-pass.md)
