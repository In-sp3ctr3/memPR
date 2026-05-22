# MemPR

Pull requests for AI memory.

MemPR is a local-first governance layer for durable agent memory. It does not try
to replace memory stores like Mem0, Claude memory files, LangGraph stores, or an
LLM Wiki. Instead, it sits in front of them and asks a smaller, sharper question:

> Should this become permanent memory, and can we show where it came from and why it was accepted or rejected?

## The Problem

AI agents are starting to remember things across sessions, projects, tools, and
teams. That is powerful, but the write path is still too casual.

An agent can infer, summarize, or import a memory that is:

- wrong
- stale
- too broad
- sensitive
- poisoned by untrusted input
- impossible to trace back to a source

Most memory systems focus on storage and retrieval. MemPR focuses on the moment
before something becomes durable memory.

## Quick Start

```bash
npm install
npm run build

node dist/cli.js propose \
  --memory "This repo uses npm for package management." \
  --source package.json \
  --scope repo \
  --source-trust trusted

node dist/cli.js list --status accepted
node dist/cli.js export --destination MEMORY.md
```

Repo- and project-scoped low-risk memories are auto-accepted by default. To test
the manual review path, propose a medium-risk record:

```bash
node dist/cli.js propose \
  --memory "The maintainer prefers short issue titles." \
  --source manual \
  --scope user \
  --risk medium

node dist/cli.js list --status pending
node dist/cli.js accept <id> --reason "Confirmed by maintainer."
```

MemPR stores its current local view in `.mempr/ledger.jsonl` and emits proposal,
status-change, and export events to `.mempr/events.jsonl`. The directory is
ignored by default so teams can decide when, where, and how to share approved
memory.

Proposal records include `source_trust` metadata and a `policy_version` marker.
Source trust can be `trusted`, `unknown`, or `untrusted`; `untrusted` prevents
automatic acceptance, while `trusted` never bypasses deny terms, secret-like
content, sensitive-content review, relationship gates, TTL/read blockers, or
read-policy denials. `policy_version` identifies the MemPR policy
implementation that made the decision. New proposal events also capture a
canonical `policy_config_hash` for local replay evidence.

TTL values are stored as canonical `ttl` / `expires_at` metadata. Expired
accepted records block `export` for their destination so stale memory is not
written into future agent context. That TTL behavior is export-time blocking
only; it is not read governance, conflict detection, or supersession.

Conflict and supersession metadata is a Phase 3D review gate. Records use
`supersedes` and `conflicts_with` arrays, with missing legacy fields treated as
empty arrays. A proposal that declares either relationship requires maintainer
review and is not auto-accepted.

R8 adds explicit relationship lifecycle support. `mempr relationships [id]`
reports incoming links, outgoing links, missing references, and supersession
cycles. `accepted` records can be moved to `retired`; retirement never deletes
or rewrites the record. `mempr accept <id> --retire-superseded --reason <text>`
accepts a replacement and retires accepted same-destination records it
supersedes, while `--override-relationships` records maintainer override
evidence without bypassing export/read-context blockers.

Export is a trust boundary for accepted memory written into a destination.
Phase 3E blocks `export` when accepted records for the requested destination
contain both sides of a declared conflict or supersession relationship. Pending,
rejected, and other-destination linked records do not block that export. Error
evidence should identify record IDs and relationship type only, not memory text
or source quotes.

Current command surface (v0.1 command list; Phase 7D status, Phase 7E
warnings, Phase 7F permissioned-read prerequisites, Phase 7G actor/permission
contract foundations, Phase 7H opt-in permissioned scope constraint, Phase 7I
opt-in permissioned expiry constraint, Phase 7J opt-in conflict/supersession
constraints, and Phase 7K optional read-context permission-denied evidence are
documented as separate contracts below; Phase 7L documents that current read
actor values are caller-asserted and unauthenticated; R3/R4/R5 add an
opt-in local signed-principal read-policy gate when `.mempr/read-policy.json`
exists):

- `propose` for memory proposals
- `list` to inspect proposals by status, risk, or destination
- `inbox` to show pending records for review
- `diff` to inspect one record and its relationship context
- `history` to inspect one record's local event timeline
- `review` to accept or reject with an explicit mode and reason
- `accept` / `reject` / `retire` for manual review decisions
- `relationships` to inspect incoming links and supersession cycles
- `export` to write accepted memories to one destination
- `sync-live` to dry-run or confirm live adapter sync
- `context` to assemble accepted local read context for one exact destination
- `context-status` to inspect destination-level read-context readiness and
  non-blocking expiry warnings without memory text
- `check` to compare the current ledger with event replay and report drift
- `repair --from-events` to preview or confirm current-ledger recovery from
  verified event replay
- `diagnostics` to write a redacted admin support bundle to `.mempr/diagnostics.jsonl`
- `migrate` to backfill missing legacy event history from the current ledger

Live adapters use a dry-run/confirm contract. `sync-live --adapter fake
--dry-run` plans a no-network sync. Confirmed sync requires `--confirm`, writes
`memory_live_synced` evidence, uses deterministic idempotency keys, reconciles
prior downstream IDs, and reports per-record retries and partial failures.
`mem0`, `langgraph`, `llm-wiki`, and `custom` adapters are credential-gated by
environment variables and endpoint configuration; the fake adapter is the
default no-network test adapter.

