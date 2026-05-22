# ADR-0022: Read-Context Expiry Warnings

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

ADR-0018 defined local read-context assembly with exact destination matching,
accepted-only eligibility, and export-parity blockers. ADR-0021 added
content-free read-context status for destination readiness and blockers.

The next safe read-governance slice is not permissioned reads, identity, or
security enforcement. It is earlier visibility for accepted records that are
still valid but approaching expiry. Maintainers need a way to see that a record
should be refreshed soon without fetching memory text and without turning a
warning into a blocker.

Expired accepted records already hard-block Phase 7A context assembly, Phase 7D
status readiness, and export through the existing accepted-only TTL blocker.
Phase 7E must preserve that behavior.

## Decision

Phase 7E defines stale/upcoming-expiry warnings as read-only, non-blocking
metadata on read-context outputs and Phase 7D status outputs.

The warnings appear on the content-returning read-context surfaces:

- CLI `mempr context [--destination <path>] [--scope <scope[,scope]>] [--json]`
- API `assembleReadContext`
- MCP tool `mempr.context`
- MCP resource/template `mempr://context/{destination}`

The same warning metadata appears on the content-free status surfaces:

- CLI `mempr context-status [--destination <path>] [--json]`
- API `summarizeReadContextStatus`
- MCP tool `mempr.context.status`
- MCP resource `mempr://contexts`
- MCP resource template `mempr://contexts/{destination}`

The contract is:

- Warnings are computed per exact destination summary.
- Warning eligibility is limited to accepted records whose `destination`
  exactly equals the summarized destination.
- On read-context assembly outputs, optional scope filters reduce returned
  records only after destination-level blockers pass. They do not hide
  destination-level warnings.
- Accepted records that have not expired but are inside the upcoming-expiry
  warning window may produce a warning.
- Expired accepted records do not produce mere warnings; they continue to hard
  block readiness through the existing accepted-only TTL blocker.
- Pending records, rejected records, and records for other destinations do not
  produce warnings for the summarized destination.
- Warnings are non-blocking. They do not make destination `ok` false, do not
  change context assembly eligibility, and do not change export eligibility.
- Warning evidence may include warning code, destination, accepted record IDs,
  `expires_at`, warning-window metadata, and time-to-expiry metadata.
- Warning payloads must not include memory text, source quotes, assembled
  record payloads, rendered context, destination-file content, export preview
  content, or full record payloads. Read-context surfaces may still return
  accepted records exactly as Phase 7A already allows after blockers pass; status
  surfaces remain content-free.
- Warnings must not write destination files, create parent directories, mutate
  `.mempr/ledger.jsonl`, append `.mempr/events.jsonl`, emit
  `memory_exported`, or create any other MemPR domain event.

Phase 7E does not add actor identity, reviewer identity, authorization,
permissioning, enforcement, security, truth validation, safety validation,
non-sensitivity proof, scanning, or redaction. A warning only says an accepted
record is approaching expiry according to local TTL metadata. It does not prove
the memory is true, safe, authorized, complete, non-sensitive, or redacted.

Permissioned read governance, identity/auth enforcement, retrieval ranking,
live stores, remote MCP HTTP/OAuth, sensitive-data scanning, and redaction
remain deferred.

## Options Considered

### Option A: Keep Expiry Warnings Deferred

Pros:

- Avoids adding another status field before permissioned read governance.
- Keeps Phase 7D status focused only on ready/blocked state.

Cons:

- Maintainers only learn about stale records after they expire and hard-block.
- Operators may call content-returning context surfaces just to inspect TTL
  urgency.
- Local dashboards and MCP clients lack a non-content signal for refresh work.

### Option B: Treat Upcoming Expiry As A Blocker

Pros:

- Maximizes caution around stale memory.
- Forces maintainers to refresh records before expiry.

Cons:

- Changes the TTL contract by blocking records that are still valid.
- Makes warning-window choices operationally dangerous.
- Blurs advisory observability with hard governance.

### Option C: Add Non-Blocking Content-Free Expiry Warnings

Pros:

- Gives maintainers early refresh visibility without returning memory content.
- Preserves the existing hard blocker for already expired accepted records.
- Keeps warning evidence small and compatible with Phase 7D status.
- Avoids permission, identity, scanning, redaction, or safety overclaims.

Cons:

- Adds one more status concept that docs and tests must keep distinct from
  blockers.
- Reveals local record IDs and expiry metadata.
- Can be mistaken for safety, authorization, or freshness proof unless the
  boundary is repeated.

## Consequences

- Phase 7E read-context and status surfaces can show advisory warning metadata
  for accepted records approaching expiry.
- Destination readiness still depends on Phase 7A/7D blockers, not warnings.
- Expired accepted records remain hard blockers.
- Warning output remains content-free and read-only.
- Warning metadata helps future local dashboards or maintainer workflows
  without requiring permissioned read governance.
- A warning is not a security, truth, authorization, non-sensitivity, or
  redaction claim.

## Verification

Phase 7E tests and docs should prove:

- warnings are returned on Phase 7A/7B/7C read-context surfaces and Phase 7D
  status surfaces
- warnings are computed per exact destination summary
- warnings consider accepted records for the summarized destination only
- pending, rejected, and other-destination records do not warn
- unexpired accepted records inside the warning window warn without blocking
- expired accepted records hard-block through the existing TTL issue instead
  of becoming warnings
- warning entries include only non-secret evidence such as warning code,
  destination, accepted record IDs, `expires_at`, and warning-window metadata
- warning entries do not include memory text, source quotes, assembled records,
  rendered context, destination-file content, export preview content, or full
  record payloads
- warnings do not write files, create directories, mutate ledger state, append
  events, or emit `memory_exported`
- docs keep identity, authorization, permissioning, enforcement, security,
  truth validation, safety validation, non-sensitivity proof, scanning,
  redaction, live stores, and remote MCP HTTP/OAuth deferred

## Deferred Risks

- permissioned read-side governance
- identity/auth enforcement
- permissioned expiry filtering
- read-context sensitive-data scanning
- read-context redaction
- truth, safety, non-sensitivity, or compliance-grade claims
- live memory-store reads
- remote MCP HTTP/OAuth transport
- retrieval ranking or vector search
- sensitive content already accepted into records

## Review Triggers

- changing warnings from advisory metadata into blockers
- changing expired accepted records from hard blockers into warnings
- returning memory text, source quotes, full records, rendered context, or
  destination-file preview content from warnings
- warning on pending, rejected, or other-destination records
- adding destination-file, directory, ledger, or event side effects
- treating warnings as authorization, permissioning, enforcement, security,
  truth validation, safety validation, freshness proof, non-sensitivity proof,
  scanning, or redaction proof
- exposing warnings over remote HTTP/OAuth or live stores
- changing the warning-window default or making it policy-configurable

## Supporting Evidence

- [ADR-0018 read-side context governance](0018-read-side-context-governance.md)
- [ADR-0021 read-context status observability](0021-read-context-status-observability.md)
- [Phase 7E expiry warnings council](../council/2026-05-21-phase-7e-read-context-expiry-warnings-pass.md)
