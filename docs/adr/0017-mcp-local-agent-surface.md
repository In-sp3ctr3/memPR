# ADR-0017: MCP Local Agent Surface

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

Phase 5A is the first MCP contract pass for MemPR. The goal is to expose the
same local memory-governance lifecycle that already exists in the CLI without
turning MemPR into a general MCP proxy, remote service, filesystem gateway, or
security product.

The target protocol is the official Model Context Protocol specification
version `2025-11-25`. The rendered MCP spec identifies this version as the
latest at review time, and its transport and authorization pages make an
important distinction for MemPR: `stdio` is a local subprocess transport, while
HTTP transport has separate authorization requirements.

Because MemPR currently has no actor identity, signatures, tamper-proof event
hashes, hosted authorization, or compliance-grade audit model, the MCP surface
must avoid claims that it proves human identity, makes memory safe, prevents
all prompt injection, or produces audit-grade evidence.

## Decision

Phase 5A will implement MCP as a local `stdio` server first. The server is
launched by an MCP client as a local subprocess and speaks JSON-RPC over
standard input and standard output. It must not expose a network listener in
Phase 5A.

HTTP transport, OAuth authorization, remote hosting, scope challenge behavior,
protected-resource metadata, and scope enforcement are deferred until a later
ADR. Phase 5A may reserve least-privilege scope names in the local contract so a
future HTTP ADR starts from reviewed vocabulary, but those names are not shipped
authorization behavior yet. Any future HTTP surface must re-review the
then-current MCP authorization and transport specs before implementation.

The MCP tool surface mirrors the existing CLI record lifecycle instead of
introducing a separate pull-request lifecycle:

| MCP tool | CLI lifecycle mirror | Phase 5A behavior |
| --- | --- | --- |
| `mempr.propose` | `propose` | create a local memory proposal through existing policy; current write handler requires `confirm: true` |
| `mempr.list` | `list` / `inbox` | list records with status, risk, destination, and review filters |
| `mempr.inspect` | `diff` | inspect one record and direct relationship context |
| `mempr.history` | `history` | read one record's local event timeline without repair or rollback |
| `mempr.review` | `review` / `accept` / `reject` | accept or reject a pending record with an explicit reason; requires `confirm: true` |
| `mempr.export` | `export` | write accepted memory to one destination after export checks; requires `confirm: true` |
| `mempr.export.preview` | `export --dry-run` | preview the local export output through the Phase 6D dry-run path; read-only and no `confirm` |
| `mempr.check` | `check` | report local current-view/event drift diagnostics |

`migrate` remains CLI-only in Phase 5A. Exposing migration/backfill through MCP
would add a maintenance mutation path and needs a separate decision.

All current MCP write tools require explicit confirmation at the server
boundary. This applies to `mempr.propose`, `mempr.review` accept/reject
operations, and `mempr.export`. The confirmation gate is a literal boolean
`confirm: true` argument on the tool call; missing, false, string, or otherwise
non-boolean confirmation must be rejected before side effects. Confirmation is
treated as a local interaction signal, not proof of human identity. MemPR must
not describe confirmation as a signature, authorization decision, audit receipt,
or compliance control.

MCP mutation handlers add a destination guard for propose/export destinations.
Destination arguments are accepted only as repo-relative destination strings.
Absolute paths, traversal segments, backslashes, URL-like strings, and generic
file or URL passthrough values must be rejected at the MCP boundary before
proposal creation or export writes.

MCP resources are constrained to MemPR-owned projections under a custom
`mempr://` namespace. Phase 5A resources may include:

- `mempr://records`
- `mempr://records/{id}`
- `mempr://records/{id}/history`
- `mempr://policy`
- `mempr://status`

The server must not expose arbitrary `file://`, `git://`, `https://`, or local
path passthrough resources. Resource contents must be projections of MemPR
state, not raw access to source files, destination files, repository files,
ledger lines, or event payloads. Tools must not return resource links that
bypass this boundary.

MCP logging is operational telemetry only. If Phase 5A emits MCP log
notifications, those logs must stay separate from `.mempr/events.jsonl`. The
MemPR event ledger remains the local domain-event record for proposals,
status changes, exports, and migrations. MCP logs may include non-secret issue
codes, tool names, record IDs, and coarse status, but must not contain secrets,
credentials, full unrelated memory payloads, or source quotes.

Phase 5A does not expose MCP prompts, sampling, elicitation, proxy mode,
tool-to-tool forwarding, remote resources, or arbitrary upstream MCP server
aggregation. Those features require separate ADRs because they change user
interaction, data flow, and trust boundaries.

## Phase 5B Skeleton Note

Phase 5B implements only the local stdio MCP server skeleton from this
contract. The shipped method surface is limited to:

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `resources/list`
- `resources/templates/list`
- `logging/setLevel`

`tools/list`, `resources/list`, and `resources/templates/list` are discovery
metadata only. Phase 5B does not implement `tools/call`, MemPR lifecycle
mutations, `resources/read`, resource content reads, HTTP transport, OAuth
authorization, arbitrary resources, prompts, sampling, elicitation, proxy mode,
or audit/security claims. `logging/setLevel` accepts a client log-level
preference; it does not write to `.mempr/events.jsonl` or create audit
evidence.