Reviewer ergonomics:

- `inbox` lists pending records with risk/destination filters and JSON output.
- `diff <id>` shows a local review view for one record and its direct relationship context.
- `history <id> [--json]` shows current target record state plus summarized proposal, status-change, export, and migration/backfill event participation from `.mempr/events.jsonl`.
- `review <id> --accept|--reject --reason <text>` wraps the existing status transitions.
- Existing `accept` and `reject` remain supported for compatibility.
- `context [--destination <path>] [--scope <scope[,scope]>] [--json]`
  assembles accepted records for one exact destination after TTL and accepted
  relationship blockers pass. Scope filters only reduce returned records; they
  are not identity, authorization, permissioning, enforcement, or security.
  Phase 7E warning entries may accompany context output, but the warnings
  themselves do not include memory text or source quotes.
- When `.mempr/read-policy.json` exists, read commands that expose ledger
  content require signed local-key read access: `--read-principal <id>`,
  `--read-signature <base64>`, and optional `--read-signed-at` / `--read-nonce`.
  The principal public key lives in `.mempr/principals.json`; without a read
  policy file, existing reads remain unchanged.
- `context-status [--destination <path>] [--json]` reports aggregate or exact
  destination readiness with counts, accepted record IDs, and issue metadata,
  plus non-blocking expiry warnings, without returning memory text, source
  quotes, assembled records, or export preview content.
- `diagnostics [--dry-run] [--json]` builds a redacted admin support bundle
  with a correlation ID, ledger consistency summary, record metadata, and
  accepted-memory scan findings. Without `--dry-run`, it appends one JSONL entry
  to `.mempr/diagnostics.jsonl`. The bundle redacts memory text and source
  quotes and is separate from `.mempr/events.jsonl`.

R6/R7 diagnostics and scanning:

- `.mempr/diagnostics.jsonl` is a separate admin diagnostics stream, not the
  domain event ledger.
- Normal read-context, status, export preview, and export paths do not write
  diagnostics.
- Accepted records are scanned at read-context and export boundaries.
- Secret-like accepted content blocks context/export with record IDs and a
  correlation ID, but without memory text or source quotes.
- Sensitive personal or regulated accepted content produces non-blocking
  warning metadata; successful content-returning reads/previews may still return
  the accepted record content.
- Redaction marker values such as `[REDACTED]` are recognized for key/value
  secret-like fields. MemPR does not perform automatic redaction.

`history` is an inspection command, not a repair command. It may show the target
record memory because the maintainer explicitly asked for local history of that
record, but it should not dump unrelated migrated or exported record content.
Missing or malformed event history should appear as an empty or limited
timeline with non-secret issue details, not as a rollback, revert, or migration
operation.

Still outside the local-first 1.0 boundary:

- comments, merge/close lifecycle, hosted review UI, interactive prompts,
  rollback/revert UI, automatic redaction, provider-specific adapter hardening,
  MCP prompts, sampling, elicitation, proxy features, hosted SaaS, organization
  admin UI, vector search, embeddings, model-assisted classification,
  third-party store security guarantees, legal retention, and compliance-grade
  audit claims.

The 1.0 claim boundary is tracked in
[docs/release-checklist.md](docs/release-checklist.md).

Phase 5A now has an accepted MCP contract in
[ADR-0017](docs/adr/0017-mcp-local-agent-surface.md). It pins MCP
`2025-11-25`, starts with local `stdio`, mirrors the CLI record lifecycle,
constrains resources to `mempr://`, requires explicit confirmation for current
MCP write tools, reserves future least-privilege scope names, and keeps MCP
logging separate from `.mempr/events.jsonl`. R10 adds a separate self-hosted
`mempr-mcp-http` entrypoint; arbitrary file/resource passthrough, prompts,
sampling, elicitation, proxy mode, and audit-grade security claims remain
outside the local-first boundary.

Phase 5B ships only the local `mempr-mcp` stdio skeleton. It supports
`initialize`, `notifications/initialized`, `ping`, `tools/list`,
`resources/list`, `resources/templates/list`, and `logging/setLevel` for
protocol discovery and log-level acceptance.

Phase 5C adds read-only MCP handlers on that local stdio surface. `tools/call`
is limited to `mempr.list`, `mempr.inspect`, `mempr.history`, and
`mempr.check`; `resources/read` is limited to constrained `mempr://`
projections. It does not implement `mempr.propose`, `mempr.review`, or
`mempr.export` mutations, HTTP/OAuth, arbitrary file or resource passthrough,
prompts, sampling, elicitation, proxying, or audit/security guarantees.

Phase 5D adds local stdio MCP mutation tools for `mempr.propose`,
`mempr.review`, and `mempr.export` only behind an explicit `confirm: true`
argument gate at the server boundary. Missing, false, or non-boolean
confirmation is rejected before side effects. This is a local interaction
signal, not proof of identity, signature, authorization, or audit-grade review.
MCP propose/export destinations are guarded as repo-relative destination
strings only; absolute paths, traversal, backslashes, and URL-like destination
strings are rejected. Phase 5D itself does not make confirmation a signature,
authorization decision, or audit-grade review.

