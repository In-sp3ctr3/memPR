# ADR-0021: Read-Context Status Observability

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0018 accepted Phase 7A local read-context assembly for one exact
destination. ADR-0019 exposed the same assembly through the read-only local
stdio MCP `mempr.context` tool. ADR-0020 exposed the same assembly through
constrained `mempr://context/{destination}` MCP resources/templates.

Those surfaces answer a content question: what accepted context records can be
returned after destination-level blockers pass? Phase 7D needs a narrower
observability answer: is a destination ready for read-context assembly, and if
not, which destination-level blockers explain the failure?

That status answer must not become another context read, export preview,
confirmed export, scanner, authorization system, or safety proof. Operators and
local clients need readiness, counts, record IDs, and issue metadata without
fetching memory text or source quotes.

## Decision

Phase 7D defines read-context status/observability as a read-only,
content-free projection of the Phase 7A destination preflight.

The shipped surfaces are:

- CLI `mempr context-status [--destination <path>] [--json]`
- API `summarizeReadContextStatus`
- MCP tool `mempr.context.status`
- MCP resource `mempr://contexts`
- MCP resource template `mempr://contexts/{destination}`

The contract is:

- A status response is composed of exact destination-level summaries.
- Unfiltered CLI/API/MCP status and `mempr://contexts` may summarize all
  recorded destinations, but each destination summary uses exact destination
  matching.
- `--destination`, a `mempr.context.status` destination argument, and
  `mempr://contexts/{destination}` summarize one exact destination.
- Records are counted only when their `destination` exactly equals the
  summarized destination.
- Readiness/blocker eligibility is limited to `accepted` records for that exact
  destination.
- Destination readiness is reported after running the same accepted-only TTL
  and accepted relationship blockers used by Phase 7A and export.
- Expired accepted records for the summarized destination block readiness.
- Accepted same-destination conflict or supersession pairs block readiness.
- Pending records, rejected records, and accepted records for other
  destinations do not block the summarized destination status.
- Status may report aggregate readiness, blocker presence, destination,
  `total`/`accepted`/`pending`/`rejected` counts, accepted record IDs,
  relationship type, blocker record IDs, issue codes, and issue messages.
- Status must not return memory text, source quotes, assembled record payloads,
  rendered context, destination-file content, or export preview content.
- Status must not write destination files, create parent directories, mutate
  `.mempr/ledger.jsonl`, append `.mempr/events.jsonl`, emit
  `memory_exported`, or create any other MemPR domain event.

Read-context status is distinct from related surfaces:

- `mempr context` assembles accepted read-context records for one destination.
- `mempr.context` returns the same accepted read-context projection through an
  MCP tool call.
- `mempr://context/{destination}` returns the same accepted read-context
  projection through MCP resource/template reads.
- `mempr://status` returns ledger/event consistency status, not read-context
  readiness.
- `mempr.export.preview` previews the exact local destination-file content a
  committing export would write, without writing it.
- Confirmed `mempr.export` writes accepted memory into the destination file
  only after `confirm: true`.

Phase 7D does not add actor identity, reviewer identity, authorization,
permissioning, enforcement, security, or compliance evidence. A ready status is
not proof that accepted memories are true, safe, complete, non-sensitive,
authorized, or redacted. Accepted sensitive content can still exist in accepted
records even though status does not echo it.

Scanning, redaction, live stores, remote MCP HTTP/OAuth, retrieval ranking, and
permissioned read governance remain deferred.

## Options Considered

### Option A: Keep Status Fully Deferred

Pros:

- Avoids adding another documentation and test surface.
- Reduces the chance that status is confused with permissioned read governance.

Cons:

- Forces operators to call content-returning context surfaces only to learn
  whether a destination is blocked.
- Makes it harder to monitor destination readiness without exposing memory
  text.
- Leaves blocker observability coupled to context retrieval.

### Option B: Reuse Existing Context Reads As Status

Pros:

- Avoids a separate status contract.
- Reuses current Phase 7A/B/C outputs.

Cons:

- Returns memory content when the caller only needs readiness.
- Blurs status with `mempr context`, `mempr.context`, and
  `mempr://context/{destination}`.
- Encourages clients to parse content-bearing responses for observability.

### Option C: Add Content-Free Read-Context Status

Pros:

- Gives operators aggregate and destination-level readiness without memory text.
- Reuses Phase 7A exact destination, accepted-only eligibility, blocker order,
  and no-side-effect rules.
- Keeps content-returning context reads, export preview, and confirmed export
  separate.
- Provides a future-friendly contract for local observability without
  permissioning or security overclaims.

Cons:

- Adds another surface to document and test.
- Can still be mistaken for authorization, safety, or redaction proof unless
  boundaries stay explicit.
- Reveals non-secret record IDs and issue metadata, which still need careful
  output discipline.

## Consequences

- Phase 7D status reports aggregate and destination readiness/blockers without
  memory text or source quotes.
- Destination status shares Phase 7A exact-destination, accepted-only,
  TTL-blocker, relationship-blocker, blocker-order, and no-side-effect rules.
- Status surfaces must remain distinct from `mempr context`, `mempr.context`,
  `mempr://context/{destination}`, ledger `mempr://status`,
  `mempr.export.preview`, and confirmed `mempr.export`.
- Status can support observability and readiness checks without implying
  identity, authorization, permissioning, enforcement, security, scanning,
  redaction, live stores, or remote MCP HTTP/OAuth.
- A ready status only means the local Phase 7A blocker preflight passed for the
  summarized destination. It does not prove truth, safety, non-sensitivity, or
  redaction.

## Verification

Phase 7D tests and docs should prove:

- status exposes `context-status`, `summarizeReadContextStatus`,
  `mempr.context.status`, `mempr://contexts`, and
  `mempr://contexts/{destination}`
- aggregate status is composed of exact destination-level summaries
- filtered status reports one exact destination
- status considers accepted records for readiness/blockers in each exact
  destination summary only
- expired accepted records block readiness with non-secret issue metadata
- accepted same-destination conflict and supersession pairs block readiness
  with non-secret issue metadata
- pending, rejected, and other-destination records do not block readiness
- status reports readiness, counts, accepted record IDs, and issue metadata
  without memory text, source quotes, assembled records, or preview content
- status has no destination-file, directory, ledger, or event side effects
- status remains distinct from `mempr context`, `mempr.context`,
  `mempr://context/{destination}`, ledger `mempr://status`,
  `mempr.export.preview`, and confirmed `mempr.export`
- docs repeat that identity, authorization, permissioning, enforcement,
  security, truth validation, safety validation, non-sensitivity proof,
  scanning, redaction, live stores, and remote MCP HTTP/OAuth remain deferred

## Deferred Risks

- permissioned read-side governance
- actor or reviewer identity
- authorization, permission semantics, and enforcement
- remote MCP HTTP/OAuth transport
- live memory-store reads
- retrieval ranking or vector search
- read-context sensitive-data scanning
- read-context redaction
- truth, safety, non-sensitivity, or compliance-grade claims
- sensitive content already accepted into records

## Review Triggers

- changing status from content-free observability to content-returning context
- returning memory text, source quotes, full records, rendered context, or
  destination-file preview content from status
- changing exact destination summary semantics
- returning pending, rejected, or other-destination records as eligible status
  records
- changing TTL or accepted relationship blocker parity with Phase 7A/export
- adding scope filters that bypass destination-level blockers
- adding destination-file, directory, ledger, or event side effects
- treating status as identity, authorization, permissioning, enforcement,
  security, truth validation, safety validation, non-sensitivity proof, or
  redaction proof
- exposing status over HTTP/OAuth or live stores
- adding scanning, redaction, truth scoring, or safety scoring

## Supporting Evidence

- [ADR-0018 read-side context governance](0018-read-side-context-governance.md)
- [ADR-0019 MCP read-context surface](0019-mcp-read-context-surface.md)
- [ADR-0020 MCP context resource template](0020-mcp-context-resource-template.md)
- [Phase 7D read-context status council](../council/2026-05-21-phase-7d-read-context-status-pass.md)