## Phase 5C Read-Only Handler Note

Phase 5C adds only read-only handlers to the local stdio server. `tools/call`
is limited to:

- `mempr.list`
- `mempr.inspect`
- `mempr.history`
- `mempr.check`

`resources/read` is limited to constrained `mempr://` projections for MemPR
records, policy, status, record review context, and record history.

Phase 5C does not implement `mempr.propose`, `mempr.review`, or `mempr.export`
mutations. It does not add HTTP transport, OAuth authorization, arbitrary
file/repository/URL/resource passthrough, raw ledger/event reads, prompts,
sampling, elicitation, proxy mode, or audit/security guarantees.

## Phase 5D Confirmed Mutation Note

Phase 5D adds the local stdio MCP mutation slice. `tools/call` may invoke:

- `mempr.propose`
- `mempr.review`
- `mempr.export`

These tools are available only when the tool arguments include the literal
boolean `confirm: true`. The server boundary rejects missing, false, string, or
otherwise non-boolean confirmation before calling the underlying mutation path
or writing MemPR events. `confirm: true` is a local interaction signal from the
caller to the local server. It is not actor identity, a signature,
authorization, a compliance control, or proof that a human reviewed the action.

`mempr.propose` and `mempr.export` also apply an MCP-level destination guard.
Their destination arguments must be repo-relative destination strings. Absolute
paths, traversal, backslashes, URL-like strings, and arbitrary file/URL
passthrough values are rejected before proposal creation or export side
effects.

Phase 5D does not add HTTP transport, OAuth authorization, arbitrary
file/repository/URL/resource passthrough, raw ledger/event reads, prompts,
sampling, elicitation, proxy mode, migration/backfill mutation tools, or
audit/security guarantees.

## Phase 6E MCP Export Preview Note

Phase 6E adds `mempr.export.preview` as a read-only local stdio MCP tool. It is
separate from the confirmed `mempr.export` mutation and does not accept or
require `confirm`.

`mempr.export.preview` reuses the Phase 6D local export dry-run path. It must
run the same destination validation, adapter compatibility, accepted-only exact
destination filtering, relationship blocking, TTL blocking, and rendering logic
as committing export, then return deterministic preview metadata and content.

The preview tool must not write destination files, create parent directories,
or append `memory_exported` events. It is not arbitrary file/resource
passthrough: missing destinations may be previewed, but an existing destination
is previewable through MCP only when that file already contains a complete
MemPR managed block. This guard exists because preview content can include
existing destination text outside the managed block.

Phase 6E does not add HTTP/OAuth, authorization enforcement, export-time
scanning/redaction, prompts, sampling, elicitation, proxy mode, live adapters,
downstream ID reconciliation, retries/auth, read-side governance, or
audit/security guarantees.

## MCP Non-Goals

The Phase 5 local MCP surface does not add:

- HTTP or Streamable HTTP transport
- OAuth authorization, protected-resource metadata, token handling, or scope
  enforcement
- arbitrary file, repository, URL, or resource passthrough
- MCP proxy mode or upstream server aggregation
- MCP prompts, sampling, or elicitation
- migration/backfill mutation tools
- actor or reviewer identity
- signatures, hashes, tamper evidence, or audit-grade proof
- hosted review UI, comments, merge/close lifecycle, rollback, or repair
- security claims beyond a local stdio-first contract with constrained tools
  and resources

## Options Considered

### Option A: Local Stdio Lifecycle Surface

Pros:

- Matches MemPR's current local-first architecture.
- Avoids opening a remote network surface before OAuth scope enforcement exists.
- Lets tools reuse the CLI lifecycle and policy boundaries.
- Keeps resources constrained to MemPR projections.

Cons:

- Remote MCP clients cannot use MemPR directly.
- Confirmation depends on client integration and is not identity proof.
- HTTP/OAuth compatibility work is deferred.

### Option B: HTTP/OAuth MCP Server Now

Pros:

- Easier for remote clients and hosted agent workflows to connect.
- Allows explicit auth-scope design earlier.

Cons:

- Requires a full authorization and transport design before MemPR has actor
  identity or hosted security posture.
- Increases attack surface with DNS rebinding, token, session, and origin
  concerns.
- Risks premature audit/security claims.

### Option C: General MCP Proxy And File Gateway

Pros:

- Broad integration story.
- Could route arbitrary project context to agents.

Cons:

- Conflicts with MemPR's write-governance boundary.
- Enables data exfiltration through resources and tool results.
- Makes review/export confirmation ambiguous.
- Would require security controls that do not exist yet.

## Consequences

- Phase 5A implementation and tests must target MCP spec `2025-11-25`.
- The MCP server starts local and stdio-only.
- Least-privilege scope names may be reserved in the contract, but HTTP/OAuth
  enforcement remains deferred.
- MCP tools reuse MemPR's record statuses and lifecycle instead of inventing
  `merge`, `close`, or comment semantics.