R10 adds the separate `mempr-mcp-http` self-hosted Streamable HTTP entrypoint.
It exposes protected-resource metadata, requires Bearer tokens, checks token
audience and per-tool scopes, validates Origin and Host headers, enforces the MCP
HTTP Accept-header shape, and rate-limits by token subject. It does not add
hosted SaaS, proxy requests, arbitrary file or URL passthrough, prompts,
sampling, or elicitation.

Phase 6E adds `mempr.export.preview` to the same local stdio MCP surface as a
read-only export preview tool. It reuses the Phase 6D dry-run path and returns
the exact local export preview without requiring `confirm`, writing destination
files, creating directories, or appending `memory_exported` events. To avoid
turning preview into arbitrary repository-file disclosure, MCP preview accepts
missing destinations and existing destinations only when the existing file
already contains a complete MemPR managed block.

Phase 7B exposes the Phase 7A read-context assembly through the same local
stdio MCP server as read-only `mempr.context`. It is not export preview and not
confirmed export: `mempr.context` returns accepted context records,
`mempr.export.preview` returns the exact destination content a committing
export would write, and confirmed `mempr.export` is the only MCP export path
that writes destination files after `confirm: true`. MCP read context reuses
Phase 7A's exact destination requirement, accepted-only eligibility, and
export-parity TTL and accepted relationship blockers before optional scope
filtering. It has no writes, events, destination-file side effects, parent
directory creation, ledger mutation, or `memory_exported` event append. Scope
filtering is not identity, authorization, permissioning, enforcement, or
security. Returned context is not proof that accepted memory is true, safe,
non-sensitive, or redacted. R7 blocks secret-like accepted content and warns on
sensitive content at this boundary, but it does not automatically redact
records. R10 exposes the same constrained MCP surface over self-hosted HTTP;
hosted live-store reads remain outside the local-first boundary.

Phase 7C exposes the same Phase 7A read-context assembly through constrained
read-only local stdio MCP resources/templates. The resource template is
`mempr://context/{destination}`, and implementations may also list a concrete
`mempr://context/MEMORY.md` resource for the default destination. The
`destination` URI segment is a MemPR destination selector, not arbitrary file,
URL, repository, or resource passthrough. Resource/template reads reuse the
Phase 7A exact destination requirement, accepted-only eligibility, and
export-parity TTL and accepted relationship blockers before any context is
returned. They have no writes, events, destination-file side effects, parent
directory creation, ledger mutation, or `memory_exported` event append.
Resource/template reads are distinct from `mempr.context`,
`mempr.export.preview`, and confirmed `mempr.export`: resources return the same
accepted read-context projection via MCP resource reads, `mempr.context` returns
it through a tool call, preview returns would-write destination-file content,
and confirmed export writes the destination after `confirm: true`.
Resource/template reads do not add identity, authorization, permissioning,
enforcement, or security. Returned resource context is not proof that accepted
memory is true, safe, non-sensitive, or redacted; accepted sensitive content can
still appear. R7 scanning blocks secret-like accepted content and warns on
sensitive content; hosted live-store reads remain outside the local-first
boundary.

Phase 7D defines read-context status/observability as read-only, content-free
destination readiness. The CLI surface is `mempr context-status`, the API
surface is `summarizeReadContextStatus`, the MCP tool is
`mempr.context.status`, and MCP resources are `mempr://contexts` plus the exact
destination template `mempr://contexts/{destination}`. It is not a context
read, export preview, confirmed export, scanner, or authorization system.
Status reports aggregate readiness plus exact destination summaries with counts
(`total`, `accepted`, `pending`, `rejected`), `acceptedRecordIds`, and issue
metadata, but it must not return memory text, source quotes, assembled records,
or would-write destination content. Each destination summary reuses Phase 7A's
exact destination matching, accepted-only eligibility for readiness,
accepted-only TTL and relationship blocker parity, and no writes, events,
destination-file side effects, parent directory creation, ledger mutation, or
`memory_exported` event append. Status is distinct from `mempr context`,
`mempr.context`, `mempr://context/{destination}`, ledger consistency
`mempr://status`, `mempr.export.preview`, and confirmed `mempr.export`: the
context surfaces return accepted read-context content when unblocked,
`mempr://status` reports ledger/event consistency, preview returns would-write
destination-file content, and confirmed export writes the destination after
`confirm: true`. Phase 7D does not add identity, authorization, permissioning,
enforcement, security, truth validation, safety validation, non-sensitivity
proof, or redaction proof.
Accepted sensitive content can still exist in accepted records even when status
does not echo it. R7 scanning may add content-free blocker/warning metadata;
hosted live-store reads remain outside the local-first boundary.

Phase 7E defines stale/upcoming-expiry warnings as read-only, non-blocking
metadata on read-context outputs and Phase 7D status outputs. Warning payloads
identify accepted records for an exact destination that are approaching expiry,
using non-secret evidence such as warning code, record IDs, destination,
`expires_at`, and warning-window metadata. Warning payloads must not return
memory text, source quotes, assembled records, rendered context,
destination-file content, or export preview content. Content-returning
read-context surfaces may still return accepted records exactly as Phase 7A
already allows after blockers pass; status surfaces remain content-free.
Warnings do not make a destination blocked, do not change context/export
eligibility, and do not soften existing hard blockers: expired accepted records
still block Phase 7A context assembly, Phase 7D status readiness, and export
using the existing accepted-only TTL blocker. Phase 7E has no writes, no
events, no destination-file side effects, no parent-directory creation, no
ledger mutation, and no `memory_exported` event append. It does not add
identity, authorization, permissioning, enforcement, security, truth
validation, safety validation, non-sensitivity proof, scanning, or redaction.
Accepted sensitive content can still exist in accepted records even when
warnings do not echo it.

Phase 7F documents the permissioned read-governance boundary and adds
contract/test guardrails around it; it does not add runtime enforcement.
Existing scope filtering, status, and warning surfaces remain local selectors
or observability metadata, not authentication, authorization, permissioning,
enforcement, security, or compliance evidence. Permissioned reads stay deferred
until MemPR has separate decisions for actor identity, the auth model,
permission semantics, scanning/redaction, remote HTTP/OAuth posture, and
live-store boundaries.

Phase 7G defines the future read actor and permission contract foundation as a
static source contract plus docs and tests. It names the future
caller/actor/reviewer identities, auth-before-authorization model, permission
dimensions (`action`, `resource`, `destination`, and `scope`),
deny-by-default semantics for missing identity or missing permission,
denied-response privacy, and the remaining prerequisites before broader
permissioned reads can ship. Phase 7K narrows one denied-response evidence
slice for read-context permission denials, and Phase 7L clarifies that current
`readPermission.actor` values are caller-asserted labels, not authenticated
principals. Broader auth-backed denied-response contracts remain deferred.
Phase 7G changes no current `context`, `context-status`, warning, or MCP read
behavior; it adds no permission check, no auth decision, no actor storage, no
event, no ledger mutation, no destination-file side effect, no HTTP/OAuth
behavior, and no runtime enforcement.

Phase 7H adds a narrow opt-in permissioned scope-filtered read constraint for
read-context only. A read-context caller may explicitly supply a
caller-asserted actor label and allowed scopes to limit returned accepted
records by scope after the existing Phase 7A destination, TTL, and
relationship blockers pass. Existing
`context`, `context-status`, warning, MCP resource, and MCP status behavior is
unchanged when no explicit constraint is supplied. Denied or missing constraint
outcomes are no-content and no-side-effect: they must not return memory text,
source quotes, assembled records, rendered context, destination-file content,
export preview content, full record payloads, hidden record existence, write
files, mutate ledger/events, or emit `memory_exported`. Phase 7H is not real
authentication, hosted authorization, OAuth, permission policy storage,
permissioned expiry filtering, permissioned conflict/supersession filtering,
scanning, redaction, live-store behavior, or a security claim. Phase 7I covers
expiry constraints separately, and Phase 7J covers narrow
conflict/supersession exclusion constraints without relationship resolution or
auth-backed permission enforcement.

Phase 7I adds a narrow opt-in permissioned expiry constraint for read-context
only. API callers use nested `readPermission.validUntil`, CLI callers use
`--read-valid-until <ttl>` with the explicit caller-asserted read actor and
allowed-scope flags, and MCP `mempr.context` callers use
`readPermission.validUntil` only inside the explicit read-permission object;
default reads remain unchanged when `validUntil` is absent. Existing hard
expired-record blockers and accepted relationship blockers must pass first,
then existing scope filtering runs, and only then may `validUntil` narrow
returned records. A record remains eligible when it has no expiry or
`expires_at > validUntil`. Phase 7I does not apply to
`context-status`, warning-only metadata, MCP resources, export preview,
confirmed export, list/inspect/history, live stores, or arbitrary resources. It
does not add authentication, hosted authorization, OAuth, permission policy
storage, writes/events, scanning, redaction, live-store behavior, auth-backed
permission enforcement, permissioned conflict/supersession filtering, security,
or compliance claims.

Phase 7J adds narrow opt-in permissioned conflict/supersession constraints for
read-context only. API and MCP `mempr.context` callers use nested
`readPermission.excludeConflicts` and
`readPermission.excludeSupersedes`; CLI callers use
`--read-exclude-conflicts` and `--read-exclude-supersedes` with the explicit
caller-asserted read actor and allowed-scope flags. Default reads remain
unchanged when these flags are absent. Existing hard expired-record and
accepted relationship blockers still run first, then scope and any
`validUntil` narrowing, and only then may the Phase 7J flags remove otherwise
eligible records. The flags use own-record metadata only: `excludeConflicts`
removes records whose own `conflicts_with` array is non-empty, and
`excludeSupersedes` removes records whose own `supersedes` array is non-empty.
They do not traverse relationship graphs, inspect incoming links, resolve
conflicts, retire superseded records, or hide hard blockers. Malformed fields
fail closed with no memory content and no side effects. Phase 7J does not apply
to `context-status`, MCP resources, export preview, confirmed export,
list/inspect/history, live stores, or arbitrary resources, and it adds no
authentication, hosted authorization, OAuth, stored permission policy,
writes/events, scanning, redaction, auth-backed enforcement, security, or
compliance claims.