- All current MCP write tools are gated by explicit `confirm: true` without
  claiming identity, signature, authorization, or audit proof.
- MCP propose/export destinations are guarded as repo-relative strings only,
  rejecting absolute, traversal, backslash, URL-like, and arbitrary file/URL
  passthrough values before side effects.
- MCP export preview is read-only, reuses Phase 6D dry-run behavior, and keeps
  `mempr.export` as the only MCP export write path.
- MCP export preview rejects unmanaged existing destinations so preview cannot
  become arbitrary repository-file disclosure.
- MCP resources expose only constrained `mempr://` projections.
- MCP logging remains separate from the MemPR event ledger.
- HTTP/OAuth, prompts, sampling, elicitation, proxy mode, and migration tools
  remain deferred.
- Public docs must distinguish the shipped Phase 5B stdio skeleton, the Phase
  5C read-only handler slice, and the Phase 5D confirmed mutation slice.

## Verification

Phase 5A contract tests should prove the planned local surface:

- protocol version `2025-11-25` is pinned
- stdio is the only supported transport in the contract
- HTTP/OAuth remains deferred
- tool names and schemas mirror the CLI lifecycle listed above
- `mempr.propose`, `mempr.review`, and `mempr.export` require explicit
  `confirm: true` before side effects
- `mempr.export.preview` is read-only, requires no confirmation, emits no
  domain event, and produces no destination-file, directory, or event side
  effects
- MCP export preview rejects unmanaged existing destinations and unsafe
  destination strings
- write-tool confirmation is not represented as identity, signature,
  authorization, or audit proof
- MCP propose/export destinations reject absolute paths, traversal,
  backslashes, URL-like strings, and arbitrary file/URL passthrough values
- resource listing only returns `mempr://` URIs
- arbitrary `file://`, `git://`, `https://`, and path resources are rejected
- tool results do not return resource links outside the `mempr://` namespace
- MCP logging does not append to `.mempr/events.jsonl`
- logs redact secrets, credentials, unrelated memory payloads, and source quotes
- prompts, sampling, elicitation, proxy mode, and migration tools are absent

Phase 5C read-only handler tests cover:

- `tools/call` succeeds only for `mempr.list`, `mempr.inspect`,
  `mempr.history`, and `mempr.check`
- `tools/call` rejects or returns MCP tool errors for `mempr.propose`,
  `mempr.review`, `mempr.export`, unknown tools, and unsupported arguments
- `resources/read` succeeds only for reviewed `mempr://` projections
- arbitrary `file://`, `git://`, `http://`, `https://`, path traversal, raw
  ledger, and raw event resource attempts are rejected
- read-only outputs remain projections of MemPR state and do not create MemPR
  domain events

Phase 5D confirmed mutation tests cover:

- `tools/call` rejects `mempr.propose`, `mempr.review`, and `mempr.export`
  without `confirm: true`, including missing, false, string, or otherwise
  non-boolean confirmation values
- `tools/call` with `confirm: true` reaches the same proposal, review, export,
  policy, event, TTL, and relationship-governance paths as the CLI lifecycle
- `mempr.propose` and `mempr.export` reject destination arguments that are
  absolute, traversal-based, backslash-based, URL-like, or otherwise outside the
  repo-relative destination contract
- confirmed mutation errors remain non-leaky and do not echo unrelated memory
  text, source quotes, raw ledger lines, raw event payloads, credentials, or
  destination file contents
- HTTP/OAuth, prompts, sampling, elicitation, proxy mode, migration/backfill
  tools, and arbitrary file/URL/resource passthrough remain absent

## Deferred Risks

- Client confirmation UX differs across MCP hosts.
- `confirm: true` can be supplied by any local caller and must not be treated as
  identity, authorization, signature, or non-repudiation.
- Destination guards must remain centralized so future adapters do not loosen
  the repo-relative/no-passthrough MCP boundary.
- Stdio-only transport limits remote workflow adoption.
- Future HTTP/OAuth support will need its own threat model and contract tests.
- Future audit-grade claims still require identity, tamper evidence, retention,
  redaction, and stronger transactionality.
- Future prompts, sampling, elicitation, and proxy features may introduce new
  memory-poisoning and data-exfiltration paths.

## Review Triggers

- adding HTTP, Streamable HTTP, OAuth, scope enforcement, or remote hosting
- exposing MCP resources outside `mempr://`
- adding file, URL, repository, or raw ledger/event passthrough
- changing MCP tool names, schemas, confirmation behavior, destination
  validation, or lifecycle mapping
- exposing `migrate` or other maintenance mutations through MCP
- emitting MCP logs into `.mempr/events.jsonl`
- adding MCP prompts, sampling, elicitation, or proxy mode
- making security, identity, or audit-grade claims about MCP behavior
- changing the pinned MCP spec version

## References

- [MCP specification](https://modelcontextprotocol.io/specification)
- [MCP 2025-11-25 overview](https://modelcontextprotocol.io/specification/2025-11-25/basic)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- [MCP logging](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging)
- [MCP prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts)
- [MCP sampling](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling)
- [MCP elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