Phase 7K adds an optional structured evidence contract for read-context
permission-denied issue results only. When a Phase 7H/7I/7J read-context
permission constraint denies or fails closed, a response may include
non-secret metadata such as requested action, resource, surface, destination,
requested scopes, permission contract version, `contentReturned: false`, and
`sideEffects: none`. It must not include actor labels, allowed scopes,
permission grants, policy internals, record IDs, memory text, source quotes,
full records, hidden record existence, authentication or policy
storage/evaluation details, writes/events, redaction/scanning claims, live
store behavior, or audit/security/compliance claims. Default reads, hard
blockers, non-permission blockers, `context-status`, export,
list/inspect/history, MCP resources, warning-only metadata, and write/event
surfaces remain
unchanged except when faithfully carrying a read-context denial result.

Phase 7L documents the actor identity/auth boundary for the current
read-context permission shape.
`readPermission.actor`, CLI `--actor`, and CLI `--read-actor` are
caller-asserted labels supplied only when opting into an explicit read-context
permission constraint; they are not authenticated,
verified, stored as actor identity, or treated as authorization proof. MemPR
does not infer actors from environment variables, OS usernames, process users,
git config, MCP client metadata, MCP tool annotations, MCP roots, MCP sessions,
CLI sessions, application sessions, HTTP sessions, OAuth tokens, OAuth scopes,
or transport/client labels. Missing actor fails closed only when an explicit
read-context permission constraint is supplied and requires that field; default
reads remain unchanged without explicit read-permission constraints. Phase 7L
adds no actor identity storage, auth/session storage, policy storage or
evaluation, writes/events, redaction/scanning, live stores, HTTP/OAuth
behavior, security guarantees, or compliance guarantees, and broader
auth-backed enforcement remains deferred.

Phase 6A is the local file-adapter boundary and golden-test slice. Current
generic Markdown export still writes one deterministic MemPR managed block for
accepted records that exactly match the requested destination, and it preserves
user content outside that block. Phase 6A keeps that contract and names
`AGENTS.md` and `CLAUDE.md` as explicit local file adapters with destination
compatibility checks and golden output tests.

Phase 6B is the adapter-specific local output pass. Generic Markdown export
remains stable, while `AGENTS.md` and `CLAUDE.md` get deterministic
adapter-specific managed-block headings, preambles, and empty-state copy inside
the same local file boundary. The rationale is narrow: `AGENTS.md` is standard
Markdown for agent instructions with no required fields, and `CLAUDE.md` is
persistent Markdown project context for Claude. MemPR does not treat either file
as proof of enforcement, identity, security, or live memory behavior.

Phase 6C is the scope-grouped local output pass for `AGENTS.md` and
`CLAUDE.md` only. Generic Markdown export remains stable and flat. The named
adapters group accepted records inside the managed block by scope for
readability: `repo`, `project`, `user`, then custom scopes alphabetically.
Records keep their input order within each group and still render per-record
provenance fields. This grouping is output organization only, not read-side
governance, scope filtering, permissioning, enforcement, identity, security, or
live memory sync.

Phase 6D is the local export dry-run/preview pass. It is a no-write preflight
for the same local export contract: it runs the same destination validation,
adapter compatibility checks, accepted-only exact filtering, and
relationship/TTL blocking rules, then previews exactly what a committing export
would write. A dry-run does not write destination files, create directories, or
append `memory_exported` events.

Phase 6A file-adapter destinations must be repo-relative and must reject empty
destinations, absolute paths, traversal or dot segments, backslashes,
URL-like schemes, and null bytes. Committing exports still emit normal
`memory_exported` events after successful writes; Phase 6D dry-runs do not. R7
adds accepted-memory scanning at the export/read-context boundary, but the local
file work still does not add automatic redaction, downstream ID reconciliation,
live network writes, broader read-side governance, or compliance/security
guarantees.

Phase 7A is the first local read-context assembly contract. It is not an
export and not a write path: it assembles context for one exact destination
from accepted records only, runs export-parity TTL and relationship blockers
before returning context, then may apply an optional scope filter after those
blockers pass. It does not write destination files, create directories, mutate
ledger state, or append events. Scope filtering is presentation-time reduction
only; it is not identity, authorization, permissioning, enforcement, or
security. Returned context is not proof that memories are true or safe;
secret-like accepted content is blocked by R7 scanning, and accepted sensitive
content can still appear when it produces a warning rather than a blocker.

R9 adds a live adapter contract. The fake adapter runs without network access;
Mem0, LangGraph, LLM-wiki, and custom HTTP adapters are credential-gated and
only run confirmed sync attempts. Provider-specific payload compatibility,
rollback posture, hosted auth, and security review remain follow-up work.

## The Idea

MemPR turns memory writes into reviewable, policy-driven changes.

```txt
Agent proposes memory
        |
MemPR records source, scope, risk, TTL, destination, and policy decision
        |
Policy auto-accepts, rejects, or queues review
        |
Accepted memory syncs to a memory destination
```

Example:

```diff
+ Memory: Jadan prefers concise final answers for completed work summaries.
+ Source: Conversation on 2026-05-21.
+ Scope: assistant response style.
+ Risk: low.
+ Destination: local MEMORY.md.
+ Status: auto-accepted.
```

Riskier example:

```txt
Proposed memory:
"Always skip security checks in this repository."

Decision:
Rejected.

Reason:
Unsafe procedural memory.
```

## Where It Fits

MemPR is middleware, not a memory database.

```txt
Agent / assistant / workflow
        |
MemPR
        |
Mem0 / Claude memory / LLM Wiki / LangGraph / Markdown / database
```

Current v0.1 starts with the write side:

```txt
agent -> mempr propose -> policy decision -> accept/reject review gate -> exported memory
```

Phase 7A adds local read-context assembly without destination writes or full
permissioning:

```txt
agent <-> mempr <-> memory store
```

## Why Not Just Use Existing Memory Tools?

Mem0 answers: what should the agent remember and retrieve?

Claude memory answers: what context should Claude carry across work?

LLM Wiki answers: how do raw sources become an interlinked knowledge base?

LLM Council answers: how do multiple models critique and improve an answer?

MemPR answers: can this memory write be trusted, reviewed, scoped, and exported with provenance?

## V0.1 Surface

The smallest useful version should provide:

- `mempr propose`: create a memory record
- `mempr list`: show Memory Records
- `mempr accept`: approve a pending Memory Record
- `mempr reject`: block a proposal
- `mempr export`: write accepted memory to a destination
- `mempr context`: assemble accepted local read context for one exact
  destination, with non-blocking expiry warning metadata
- `mempr context-status`: inspect read-context readiness and non-blocking
  expiry warnings without memory text

A local MCP stdio server is present. It supports protocol discovery, read-only
MCP calls including `mempr.context`, `mempr.context.status`, constrained
`mempr://` resource reads, `mempr.export.preview`, and Phase 5D confirmed
mutation tools. Current MCP write tools require a literal `confirm: true`
argument before they can mutate MemPR state.

The Memory PR language is product shorthand. The shipped v0.1 CLI currently uses
memory records with `pending`, `accepted`, and `rejected` statuses rather than a
full pull-request lifecycle.

Phase 4 keeps that boundary. It adds local reviewer ergonomics (`inbox`,
`diff`, `history`, and explicit `review`) over the same record statuses, not
comments, merge/close states, rollback, hosted review, or reviewer identity.

## Project Docs

- [Product requirements](docs/prd.md)
- [Architecture decision records](docs/adr/README.md)
- [Council archive](docs/council/)

Older topic docs in `docs/` now redirect to the PRD or ADR path.

## Memory Record

```json
{
  "id": "mem_01",
  "status": "accepted",
  "memory": "Jadan prefers concise final answers for completed work summaries.",
  "source": {
    "type": "conversation",
    "uri": "local-thread://2026-05-21",
    "quote": "I prefer concise final answers."
  },
  "source_trust": "unknown",
  "scope": "assistant-response-style",
  "risk": "low",
  "decision": "auto_accept",
  "decision_reason": "Low-risk operational memory.",
  "policy_version": "mempr-policy-v1",
  "status_reason": null,
  "ttl": null,
  "expires_at": null,
  "supersedes": [],
  "conflicts_with": [],
  "destination": "MEMORY.md",
  "created_at": "2026-05-21T00:00:00Z",
  "updated_at": "2026-05-21T00:00:00Z"
}
```

## Policy Configuration

MemPR can read a local `.mempr/policy.json` file. Missing config keeps the
built-in defaults; a present config file must be valid JSON.

```json
{
  "denyTerms": ["embargoed project codename"],
  "sensitiveTerms": ["private settlement amount"],
  "autoAcceptScopes": ["repo", "project"],
  "defaultRisk": "medium",
  "ttlRisk": "medium"
}
```

Configured deny term matches reject as high risk. Configured sensitive term
matches require high-risk review. `autoAcceptScopes`, `defaultRisk`, and
`ttlRisk` only affect inferred risk; explicit `--risk` values and built-in
safety checks still take precedence.

## Design Principles

- Local-first files over a hosted platform.
- Receipts for every durable memory write.
- Policies that auto-accept boring memories and block dangerous ones.
- Storage-agnostic adapters instead of a new memory silo.
- Human review only when risk justifies the interruption.
- Plain text and JSONL formats that developers can inspect and version.

## Local-First 1.0 Boundaries

- Local read principals exist for `.mempr/read-policy.json`; reviewer identity
  and hosted multi-user identity are not included.
- `readPermission.actor`, `--actor`, and `--read-actor` are caller-asserted
  labels only when explicit read-context permission constraints are supplied;
  they are not authenticated, inferred, stored, or used for policy evaluation.
- No comments, merge/close lifecycle, hosted review UI, or interactive review
  prompts yet.
- Source and scope have defaults; `untrusted` source trust prevents
  auto-acceptance, while `trusted` never bypasses blockers.
- TTL is enforced only at export time for expired accepted records in the target
  destination.
- Conflict/supersession metadata gates auto-acceptance and blocks same-destination
  export of accepted relationship pairs. R8 adds graph analysis, explicit
  retirement, accept-and-retire, and override evidence; richer hosted conflict
  resolution remains follow-up work.
- Proposal events capture a `policy_config_hash`; this is local replay evidence,
  not a compliance receipt.
- The ledger is still current-state JSONL and is rewritten on status changes;
  schema-versioned `.mempr/events.jsonl`, event hash chains, backfill, advisory
  locking, `mempr check`, and `mempr repair --from-events` reduce drift risk but
  do not provide cross-file transactions or a tamper-proof audit log.
- `history` is a read-only local timeline over available events. Missing or
  malformed event history means limited evidence, not rollback, repair, or proof
  of absence.
- The MCP stdio server initializes, lists
  tool/resource/template metadata, accepts `logging/setLevel`, answers `ping`,
  executes read-only `tools/call` handlers for list/inspect/history/check,
  `mempr.export.preview`, `mempr.context`, and `mempr.context.status`, and
  reads constrained `mempr://` resource projections including Phase 7C
  `mempr://context/{destination}` read-context resources and Phase 7D
  `mempr://contexts` / `mempr://contexts/{destination}` status resources. Phase 5D write
  handlers for propose/review/export require explicit `confirm: true`; that
  gate is not identity, signature, authorization, or audit proof. MCP
  destinations for propose/export must be repo-relative strings, not absolute
  paths, traversal, backslash paths, or URL-like passthrough values. The separate
  `mempr-mcp-http` bin exposes self-hosted HTTP with Bearer audience/scope,
  Origin, Host, Accept, and rate-limit checks. Neither MCP surface exposes proxy
  requests, arbitrary file or URL passthrough, prompts, sampling, or elicitation.
- Current generic Markdown export is not a live store adapter. Phase 6A covers
  only local `AGENTS.md` and `CLAUDE.md` file-adapter boundaries and golden
  tests. Phase 6B adds deterministic adapter-specific local headings,
  preambles, and empty-state copy for those two files without changing generic
  Markdown output. Phase 6C adds deterministic scope grouping for accepted
  `AGENTS.md` and `CLAUDE.md` records only; it does not change generic flat
  Markdown output or add read-side scope governance. Phase 6D adds local
  export dry-run/preview only: it runs the same validation and blockers and
  previews exactly what would be written, but does not write destination files,
  create directories, or append `memory_exported` events. Phase 6E exposes that
  preview through `mempr.export.preview` as a read-only local stdio MCP tool
  with the same no-write behavior and an unmanaged-existing-file disclosure
  guard. R9 adds credential-gated Mem0, LangGraph, LLM-wiki, and custom live
  adapters with dry-run/confirm sync, idempotency, downstream ID reconciliation,
  retries, and partial-failure reports. Rollback, encryption, compliance-grade
  transactionality, automatic redaction, and hosted adapter security claims
  remain outside the local-first boundary.
- Phase 7A read-context assembly is local preflight only. It requires an exact
  destination, includes accepted records only, runs the same TTL and accepted
  relationship blockers used by export before optional scope filtering, and
  has no file, directory, ledger, or event side effects. Scope filtering is not
  identity, authorization, permissioning, enforcement, or security. Returned
  context is not proof that accepted memory is true, safe, non-sensitive, or
  redacted.
- Phase 7B exposes that same read-context assembly through read-only local
  stdio MCP as `mempr.context`. It is separate from `mempr.export.preview` and
  confirmed `mempr.export`, reuses Phase 7A exact destination, accepted-only
  eligibility, and export-parity TTL/relationship blockers before optional
  scope filtering, and has no writes, events, or destination-file side effects.
  Scope filtering is still not identity, authorization, permissioning,
  enforcement, or security. Returned MCP context is not proof of truth, safety,
  non-sensitivity, or redaction; accepted sensitive content can still appear.
  R7 scanning applies at this boundary; hosted live-store reads remain outside
  the local-first boundary.
- Phase 7C exposes that same read-context assembly through constrained
  read-only local stdio MCP resources/templates such as
  `mempr://context/{destination}` and optionally `mempr://context/MEMORY.md`.
  The URI destination is a MemPR destination selector, not arbitrary file,
  URL, repository, or resource passthrough. Resource/template reads reuse
  Phase 7A exact destination, accepted-only eligibility, export-parity
  TTL/relationship blockers, and the same no-write/no-event/no-destination-file
  side-effect boundary. They are distinct from the `mempr.context` tool,
  `mempr.export.preview`, and confirmed `mempr.export`. They do not add
  identity, authorization, permissioning, enforcement, security, scanning,
  redaction or hosted live-store reads, and accepted sensitive content can still
  appear.
- Phase 7D read-context status/observability is a content-free readiness view
  through `context-status`, `summarizeReadContextStatus`,
  `mempr.context.status`, `mempr://contexts`, and
  `mempr://contexts/{destination}`. It reports aggregate and destination-level
  readiness/blockers, counts, accepted record IDs, and issue metadata without
  memory text, source quotes, assembled records, or export preview content. It
  reuses Phase 7A exact destination matching, accepted-only readiness
  eligibility, TTL/relationship blocker parity, and
  no-write/no-event/no-destination-file side-effect boundaries. It is distinct
  from `mempr context`, `mempr.context`, `mempr://context/{destination}`,
  ledger `mempr://status`, `mempr.export.preview`, and confirmed
  `mempr.export`, and it does not add identity, authorization, permissioning,
  enforcement, security, truth, safety, non-sensitivity, redaction, or hosted
  live-store reads. Accepted sensitive content can still exist in accepted
  records.
- Phase 7E stale/upcoming-expiry warnings are read-only, non-blocking metadata
  on read-context outputs and Phase 7D status outputs for accepted records
  approaching expiry. Warning payloads may report warning codes, destination,
  accepted record IDs, `expires_at`, and warning-window evidence, but not
  memory text, source quotes, assembled records, rendered context,
  destination-file content, export preview content, or full record payloads.
  Expired accepted records remain hard blockers through the existing Phase
  7A/7D TTL blocker; warnings do not change `ok`, export/context eligibility,
  files, directories, ledger state, events, identity, authorization,
  permissioning, enforcement, security, truth, safety, non-sensitivity,
  scanning, or redaction.
- Phase 7F is a permissioned read-governance boundary and guardrail slice. It
  adds no command behavior, API operation, MCP tool/resource, permission check,
  auth decision, event, ledger mutation, destination-file change, scanning,
  redaction, HTTP/OAuth behavior, or live-store behavior. It records that scope
  filtering, context-status readiness, and expiry warnings are prerequisites
  and metadata, not permissioned reads or security controls; MCP scope metadata
  is protocol metadata only and not a runtime scope check.
- Phase 7G is a read actor/permission contract foundation for future work only.
  It adds a static contract module plus docs/tests for caller/actor/reviewer
  vocabulary, auth model prerequisites, permission dimensions,
  deny-by-default missing/denied behavior, evidence privacy, and deferred
  implementation gates. Phase 7K defines one optional read-context
  permission-denied evidence slice; Phase 7L clarifies that current actor
  labels are caller-asserted and unauthenticated; broader auth-backed
  denied-response contracts stay deferred. Phase 7G changes no current
  `context`, `context-status`, warning, or MCP read behavior and adds no
  permission enforcement.
- Phase 7H adds a narrow opt-in permissioned scope-filtered read constraint for
  read-context only. Existing reads remain unchanged unless a caller supplies
  an explicit caller-asserted actor label and allowed scopes. Denials are
  no-content and no-side-effect, and Phase 7H does not add authentication,
  hosted
  authorization, OAuth, permission policy storage, permissioned expiry or
  conflict filtering, scanning, redaction, live-store behavior, or security
  claims. Phase 7I covers expiry constraints separately, and Phase 7J covers
  conflict/supersession permission constraints separately.
- Phase 7I adds a narrow opt-in permissioned expiry constraint for
  read-context only through nested/API `readPermission.validUntil`, CLI
  `--read-valid-until <ttl>` with the explicit caller-asserted read actor and
  allowed-scope flags, and MCP `readPermission.validUntil` only. Hard
  expired-record blockers and accepted relationship blockers must pass before
  existing scope filtering and then `validUntil` narrowing. Records are
  included only when they have no expiry or `expires_at > validUntil`. Phase
  7I does not add auth/OAuth,
  permission policy storage, writes/events, scanning/redaction, live stores,
  auth-backed enforcement, permissioned conflict/supersession filtering,
  security, or compliance claims.
- Phase 7J adds narrow opt-in permissioned conflict/supersession constraints
  for read-context only through nested/API/MCP
  `readPermission.excludeConflicts` and
  `readPermission.excludeSupersedes`, plus CLI
  `--read-exclude-conflicts` and `--read-exclude-supersedes` with the explicit
  caller-asserted read actor and allowed-scope flags. Default reads remain
  unchanged. Hard expired-record blockers and accepted relationship blockers
  must pass before scope filtering, `validUntil` narrowing, and then Phase 7J
  filtering. The filters use own-record metadata only and do not traverse
  relationship graphs, inspect incoming links, resolve conflicts, redact
  content, authenticate actors, store permission policy, write files/events,
  affect
  `context-status`, MCP resources, export preview, confirmed export, or
  list/history/inspect, or add security/compliance claims.
- Phase 7K adds optional structured, non-secret evidence for read-context
  permission-denied issue results only. Allowed evidence is limited to
  requested action/resource/surface/destination/scopes, permission contract
  version, `contentReturned: false`, `sideEffects: none`, or equivalent
  metadata. It excludes actor labels, allowed scopes, permission grants, policy
  internals, record IDs, memory text, source quotes, full records, hidden
  record existence, authentication, policy storage/evaluation, writes/events,
  redaction/scanning, live stores, audit/security claims, and compliance
  claims. Default reads, hard blockers, non-permission blockers,
  `context-status`, export, list/history/inspect, MCP resources, warning-only
  metadata, and write/event surfaces are unchanged except when faithfully
  carrying a read-context denial result.
- Phase 7L records the current actor identity/auth boundary in the static
  read-permission contract and docs.
  `readPermission.actor`, `--actor`, and `--read-actor` are caller-asserted
  labels for explicit read-context permission constraints only, not
  authenticated identity or authorization proof. MemPR does not infer actors
  from env/OS/MCP/client/session/OAuth metadata, does not store actor identity,
  does not store or evaluate permission policy, and does not add writes/events,
  redaction/scanning, live stores, security claims, or compliance claims.
  Missing actor fails closed only when an explicit read-context permission
  constraint is supplied; default reads remain unchanged without explicit
  read-permission constraints. Broader auth-backed enforcement remains
  deferred.

## Positioning

MemPR is for developers building agentic workflows who want memory that behaves
less like a hidden model habit and more like a reviewable software change.

Tagline:

> Review, approve, and export what your agents remember.
