# MemPR Product Requirements Document

## 1. Document Status

**Status:** Canonical product document
**Date:** 2026-05-21
**Owner:** MemPR maintainers

This PRD is the source of truth for MemPR product scope, shipped behavior,
roadmap, implementation phases, and claim boundaries. It consolidates the former
product spec, build plan, design review, research positioning, integration notes,
threat model, and implementation readiness docs.

Detailed architectural decisions live in [docs/adr/](adr/README.md). Council
passes live in [docs/council/](council/) as decision evidence, not canonical
runtime behavior.

## 2. Executive Summary

MemPR is a local-first, storage-agnostic governance layer for proposed durable
AI-agent memory writes.

It does not replace memory stores like Mem0, LangGraph stores, Claude Code
memory files, LLM-wiki workflows, or custom databases. It sits before them and
asks:

> Should this become durable memory, and can we show where it came from and why it was accepted or rejected?

The v0.1 product is intentionally small: CLI commands, deterministic policy
heuristics, a local current-state JSONL ledger, and generic Markdown export.

## 3. Problem Statement

Agent memory is becoming part of the execution environment. A memory written in
one session can shape later tool use, code changes, decisions, exports, and user
interactions.

Most memory systems optimize storage and retrieval. The missing control point is
the write path:

- what changed
- where it came from
- whether the source is trustworthy
- whether it is scoped correctly
- whether it is sensitive, stale, speculative, or adversarial
- who or what accepted/rejected it
- when it should expire
- where it is allowed to be exported

MemPR makes the transition from candidate memory to durable memory reviewable.

## 4. Target User And Jobs To Be Done

The first user is a developer running agentic workflows in tools like Codex,
Claude Code, Cursor, LangGraph, custom MCP agents, or local scripts.

Jobs to be done:

- Propose durable memory without writing directly to the destination.
- Inspect pending, accepted, and rejected records.
- Auto-accept low-risk operational facts.
- Block obvious secrets and unsafe standing instructions.
- Review medium-risk proposals before they become durable context.
- Export accepted memory into a local destination.
- Keep enough provenance to explain why memory exists.

## 5. Product Positioning

Public shorthand:

> Memory PRs for AI agents.

Technical positioning:

> A storage-agnostic governance layer for durable agent-memory writes.

MemPR is not:

- a vector database
- a retriever or RAG framework
- an embeddings pipeline
- a hosted dashboard
- a replacement for Mem0, Zep, Letta, LangGraph memory, Claude Code memory, or LLM-wiki compilers
- a complete prompt-injection or memory-poisoning prevention layer
- a compliance-grade or tamper-proof audit system

Allowed claim:

- MemPR reduces persistent-memory risk by adding a reviewable write-control boundary.

Disallowed claim:

- MemPR prevents prompt injection, proves memory is true, or makes agent memory safe.

## 6. Current Capability Status

| Capability | v0.1 status | Roadmap status |
| --- | --- | --- |
| CLI `propose/list/inbox/diff/history/review/accept/reject/retire/relationships/export/sync-live/context/context-status/diagnostics/check/repair/migrate` | Local-first 1.0 includes advisory expiry warnings, caller-supplied read-context constraints, signed local-key read-policy gates, redacted diagnostics, accepted-memory boundary scanning, relationship graph/retirement commands, dry-run/confirmed live sync, and repair from verified events | Full PR lifecycle, hosted collaboration, rollback UI, reviewer identity, and hosted multi-user administration require separate decisions |
| Ledger | Current-state JSONL plus schema-versioned `.mempr/events.jsonl`, atomic current-view writes, drift detection, canonical SHA-256 event/record hashes, hash-chain validation, policy-config hash capture on proposals, and repair from verified event replay | Cross-file transactions, signatures/non-repudiation, and compliance-grade audit guarantees are out of scope |
| Policy | Built-in deterministic heuristics plus narrow `.mempr/policy.json` local overrides, `untrusted` source-trust review gating, `.mempr/read-policy.json` allow/deny read policy, and local Ed25519 principal verification | Richer rule language, hosted admin workflow, and automatic trust inference require separate decisions |
| TTL | Stored as canonical expiry metadata; expired accepted records block export for their destination, Phase 7E defines non-blocking read-context/read-context-status warnings for accepted records approaching expiry, and Phase 7I adds opt-in `validUntil` read-context expiry narrowing after hard blockers and scope filtering | Auth-backed freshness policy or permission evaluation beyond caller-supplied `validUntil` requires separate actor identity, auth, and policy-storage decisions |
| Conflict/supersession | Declared metadata is stored, validated, review-gated, checked at export for accepted same-destination pairs, Phase 7J adds opt-in read-context-only exclusion flags, and R8 adds `retired`, incoming-link graph analysis, supersession cycle detection, accept-and-retire, and explicit override evidence without silent deletion | Rich hosted conflict-resolution UI, auth-backed relationship policy, redaction, and broader relationship behavior outside local review/export/read-context require separate decisions |
| Markdown export | Generic managed block by exact destination path; blocks expired accepted records and accepted relationship pairs for the target destination | Phase 6A golden tests preserve this as the base export contract; Phase 6B and 6C keep generic output stable and flat; Phase 6D adds no-write local dry-run/preview |
| `AGENTS.md` / `CLAUDE.md` file adapters | Phase 6A local file-adapter boundary plus Phase 6B adapter-specific local output plus Phase 6C deterministic scope-grouped local output: explicit destinations, compatibility checks, deterministic managed-block headings/preambles/empty-state copy, grouped accepted records, and golden output tests | Phase 6D dry-run/preview uses the same local validation and blockers without writing destination files, creating directories, or appending `memory_exported` events; read-side scope permissioning, enforcement, identity, security, and live memory sync require separate decisions beyond Phase 7A local assembly |
| Live store/workflow adapters | R9 adds a dry-run/confirmed live sync contract with deterministic idempotency keys, downstream ID reconciliation from events, retries, partial-failure reporting, a fake no-network adapter, and credential-gated Mem0, LangGraph, LLM-wiki, and custom HTTP adapters | Provider-specific payload compatibility, rollback posture, hosted security review, and stronger auth/session handling remain follow-up work |
| MCP | Local stdio MCP plus self-hosted `mempr-mcp-http`: read/write tools remain constrained to MemPR operations; stdio scope metadata is protocol-only; HTTP exposes protected-resource metadata and enforces Bearer token audience, per-tool scopes, Origin, Host, Accept, and rate limits | Prompts, sampling, elicitation, proxy mode, arbitrary file/resource passthrough, hosted service claims, and audit-grade claims require separate decisions |
| Read governance | Exact destination summaries, accepted-only blocker parity, hard expired-record and accepted relationship blockers before filtering, warning metadata, no file/event/write side effects, status without memory text or quotes, caller-supplied read-context constraints, optional non-secret denial evidence, signed local-key read access when `.mempr/read-policy.json` exists, and content-free read denials | Hosted relationship resolution, automatic redaction, retrieval ranking, and organization-wide policy administration require separate decisions |
| Read actor/permission contract | Caller-supplied `readPermission.actor` remains a label for read-context constraints; R3-R5 add separate local-key principals and read-policy evaluation for gated read surfaces | Reviewer identity, service delegation UX, hosted sessions, and multi-user administration require separate decisions |
| Actor/reviewer identity | Local read principals are shipped for read-policy gates; reviewer identity is not shipped | Required before non-repudiation, hosted approvals, or compliance-grade audit claims |
| Diagnostics and scanning | R6/R7 add `.mempr/diagnostics.jsonl`, `mempr diagnostics`, correlation IDs, redacted admin support bundles, secret-like blockers, sensitive-content warnings, and optional redaction-marker recognition at read-context/export boundaries | Automatic redaction, scanner policy configuration, audit-grade logging, retention policy, and claims that returned memory is safe/non-sensitive/redacted remain follow-up work |
| Tamper evidence | Local schema-versioned event hashes, record hashes, previous-event links, and `mempr check` hash validation are shipped | Signatures, non-repudiation, cross-file transactionality, legal retention, and compliance-grade audit guarantees are out of scope |

Every future feature must be marked `shipped`, `planned`, or `deferred` in this
matrix or in a replacement matrix.

## 7. V0.1 Product Scope

Shipped v0.1 behavior:

- `mempr propose`
- `mempr list`
- `mempr accept`
- `mempr reject`
- `mempr export`
- `mempr context`
- `mempr context-status`
- `mempr diagnostics`
- `mempr check`
- local `.mempr/ledger.jsonl`
- local `.mempr/events.jsonl` event stream for propose/status/export events
- local `.mempr/diagnostics.jsonl` diagnostics stream for explicit admin
  diagnostics
- atomic current-view writes for `.mempr/ledger.jsonl`
- consistency check comparing current records to event replay
- source-trust metadata on memory records
- policy implementation version markers on memory records
- canonical `ttl` / `expires_at` metadata on memory records
- stale accepted-record blocking at export time
- `pending`, `accepted`, `rejected` statuses
- deterministic policy decisions: `auto_accept`, `review`, `reject`
- generic Markdown managed block export
- exact destination filtering
- accepted-memory scanning at read-context and export boundaries
- default secret-like accepted content blockers with correlation IDs and no
  content echo in normal errors
- non-blocking sensitive-content warnings
- redacted diagnostics/support bundles for admin troubleshooting

Expected Phase 4B behavior:

- read-only `mempr history <id> [--json]`

Phase 6A behavior:

- local file-adapter boundary for `AGENTS.md` and `CLAUDE.md`
- deterministic managed-block mechanics and marker reuse
- accepted-only export with exact destination filtering
- export-time destination compatibility checks
- preservation of user-written content outside the managed block
- golden output tests for the named file adapters
- normal `memory_exported` event emission after successful export

Phase 6B behavior:

- generic Markdown output remains stable
- `AGENTS.md` gets deterministic adapter-specific managed-block headings,
  preamble text, and empty-state copy
- `CLAUDE.md` gets deterministic adapter-specific managed-block headings,
  preamble text, and empty-state copy
- adapter-specific output remains ordinary local Markdown inside the MemPR
  managed block markers
- accepted-only exact destination filtering, destination validation,
  outside-block preservation, and normal `memory_exported` event behavior stay
  the same as Phase 6A

Phase 6C behavior:

- generic Markdown output remains stable, flat, and ungrouped
- `AGENTS.md` and `CLAUDE.md` group accepted records by scope inside the
  managed block for readability
- scope group order is deterministic: `repo`, `project`, `user`, then custom
  scopes alphabetically by scope value
- records preserve the filtered input order within each scope group
- each rendered record keeps its per-record provenance fields, including scope,
  source URI, source-trust metadata, and record ID
- grouping changes output organization only; it does not change export
  eligibility, acceptance status, exact destination filtering, policy
  decisions, or event behavior

Phase 6D behavior:

- local export dry-run/preview is a preflight for the same export path used by
  committing local exports
- dry-run/preview preserves the same export validation and blocking rules,
  including destination validation, adapter compatibility, accepted-only exact
  destination filtering, relationship blocking, and TTL blocking
- dry-run/preview shows exactly what the committing export would write for the
  destination after managed-block replacement
- dry-run/preview does not write destination files, create parent directories,
  or append `memory_exported` events

Phase 6E behavior:

- local stdio MCP exposes `mempr.export.preview` as a read-only tool, separate
  from the confirmed `mempr.export` mutation
- MCP preview reuses the Phase 6D dry-run validation, blocker, adapter, and
  rendering path
- MCP preview returns deterministic structured output with `dryRun: true`,
  destination, output path, adapter metadata, record IDs/count, destination
  existence, and exact preview content
- MCP preview does not require `confirm`, write destination files, create
  directories, or append `memory_exported` events
- MCP preview is not arbitrary file/resource passthrough; existing destinations
  are previewable only when they already contain a complete MemPR managed block

Phase 7A behavior:

- `mempr context [--destination <path>] [--scope <scope[,scope]>] [--json]`
  assembles local read context
- local read-context assembly requires one exact destination
- returned context is assembled from accepted records only
- the preflight runs export-parity TTL blocking before context is returned
- the preflight runs export-parity accepted relationship blocking before
  context is returned
- optional scope filtering may reduce the returned accepted records only after
  TTL and relationship blockers pass
- read-context assembly does not write destination files, create directories,
  mutate ledger state, or append events
- scope filtering is not identity, authorization, permissioning, enforcement,
  or security
- returned context is not proof that memories are true, safe, non-sensitive, or
  redacted

Phase 7B behavior:

- local stdio MCP exposes `mempr.context` as a read-only tool
- MCP read context reuses the Phase 7A assembly path
- MCP read context requires one exact destination and considers accepted records
  for that exact destination only
- MCP read context runs export-parity TTL and accepted relationship blockers
  before optional scope filtering
- optional scope filtering reduces returned records only after blockers pass
- MCP read context does not require `confirm`, write destination files, create
  directories, mutate ledger state, append events, or emit `memory_exported`
  events
- `mempr.context` is distinct from `mempr.export.preview` and confirmed
  `mempr.export`: context returns accepted records for read assembly, preview
  returns exact would-write destination content, and confirmed export writes the
  destination file
- scope filtering is not identity, authorization, permissioning, enforcement,
  or security
- returned MCP context is not proof that memories are true, safe,
  non-sensitive, or redacted
- R7 scanning blocks secret-like accepted content before context is returned
  and reports non-blocking sensitive-content warnings without echoing content
- accepted sensitive content can still appear because R7 warns rather than
  automatically redacts or rewrites accepted memory
- self-hosted MCP HTTP is available through R10; hosted live-store reads,
  broader permissioning, and security claims remain outside this local context
  slice

Phase 7C behavior:

- local stdio MCP exposes read-context assembly through constrained
  resources/templates
- `resources/templates/list` may advertise `mempr://context/{destination}`
- `resources/list` may advertise reviewed concrete resources such as
  `mempr://context/MEMORY.md`
- the URI destination is a MemPR destination selector, not arbitrary file,
  URL, repository, raw ledger/event, or generic resource passthrough
- resource/template reads reuse the Phase 7A assembly path
- resource/template reads require one exact destination and consider accepted
  records for that exact destination only
- resource/template reads run export-parity TTL and accepted relationship
  blockers before any context is returned
- optional scope filtering, if supported later for resource reads, can reduce
  returned records only after blockers pass
- resource/template reads do not require `confirm`, write destination files,
  create directories, mutate ledger state, append events, or emit
  `memory_exported` events
- `mempr://context/{destination}` is distinct from `mempr.context`,
  `mempr.export.preview`, and confirmed `mempr.export`: resources return the
  accepted read-context projection through MCP resource reads, the tool returns
  it through `tools/call`, preview returns exact would-write destination
  content, and confirmed export writes the destination file
- resource/template reads are not identity, authorization, permissioning,
  enforcement, or security
- returned resource context is not proof that memories are true, safe,
  non-sensitive, or redacted
- R7 scanning blocks secret-like accepted content before resource context is
  returned and reports non-blocking sensitive-content warnings without echoing
  content
- accepted sensitive content can still appear because R7 warns rather than
  automatically redacts or rewrites accepted memory
- self-hosted MCP HTTP is available through R10; hosted live-store reads,
  broader permissioning, and security claims remain outside this resource slice

Phase 7D behavior:

- read-context status/observability is read-only, content-free destination
  readiness through CLI `mempr context-status`, API
  `summarizeReadContextStatus`, MCP tool `mempr.context.status`, MCP resource
  `mempr://contexts`, and MCP template `mempr://contexts/{destination}`
- status is not a context read, export preview, confirmed export, scanner, or
  authorization system
- status responses are aggregate summaries made of exact destination-level
  summaries; an optional destination filter must match one exact destination
- status reuses Phase 7A exact destination matching, accepted-only readiness
  eligibility, and accepted-only export-parity TTL and relationship blockers
- status reports aggregate readiness, destination-level readiness/blockers,
  `total`/`accepted`/`pending`/`rejected` counts, accepted record IDs, and issue
  metadata without memory text, source quotes, assembled records, or would-write
  destination-file content
- status has no writes, events, destination-file side effects, parent directory
  creation, ledger mutation, or `memory_exported` event append
- status is distinct from `mempr context`, `mempr.context`,
  `mempr://context/{destination}`, ledger `mempr://status`,
  `mempr.export.preview`, and confirmed `mempr.export`
- status is not identity, authorization, permissioning, enforcement, security,
  truth validation, safety validation, non-sensitivity proof, or redaction
  proof
- R7 status may report content-free secret-like blockers and
  sensitive-content warnings, but it does not include memory text or source
  quotes
- accepted sensitive content can still exist in accepted records because R7
  warns rather than automatically redacts or rewrites accepted memory
- self-hosted MCP HTTP is available through R10; hosted live-store reads,
  broader permissioning, and security claims remain outside this status slice

Phase 7E behavior:

- adds stale/upcoming-expiry warnings to read-context outputs and read-context
  status outputs as read-only, non-blocking advisory metadata
- warns only for accepted records whose exact destination matches the
  summarized destination and whose `expires_at` is approaching
- reports non-secret evidence such as warning code, destination, accepted
  record IDs, `expires_at`, warning-window metadata, and time-to-expiry
  metadata
- does not warn for pending, rejected, or other-destination records
- does not turn warnings into blockers, change destination `ok`, or change
  context/export eligibility
- keeps expired accepted records as hard blockers through the existing Phase
  7A/7D accepted-only TTL blocker
- warning entries do not return memory text, source quotes, assembled records,
  rendered context, destination-file content, export preview content, or full
  record payloads
- has no writes, no destination-file side effects, no parent-directory
  creation, no ledger mutation, no event append, and no `memory_exported`
  event
- does not add identity, authorization, permissioning, enforcement, security,
  truth validation, safety validation, non-sensitivity proof, scanning, or
  redaction

Phase 7F behavior:

- documents the permissioned read-governance boundary and prerequisites, with
  contract metadata and regression tests that preserve the non-enforcement
  boundary
- adds no command behavior, API operation, MCP tool/resource, permission check,
  auth decision, event, ledger mutation, destination-file side effect,
  scanning, redaction, HTTP/OAuth behavior, live-store behavior, or runtime
  scope check
- states that scope filtering is presentation-time reduction after blockers,
  not actor identity, authorization, permissioning, enforcement, security, or
  compliance evidence
- states that read-context status is content-free readiness/blocker
  observability, not authentication, authorization, permissioning,
  enforcement, safety, redaction, or security
- states that expiry warnings are advisory metadata, not freshness proof,
  permissioning, enforcement, safety, or security
- keeps permissioned reads deferred until separate decisions define actor
  identity, the auth model, permission semantics, scanning/redaction,
  HTTP/OAuth posture, and live-store boundaries

Phase 7G behavior:

- defines the future read actor/permission contract foundation as a static
  source contract plus docs and tests
- defines `caller` as the immediate client or process making a read request,
  `actor` as the future authenticated principal whose permissions would be
  evaluated, and `reviewer` as a human approval role that is separate from read
  identity
- requires future permissioned reads to authenticate a caller/actor before
  authorization, while treating current local stdio metadata as protocol
  metadata, not proof of identity or permission
- defines future permission decisions across `action`, `resource`,
  `destination`, and `scope`; scope remains a record attribute or filter, not
  identity by itself
- defines missing identity, missing permission, unknown action/resource,
  ambiguous destination, and explicit deny as future deny-by-default outcomes
  with no returned memory text, source quotes, assembled records, or full record
  payloads
- keeps evidence privacy limited to non-secret decision metadata such as error
  code, requested action/resource/destination/scope, and correlation or policy
  identifiers; inaccessible content must not be exposed as denial evidence
- adds no command behavior, API operation, MCP tool/resource, permission check,
  auth decision, event, ledger mutation, destination-file side effect,
  scanning, redaction, HTTP/OAuth behavior, live-store behavior, actor storage,
  permission storage, or runtime enforcement
- changes no current `context`, `context-status`, Phase 7E warning, or MCP read
  behavior

Phase 7H behavior:

- adds a narrow opt-in permissioned scope-filtered read constraint for
  read-context only
- leaves existing `context`, `context-status`, Phase 7E warning, MCP resource,
  and MCP status behavior unchanged unless a caller supplies an explicit actor
  label and allowed scopes
- constrains only returned read-context records by permitted scope, after Phase
  7A exact-destination selection, accepted-only eligibility, TTL blockers, and
  accepted relationship blockers pass
- denies missing or failed permission constraints as no-content outcomes:
  denial evidence must not return memory text, source quotes, assembled
  records, rendered context, destination-file content, export preview content,
  full record payloads, or hidden record existence
- keeps denial paths no-side-effect: no destination-file writes, parent
  directory creation, ledger mutation, event append, or `memory_exported`
  emission
- does not apply to `context-status`, warning-only metadata, export preview,
  confirmed export, history, list/inspect, raw ledger/event projections, live
  stores, or arbitrary resource passthrough
- adds no real authentication, hosted authorization, OAuth behavior,
  permission policy storage/evaluation, permissioned expiry filtering,
  permissioned conflict/supersession filtering, scanning, redaction,
  live-store behavior, security claim, or compliance claim
- leaves permissioned expiry constraints to Phase 7I and permissioned
  conflict/supersession exclusion constraints to Phase 7J

Phase 7I behavior:

- adds a narrow opt-in permissioned expiry constraint for read-context
  only
- uses nested/API `readPermission.validUntil`, CLI
  `--read-valid-until <ttl>` with the explicit caller-asserted read actor and
  allowed-scope flags, and MCP `readPermission.validUntil` only on
  `mempr.context`
- leaves existing reads unchanged when `validUntil` is absent
- preserves hard expired-record blockers and accepted relationship blockers
  before any expiry permission narrowing can run
- runs existing scope filtering and any Phase 7H scope narrowing before
  applying `validUntil`
- includes records only when they have no expiry or `expires_at > validUntil`
- does not apply to `context-status`, warning-only metadata outside filtered
  read-context responses, MCP resources, export preview, confirmed export,
  list/inspect/history, raw ledger/event projections, arbitrary resources, or
  live stores
- adds no real authentication, hosted authorization, OAuth behavior,
  permission policy storage/evaluation, writes, events, scanning, redaction,
  live-store behavior, auth-backed permission enforcement, permissioned
  conflict/supersession filtering, security claim, or compliance claim

Phase 7J behavior:

- adds narrow opt-in permissioned conflict/supersession constraints for
  read-context only
- uses nested/API/MCP `readPermission.excludeConflicts` and
  `readPermission.excludeSupersedes`, plus CLI
  `--read-exclude-conflicts` and `--read-exclude-supersedes` with the explicit
  caller-asserted read actor and allowed-scope flags
- leaves existing reads unchanged when both flags are absent
- requires the explicit read-permission object to keep the Phase 7H
  caller-asserted actor label and allowed scopes; relationship flags are not
  accepted as standalone
  permission claims
- preserves hard expired-record blockers and accepted relationship blockers
  before any relationship permission narrowing can run
- runs existing scope filtering, Phase 7H allowed-scope narrowing, and Phase
  7I `validUntil` narrowing before applying Phase 7J relationship narrowing
- filters by own-record metadata only: `excludeConflicts` removes otherwise
  eligible records whose own `conflicts_with` array is non-empty, and
  `excludeSupersedes` removes otherwise eligible records whose own
  `supersedes` array is non-empty
- does not traverse relationship graphs, inspect incoming links, infer that a
  record has been superseded by another record, resolve conflicts, retire
  accepted records, or redact memory content
- treats malformed relationship permission fields as fail-closed no-content
  outcomes with no side effects
- does not apply to `context-status`, warning-only metadata outside filtered
  read-context responses, MCP resources, export preview, confirmed export,
  list/inspect/history, raw ledger/event projections, arbitrary resources, or
  live stores
- adds no real authentication, hosted authorization, OAuth behavior, permission
  policy storage/evaluation, writes, events, scanning, redaction, live-store
  behavior, auth-backed permission enforcement, graph policy, security claim,
  or compliance claim

Phase 7K behavior:

- adds optional structured non-secret evidence for read-context
  permission-denied issue results only
- applies only when explicit Phase 7H, Phase 7I, or Phase 7J read-context
  permission constraints deny or fail closed with a read-context
  permission-denial issue code
- permits only requested action, resource, surface, destination, requested
  scopes, permission contract version, `contentReturned: false`,
  `sideEffects: none`, or equivalent non-secret metadata
- excludes actor labels, allowed scopes, permission grants, policy internals,
  record IDs, memory text, source quotes, assembled records, full records,
  hidden record existence, authentication, policy storage/evaluation,
  writes/events, scanning, redaction, live-store behavior, audit/security
  claims, and compliance claims
- leaves default reads, hard blockers, non-permission blockers,
  `context-status`, warning-only metadata, MCP resources, export preview,
  confirmed export, list/inspect/history, raw ledger/event projections,
  arbitrary resources, live stores, and write/event surfaces unchanged except
  when faithfully carrying a read-context denial result

Phase 7L behavior:

- documents that `readPermission.actor`, CLI `--actor`, and CLI
  `--read-actor` are caller-asserted labels supplied only with explicit
  read-context permission constraints
- states that actor labels are not authenticated, verified, trusted as
  identity, stored as actor identity, or treated as authorization proof
- forbids actor inference from environment variables, OS usernames, process
  users, git config, MCP client metadata, MCP tool annotations, MCP roots, MCP
  sessions, CLI sessions, application sessions, HTTP sessions, OAuth tokens,
  OAuth scopes, or transport/client labels
- keeps missing-actor fail-closed behavior scoped to explicit read-context
  permission constraints; default reads remain unchanged when no explicit
  read-permission constraint is supplied
- adds no actor identity storage, auth/session storage, permission policy
  storage/evaluation, writes, events, destination-file side effects,
  redaction/scanning, live-store behavior, HTTP/OAuth behavior, security claim,
  or compliance claim

Phase 6A through 7L do not themselves add live network writes, automatic
redaction, auth-backed permissioned read enforcement, remote MCP HTTP/OAuth, or
compliance/security guarantees. R6-R11 later add explicit diagnostics/scanning,
local read-policy enforcement, live sync, self-hosted HTTP MCP, and release
hardening inside the local-first boundary.

The Memory PR metaphor is product language. The runtime truth in v0.1 is a memory
record lifecycle, not a full pull-request lifecycle.

## 8. Explicit Non-Goals

MemPR should not implement these before the write-governance core is stable:

- embeddings or retrieval ranking
- hosted multi-user review
- universal memory storage
- short-term checkpoint review
- hosted third-party memory-store security claims
- unconfirmed MCP write handlers, hosted MCP service claims, arbitrary proxy mode
- compliance-grade audit guarantees
- model-assisted classification as the primary policy engine

## 9. Core Workflow

```txt
agent/human proposes memory
        |
MemPR records source, scope, risk, TTL, destination, and policy decision
        |
policy returns auto_accept, review, or reject
        |
reviewer may accept/reject pending records
        |
accepted records export to a destination
```

Example low-risk path:

```bash
mempr propose \
  --memory "This repo uses npm for package management." \
  --source package.json \
  --scope repo

mempr list --status accepted
mempr export --destination MEMORY.md
```

Example manual review path:

```bash
mempr propose \
  --memory "The maintainer prefers short issue titles." \
  --source manual \
  --scope user \
  --risk medium \
  --destination MEMORY.md

mempr list --status pending
mempr accept mem_0g9ab1cd --reason "Confirmed by maintainer."
mempr export --destination MEMORY.md
```

## 10. Memory Record Model

Current record shape:

```json
{
  "id": "mem_01",
  "status": "accepted",
  "memory": "This repo uses npm for package management.",
  "source": {
    "type": "file",
    "uri": "package.json",
    "quote": null
  },
  "source_trust": "unknown",
  "scope": "repo",
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

V0.1 defaults and limits:

- `memory` is required.
- `source` defaults to `manual`.
- `source.type` is inferred from URI when possible.
- `source_trust` defaults to `unknown`; accepted values are `trusted`,
  `unknown`, and `untrusted`.
- `scope` defaults to `user`.
- `destination` defaults to `MEMORY.md`.
- Named file-adapter destinations must be repo-relative strings. They reject
  empty destinations, absolute paths, traversal or dot segments, backslashes,
  URL-like schemes, and null bytes.
- `ttl` and `expires_at` are stored as canonical expiry metadata. Date-only TTL
  values expire at the end of that UTC calendar day.
- Missing TTL stores `expires_at: null`.
- Export blocks expired `accepted` records for the requested destination.
- `supersedes` and `conflicts_with` are stored as arrays of record IDs.
- Missing legacy `supersedes` and `conflicts_with` fields normalize to `[]`.
- Export blocks when accepted records for the requested destination contain both
  sides of a declared conflict or supersession relationship.
- `policy_version` is the MemPR policy implementation marker that made the
  decision.
- Legacy records missing `expires_at` normalize from parseable `ttl`, or to
  `null` when no TTL exists.
- Legacy records missing `source_trust` or `policy_version` read as `unknown`.
- `source_trust: "untrusted"` prevents automatic acceptance; `trusted` does not
  bypass blockers or prove source safety.
- `policy_version` is not a tamper-proof receipt or evidence that a memory claim
  is true; proposal events separately capture a local `policy_config_hash`.
- actor/reviewer identity is not stored yet.
- `readPermission.actor` is a caller-asserted read-context constraint label,
  not authenticated, inferred, stored actor identity, or a policy evaluation
  key.
- status changes rewrite the current JSONL file.

Planned record extensions:

- `actor`
- `reviewer`
- `content_hash`
- `decision_event_id`
- `export_events`

## 11. State Machine And Transitions

Current v0.1 statuses:

- `pending`
- `accepted`
- `rejected`

Current policy decisions:

- `auto_accept`
- `review`
- `reject`

Current transition behavior:

- `auto_accept` creates an `accepted` record.
- `review` creates a `pending` record.
- `reject` creates a `rejected` record.
- CLI `accept` and `reject` can update record status by ID.

Required next hardening:

- require reviewer reasons for risky status changes
- block rejected-to-accepted transitions unless explicit override reason exists
- preserve previous status in event history once append-only events exist
- validate status transitions through one state-machine function

## 12. Policy And Risk Model

Policy order in v0.1:

1. Reject secret-like content.
2. Reject unsafe security-weakening standing instructions.
3. Review sensitive personal or regulated information.
4. Use explicit `--risk` if supplied.
5. Infer low risk for `repo` or `project` scope.
6. Default to medium risk and review.

Risk classes:

Low risk:

- repo conventions
- non-sensitive project facts
- formatting and process preferences

Medium risk:

- broad user preferences
- claims derived from summaries
- project assumptions with uncertain provenance
- procedural memory that is not obviously unsafe

High risk:

- secrets or credentials
- medical, legal, or financial details
- security-weakening instructions
- memory from untrusted sources that looks procedural

Policy must remain deterministic before any model-assisted classification is
introduced.

### 12.1 Policy Configuration Foundation

Phase 3A adds a local `.mempr/policy.json` file for narrow deterministic policy
configuration.

Supported fields:

- `denyTerms`: local term snippets that force high-risk rejection when matched.
- `sensitiveTerms`: local term snippets that force high-risk review when
  matched.
- `autoAcceptScopes`: scopes that infer low risk when no explicit risk is
  supplied.
- `defaultRisk`: fallback inferred risk for proposals without explicit risk,
  configured auto-accept scope, or TTL.
- `ttlRisk`: inferred risk for proposals with a TTL and no explicit risk.

Missing config preserves the built-in defaults. A present config file must be
valid JSON. Configured terms are matched against memory text and source quotes,
but decision reasons and config errors must not echo matched terms, memory text,
quotes, or secret values from a malformed config file.

Config risk fields affect inferred risk only. They do not override built-in
secret, unsafe-instruction, or sensitive checks, and they do not override an
explicit proposal risk.

Still out of scope for Phase 3A itself:

- TTL expiry enforcement or stale export blocking.
- Source-trust scoring or confidence-based policy decisions.
- Policy config hashes, policy replay proofs, or tamper-proof policy receipts.
- Conflict detection, supersession, or read-side governance.

### 12.2 Source Trust And Policy Version Recording

Phase 3B records provenance metadata without changing policy behavior.

Supported source-trust values:

- `trusted`
- `unknown`
- `untrusted`

Missing source trust defaults to `unknown`. A caller can set source trust through
the API or CLI, but the value is metadata only in this slice. It does not change
risk, decision, status, review requirements, or export eligibility.

New records also store `policy_version`, currently `mempr-policy-v1`. This is a
MemPR policy implementation marker for the algorithm/version family that made
the decision. It is not a `.mempr/policy.json` hash, not a replay proof, not a
tamper-proof receipt, and not proof that the memory is true.

Legacy records that are missing `source_trust` or `policy_version` normalize on
read as `unknown`. Malformed metadata must fail closed without echoing memory
text, source quotes, or malformed secret-like values.

### 12.3 TTL Expiry And Stale Export Blocking

Phase 3C enforces TTL at the export boundary only.

Supported TTL inputs:

- ISO datetimes with timezone.
- Date-only `YYYY-MM-DD` values, interpreted as the end of that UTC calendar
  day.

New records store canonical expiry metadata in `ttl` and `expires_at`. Missing
TTL stores both as `null`. Legacy records missing `expires_at` normalize from a
parseable `ttl`, or to `null` when no TTL exists.

Invalid TTL values fail closed before records or events are written. Error
messages must not echo memory text, source quotes, or malformed secret-like
values.

Export blocks when an `accepted` record for the requested destination is
expired. The error may include blocked count and record IDs. It must not include
memory text or source quotes.

Expired `pending` records, expired `rejected` records, and expired records for
other destinations remain inspectable and do not block an export.

This is not conflict detection, supersession, provider identity proof,
destination-adapter compatibility, export redaction, or read-side governance.

### 12.4 Conflict Supersession Review Gating

Phase 3D records declared conflict and supersession relationships without
turning them into automatic conflict resolution.

Supported relationship metadata:

- `supersedes`: record IDs this proposal claims to replace.
- `conflicts_with`: record IDs this proposal claims to conflict with.

New proposals may declare existing record IDs in either field. Missing legacy
fields normalize on read as empty arrays.

Before append, MemPR must reject proposals that contain unknown record
references. It must also reject proposals where the same record ID appears in
both `supersedes` and `conflicts_with`.

Any non-empty conflict or supersession metadata prevents automatic acceptance.
The proposal requires maintainer review even when scope/risk would otherwise
produce `auto_accept`.

Secret-like content and unsafe security-weakening standing instructions still
reject. Relationship metadata must not downgrade those safety failures into
review.

This is not automatic conflict resolution, read-side conflict filtering, or
active retirement of superseded accepted records. Superseded accepted records
remain accepted until a maintainer changes their status through normal review.

### 12.5 Accepted Relationship Export Governance

Phase 3E treats export as the trust boundary for accepted memory written into a
destination.

For a requested destination, export must inspect accepted target records and
block when the target set contains both sides of a declared relationship:

- Conflict: an accepted target record's `conflicts_with` points to another
  accepted target record.
- Supersession: an accepted target record's `supersedes` points to another
  accepted target record that is still accepted in the same destination.

Blocking is destination-scoped. Linked records that are `pending`, `rejected`,
or accepted for another destination do not block the requested export.

Relationship export errors may include record IDs and relationship type only.
They must not include memory content, source quotes, or other evidence copied
from the memory text.

This is not automatic conflict resolution, read-side filtering, graph or cycle
analysis, or active retirement of superseded accepted records.

## 13. CLI Requirements

Current commands:

- `propose --memory <text> [--source <uri>] [--source-type <type>] [--source-trust trusted|unknown|untrusted] [--quote <text>] [--scope <scope>] [--risk low|medium|high] [--destination <path>] [--ttl <value>] [--supersedes <ids>] [--conflicts-with <ids>]`
- `list [--status pending|accepted|rejected] [--risk low|medium|high] [--destination <path>]`
- `inbox [--risk low|medium|high] [--destination <path>]`
- `diff <id>`
- `history <id> [--json]`
- `review <id> --accept|--reject --reason <text>`
- `accept <id> [--reason <text>]`
- `reject <id> [--reason <text>]`
- `export [--destination <path>]`
- `context [--destination <path>] [--scope <scope[,scope]>]`
- `context-status [--destination <path>]`
- `check`

`inbox` lists pending records only and supports risk/destination filtering and
JSON output. `diff <id>` shows a local review view for one record plus direct
relationship context. `review <id> --accept|--reject --reason <text>` wraps the
same status-transition rules as `accept` and `reject`, which remain supported.

`history <id> [--json]` is a read-only local timeline command for
one memory record. It reads the current record state from `.mempr/ledger.jsonl`
and summarizes that record's proposal, status-change, export, and
migration/backfill participation from `.mempr/events.jsonl`. It may show the
target record memory because this is explicit local review/history, but it must
not dump unrelated migrated or exported record content. Missing event history
is represented as an empty timeline, and malformed event history is represented
as an empty or limited timeline with a non-secret issue summary, not as
rollback, repair, migration, or proof of absence.

Relationship context in `diff <id>` may show memory content because it is an
explicit local review command. Non-leaky behavior still applies to export
blocking errors, malformed metadata/config errors, and other failures that are
not intentional review views.

`context [--destination <path>] [--scope <scope[,scope]>]` is the Phase 7A
local read-context assembly command. It reads accepted records for one exact
destination, runs export-parity TTL and accepted relationship blockers, applies
optional scope filtering only after those blockers pass, and then returns the
assembled records. It does not write destination files, create directories,
mutate ledger state, or append events. Scope filtering is not identity,
authorization, permissioning, enforcement, or security. Returned context is not
truth validation, safety validation, sensitive-data scanning, or redaction.

`context-status [--destination <path>]` is the Phase 7D read-context
status/observability command. Without `--destination`, it summarizes each
recorded MemPR destination; with `--destination`, it reports one exact
destination. It returns aggregate readiness, destination-level
readiness/blockers, `total`/`accepted`/`pending`/`rejected` counts, accepted
record IDs, and issue metadata without returning memory text, source quotes,
assembled records, or would-write destination-file content. It reuses the same
accepted-only TTL and relationship blockers as Phase 7A and has no write,
event, directory, ledger, or destination-file side effects.
Phase 7E extends read-context and status outputs with stale/upcoming-expiry
warnings for accepted records approaching expiry. Those warnings are advisory
only: expired accepted records still hard-block through the existing TTL issue,
while warnings do not change destination readiness, context assembly
eligibility, or export eligibility.

Phase 7F adds no CLI behavior. It documents that `context` scope filtering,
`context-status` readiness, and Phase 7E warning metadata are not actor
identity, authentication, authorization, permissioning, enforcement, security,
or compliance controls. Permissioned reads remain deferred until separate
decisions define actor identity, auth model, permission semantics,
scanning/redaction, HTTP/OAuth stance, and live-store boundaries.

Phase 7G also adds no CLI behavior. It defines the future read actor and
permission vocabulary for later work only: caller identity, actor identity,
auth-before-authorization, permission dimensions (`action`, `resource`,
`destination`, `scope`), deny-by-default missing/denied behavior, and
content-free evidence privacy. Current `context`, `context-status`, expiry
warnings, and MCP read outputs are unchanged and do not enforce permissions.

Phase 7H adds opt-in CLI behavior for `mempr context`: callers may pass
`--actor` or `--read-actor` together with `--allowed-scopes <scope[,scope]>`.
Those actor flags are caller-asserted labels, not authenticated identity.
Without that explicit constraint, existing reads remain unchanged; with it,
returned accepted records are narrowed by allowed scope after Phase 7A blockers
pass, and any requested `--scope` value must be included in the allowed set.
Denials are no-content and no-side-effect. Phase 7H does not define
authentication, hosted authorization, OAuth, permission policy storage,
permissioned expiry or conflict filtering, scanning/redaction, live-store
reads, or security claims.

Phase 7I adds opt-in CLI behavior for `mempr context` through
`--read-valid-until <ttl>` with the explicit caller-asserted read actor and
allowed-scope flags. Without that flag, existing reads remain unchanged. With it, hard
expired-record and accepted relationship blockers still run before scope
filtering and expiry narrowing.

Phase 7J adds opt-in CLI behavior for `mempr context` through
`--read-exclude-conflicts` and `--read-exclude-supersedes` with the explicit
caller-asserted read actor and allowed-scope flags. Without those flags,
existing reads remain unchanged. With them, hard blockers, scope filtering, and any
`--read-valid-until` narrowing still run first; the relationship flags may only
remove otherwise eligible records based on their own `conflicts_with` or
`supersedes` metadata. The flags do not affect `context-status`, MCP
resources, export preview, confirmed export, `list`, `inspect`, or `history`,
and malformed flag values or malformed read-permission fields fail closed with
no memory content and no side effects.

Phase 7L adds no CLI behavior. It documents that `--actor`, `--read-actor`,
and nested `readPermission.actor` are caller-asserted labels only. The CLI must
not infer actors from environment variables, OS usernames, process users, git
config, shell/session state, OAuth tokens, OAuth scopes, or client metadata.
Missing actor fails closed only when an explicit read-context permission
constraint is supplied; default `context` reads without explicit
read-permission constraints remain unchanged.

Global flags:

- `--root <path>`
- `--json`

CLI requirements:

- Support no-network local operation.
- Print JSON when `--json` is set.
- Avoid printing sensitive values in errors.
- Keep terminal output aligned with actual record state.
- Preserve deterministic behavior for tests.

## 14. Export Requirements

Current export behavior:

- Exports only `accepted` records.
- Filters by exact destination path.
- Blocks export when accepted records for the target destination are expired.
- Blocks export when accepted records for the target destination contain both
  sides of a declared conflict or supersession relationship.
- Writes a managed Markdown block.
- Preserves existing user-written content outside the managed block.
- Includes memory text, scope, source URI, source-trust metadata, and record ID.

Export is an exfiltration boundary. Before downstream adapters ship, MemPR must
keep the file-adapter contract small, deterministic, and locally testable.
Generic Markdown output is the stable base output.

Phase 6A local file-adapter requirements:

- Keep the managed Markdown block mechanics deterministic across generic
  export, `AGENTS.md`, and `CLAUDE.md`.
- Export only accepted records whose `destination` exactly equals the requested
  destination.
- Check export-time destination compatibility before writing a destination.
- Preserve user-written content outside the MemPR managed block.
- Validate local file destinations as repo-relative strings; reject empty
  destinations, absolute paths, traversal or dot segments, backslashes,
  URL-like schemes, and null bytes.
- Cover `AGENTS.md` and `CLAUDE.md` adapters with golden output tests.
- Emit the normal `memory_exported` event after successful exports.

Phase 6B adapter-specific local output requirements:

- Keep generic Markdown managed-block output stable for generic destinations.
- Give `AGENTS.md` a deterministic managed-block heading, preamble, and
  empty-state copy tailored for standard Markdown agent instructions.
- Give `CLAUDE.md` a deterministic managed-block heading, preamble, and
  empty-state copy tailored for persistent Markdown project context for Claude.
- Keep adapter-specific output inside the same MemPR managed block markers.
- Preserve accepted-only exact destination filtering, destination validation,
  user-written content outside the block, and normal `memory_exported` event
  behavior.
- Keep empty-state copy deterministic and local; it must not imply hidden
  memory, live synchronization, enforcement, identity, security, or read-side
  governance.

The rationale for the two named outputs is intentionally narrow. `AGENTS.md` is
standard Markdown for agent instructions and has no required fields, so MemPR
uses a deterministic local managed section rather than a schema. `CLAUDE.md` is
persistent Markdown project context for Claude, so MemPR keeps the managed
section concise and specific. Neither rationale is a security, authorization,
identity, enforcement, or live-memory claim.

Phase 6C scope-grouped local output requirements:

- Keep generic Markdown managed-block output stable, flat, and ungrouped for
  generic destinations.
- Group `AGENTS.md` and `CLAUDE.md` accepted records by scope inside the
  managed block for readability only.
- Use deterministic group order: `repo`, `project`, `user`, then custom scopes
  alphabetically by scope value.
- Preserve the filtered input order of records within each scope group.
- Keep every record's per-record provenance fields, including scope, source
  URI, source-trust metadata, and record ID.
- Keep accepted-only exact destination filtering, destination validation,
  relationship/TTL export blocking, outside-block preservation, and normal
  `memory_exported` event behavior unchanged from Phase 6A and 6B.
- Do not treat grouping as read-side governance, scope filtering,
  permissioning, enforcement, identity, security, authorization, or live memory
  synchronization.

Phase 6D local export dry-run/preview requirements:

- Treat dry-run/preview as local preflight only, not a committing export.
- Use the same destination validation, adapter compatibility checks,
  accepted-only exact destination filtering, relationship/TTL export blocking,
  and rendering path that a committing export uses.
- Preview exactly what would be written to the requested destination after
  managed-block replacement.
- Do not write destination files.
- Do not create parent directories.
- Do not append `memory_exported` events.
- Do not weaken export blockers or present dry-run as automatic redaction,
  authorization, downstream synchronization, or compliance evidence. R7
  scanning applies to preview/export blockers and warnings without writing
  diagnostics during normal previews.

Phase 6A, 6B, 6C, 6D, and 6E explicitly do not add export-time sensitive-data
redaction, downstream ID reconciliation, retries/auth, live network writes,
read-side governance, or compliance/security guarantees. R7 later adds
accepted-memory export-boundary scanning only; it does not auto-redact memory.

### 14.1 Read-Side Context Assembly Requirements

Phase 7A is the first local read-side governance contract. It assembles local
read context; it does not export, mutate, authorize, enforce, or validate truth.

Phase 7A requirements:

- Require one exact destination. There is no all-destination read, fuzzy
  adapter match, arbitrary file passthrough, or live store query in this slice.
- Consider only records whose status is `accepted` and whose `destination`
  exactly equals the requested destination.
- Run TTL blocking with export parity before any context is returned. Expired
  accepted records for the requested destination block the whole assembly.
- Run accepted relationship blocking with export parity before any context is
  returned. Accepted same-destination conflict or supersession pairs block the
  whole assembly.
- Report blockers with non-secret evidence such as record IDs, counts,
  destination, and relationship type. Blocker errors must not include memory
  text or source quotes.
- Apply optional scope filtering only after TTL and relationship blockers pass.
  Scope filters reduce the returned accepted records; they cannot bypass stale
  or relationship blockers.
- Run R7 accepted-memory scanning before context is returned. Secret-like
  content blocks with a correlation ID and no memory text or quote echo;
  sensitive content warns without blocking.
- Do not write destination files, create directories, mutate `.mempr/ledger.jsonl`,
  append `.mempr/events.jsonl`, or emit `memory_exported` events.
- Treat returned context as local assembly output only. It is not proof that
  memories are true, safe, complete, non-sensitive, authorized, or redacted.
- Treat scope filtering as presentation-time selection only. It is not actor
  identity, reviewer identity, authorization, permissioning, enforcement,
  security, or compliance evidence.
- Keep automatic redaction deferred. Accepted sensitive content can still
  appear in returned context when it produces a warning rather than a blocker.

Full read-side governance remains a later decision. It requires separate ADRs
for identity, authorization, permission semantics, remote MCP/HTTP behavior,
retrieval ranking, live memory-store reads, scanning/redaction, and truth or
safety claims.

### 14.2 MCP Context Resource Requirements

Phase 7C exposes the Phase 7A read-context assembly contract through
constrained read-only local stdio MCP resources/templates. It does not create a
new read policy, export path, file passthrough surface, permission system, or
live-store reader.

Phase 7C requirements:

- Advertise the reviewed resource template `mempr://context/{destination}`.
- Optionally advertise concrete reviewed resources such as
  `mempr://context/MEMORY.md`.
- Treat the URI destination as a MemPR destination selector, not arbitrary file,
  URL, repository, raw ledger/event, or generic resource passthrough.
- Reuse the Phase 7A exact destination requirement, accepted-only eligibility,
  and export-parity TTL and accepted relationship blockers.
- Run TTL and accepted relationship blockers before any context is returned.
- Return non-secret blocker evidence only, such as record IDs, counts,
  destination, and relationship type; do not include memory text or source
  quotes in blocker errors.
- Do not require or accept `confirm` for context resource reads.
- Do not write destination files, create parent directories, mutate
  `.mempr/ledger.jsonl`, append `.mempr/events.jsonl`, emit
  `memory_exported`, or create other MemPR domain events.
- Distinguish resource/template reads from `mempr.context`,
  `mempr.export.preview`, and confirmed `mempr.export`: resources return
  accepted read-context projection content through MCP resource reads,
  `mempr.context` returns the same projection through a tool call,
  `mempr.export.preview` returns would-write destination-file content, and
  confirmed `mempr.export` writes the destination after `confirm: true`.
- Do not claim identity, authorization, permissioning, enforcement, security,
  or compliance evidence.
- Do not claim returned context is truth validation, safety validation,
  sensitive-data scanning, non-sensitivity proof, or redaction proof.
- R7 scanning now applies at this boundary; automatic redaction and hosted
  live-store reads remain outside this slice.

Accepted sensitive content can still appear in successful context resource
reads because accepted memory is returned as context.

### 14.3 Read-Context Status Observability Requirements

Phase 7D adds read-context status/observability for destination readiness. The
surfaces are CLI `mempr context-status`, API `summarizeReadContextStatus`, MCP
tool `mempr.context.status`, MCP resource `mempr://contexts`, and MCP template
`mempr://contexts/{destination}`. They do not return read context, preview
export output, write files, scan content, authorize callers, or prove safety.

Phase 7D requirements:

- Report aggregate status as a list of exact destination-level summaries.
  `mempr://contexts` and unfiltered `context-status` summarize recorded
  destinations; `--destination`, `mempr.context.status` with a destination
  argument, and `mempr://contexts/{destination}` report one exact destination.
- Use exact destination matching for each destination summary. There is no
  fuzzy adapter match, arbitrary file passthrough, or live store query in this
  slice.
- Count records whose `destination` exactly equals the summarized destination,
  and use `accepted` records only for readiness/blocker eligibility.
- Run accepted-only TTL blocking with export parity before readiness is
  reported. Expired accepted records for the requested destination block the
  destination status.
- Run accepted-only relationship blocking with export parity before readiness
  is reported. Accepted same-destination conflict or supersession pairs block
  the destination status.
- Treat pending, rejected, and other-destination records as non-blocking for
  the requested destination status.
- Report aggregate readiness, destination-level readiness/blockers,
  `total`/`accepted`/`pending`/`rejected` counts, accepted record IDs, and
  issue metadata such as issue code, message, relationship type, and blocker
  record IDs.
- Do not include memory text, source quotes, assembled record payloads,
  rendered context, destination-file content, or export preview content.
- Do not treat counts for pending, rejected, or other-destination records as
  blockers.
- Do not write destination files, create directories, mutate
  `.mempr/ledger.jsonl`, append `.mempr/events.jsonl`, emit
  `memory_exported`, or create other MemPR domain events.
- Distinguish status from `mempr context`, `mempr.context`,
  `mempr://context/{destination}`, ledger consistency `mempr://status`,
  `mempr.export.preview`, and confirmed `mempr.export`.
- Do not claim identity, authorization, permissioning, enforcement, security,
  or compliance evidence.
- Do not claim a ready status is truth validation, safety validation,
  sensitive-data scanning, non-sensitivity proof, or redaction proof.
- R7 scanning now applies at this boundary; automatic redaction and hosted
  live-store reads remain outside this slice.

Accepted sensitive content can still exist in accepted records even though
status does not echo memory text or source quotes.

### 14.4 Read-Context Expiry Warning Requirements

Phase 7E adds stale/upcoming-expiry warnings as metadata on read-context
outputs and read-context status outputs. Warning payloads are read-only,
non-blocking, and content-free. Read-context surfaces may still return accepted
records as Phase 7A already allows after blockers pass; status surfaces remain
content-free. It is a warning slice, not permissioned read governance.

Phase 7E requirements:

- Return warning metadata on Phase 7A/7B/7C read-context surfaces and Phase 7D
  status surfaces: `context`, `assembleReadContext`, `mempr.context`,
  `mempr://context/{destination}`, `context-status`,
  `summarizeReadContextStatus`, `mempr.context.status`, `mempr://contexts`,
  and `mempr://contexts/{destination}`.
- Compute warnings per exact destination summary.
- Consider accepted records only when their `destination` exactly equals the
  summarized destination.
- Warn for unexpired accepted records inside the upcoming-expiry warning
  window.
- Keep expired accepted records as hard blockers through the existing
  accepted-only TTL issue instead of downgrading them to warnings.
- Treat pending, rejected, and other-destination records as non-warning inputs
  for the summarized destination.
- Keep warnings non-blocking: they must not set destination `ok` to false,
  change context assembly eligibility, or change export eligibility.
- Warning payloads may include warning code, destination, accepted record IDs,
  `expires_at`, warning-window metadata, and time-to-expiry metadata.
- Warning payloads must not include memory text, source quotes, assembled
  records, rendered context, destination-file content, export preview content,
  or full record payloads.
- Do not write destination files, create parent directories, mutate
  `.mempr/ledger.jsonl`, append `.mempr/events.jsonl`, emit
  `memory_exported`, or create other MemPR domain events.
- Do not claim identity, authorization, permissioning, enforcement, security,
  truth validation, safety validation, non-sensitivity proof, automatic
  redaction, or hosted live-store reads.

### 14.5 Permissioned Read-Governance Boundary Requirements

Phase 7F is a documentation, contract-metadata, and regression-guardrail slice.
It does not implement permissioned reads, enforcement, scanning, redaction,
remote transport, or live store reads. It exists to prevent the existing
read-context surfaces from being mistaken for access-control behavior.

Phase 7F requirements:

- Treat scope filtering as local presentation-time selection only. Scope
  filters run after Phase 7A blockers and are not actor identity,
  authorization, permission semantics, enforcement, security, or compliance
  evidence.
- Treat read-context status as content-free destination readiness and blocker
  observability only. Status is not authentication, authorization,
  permissioning, enforcement, safety validation, redaction proof, or security.
- Treat Phase 7E expiry warnings as non-blocking advisory metadata only.
  Warnings are not freshness proof, authorization, permissioning, enforcement,
  safety validation, redaction proof, or security.
- Do not add a command, API operation, MCP tool/resource, OAuth scope,
  permission check, auth decision, event, ledger mutation, destination-file
  side effect, scanning behavior, redaction behavior, HTTP/OAuth behavior,
  live-store behavior, or runtime scope check in Phase 7F.
- Do not claim permissioned reads until separate ADRs define actor identity,
  auth model, permission semantics, denied/missing-identity behavior beyond
  Phase 7K's narrow read-context permission-denied evidence and Phase 7L's
  caller-asserted actor boundary,
  scanning/redaction requirements, HTTP/OAuth posture, live-store boundaries,
  broader evidence privacy, and verification tests.
- Keep accepted sensitive content as an explicit residual risk until scanning
  and redaction decisions exist.

### 14.6 Read Actor And Permission Contract Foundation

Phase 7G defines vocabulary and decision gates for future permissioned reads as
a static source contract plus docs and tests. It does not implement
permissioned reads, permission enforcement, actor storage, permission storage,
authentication, authorization, scanning, redaction, remote transport, or
live-store reads.

Phase 7G requirements:

- Define `caller` as the immediate client, process, tool, or transport peer that
  invokes a MemPR read surface.
- Define `actor` as the future authenticated principal on whose behalf the read
  is evaluated. An actor may later be a human, local agent, service account, or
  delegated subject, but Phase 7G does not store or authenticate any actor.
- Treat current `readPermission.actor`, CLI `--actor`, and CLI `--read-actor`
  values as caller-asserted labels only. They are not the future authenticated
  actor identity until a later ADR defines identity storage, authentication,
  trust, and runtime verification.
- Define `reviewer` as a future human approval or governance role that is
  separate from read actor identity.
- Treat current local stdio MCP metadata, scope metadata, and tool annotations
  as protocol/client metadata only. They are not identity, authentication,
  authorization, permission grants, OAuth scopes, or enforcement evidence.
- Require future permissioned reads to authenticate the actor before
  authorization. Missing or unverifiable identity must fail closed once a
  permissioned mode exists.
- Define future permission decisions across four dimensions: `action` (for
  example reading context, status, or warning metadata), `resource` (the MemPR
  read surface or record projection), `destination` (the exact MemPR
  destination selector), and `scope` (record scope or requested scope filter).
- Treat scope as one permission dimension only. Scope alone must not identify
  the actor, grant access, bypass Phase 7A blockers, or prove security.
- Define deny precedence for future permission evaluation: explicit deny beats
  allow, missing identity denies, missing permission denies, unknown
  action/resource denies, ambiguous destination denies, and malformed permission
  data fails closed.
- Keep future permission checks unable to weaken current TTL blockers,
  accepted-relationship blockers, exact-destination requirements,
  no-write/no-event boundaries, or evidence privacy rules.
- Define missing/denied responses as no-content outcomes. They must not return
  memory text, source quotes, assembled records, rendered context,
  destination-file content, export preview content, full record payloads, or
  hidden record existence as proof.
- Permit only non-secret denial evidence such as stable error code, requested
  action/resource/destination/scope, correlation ID, and policy/permission
  version identifiers. Actor identifiers and permission details must be
  minimized and must not expose secrets or inaccessible content.
- Require separate ADRs before implementation for identity storage and trust,
  auth/session model, permission policy storage and evaluation, admin/reviewer
  workflows, broader denied-response contracts beyond Phase 7K's narrow
  read-context permission-denied evidence, scanning/redaction, HTTP/OAuth
  posture, live-store boundaries, audit/logging boundaries, and runtime tests.
- Add no command, API operation, MCP tool/resource, permission check, auth
  decision, event, ledger mutation, destination-file side effect, actor storage,
  permission storage, scanning behavior, redaction behavior, HTTP/OAuth
  behavior, live-store behavior, or runtime enforcement in Phase 7G.
- Change no current `context`, `context-status`, Phase 7E warning, or MCP read
  behavior.

### 14.7 Permissioned Scope-Filtered Read Constraint

Phase 7H implements the narrowest permissioned read-context constraint MemPR
can safely ship before real authentication and policy storage exist. It is an
opt-in scope constraint for read-context output only, not a general permission
system.

Phase 7H requirements:

- Apply only when a caller explicitly supplies a caller-asserted actor label
  and allowed scopes for read-context assembly. The actor label is not
  authenticated identity. Existing `context` and `mempr.context` reads remain
  unchanged when no explicit constraint is supplied; MCP resource reads such as
  `mempr://context/{destination}` have no permission-argument path in Phase
  7H.
- Constrain read-context output only. Phase 7H does not apply to
  `context-status`, Phase 7E warning-only metadata, export preview, confirmed
  export, `list`, `inspect`, `history`, ledger/event resources, live stores, or
  arbitrary resource passthrough.
- Reuse Phase 7A order: exact destination and accepted-only eligibility first,
  then TTL blockers, then accepted relationship blockers, then scope filtering,
  and only then the explicit permission constraint. The permission constraint
  must not bypass stale-record blockers, accepted relationship blockers, exact
  destination matching, or accepted-only eligibility.
- Permit only scope narrowing. The constraint may reduce returned accepted
  read-context records to the caller-supplied allowed scopes. It must not
  broaden records, include non-matching destinations, include pending or
  rejected records, resolve conflicts, hide expired blockers, or create live
  store queries.
- Treat missing actor, missing/empty allowed scopes, malformed permission data,
  and requested scopes outside the allowed set as no-content denials when an
  explicit permission constraint is supplied.
- Keep denials no-content: they must not return memory text, source quotes,
  assembled records, rendered context, destination-file content, export preview
  content, full record payloads, or hidden record existence.
- Keep denials no-side-effect: they must not write destination files, create
  parent directories, mutate `.mempr/ledger.jsonl`, append
  `.mempr/events.jsonl`, emit `memory_exported`, or create other MemPR domain
  events.
- Keep allowed denial evidence limited to non-secret metadata such as a stable
  denial code, requested action/resource/destination/scope, correlation ID, and
  policy/permission version identifiers.
- Do not treat local stdio MCP metadata, scope metadata, tool annotations, or
  OAuth scope names as proof of actor identity, authentication,
  authorization, or record-level permission.
- Do not add real authentication, hosted authorization, OAuth behavior,
  permission policy storage/evaluation, scanning, redaction, live-store
  behavior, or security/compliance claims in Phase 7H.
- Do not add permissioned expiry filtering or permissioned
  conflict/supersession filtering in Phase 7H. Permissioned expiry constraints
  are covered by Phase 7I, and permissioned conflict/supersession constraints
  are covered by Phase 7J.
- Require separate implementation ADRs/tests before any auth-backed permission
  enforcement claim: actor identity storage and trust, auth/session handling,
  permission policy storage/evaluation, broader denied-response schema beyond
  Phase 7K, logging/audit boundary, scanning/redaction decisions, HTTP/OAuth
  stance, live-store boundaries, and broader runtime integration tests.

### 14.8 Permissioned Expiry Constraint

Phase 7I implements the next narrow permissioned read-context constraint. It is
an opt-in expiry filter for returned read-context records only, not a general
authorization system or freshness proof.

Phase 7I API shape:

- API callers may supply `validUntil` only inside the nested read-permission
  constraint object, for example `readPermission.validUntil`; the explicit read
  permission object still requires a caller-asserted actor label and allowed
  scopes.
- CLI callers use `--read-valid-until <ttl>` on `context` with the explicit
  caller-asserted read actor and allowed-scope flags to opt in.
- MCP callers may supply `readPermission.validUntil` only on `mempr.context`
  inside the explicit `readPermission` object alongside `actor` and
  `allowedScopes`. MCP top-level `validUntil`, MCP resource reads,
  `mempr.context.status`, and `mempr://contexts` are outside Phase 7I.

Phase 7I requirements:

- Leave existing `context`, `mempr.context`, read-context API, warning, status,
  resource, and export behavior unchanged when `validUntil` is absent.
- Parse `validUntil` to the same canonical timestamp shape as existing expiry
  metadata. Malformed or unsupported `validUntil` values fail closed with no
  memory content and no side effects when an explicit Phase 7I constraint is
  supplied.
- Preserve ordering: exact destination and accepted-only eligibility first,
  then hard expired-record blockers, then accepted relationship blockers, then
  existing scope filtering and any Phase 7H scope narrowing, and only then
  Phase 7I expiry narrowing.
- Include records after Phase 7I expiry narrowing only when they have no expiry
  or `expires_at > validUntil`. The comparison is strict; records expiring at
  exactly `validUntil` are not included by the opt-in constraint.
- Keep existing expired accepted records as hard blockers. `validUntil` must
  not hide, downgrade, or bypass an `expired_record` blocker.
- Keep accepted conflict/supersession blockers as hard blockers. Phase 7I must
  not filter, resolve, suppress, or permission relationship constraints; Phase
  7J covers only later opt-in own-record relationship exclusion.
- Apply only to returned read-context records. Phase 7I does not apply to
  `context-status`, Phase 7E warning-only metadata outside filtered
  read-context responses, export preview, confirmed export, `list`,
  `inspect`, `history`, raw ledger/event projections, live stores, arbitrary
  resource passthrough, or MCP context resources.
- Keep omitted records private from the Phase 7I result: do not return memory
  text, source quotes, assembled records, rendered context, destination-file
  content, export preview content, full record payloads, or hidden record
  existence for records removed only by `validUntil`.
- Keep Phase 7I no-side-effect: no destination-file writes, parent directory
  creation, ledger mutation, event append, `memory_exported`, or other MemPR
  domain event.
- Do not add real authentication, hosted authorization, OAuth behavior,
  permission policy storage/evaluation, auth-backed permission enforcement,
  scanning, redaction, live-store behavior, or security/compliance claims.

### 14.9 Permissioned Conflict/Supersession Constraint

Phase 7J implements the next narrow permissioned read-context constraint. It is
an opt-in relationship metadata filter for returned read-context records only,
not a graph resolver, authorization system, redaction pass, or active
retirement mechanism.

Phase 7J API shape:

- API callers may supply `excludeConflicts` and `excludeSupersedes` only inside
  the nested read-permission constraint object, for example
  `readPermission.excludeConflicts` and
  `readPermission.excludeSupersedes`; the explicit read permission object still
  requires a caller-asserted actor label and allowed scopes.
- CLI callers use `--read-exclude-conflicts` and
  `--read-exclude-supersedes` on `context` with the explicit
  caller-asserted read actor and allowed-scope flags to opt in.
- MCP callers may supply `readPermission.excludeConflicts` and
  `readPermission.excludeSupersedes` only on `mempr.context` inside the
  explicit `readPermission` object alongside `actor` and `allowedScopes`. MCP
  top-level relationship flags, MCP resource reads, `mempr.context.status`,
  and `mempr://contexts` are outside Phase 7J.

Phase 7J requirements:

- Leave existing `context`, `mempr.context`, read-context API, warning, status,
  resource, and export behavior unchanged when both relationship flags are
  absent.
- Parse `excludeConflicts` and `excludeSupersedes` as booleans only. Malformed
  or unsupported values fail closed with no memory content and no side effects
  when an explicit Phase 7J constraint is supplied.
- Preserve ordering: exact destination and accepted-only eligibility first,
  then hard expired-record blockers, then accepted relationship blockers, then
  existing scope filtering, any Phase 7H scope narrowing, any Phase 7I
  `validUntil` narrowing, and only then Phase 7J relationship narrowing.
- Keep existing accepted conflict/supersession blockers as hard blockers.
  Phase 7J must not hide, downgrade, or bypass a same-destination accepted
  relationship blocker.
- Filter by own-record metadata only. When `excludeConflicts` is true, remove
  otherwise eligible records whose own `conflicts_with` array is non-empty.
  When `excludeSupersedes` is true, remove otherwise eligible records whose own
  `supersedes` array is non-empty.
- Do not inspect incoming links, traverse relationship graphs, infer that a
  record has been superseded by another record, perform cycle analysis, resolve
  conflicts, retire accepted records, or redact memory content.
- Apply only to returned read-context records. Phase 7J does not apply to
  `context-status`, Phase 7E warning-only metadata outside filtered
  read-context responses, MCP resources, export preview, confirmed export,
  `list`, `inspect`, `history`, raw ledger/event projections, live stores, or
  arbitrary resource passthrough.
- Keep omitted records private from the Phase 7J result: do not return memory
  text, source quotes, assembled records, rendered context, destination-file
  content, export preview content, full record payloads, or hidden record
  existence for records removed only by relationship flags.
- Keep Phase 7J no-side-effect: no destination-file writes, parent directory
  creation, ledger mutation, event append, `memory_exported`, or other MemPR
  domain event.
- Do not add real authentication, hosted authorization, OAuth behavior,
  permission policy storage/evaluation, auth-backed permission enforcement,
  scanning, redaction, live-store behavior, graph policy, or
  security/compliance claims.

### 14.10 Read-Context Permission-Denied Evidence

Phase 7K defines optional structured evidence for read-context
permission-denied issue results only. It is not authentication,
authorization, policy evaluation, redaction, scanning, audit evidence, or a
security claim.

Phase 7K requirements:

- Apply only to read-context permission-denial issue codes from explicit
  read-context permission constraints. This includes Phase 7H scope-constraint
  denials, Phase 7I `validUntil` denial or parse-failure outcomes, and Phase
  7J relationship-field denial or parse-failure outcomes when they are
  represented as read-context permission denials.
- Keep the evidence optional. A compliant denial may remain minimal; structured
  evidence must stay inside the allowed field classes.
- Allow only non-secret metadata: requested `action`, requested `resource`,
  `surface`, requested `destination`, requested scopes or scope filters,
  permission contract version, `contentReturned: false`, `sideEffects: none`,
  a stable permission-denied issue code, or equivalent non-secret fields.
- Exclude actor labels, caller labels, reviewer labels, service-account labels,
  delegated-subject labels, allowed scopes, permission grants, allow lists,
  deny lists, policy internals, policy storage details, evaluation traces,
  rule names, record IDs, inaccessible-record counts, hidden record existence,
  memory text, source quotes, assembled records, rendered context,
  destination-file content, export preview content, full records, raw
  ledger/event payloads, authentication state, OAuth scopes, redaction proof,
  scanning proof, audit claims, security claims, and compliance claims.
- Preserve no-content behavior. Denials must not return memory text, source
  quotes, assembled records, rendered context, destination-file content,
  export preview content, full record payloads, or hidden record existence.
- Preserve no-side-effect behavior. Denials must not write destination files,
  create parent directories, mutate `.mempr/ledger.jsonl`, append
  `.mempr/events.jsonl`, emit `memory_exported`, or create other MemPR domain
  events.
- Leave default reads unchanged when no explicit read-permission constraint is
  supplied.
- Leave hard blockers and non-permission blockers unchanged. Expired-record
  blockers, accepted relationship blockers, destination validation failures,
  and non-permission parse failures must keep their existing issue contracts.
- Leave `context-status`, export preview, confirmed export, list/inspect,
  history, MCP resources/templates, warning-only metadata, raw ledger/event
  projections, arbitrary resources, live stores, and write/event surfaces
  unaffected except when faithfully carrying a read-context denial result.
- Do not add authentication, hosted authorization, OAuth behavior, permission
  policy storage/evaluation, auth-backed permission enforcement,
  scanning/redaction, live-store behavior, audit/security guarantees, or
  compliance guarantees in Phase 7K.

### 14.11 Read Actor Identity/Auth Boundary

Phase 7L records the current actor identity/auth boundary for explicit
read-context permission constraints in the static read-permission contract and
docs. It does not implement authentication,
authorization, actor identity storage, session handling, permission policy
storage/evaluation, redaction, scanning, live-store reads, remote transport, or
security/compliance guarantees.

Phase 7L requirements:

- Expose the boundary through `MEMPR_READ_PERMISSION_CONTRACT` with
  caller-asserted actor semantics, no identity inference, no identity storage,
  unchanged default reads, and no ledger/event/file side effects.
- Treat `readPermission.actor`, CLI `--actor`, and CLI `--read-actor` as
  caller-asserted labels supplied only by callers that opt into explicit
  read-context permission constraints.
- Do not treat those actor labels as authenticated identity, verified
  principals, authorization proof, reviewer identity, service-account identity,
  delegated-subject identity, audit evidence, security evidence, or compliance
  evidence.
- Do not infer actors from environment variables, OS usernames, process users,
  git config, MCP client metadata, MCP tool annotations, MCP roots, MCP
  sessions, CLI sessions, application sessions, HTTP sessions, OAuth tokens,
  OAuth scopes, transport labels, or client labels.
- Fail closed for missing actor only when an explicit read-context permission
  constraint is supplied and the constraint requires an actor label. Keep
  default `context` and `mempr.context` reads unchanged when no explicit
  read-permission constraint is supplied.
- Do not apply actor requirements to `context-status`, Phase 7E warning-only
  metadata, MCP resources/templates, export preview, confirmed export, `list`,
  `inspect`, `history`, raw ledger/event projections, arbitrary resources,
  live stores, or write/event surfaces.
- Do not store actor identity in `.mempr/ledger.jsonl`, `.mempr/events.jsonl`,
  policy state, denial evidence, or exported context because of Phase 7L.
- Do not add permission policy storage, permission policy evaluation, actor
  allow lists, actor deny lists, permission grants, writes, events,
  destination-file side effects, redaction/scanning behavior, live-store
  behavior, HTTP/OAuth behavior, security guarantees, or compliance guarantees.
- Keep broader auth-backed permission enforcement deferred until separate ADRs
  define actor identity storage and trust, authentication/session handling,
  permission policy storage and evaluation, OAuth/HTTP posture,
  denied-response privacy beyond Phase 7K, redaction/scanning, live-store
  boundaries, audit/logging boundaries, and runtime verification.

## 15. Security And Trust Requirements

MemPR treats durable memory as trusted future context. Proposed memory content is
untrusted data until policy and review decide otherwise.

Primary risks:

- memory poisoning
- secret persistence
- scope bleed
- unsafe standing instructions
- silent mutation
- adapter confusion
- MCP context/tool poisoning
- export exfiltration

V0.1 controls:

- policy rejects known secret-like patterns
- policy rejects known unsafe-instruction patterns
- policy reviews sensitive personal or regulated information
- ledger records source URI/type, source-trust metadata, scope, risk, decision,
  policy version, reason, canonical expiry metadata, and declared
  conflict/supersession metadata
- conflict/supersession metadata forces maintainer review instead of automatic
  acceptance
- rejected proposals remain inspectable in local records
- exported output excludes pending and rejected records
- export blocks expired accepted records for the target destination

Deferred controls requiring separate decisions:

- provider identity proof beyond local source-trust review gating
- stronger replay proofs beyond local policy config hashes
- actor/reviewer identity
- actor/caller identity storage and trust model
- actor inference from env/OS/MCP/client/session/OAuth metadata
- permission policy storage and evaluation
- append-only events
- content hashes
- auth-backed permissioned read enforcement beyond Phase 7H's opt-in
  read-context scope constraint
- auth-backed or broader expiry policy beyond Phase 7I's opt-in `validUntil`
  read-context constraint
- auth-backed or graph-based conflict/supersession policy beyond Phase 7J's
  opt-in own-record read-context exclusion flags
- read-side identity, authorization, enforcement, and security semantics
- actor identity, auth model, permission semantics, denied/missing-identity
  behavior, action/resource/destination/scope dimensions, caller-asserted
  actor boundaries beyond Phase 7L, and broader evidence privacy beyond Phase
  7K's narrow read-context permission-denied evidence
- automatic export-time sensitive-data redaction
- automatic read-context sensitive-data redaction
- treating scanning as a permissioned-read, security, compliance, or
  non-sensitivity proof
- downstream adapter IDs, retries/auth, and write reconciliation
- live-store read boundaries and remote HTTP/OAuth posture

Security non-goals:

- preventing all prompt injection in the agent itself
- securing third-party memory stores
- proving memory claims are true
- proving returned read context is safe or non-sensitive
- encrypting local ledgers in v0.1
- tamper-proof or compliance-grade audit guarantees

## 16. Integration Requirements

Current:

- generic Markdown export to `MEMORY.md` or an explicit destination path

Phase 6A local file adapters:

- `AGENTS.md`
- `CLAUDE.md`

These are local file adapters only. Phase 6A gives them explicit destination
compatibility, exact accepted-only destination filtering, outside-block content
preservation, golden output tests, and normal `memory_exported` event behavior.

Phase 6A file-adapter destinations must be repo-relative and must reject empty
destinations, absolute paths, traversal or dot segments, backslashes,
URL-like schemes, and null bytes.

Phase 6B adapter-specific local output:

- Generic Markdown output remains stable.
- `AGENTS.md` receives deterministic managed-block headings, preamble text, and
  empty-state copy for standard Markdown agent instructions.
- `CLAUDE.md` receives deterministic managed-block headings, preamble text, and
  empty-state copy for persistent Markdown project context for Claude.
- Both named adapters remain ordinary local file outputs inside MemPR managed
  block markers.

Phase 6C scope-grouped local output:

- Generic Markdown output remains stable, flat, and ungrouped.
- `AGENTS.md` and `CLAUDE.md` group accepted records by scope for readability
  inside the managed block.
- Group order is `repo`, `project`, `user`, then custom scopes alphabetically.
- Records preserve input order within each group.
- Per-record provenance fields remain rendered for every record.

`AGENTS.md` support does not imply required fields, runtime enforcement,
identity, authorization, security behavior, scope permissioning, or read-side
scope governance. `CLAUDE.md` support does not imply live memory
synchronization, identity, authorization, security behavior, scope
permissioning, or read-side governance.

Phase 6D local export dry-run/preview:

- Dry-run/preview is a local preflight for generic Markdown, `AGENTS.md`, and
  `CLAUDE.md` export behavior.
- It preserves the same validation and blocking rules as committing export.
- It previews the exact destination content that would be written.
- It does not write destination files, create directories, or append
  `memory_exported` events.

Deferred store/workflow adapters:

- Mem0
- LangGraph long-term stores, not short-term checkpoints
- LLM-wiki durable page updates
- custom network adapters
- Claude Code memory directory support beyond the two named local files

Deferred adapters must not be described as live network writes until separate
contracts cover destination compatibility, retries/failure handling,
authentication where needed, and downstream ID/reconciliation semantics.

MCP local stdio surface:

Phase 5B ships only a local stdio MCP skeleton. It supports `initialize`,
`notifications/initialized`, `ping`, `tools/list`, `resources/list`,
`resources/templates/list`, and `logging/setLevel`. The list methods expose
reviewed metadata from ADR-0017; they do not execute tools or read resource
contents. `logging/setLevel` accepts a client log-level preference only and
does not write to `.mempr/events.jsonl`.

Phase 5C adds a read-only callable slice. `tools/call` is limited to
`mempr.list`, `mempr.inspect`, `mempr.history`, and `mempr.check`.
`resources/read` is limited to reviewed `mempr://` projections for records,
policy, status, record review context, and record history.

Phase 5D adds local stdio mutation tools for `mempr.propose`, `mempr.review`,
and `mempr.export`. Every current MCP write tool must reject at the server
boundary unless its arguments include the literal boolean `confirm: true`.
Missing, false, string, or otherwise non-boolean confirmation is a no-write
tool error. Confirmation is a local interaction signal only; it is not actor
identity, a signature, authorization, or audit-grade proof. MCP propose/export
destinations must pass an MCP-level destination guard: repo-relative strings
only, with absolute paths, traversal, backslashes, and URL-like destination
strings rejected before side effects.

Phase 6E adds local stdio `mempr.export.preview` as a read-only MCP tool. It
does not accept `confirm`, does not call the committing export mutation, and
does not write destination files, create directories, or append
`memory_exported` events. It reuses the Phase 6D dry-run path and rejects
unmanaged existing destinations so preview cannot become arbitrary
repository-file disclosure.

Phase 7B adds local stdio `mempr.context` as a read-only MCP tool. It reuses
the Phase 7A local read-context assembly path and does not accept `confirm`,
write destination files, create directories, mutate ledger state, append events,
or emit `memory_exported` events. It requires one exact destination, considers
accepted records for that exact destination only, runs export-parity TTL and
accepted relationship blockers before optional scope filtering, and returns
assembled accepted records rather than destination-file preview content.
`mempr.context` is separate from Phase 6E `mempr.export.preview` and Phase 5D
confirmed `mempr.export`. Scope filtering is not identity, authorization,
permissioning, enforcement, or security. Returned MCP context is not proof that
accepted memory is true, safe, non-sensitive, or redacted; R7 blocks
secret-like accepted memory and warns on sensitive accepted memory without
automatic redaction.
R10 exposes self-hosted MCP HTTP; hosted live-store reads remain outside this
slice.

Phase 7C adds constrained local stdio MCP resources/templates for the same
read-context assembly path. `resources/templates/list` may expose
`mempr://context/{destination}`, and `resources/list` may expose concrete
reviewed resources such as `mempr://context/MEMORY.md`. The URI destination is
a MemPR destination selector, not arbitrary file, URL, repository, raw
ledger/event, or generic resource passthrough. Resource/template reads reuse
Phase 7A exact-destination accepted context eligibility and export-parity TTL
and accepted relationship blockers before returning context, and they do not
write destination files, create directories, mutate ledger state, append
events, or emit `memory_exported`. They are separate from the `mempr.context`
tool, `mempr.export.preview`, and confirmed `mempr.export`. They do not add
identity, authorization, permissioning, enforcement, security, automatic
redaction, or hosted live-store reads. Accepted sensitive content can still
appear.

Phase 7D adds read-context status/observability as content-free destination
readiness, not another MCP context read. The MCP tool is
`mempr.context.status`; resources are `mempr://contexts` for aggregate exact
destination summaries and `mempr://contexts/{destination}` for one exact
destination. These are distinct from `mempr.context`,
`mempr://context/{destination}`, ledger consistency `mempr://status`,
`mempr.export.preview`, and confirmed `mempr.export`; they may report
aggregate readiness, destination-level blockers, counts, accepted record IDs,
and issue metadata, but must not return memory text, source quotes, assembled
records, rendered context, destination-file content, or export preview content.
They reuse Phase 7A exact-destination matching, accepted-only readiness
eligibility, TTL/relationship blocker parity, and no-write/no-event boundaries.
They do not add identity, authorization, permissioning, enforcement, security,
truth validation, safety validation, non-sensitivity proof, automatic redaction,
or hosted live-store reads.

Phase 7E adds advisory expiry warning metadata to read-context and
read-context status outputs. The metadata is non-blocking and content-free:
warnings do not change destination readiness, context assembly eligibility, or
export eligibility, and they must not include memory text, source quotes,
assembled records, rendered context, destination-file content, export preview
content, or full record payloads.

Phase 7F adds no MCP read or enforcement behavior. It clarifies that existing
local stdio read-context tools/resources, context-status observability, scope
filtering, and expiry warnings are not authentication, authorization,
permissioning, enforcement, OAuth scopes, security, or compliance evidence.
Local stdio scope metadata is protocol metadata only, with no runtime scope
checks. Permissioned reads require separate decisions for actor identity, auth
model, permission semantics, scanning/redaction, HTTP/OAuth posture, and
live-store boundaries.

Phase 7G adds no MCP read, auth, or enforcement behavior. It defines future
caller/actor/reviewer vocabulary and a future permission-decision shape across
`action`, `resource`, `destination`, and `scope`, but current MCP
`mempr.context`, `mempr.context.status`, `mempr://context/{destination}`,
`mempr://contexts`, and `mempr://contexts/{destination}` behavior is unchanged.
MCP local stdio metadata remains protocol metadata only, not identity,
authentication, authorization, OAuth scope evidence, or a permission grant.

Phase 7H adds opt-in MCP `mempr.context` behavior through a caller-supplied
`readPermission` constraint with a caller-asserted actor label and allowed
scopes. Without that explicit constraint, current MCP read behavior is
unchanged; with it, returned accepted records are narrowed by permitted scope
only after Phase 7A blockers pass. MCP resource reads such as
`mempr://context/{destination}` stay unchanged because they have no
permission-argument path in Phase 7H. Denied constrained reads must return no
memory text, source quotes, assembled records, rendered context,
destination-file content, export preview content, full record payloads, or
hidden record existence, and must have no writes, events, ledger mutation,
directories, or destination-file side effects. Phase 7H does not turn MCP
metadata, OAuth scope names, or tool annotations into authentication,
authorization, permission policy storage, hosted authorization,
scanning/redaction, live-store behavior, or security evidence.

Phase 7I adds opt-in MCP `mempr.context` behavior through
`readPermission.validUntil` inside that same explicit `readPermission` object.
Phase 7J adds opt-in MCP `mempr.context` behavior through
`readPermission.excludeConflicts` and
`readPermission.excludeSupersedes` inside that same explicit object. Without
those fields, existing MCP read behavior is unchanged. With them, hard
expired-record and accepted relationship blockers still run before scope,
expiry, and relationship narrowing. Phase 7J uses own-record relationship
metadata only and does not affect MCP resource reads, `mempr.context.status`,
`mempr://contexts`, export preview, confirmed export, list/history/inspect,
auth, stored policy, writes/events, graph traversal, redaction, or security
claims.

Phase 7L adds no MCP tool or resource behavior. It records in the static
contract and docs that
`readPermission.actor` on `mempr.context` is a caller-asserted label only, not
authenticated identity or authorization proof. MCP metadata, tool annotations,
roots, sessions, client labels, OAuth tokens, OAuth scopes, and transport
details must not be used to infer actor identity. Missing actor fails closed
only when an explicit `readPermission` object is supplied and requires the
actor field; MCP reads without explicit read-permission constraints remain
unchanged. Broader auth-backed MCP enforcement remains deferred.

- target MCP spec `2025-11-25`, as pinned by ADR-0017
- re-review the current MCP spec before coding if the official latest spec has
  changed
- start with local `stdio`; defer HTTP transport and OAuth authorization
- distinguish Phase 5C read-only list/inspect/history/check behavior from Phase
  5D confirmed mutation behavior, Phase 6E export preview, Phase 7B tool
  read-context assembly, Phase 7C resource/template read-context assembly, and
  Phase 7D read-context status observability, Phase 7E advisory warnings,
  Phase 7F/7G prerequisite documentation and metadata guardrails, Phase 7H
  opt-in scope constraints, Phase 7I `validUntil` constraints, Phase 7J
  conflict/supersession exclusion constraints, Phase 7K permission-denied
  evidence, and Phase 7L static caller-asserted actor boundary
- use static, reviewed tool descriptions
- treat tool annotations as advisory hints
- expose resources under a constrained `mempr://` namespace
- read resources only through constrained `mempr://` projection handlers
- do not expose arbitrary files, URLs, repositories, raw ledger lines, raw event
  payloads, or generic resource passthrough
- require explicit `confirm: true` for `mempr.propose`, `mempr.review`, and
  `mempr.export` before any MCP write side effect
- keep `mempr.context` read-only with no `confirm`, no writes, no events, and
  no destination-file side effects
- keep `mempr://context/{destination}` resource reads constrained to MemPR
  destination selectors with no writes, no events, and no destination-file side
  effects
- keep Phase 7H/7I/7J permission constraints opt-in and read-context-only;
  they may narrow returned records but must not change status, warnings, MCP
  resources, export preview, confirmed export, list/history/inspect,
  ledger/event projections, live stores, or arbitrary resources
- keep `readPermission.actor` caller-asserted and unauthenticated; do not infer
  actors from MCP metadata, tool annotations, roots, sessions, client labels,
  OAuth tokens, OAuth scopes, or transport metadata
- reject MCP propose/export destination strings that are absolute, traversal,
  backslash-based, URL-like, or otherwise not repo-relative
- reserve least-privilege scope names before any HTTP transport support
- defer OAuth/scope enforcement until a separate HTTP ADR
- keep MCP logging separate from MemPR's event ledger
- do not expose MCP prompts, sampling, elicitation, or proxy mode yet

MCP `2025-11-25` was verified as latest during the Phase 5A contract pass on
2026-05-21. ADR-0017 is the canonical MCP contract until superseded.

## 17. Acceptance Criteria

V0.1 is useful when a developer can:

- propose memory records with source and scope
- list records by status
- auto-accept low-risk repo/project memory
- reject secret-like and unsafe-instruction memory
- explicitly accept or reject pending memory
- export accepted memory to a local Markdown destination
- prevent stale accepted records from being exported after expiry
- replay emitted proposal/status events into current memory records
- validate Phase 6A local file-adapter destinations before writing
- export deterministic `AGENTS.md` and `CLAUDE.md` managed blocks under golden
  tests
- keep generic Markdown output stable while Phase 6B gives `AGENTS.md` and
  `CLAUDE.md` deterministic adapter-specific headings, preambles, and
  empty-state copy
- keep generic Markdown output flat while Phase 6C groups accepted
  `AGENTS.md` and `CLAUDE.md` records by deterministic scope order for
  readability only
- preview a Phase 6D local export dry-run with the same validation and blocking
  rules as committing export, without writing destination files, creating
  directories, or appending `memory_exported` events
- preview the same export through local stdio MCP with read-only
  `mempr.export.preview`, without turning MCP into arbitrary file passthrough
- assemble Phase 7A local read context for one exact destination from accepted
  records only, with export-parity TTL and relationship blockers, optional
  scope filtering only after blockers pass, and no writes, destination-file
  changes, directories, or events
- assemble the same read context through local stdio MCP with read-only
  `mempr.context`, without confusing it with export preview or confirmed export
- read the same context through constrained local stdio MCP resources/templates
  such as `mempr://context/{destination}`, without treating the destination as
  arbitrary file/resource passthrough or confusing resource reads with
  `mempr.context`, export preview, or confirmed export
- inspect Phase 7D read-context status for one exact destination with
  `context-status`, `summarizeReadContextStatus`, `mempr.context.status`, or
  `mempr://contexts/{destination}`, and inspect aggregate exact-destination
  status through `mempr://contexts`, without memory text, source quotes,
  context records, preview content, writes, events, or security overclaims
- inspect Phase 7E stale/upcoming-expiry warnings on read-context and status
  surfaces as non-blocking metadata for accepted records approaching expiry,
  without changing hard blockers for expired accepted records or returning
  memory text inside warning entries
- understand Phase 7F as a permissioned read-governance boundary and
  prerequisite map only, without mistaking scope filtering, status readiness,
  or warning metadata for identity, auth, permissioning, enforcement, security,
  scanning, redaction, HTTP/OAuth, or live-store behavior
- understand Phase 7G as a future read actor/permission contract foundation
  only, without expecting current `context`, `context-status`, warning, or MCP
  read behavior to authenticate callers, authorize actors, enforce permissions,
  hide denied resources, or change returned records
- understand Phase 7H as an opt-in read-context-only scope constraint
  ownership slice, without expecting existing reads to change unless a future
  explicit permission constraint is supplied, and without expecting real
  authentication, hosted authorization, OAuth, policy storage, scanning,
  redaction, live-store behavior, permissioned expiry filtering, or
  permissioned conflict filtering
- understand Phase 7I as an opt-in read-context-only `validUntil` expiry
  constraint, using nested/API `readPermission.validUntil`, CLI
  `--read-valid-until <ttl>` with the explicit caller-asserted read actor and
  allowed-scope flags, and MCP `readPermission.validUntil` only, without
  expecting hard
  expired-record blockers, relationship blockers, status, export, MCP
  resources, auth, policy storage, scanning/redaction, live stores, or security
  claims to change
- understand Phase 7J as an opt-in read-context-only conflict/supersession
  exclusion constraint, using nested/API/MCP
  `readPermission.excludeConflicts` and
  `readPermission.excludeSupersedes` plus CLI
  `--read-exclude-conflicts` and `--read-exclude-supersedes`, without expecting
  default reads, hard blockers, `context-status`, MCP resources, export
  preview, confirmed export, list/history/inspect, auth, policy storage,
  graph traversal, redaction, writes/events, live stores, or security claims to
  change
- inspect the local ledger
- understand what is shipped vs planned from the README and PRD

## 18. Test Requirements

Current tests cover:

- auto-accept low-risk repo memory
- reject secret-like memory
- export accepted memories and exclude pending memories
- unsafe standing instructions
- sensitive personal/regulatory review path
- explicit risk override behavior
- scope defaults and source defaults
- status transition guards
- accept/reject reasons
- malformed ledger and event handling
- destination filtering
- managed block preservation
- event writes for propose, status change, and export
- event replay parity for proposal/status flows
- CLI smoke for JSON flags, list filters, review, export, and event writing
- consistency checks for missing event files, malformed events, replay/current drift, and CLI check output
- atomic current-view write helper
- policy config defaults, deny terms, sensitive terms, inferred-risk knobs, and non-leaky malformed config errors
- source-trust defaults, API/CLI source-trust inputs, untrusted-source review
  gating, policy-version stamping, legacy metadata normalization, and non-leaky
  malformed metadata errors
- TTL expiry defaults, canonical expiry storage, legacy expiry normalization,
  non-leaky invalid TTL failures, and destination-scoped stale export blocking
- conflict/supersession storage, legacy empty-array normalization, pre-append
  reference rejection, overlap rejection, review gating, and unsafe/secret
  rejection precedence
- MCP Phase 5C read-only `tools/call` for list/inspect/history/check,
  constrained `resources/read` projections, and non-MemPR/traversal/unknown URI
  rejection
- MCP Phase 5D confirmed mutation behavior for propose/review/export: missing,
  false, or non-boolean `confirm` rejects before side effects; `confirm: true`
  reaches the CLI-equivalent mutation path; and propose/export destinations
  reject absolute, traversal, backslash, and URL-like strings
- Phase 7A API/CLI context assembly for accepted exact-destination records,
  omitted pending/rejected/other-destination records, optional scope filtering
  after blockers, export-parity TTL and relationship blockers, non-leaky issue
  evidence, and no destination-file, directory, ledger, or event side effects
- Phase 7B MCP `mempr.context` contract/listing and tool-call coverage for
  read-only annotations, no confirmation, exact-destination accepted records,
  optional scope filtering after blockers, export-parity TTL and relationship
  blockers, non-leaky `ok: false` issue evidence, and no destination-file,
  directory, ledger, or event side effects
- Phase 7C MCP context resource/template coverage for
  `mempr://context/{destination}` metadata, optional concrete
  `mempr://context/MEMORY.md` listing, exact-destination accepted records,
  export-parity TTL and relationship blockers, non-leaky blocked evidence,
  destination-as-selector validation, distinction from `mempr.context`,
  `mempr.export.preview`, and confirmed `mempr.export`, and no
  destination-file, directory, ledger, or event side effects
- Phase 7D read-context status coverage for exact-destination accepted-only
  readiness, accepted-only TTL blockers, accepted same-destination relationship
  blockers, pending/rejected/other-destination non-blockers, aggregate and
  exact destination outputs, `total`/`accepted`/`pending`/`rejected` counts,
  accepted record IDs, issue metadata, no memory text or source quotes,
  distinction from `mempr context`, `mempr.context`,
  `mempr://context/{destination}`, ledger `mempr://status`,
  `mempr.export.preview`, and confirmed `mempr.export`, and no
  destination-file, directory, ledger, or event side effects

Next tests must cover:
- Phase 7E read-context/read-context-status warning coverage for unexpired accepted records
  inside the warning window, exact-destination matching, pending/rejected and
  other-destination non-warning inputs, expired accepted records hard-blocking
  through the existing TTL issue instead of warnings, content-free warning
  evidence, and no file, directory, ledger, event, or `memory_exported` side
  effects
- Phase 6A adapter golden files for `AGENTS.md` and `CLAUDE.md`
- Phase 6A destination validation: repo-relative only, no empty destinations,
  absolute paths, traversal or dot segments, backslashes, URL-like schemes, or
  null bytes
- Phase 6A proof that file adapters preserve outside-block user content,
  filter accepted records by exact destination, and emit normal
  `memory_exported` events
- Phase 6B generic Markdown stability fixtures and adapter golden outputs for
  deterministic `AGENTS.md` and `CLAUDE.md` headings, preambles, and empty-state
  copy
- Phase 6B proof that adapter-specific output does not change destination
  validation, exact destination filtering, outside-block preservation, or
  `memory_exported` event behavior
- Phase 6C generic Markdown flat-output stability fixtures
- Phase 6C `AGENTS.md` and `CLAUDE.md` golden outputs proving scope group order:
  `repo`, `project`, `user`, then custom scopes alphabetically
- Phase 6C proof that records preserve filtered input order within each group
  and keep per-record provenance fields
- Phase 6C proof that grouping does not change accepted-only export, exact
  destination filtering, destination validation, relationship/TTL blocking,
  outside-block preservation, or `memory_exported` event behavior
- Phase 6D dry-run/preview fixtures proving the preview matches the exact
  content a committing export would write for generic Markdown, `AGENTS.md`,
  and `CLAUDE.md`
- Phase 6D proof that dry-run/preview preserves destination validation,
  adapter compatibility checks, accepted-only exact destination filtering, and
  relationship/TTL export blocking
- Phase 6D proof that dry-run/preview does not write destination files, create
  parent directories, or append `memory_exported` events

Phase 7F verification combines documentation review, contract checks, and
runtime payload regression tests for boundary claims. Runtime tests prove the
absence of premature permissioned-read fields or claims; they do not test
permission enforcement because Phase 7F does not implement it.

Phase 7G verification combines documentation review, static contract tests, and
runtime-boundary regression tests. It must prove that README, PRD, ADR-0024,
the ADR index, council evidence, and `src/read-permissions.ts` define the future
actor/permission contract while preserving the no-enforcement boundary. Runtime
tests prove current read-context and MCP schemas do not expose premature
actor/permission fields; they do not test permission enforcement because Phase
7G does not implement it.

Phase 7H verification combines source, contract, documentation, and runtime
tests. It must prove that README, PRD, ADR-0025, the ADR index, council
evidence, `src/ledger.ts`, `src/cli.ts`, `src/mcp-contract.ts`,
`src/mcp-server.ts`, and `src/read-permissions.ts` describe and implement an
opt-in read-context-only scope constraint, existing reads remain unchanged
without an explicit actor and allowed scopes, denials return no content and
produce no side effects, `context-status` remains unchanged, and authentication,
hosted authorization, OAuth, policy storage, permissioned expiry/conflict
filtering, scanning/redaction, live-store behavior, and security claims remain
deferred.

Phase 7I verification combines documentation review, API-shape review, and
runtime tests. It must prove that README, PRD, ADR-0026, the ADR index, council
evidence, and source contracts describe and implement an opt-in
read-context-only `validUntil` expiry constraint through nested/API
`readPermission.validUntil`, CLI `--read-valid-until <ttl>` with the explicit
read actor and allowed-scope flags, and MCP `readPermission.validUntil` only.
Runtime coverage must prove default reads
stay unchanged, hard expired-record and accepted relationship blockers run
before `validUntil`, existing scope filtering runs before expiry narrowing,
records are
included only when they have no expiry or `expires_at > validUntil`,
context-status/MCP resources/export/list/history remain unchanged, denied or
malformed paths return no memory content and produce no side effects, and
auth/OAuth, policy storage, scanning/redaction, live stores, relationship
permission filtering, and security claims remain deferred.

Phase 7J verification combines documentation review, API-shape review, and
runtime tests. It must prove that README, PRD, ADR-0027, the ADR index, council
evidence, and source contracts describe and implement opt-in
read-context-only conflict/supersession constraints through nested/API/MCP
`readPermission.excludeConflicts` and
`readPermission.excludeSupersedes`, plus CLI `--read-exclude-conflicts` and
`--read-exclude-supersedes` with the explicit caller-asserted read actor and
allowed-scope flags. Runtime coverage must prove default reads stay unchanged,
hard
expired-record and accepted relationship blockers run before relationship
filtering, existing scope and `validUntil` filtering run before relationship
filtering, filtering uses own-record relationship metadata only, malformed
fields fail closed with no memory content and no side effects, and
`context-status`, MCP resources, export preview, confirmed export,
list/history/inspect remain unchanged.

Phase 7K verification combines documentation review, evidence-shape review, and
runtime tests. It must prove that README, PRD, ADR-0028, the ADR index, council
evidence, and source contracts describe and implement optional structured
non-secret evidence for read-context permission-denied issue results only.
Runtime coverage must prove allowed evidence stays limited to requested
action/resource/surface/destination/scopes, permission contract version,
`contentReturned: false`, `sideEffects: none`, or equivalent metadata; excluded
fields such as actor labels, allowed scopes, permission grants, policy
internals, record IDs, memory text, source quotes, full records, hidden record
existence, authentication, policy storage/evaluation, writes/events,
redaction/scanning, live stores, audit/security claims, and compliance claims
are absent; default reads, hard blockers, non-permission blockers,
`context-status`, export, list/history/inspect, MCP resources, warning-only
metadata, raw ledger/event projections, live stores, and write/event surfaces
remain unchanged except when faithfully carrying a read-context denial result.

Phase 7L verification combines static source contract tests, API/CLI/MCP
behavior tests, documentation review, and scoped grep/diff checks. It must
prove that `MEMPR_READ_PERMISSION_CONTRACT`, README, PRD, ADR-0029, the ADR
index, and council evidence say `readPermission.actor`, `--actor`, and
`--read-actor` are caller-asserted labels only; actors are not authenticated,
inferred from env/OS/MCP/client/session/OAuth metadata, stored as actor
identity, or used for permission policy storage/evaluation; missing actor
fails closed only for explicit read-context permission constraints; default
reads and unrelated surfaces remain unchanged; and writes/events,
redaction/scanning, live stores, security claims, compliance claims, and
broader auth-backed enforcement remain deferred.

Remaining test gaps:

- Phase 4 CLI smoke for `inbox`, `diff`, `review --accept`, `review --reject`,
  JSON output, filters, legacy `accept`/`reject` compatibility, and review-view
  relationship context
- Phase 4B CLI smoke for `history`, `history --json`, proposal/status/export
  event participation, migration/backfill participation, missing or malformed
  event history, and prevention of unrelated migrated/exported memory dumps
- provider/source identity tests beyond local source-trust review gating
- read-side conflict filtering if it is introduced
- read actor identity, auth/session handling, permission policy evaluation,
  broader denied-response privacy, and enforcement tests if permissioned reads
  are implemented later
- Phase 7J graph traversal, incoming-link, and active-retirement behavior if
  those are introduced later
- future MCP HTTP/OAuth authorization behavior if a remote transport is added

Tests should remain local and no-network by default.

## 19. Implementation Phases

### Phase 0: Documentation Consolidation

Entry criteria:

- Current v0.1 docs exist but overlap.

Deliverables:

- canonical `docs/prd.md`
- flat `docs/adr/` path with index
- old product/build/readiness docs converted to stubs
- final council consolidation record

Exit criteria:

- README links to the PRD and ADR index
- claims are labeled shipped, planned, or deferred

Do not start too early:

- code changes beyond docs consolidation

### Phase 1: V0.1 Hardening

Entry criteria:

- PRD and ADR path are canonical.

Deliverables:

- schema/reference doc or ADR-backed schema section
- transition guards
- required reviewer reasons for risky transitions
- filters by risk and destination
- improved CLI errors
- no-secret terminal output
- adversarial policy tests

Exit criteria:

- record lifecycle invariants are tested
- current-state JSONL behavior is explicit and stable

Do not start too early:

- MCP server
- downstream store adapters
- model-assisted classification

### Phase 2: Audit/Event Ledger Core

Entry criteria:

- v0.1 lifecycle and schema are stable.

Phase 2A shipped:

- `.mempr/events.jsonl` event foundation
- events for proposal, status change, and export operations
- reusable event read/replay helpers
- replay parity tests for proposal/status flows

Phase 2B shipped:

- atomic writes for the current `ledger.jsonl` view
- `mempr check`
- structured drift detection for missing events, malformed events, replay
  failures, and replay/current mismatches
- CLI and unit tests for consistency checks

Phase 2C shipped:

- migration/backfill from current JSONL to replay-equivalent events
- `mempr migrate [--dry-run] [--json]`
- advisory file locking around store mutations
- tests that reject silent overwrite of divergent event history
- documentation that advisory locking is not compliance-grade
  transactionality

Remaining deliverables:

- stronger transactional guarantees
- actor/reviewer identity
- policy config hashes and replay proofs
- content hashes

Exit criteria:

- event replay produces the same current view
- migrations are tested
- concurrent write behavior is defined

Do not start too early:

- compliance-grade audit claims

### Phase 3: Policy, TTL, Source Trust, And Conflicts

Entry criteria:

- event model can preserve policy decisions and versions.

Phase 3A shipped:

- policy config file
- deny and sensitive term lists
- inferred-risk knobs
- malformed-config privacy checks

Phase 3B shipped:

- `source_trust` metadata on records, defaulting to `unknown`
- CLI/API support for `trusted`, `unknown`, and `untrusted`
- policy-version markers on new records
- legacy read normalization for missing metadata
- malformed metadata privacy checks

Phase 3C shipped:

- canonical `ttl` / `expires_at` metadata on records
- legacy `expires_at` normalization from parseable `ttl`
- invalid TTL failures that do not write records or echo memory/quote content
- export-time stale blocking for expired accepted records in the requested
  destination
- tests documenting that expired pending/rejected/other-destination records do
  not block export

Later Phase 3 deliverables:

- richer provider/source identity beyond local source-trust review gating

Phase 3D expected behavior:

- records store `supersedes` and `conflicts_with` arrays
- legacy records missing either relationship field normalize to `[]`
- new proposals may declare existing record IDs they supersede or conflict with
- unknown references and overlapping relationship references are rejected before
  append
- non-empty relationship metadata prevents automatic acceptance and requires
  maintainer review
- secret-like and unsafe standing-instruction proposals still reject
- no automatic conflict resolution, read-side conflict filtering, or active
  retirement of superseded accepted records

Phase 3E expected behavior:

- export is a trust boundary for accepted memory written into a destination
- export blocks when accepted records for the requested destination contain both
  sides of a declared conflict or supersession relationship
- `conflicts_with` blocks only when it points from one accepted target record to
  another accepted target record
- `supersedes` blocks only when it points from one accepted target record to
  another accepted target record that is still accepted in the same destination
- pending, rejected, and other-destination linked records do not block export
- relationship export errors expose record IDs and relationship type only, not
  memory content or source quotes
- no automatic conflict resolution, read-side filtering, graph/cycle analysis,
  or active retirement of superseded accepted records

Exit criteria:

- adversarial poisoning cases are tested
- expiry and conflict behavior are tested
- broad auto-accept remains narrow and justified

Do not start too early:

- personal-memory automation from untrusted sources

### Phase 4: Reviewer Ergonomics CLI

Entry criteria:

- policy and ledger can explain history reliably.
- Phase 3 relationship metadata and export governance are documented.

Deliverables:

Phase 4A shipped:

- `inbox` command that lists pending records only
- risk and destination filters for `inbox`
- JSON support for reviewer commands
- `diff <id>` local review view for one record
- direct relationship context in `diff <id>`
- `review <id> --accept|--reject --reason <text>` wrapper over existing status
  transitions
- continued support for existing `accept` and `reject`

Phase 4B shipped:

- `history <id> [--json]` read-only timeline command
- current target record state in history output
- summarized proposal/status/export/migration event participation for the
  target record from `.mempr/events.jsonl`
- target record memory may appear in explicit local history
- unrelated migrated or exported record content is not dumped
- missing or malformed event history produces an empty or limited timeline with
  non-secret issue details, not rollback, repair, migration, or proof of
  absence

Exit criteria:

- maintainers can find pending records, inspect one proposal with relationship
  context, and accept or reject it through an explicit review mode
- maintainers can inspect one record's available local event timeline without
  mutating the store or leaking unrelated event payload content
- runtime docs describe reviewer ergonomics without claiming a full PR
  lifecycle
- `diff` memory-content display is limited to explicit local review; non-review
  errors remain non-leaky
- `history` remains separate from `check`, `migrate`, rollback, repair, and
  audit-proof claims

Do not start too early:

- hosted collaboration UI
- actor/reviewer identity
- signatures, hashes, or audit-grade proof
- comments or reviewer note threads
- merge, close, reopen, rollback, or active retirement lifecycle
- interactive prompts or confirmations

### Phase 5: MCP Agent Surface

Entry criteria:

- governance core is stable
- MCP spec `2025-11-25` is re-reviewed and pinned
- ADR-0017 is accepted

Phase 5B skeleton deliverables:

- local `mempr-mcp` stdio entrypoint
- `initialize` with MCP `2025-11-25` protocol version and logging/tools/resources
  capabilities
- `notifications/initialized` state acceptance
- `ping`
- `tools/list` metadata only; no `tools/call`
- `resources/list` and `resources/templates/list` metadata only; no
  `resources/read`
- `logging/setLevel` acceptance without MemPR event-ledger writes
- no HTTP/OAuth, arbitrary resources, prompts, sampling, elicitation, proxy
  mode, or migration tools

Phase 5C read-only deliverables:

- `tools/call` for `mempr.list`, `mempr.inspect`, `mempr.history`, and
  `mempr.check`
- `resources/read` for constrained `mempr://` projections
- structured outputs
- logging redaction rules
- local transport first
- no `mempr.propose`, `mempr.review`, or `mempr.export` mutations
- no arbitrary file/resource passthrough
- no HTTP/OAuth, prompts, sampling, elicitation, proxy mode, or migration tools

Phase 5D confirmed mutation deliverables:

- local stdio `tools/call` for `mempr.propose`, `mempr.review`, and
  `mempr.export`
- explicit `confirm: true` is required for every current MCP write tool at the
  server boundary before side effects
- missing, false, string, or otherwise non-boolean `confirm` values return a
  no-write tool error
- `mempr.propose` reuses the CLI policy path and `mempr.review` reuses the
  explicit accept/reject review path
- `mempr.export` reuses export checks for TTL and accepted same-destination
  conflict/supersession pairs
- MCP-level propose/export destination guard accepts repo-relative destination
  strings only and rejects absolute paths, traversal, backslashes, and URL-like
  destination strings
- confirmation is documented only as a local interaction signal, not identity,
  signature, authorization, or audit proof
- no prompts, sampling, elicitation, proxy mode, or migration tools
- no HTTP/OAuth enforcement without a separate ADR

Phase 6E MCP export preview deliverables:

- local stdio `tools/call` for read-only `mempr.export.preview`
- no `confirm` argument required or accepted for preview
- preview reuses the Phase 6D local export dry-run path
- preview preserves destination validation, adapter compatibility, accepted-only
  exact destination filtering, relationship blocking, and TTL blocking
- preview does not write destination files, create parent directories, or append
  `memory_exported` events
- preview rejects unmanaged existing destinations so it cannot become arbitrary
  repository-file disclosure
- `mempr.export` remains a separate confirmed mutation
- no HTTP/OAuth, arbitrary file/resource passthrough, prompts, sampling,
  elicitation, proxy mode, export-time scanning/redaction, or live adapters

Skeleton exit criteria:

- initialize/discovery/logging methods are local and no-network
- no arbitrary file/resource passthrough exists

Phase 5C exit criteria:

- `tools/call` exposes only the read-only list/inspect/history/check subset
- `resources/read` exposes only constrained `mempr://` projections
- propose/review/export mutations remain unavailable through MCP
- no arbitrary file/resource passthrough exists

Phase 5D exit criteria:

- all current MCP write tools reject unless arguments include `confirm: true`
- confirmed MCP propose/review/export mutations produce the same policy,
  review, event, and export semantics as the CLI lifecycle
- MCP propose/export destination validation is stricter than generic CLI paths:
  repo-relative only, no absolute paths, traversal, backslashes, or URL-like
  strings
- no HTTP/OAuth, prompts, sampling, elicitation, proxy mode, arbitrary file or
  URL passthrough, or migration tools are introduced

Do not start too early:

- MCP proxy mode
- remote HTTP transport
- OAuth scopes or protected-resource metadata
- MCP prompts, sampling, or elicitation

### Phase 6: Destination Adapters

Entry criteria:

- export is treated as a tested trust boundary
- generic Markdown managed-block behavior is stable
- destination compatibility is specified for local files

Phase 6A local file-adapter deliverables:

- `AGENTS.md` adapter
- `CLAUDE.md` adapter
- deterministic managed Markdown block shared with generic export
- accepted-only exact destination filtering
- export-time destination compatibility checks
- user content preservation outside the managed block
- destination validation: repo-relative only; reject empty destinations,
  absolute paths, traversal or dot segments, backslashes, URL-like schemes, and
  null bytes
- golden output tests for both file adapters
- normal `memory_exported` event behavior

Phase 6A exit criteria:

- `AGENTS.md` and `CLAUDE.md` exports are deterministic, tested, and do not
  write outside the requested local repo-relative destination.
- Generic Markdown export remains distinguishable from named file adapters.
- Successful file-adapter exports produce the same `memory_exported` event
  shape as other exports.

Phase 6B adapter-specific local output deliverables:

- generic Markdown output remains stable
- `AGENTS.md` deterministic managed-block heading, preamble, and empty-state
  copy
- `CLAUDE.md` deterministic managed-block heading, preamble, and empty-state
  copy
- adapter-specific output remains inside MemPR managed block markers
- accepted-only exact destination filtering, destination validation,
  outside-block preservation, and normal `memory_exported` event behavior are
  unchanged from Phase 6A
- docs explain that `AGENTS.md` is standard Markdown for agent instructions with
  no required fields, and `CLAUDE.md` is persistent Markdown project context for
  Claude, without claiming enforcement, security, identity, or live memory
  behavior

Phase 6B exit criteria:

- Generic Markdown output remains byte-stable under its existing golden tests.
- `AGENTS.md` and `CLAUDE.md` golden tests prove their adapter-specific
  headings, preambles, and empty-state copy.
- Empty-state copy is deterministic and does not imply hidden memory, live sync,
  enforcement, identity, security, or read-side governance.
- README, PRD, ADR-0006, and council notes distinguish Phase 6A adapter
  boundary from Phase 6B adapter-specific local output.

Phase 6C scope-grouped local output deliverables:

- generic Markdown output remains stable, flat, and ungrouped
- `AGENTS.md` and `CLAUDE.md` accepted records group by scope inside the
  MemPR managed block for readability
- deterministic group order: `repo`, `project`, `user`, then custom scopes
  alphabetically by scope value
- filtered input order is preserved within each group
- per-record provenance fields remain present on every rendered record
- accepted-only exact destination filtering, destination validation,
  relationship/TTL export blocking, outside-block preservation, and normal
  `memory_exported` event behavior remain unchanged from Phase 6A and 6B
- docs explain that scope grouping is output organization only, not read-side
  governance, scope filtering, permissioning, enforcement, identity, security,
  authorization, or live memory synchronization

Phase 6C exit criteria:

- Generic Markdown output remains byte-stable and flat under golden tests.
- `AGENTS.md` and `CLAUDE.md` golden tests prove deterministic scope group
  order and preserved input order within each group.
- Golden outputs prove per-record provenance fields remain rendered after
  grouping.
- README, PRD, ADR-0006, and council notes distinguish Phase 6A boundary,
  Phase 6B adapter copy, and Phase 6C scope-grouped local output.

Phase 6D local export dry-run/preview deliverables:

- dry-run/preview mode for local export preflight
- same validation and blocking rules as committing export: destination
  validation, adapter compatibility, accepted-only exact destination filtering,
  relationship blocking, and TTL blocking
- exact preview of the destination content a committing export would write
- no destination file writes
- no parent directory creation
- no `memory_exported` event append
- docs explain that dry-run/preview is local preflight only, not live adapter
  rehearsal, automatic redaction, authorization, downstream synchronization,
  read-side governance, or compliance/security evidence

Phase 6D exit criteria:

- Dry-run/preview output matches committing export output for generic Markdown,
  `AGENTS.md`, and `CLAUDE.md` under golden or equivalent fixture tests.
- Tests prove dry-run/preview preserves all export validation and blocking
  rules.
- Tests prove dry-run/preview has no destination-file, directory-creation, or
  `memory_exported` event side effects.
- README, PRD, ADR-0006, and council notes distinguish Phase 6A boundary,
  Phase 6B adapter copy, Phase 6C scope-grouped output, and Phase 6D dry-run
  preview.

Phase 6E exit criteria:

- MCP contract tests prove `mempr.export.preview` is read-only, has no domain
  event, and does not require human confirmation.
- MCP stdio tests prove `tools/list` marks preview as read-only and
  non-destructive.
- MCP tool-call tests prove preview returns deterministic dry-run metadata and
  exact content for generic Markdown and named file adapters.
- MCP tool-call tests prove preview preserves export blockers and has no
  destination-file, directory-creation, or `memory_exported` event side effects.
- Docs distinguish Phase 5D confirmed export mutation, Phase 6D local dry-run,
  and Phase 6E read-only MCP preview.

Do not start too early:

- Mem0 adapter
- LangGraph long-term store wrapper
- LLM-wiki mutation adapter
- custom network adapters
- downstream ID reconciliation
- retries/auth for live adapters
- live network writes before local file adapter and dry-run contracts are boring
- automatic export-time sensitive-data redaction, read-side governance,
  read-side scope filtering, scope permissioning, enforcement, identity,
  security claims, or compliance-grade guarantees

### Phase 7: Read-Side Governance

Entry criteria:

- write governance is measurable and stable.

Deliverables:

Phase 7A local read-context assembly contract:

- exact destination is required
- only accepted records for that exact destination are eligible
- TTL blockers match export behavior and block before context is returned
- accepted same-destination conflict/supersession blockers match export
  behavior and block before context is returned
- optional scope filtering can run only after blockers pass
- R7 accepted-memory scanning blocks secret-like content and warns on
  sensitive content before context is returned
- no destination file writes, parent directory creation, ledger mutation, or
  event appends
- scope filtering is not identity, authorization, permissioning, enforcement,
  security, or compliance evidence
- returned context is not proof memories are true, safe, non-sensitive, or
  redacted

Phase 7B local stdio MCP read-context surface:

- expose `mempr.context` as read-only local stdio MCP
- reuse the Phase 7A exact destination, accepted-only eligibility, and
  export-parity TTL/relationship blockers before optional scope filtering
- do not require `confirm`
- do not write destination files, create parent directories, mutate ledger
  state, append events, or emit `memory_exported`
- distinguish returned accepted context records from Phase 6E export preview
  content and Phase 5D confirmed export writes
- keep scope filtering out of identity, authorization, permissioning,
  enforcement, and security claims
- keep returned MCP context out of truth, safety, non-sensitivity, and
  redaction claims; accepted sensitive content can still appear when it warns
  instead of blocks
- keep automatic redaction and hosted live-store reads outside this slice

Phase 7C constrained MCP resource/template read-context surface:

- expose `mempr://context/{destination}` as a constrained read-only local stdio
  MCP resource template
- optionally expose concrete reviewed resources such as
  `mempr://context/MEMORY.md`
- treat the URI destination as a MemPR destination selector, not arbitrary
  file, URL, repository, raw ledger/event, or generic resource passthrough
- reuse Phase 7A exact destination, accepted-only eligibility, and
  export-parity TTL/relationship blockers before returning context
- do not require `confirm`
- do not write destination files, create parent directories, mutate ledger
  state, append events, or emit `memory_exported`
- distinguish resource/template reads from the `mempr.context` tool, Phase 6E
  export preview content, and Phase 5D confirmed export writes
- keep resource/template reads out of identity, authorization, permissioning,
  enforcement, security, truth, safety, non-sensitivity, and redaction claims;
  accepted sensitive content can still appear when it warns instead of blocks
- keep automatic redaction and hosted live-store reads outside this slice

Phase 7D read-context status observability:

- expose CLI `context-status`, API `summarizeReadContextStatus`, MCP tool
  `mempr.context.status`, MCP resource `mempr://contexts`, and MCP template
  `mempr://contexts/{destination}`
- report aggregate and destination-level readiness/blockers through exact
  destination summaries
- reuse Phase 7A exact destination matching, accepted-only readiness
  eligibility, and export-parity TTL/relationship blockers
- return `total`/`accepted`/`pending`/`rejected` counts, accepted record IDs,
  and issue metadata only
- do not return memory text, source quotes, assembled records, rendered
  context, destination-file content, or export preview content
- do not write destination files, create parent directories, mutate ledger
  state, append events, or emit `memory_exported`
- distinguish status from `mempr context`, `mempr.context`,
  `mempr://context/{destination}`, ledger `mempr://status`,
  `mempr.export.preview`, and confirmed `mempr.export`
- keep status out of identity, authorization, permissioning, enforcement,
  security, truth, safety, non-sensitivity, and redaction claims; accepted
  sensitive content can still exist in accepted records
- keep automatic redaction and hosted live-store reads outside this slice

Phase 7E stale/upcoming-expiry warnings:

- add non-blocking warning metadata to read-context outputs and read-context
  status outputs for accepted records approaching expiry
- compute warnings per exact destination summary from accepted records only
- report warning code, destination, accepted record IDs, `expires_at`, and
  warning-window evidence without memory text, source quotes, assembled
  records, rendered context, destination-file content, export preview content,
  or full record payloads
- keep expired accepted records as hard blockers through the existing Phase
  7A/7D TTL blocker instead of downgrading them to warnings
- do not change destination `ok`, context assembly eligibility, or export
  eligibility
- do not write destination files, create parent directories, mutate ledger
  state, append events, or emit `memory_exported`
- keep identity, authorization, permissioning, enforcement, security, truth,
  safety, non-sensitivity, automatic redaction, and hosted live-store reads
  outside this warning slice

Phase 7F permissioned read-governance boundary:

- document that Phase 7F is a prerequisite and ownership slice, not runtime
  enforcement
- add no commands, API operation, MCP tool/resource, permission checks, auth
  decisions, events, ledger changes, destination-file side effects, scanning,
  redaction, HTTP/OAuth behavior, live-store behavior, or runtime scope checks
- classify scope filtering as post-blocker presentation-time selection, not
  actor identity, authorization, permissioning, enforcement, security, or
  compliance evidence
- classify read-context status as content-free readiness/blocker
  observability, not authentication, authorization, permissioning,
  enforcement, safety validation, redaction proof, or security
- classify expiry warnings as advisory metadata, not freshness proof,
  permissioning, enforcement, safety validation, redaction proof, or security
- require separate decisions for actor identity, auth model, permission
  semantics, denied/missing-identity behavior beyond Phase 7K's narrow
  read-context permission-denied evidence, scanning/redaction, HTTP/OAuth
  posture, live-store boundaries, broader evidence privacy, and tests before
  permissioned reads can be claimed

Phase 7G read actor/permission contract foundation:

- document future caller, actor, and reviewer vocabulary without storing or
  authenticating those identities
- document that future permissioned reads require authentication before
  authorization and that current local stdio metadata is not identity or a
  permission grant
- define future permission dimensions: `action`, `resource`, `destination`, and
  `scope`
- define default-deny missing/denied behavior for missing identity, missing
  permission, explicit deny, unknown action/resource, ambiguous destination, and
  malformed permission data
- define evidence privacy for denied/missing outcomes: no memory text, source
  quotes, assembled records, rendered context, destination-file content, export
  preview content, full record payloads, or inaccessible record existence
- require separate decisions for identity storage/trust, auth/session model,
  permission policy storage/evaluation, admin/reviewer workflows,
  broader denied-response contracts beyond Phase 7K, scanning/redaction,
  HTTP/OAuth posture, live-store boundaries, audit/logging boundaries, and
  runtime tests before enforcement
- add no commands, API operation, MCP tool/resource, permission checks, auth
  decisions, events, ledger changes, destination-file side effects, actor
  storage, permission storage, scanning, redaction, HTTP/OAuth behavior,
  live-store behavior, or runtime enforcement
- change no current `context`, `context-status`, Phase 7E warning, or MCP read
  behavior

Phase 7H permissioned scope-filtered read constraint:

- implement a narrow opt-in permissioned scope-filtered read constraint for
  read-context only
- leave existing `context`, `context-status`, warning, MCP resource, and MCP
  status behavior unchanged unless a caller supplies an explicit
  caller-asserted actor label and allowed scopes
- constrain only returned accepted read-context records by permitted scope after
  exact destination matching, accepted-only eligibility, TTL blockers, accepted
  relationship blockers, and normal scope filtering pass
- define missing actor, missing/empty allowed scopes, malformed constraints, or
  requested scopes outside the allowed set as no-content denials with no memory
  text, source quotes, assembled records, rendered context, destination-file
  content, export preview content, full record payloads, or hidden record
  existence
- keep denials no-side-effect: no files, directories, ledger mutation, event
  append, or `memory_exported`
- add no real authentication, hosted authorization, OAuth behavior, permission
  policy storage/evaluation, permissioned expiry filtering, permissioned
  conflict/supersession filtering, scanning, redaction, live-store behavior,
  auth-backed permission enforcement, or security/compliance claim
- defer permissioned expiry constraints to Phase 7I and permissioned
  conflict/supersession exclusion constraints to Phase 7J

Phase 7I permissioned expiry constraint:

- document a narrow opt-in permissioned expiry constraint for read-context only
- use nested/API `readPermission.validUntil`, CLI
  `--read-valid-until <ttl>` with the explicit caller-asserted read actor and
  allowed-scope flags, and MCP `readPermission.validUntil` only
- leave existing read-context behavior unchanged when `validUntil` is absent
- preserve hard expired-record blockers and accepted relationship blockers
  before existing scope filtering and before `validUntil` narrowing
- include records only when they have no expiry or `expires_at > validUntil`
- keep Phase 7I out of `context-status`, Phase 7E warning-only metadata outside
  filtered read-context responses, MCP resources, export preview, confirmed
  export, list/inspect/history, raw ledger/event projections, arbitrary
  resources, and live stores
- add no real authentication, hosted authorization, OAuth behavior, permission
  policy storage/evaluation, writes, events, scanning, redaction, live-store
  behavior, auth-backed permission enforcement, permissioned
  conflict/supersession filtering, or security/compliance claim

Phase 7J permissioned conflict/supersession constraint:

- document a narrow opt-in permissioned conflict/supersession constraint for
  read-context only
- use nested/API/MCP `readPermission.excludeConflicts` and
  `readPermission.excludeSupersedes`, plus CLI
  `--read-exclude-conflicts` and `--read-exclude-supersedes` with the explicit
  caller-asserted read actor and allowed-scope flags
- leave existing read-context behavior unchanged when both flags are absent
- require the explicit read-permission object to keep caller-asserted actor and
  allowed scopes
- preserve hard expired-record blockers and accepted relationship blockers
  before existing scope filtering, `validUntil` narrowing, and relationship
  narrowing
- filter by own-record metadata only: non-empty `conflicts_with` for
  `excludeConflicts` and non-empty `supersedes` for `excludeSupersedes`
- treat malformed relationship fields as fail-closed no-content/no-side-effect
  outcomes
- keep Phase 7J out of `context-status`, warning-only metadata outside
  filtered read-context responses, MCP resources, export preview, confirmed
  export, list/inspect/history, raw ledger/event projections, arbitrary
  resources, and live stores
- add no real authentication, hosted authorization, OAuth behavior, permission
  policy storage/evaluation, writes, events, scanning, redaction, live-store
  behavior, auth-backed permission enforcement, graph traversal, incoming-link
  analysis, active retirement, or security/compliance claim

Phase 7K read-context permission-denied evidence:

- document optional structured non-secret evidence for read-context
  permission-denied issue results only
- allow only requested action/resource/surface/destination/scopes, permission
  contract version, `contentReturned: false`, `sideEffects: none`, or
  equivalent non-secret metadata
- exclude actor labels, allowed scopes, permission grants, policy internals,
  record IDs, memory text, source quotes, full records, hidden record
  existence, authentication, policy storage/evaluation, writes/events,
  redaction/scanning, live stores, audit/security claims, and compliance claims
- leave default reads, hard blockers, non-permission blockers,
  `context-status`, export, list/inspect/history, MCP resources, warning-only
  metadata, raw ledger/event projections, arbitrary resources, live stores, and
  write/event surfaces unchanged except when faithfully carrying a read-context
  denial result

Phase 7L read actor identity/auth boundary:

- record in the static read-permission contract and docs that
  `readPermission.actor`, `--actor`, and `--read-actor` are caller-asserted
  labels for explicit read-context permission constraints only
- record that actor labels are not authenticated, inferred, stored as actor
  identity, policy-evaluated, or authorization/security/compliance proof
- reject actor inference from env/OS/MCP/client/session/OAuth metadata
- define missing actor as fail-closed only when an explicit read-context
  permission constraint is supplied; default reads remain unchanged without
  explicit read-permission constraints
- add no actor identity storage, auth/session storage, policy
  storage/evaluation, writes/events, redaction/scanning, live stores,
  HTTP/OAuth behavior, security claims, or compliance claims

Exit criteria:

- local read-context assembly reuses export TTL and relationship blockers
- local stdio MCP read-context assembly reuses the same Phase 7A blockers and
  no-side-effect contract
- constrained MCP context resources/templates reuse the same Phase 7A blockers,
  no-side-effect contract, and destination-selector boundary
- read-context status reports destination readiness/blockers without memory
  text, quotes, context records, preview content, writes, or events
- read-context status warnings report accepted upcoming-expiry evidence without
  blocking, returning memory text, or weakening expired-record hard blockers
- permissioned read-governance prerequisites are documented without claiming
  runtime enforcement
- read actor/permission contract prerequisites are documented without changing
  current read behavior or claiming permission enforcement
- permissioned scope-filtered read constraints are implemented as opt-in,
  read-context-only, no-content/no-side-effect on denial, and not real auth,
  hosted authorization, OAuth, policy storage, expiry/conflict filtering,
  scanning/redaction, live-store behavior, or security
- permissioned expiry constraints are documented as opt-in, read-context-only
  `validUntil` narrowing after hard blockers and scope filtering, with no
  auth/OAuth, policy storage, writes/events, scanning/redaction, live stores,
  conflict/supersession filtering, or security claims
- permissioned conflict/supersession constraints are documented as opt-in,
  read-context-only own-record metadata narrowing after hard blockers, scope,
  and expiry filtering, with no auth/OAuth, policy storage, writes/events,
  graph traversal, redaction, live stores, export/status/resource/list/history
  changes, or security claims
- read-context permission-denied evidence is documented as optional,
  structured, non-secret metadata only, with no actor labels, allowed scopes,
  permission grants, policy internals, record IDs, hidden record existence,
  memory content, writes/events, scanning/redaction, live stores,
  audit/security claims, or compliance claims
- current read actor labels are documented as caller-asserted and
  unauthenticated, with no actor inference, actor identity storage, policy
  storage/evaluation, writes/events, redaction/scanning, live stores,
  security claims, or compliance claims
- memory reuse is governed by explicit scope, expiry, and conflict policy
  without claiming identity, authorization, permissioning, enforcement,
  security, or truth validation

Do not start too early:

- retrieval ranking or vector search
- hosted or remote authorization
- scanning/redaction claims
- auth-backed permissioned read enforcement before actor identity, auth model,
  permission semantics, permission policy storage, broader denied-response
  privacy beyond Phase 7K's narrow evidence contract, Phase 7L's
  caller-asserted actor boundary, redaction/scanning decisions, HTTP/OAuth
  stance, and live-store boundaries exist
- graph traversal, incoming-link relationship policy, or active retirement
  before separate relationship-resolution decisions exist

### R1-R11 Local-First 1.0 Completion

R1-R11 are shipped for the local-first 1.0 boundary. The release remains scoped
to local files, explicit review, deterministic policy, self-hosted transport, and
credential-gated adapters. It does not claim hosted SaaS, automatic redaction,
third-party store security, legal retention, or compliance-grade audit behavior.

R1 shipped core: audit integrity and replay proof.

- Adds schema-versioned `mempr-event-v2` events, canonical SHA-256 event hashes,
  record/records hashes, previous-event hash links, proposal
  `policy_config_hash`, `mempr check` hash validation, and
  `mempr repair --from-events`.
- Preserves non-echoing malformed/tampered event evidence.
- Does not claim tamper-proof storage, non-repudiation, legal retention, or
  compliance-grade audit safety.

R2 shipped core: source-trust scoring and policy-version proof.

- `trusted`, `unknown`, and `untrusted` remain explicit source-trust vocabulary.
- `untrusted` prevents automatic acceptance and requires review.
- `trusted` never bypasses secret, sensitive, deny, relationship, TTL, or
  read-policy blockers.
- Policy implementation version and proposal `policy_config_hash` are recorded
  as local replay evidence, not proof that a source is safe or true.

R3-R5 shipped core: local principals, read policy, and read enforcement.

- Adds `.mempr/principals.json` local Ed25519 principals and signed read request
  verification.
- Adds `.mempr/read-policy.json` with deterministic allow/deny evaluation,
  versioning, deny precedence, and fail-closed malformed active policy behavior.
- Enforces policy on CLI/API/MCP read surfaces when the policy exists, while
  preserving default reads when it is absent.
- Denials return no memory text, source quotes, hidden IDs, grants, or policy
  internals.

R6 shipped core: denied-response diagnostics, logging, and audit boundaries.

- Goal: define what operators can safely see when diagnostics are explicitly
  requested.
- Includes correlation IDs, admin-only diagnostics, `.mempr/diagnostics.jsonl`
  separated from `.mempr/events.jsonl`, redacted support bundles, and audit
  wording.
- Must not leak actor secrets, grants, hidden record existence, memory text,
  source quotes, policy internals, inaccessible record IDs, or raw events to
  normal denied responses.
- Retention policy and audit-grade logging remain follow-up work.

R7 shipped core: scanning and redaction boundary.

- Goal: warn or block when accepted memory contains sensitive content at
  read-context/export boundaries.
- Includes export-time scanning, read-context scanning, default secret-like
  blockers, sensitive-content warnings, optional redaction marker recognition,
  and tests for sensitive content that is already accepted.
- Must not claim returned memory is safe, true, non-sensitive, or redacted
  because scanner behavior is intentionally heuristic and does not rewrite
  memory.
- False-positive handling, policy configuration, and automatic redaction remain
  follow-up work.

R8 shipped core: relationship lifecycle and graph policy.

- Adds incoming-link analysis, outgoing-link analysis, missing-reference
  reporting, supersession cycle detection, `retired` status, explicit
  accept-and-retire, maintainer override evidence, and relationship history.
- Does not silently delete, hide, or rewrite accepted memory.
- Follow-up work remains for richer hosted conflict-resolution UI and any
  audit-grade recovery claims.

R9 shipped core: live store and workflow adapters.

- Adds dry-run/confirmed live sync, deterministic idempotency keys, downstream
  ID reconciliation from events, retries, partial-failure reporting, fake
  no-network adapter, and credential-gated Mem0, LangGraph, LLM-wiki, and
  custom HTTP adapters.
- Confirmed sync writes `memory_live_synced` evidence but does not store
  downstream IDs inside memory records.
- Follow-up work remains for provider-specific payload compatibility, rollback
  posture, hosted auth/security review, and stronger replay/reconciliation
  guarantees.

R10 shipped core: self-hosted MCP HTTP transport.

- Adds `mempr-mcp-http` with Streamable HTTP request handling.
- Exposes OAuth protected-resource metadata.
- Requires Bearer tokens and validates token audience.
- Enforces per-tool least-privilege scopes, Origin, Host, Accept headers, and
  simple rate limits.
- Does not reuse stdio confirmation flags or caller-asserted actor labels as
  HTTP authorization proof.
- Hosted deployment and SaaS security claims require a separate review.

R11 shipped core: local-first 1.0 release hardening.

- Sets package version `1.0.0` with `mempr`, `mempr-mcp`, and
  `mempr-mcp-http` bins.
- Adds package dry-run smoke tests, migration guide, release checklist, security
  checklist, and deprecation policy.
- Freezes claims to local-first behavior and explicitly excludes hosted SaaS,
  automatic redaction, third-party store security, legal retention, and
  compliance-grade audit guarantees.

Scope-change backlog, not planned by default:

- retrieval ranking, vector search, embeddings, or knowledge-graph features
- hosted service, multi-user approval workflows, or organization admin UI
- model-assisted memory classification beyond deterministic policy
- third-party memory-store security guarantees
- compliance-grade audit, legal retention, or regulated-data guarantees

These require a product-scope ADR before implementation because they can move
MemPR away from local-first memory write governance.

### Phase 8: Mature Release / Project Completion

Entry criteria:

- CLI, ledger, policy, review lifecycle, MCP, adapters, and read governance are stable.

Deliverables:

- npm release discipline
- compatibility policy
- migration guide
- security review checklist
- no-network CI suite
- package install smoke test
- adapter contract suite
- MCP compatibility suite
- documented deprecation policy

Exit criteria:

- MemPR can be released as a credible 1.0 local-first memory write-governance tool.

Do not start too early:

- hosted service
- multi-user approvals
- embeddings or knowledge-graph features unless project scope deliberately changes

## 20. Release And Maintenance Requirements

- No default telemetry.
- `npm test` must pass before release.
- Behavior changes require docs and tests.
- Security reports go through `SECURITY.md`.
- Public claims must match shipped behavior.
- ADRs must be updated when schema, lifecycle, policy, export, MCP, or audit
  guarantees change.

## 21. Open Questions

- Should v0.1 hardening preserve current JSONL shape or introduce a new schema version immediately?
- What source identity model is small enough beyond local source-trust review gating?
- Should rejected records ever be accepted by override, or only superseded?
- Should any future export scanning block exports or warn by default, and what
  separate ADR would govern that behavior?
- What permissioned read-side scope governance should exist after Phase 7A
  local read-context assembly, Phase 7B local stdio MCP tool exposure, and
  Phase 7C constrained resource/template exposure plus Phase 7D context-status
  observability plus Phase 7E advisory expiry warnings and Phase 7F boundary
  guardrails plus Phase 7G actor/permission contract foundations and Phase 7H
  opt-in scope-constraint plus Phase 7I `validUntil` expiry constraint plus
  Phase 7J own-record conflict/supersession exclusion constraints once actor
  identity storage, auth model, permission policy evaluation, redaction/scanning
  decisions, HTTP/OAuth stance, live-store boundaries, and graph/active-retirement
  relationship decisions exist, given Phase 7L's current actor value is only
  caller-asserted?
- What hosted authorization and identity model is small enough for any future
  remote HTTP MCP transport without implying compliance-grade audit proof?

## 22. Supporting References

- [ADR index](adr/README.md)
- [ADR-0017 MCP local agent surface](adr/0017-mcp-local-agent-surface.md)
- [ADR-0018 read-side context governance](adr/0018-read-side-context-governance.md)
- [ADR-0019 MCP read-context surface](adr/0019-mcp-read-context-surface.md)
- [ADR-0020 MCP context resource template](adr/0020-mcp-context-resource-template.md)
- [ADR-0021 read-context status observability](adr/0021-read-context-status-observability.md)
- [ADR-0022 read-context expiry warnings](adr/0022-read-context-expiry-warnings.md)
- [ADR-0023 permissioned read-governance boundary](adr/0023-permissioned-read-governance-boundary.md)
- [ADR-0024 read actor and permission contract](adr/0024-read-actor-permission-contract.md)
- [ADR-0025 permissioned scope-filtered reads](adr/0025-permissioned-scope-filtered-reads.md)
- [ADR-0026 permissioned expiry constraints](adr/0026-permissioned-expiry-constraints.md)
- [ADR-0027 permissioned conflict/supersession constraints](adr/0027-permissioned-conflict-supersession-constraints.md)
- [ADR-0028 read-context permission-denied evidence](adr/0028-read-context-permission-denied-evidence.md)
- [ADR-0029 read actor identity/auth boundary](adr/0029-read-actor-identity-auth-boundary.md)
- [Council archive](council/)
- [Remaining backlog solidification council](council/2026-05-22-remaining-backlog-solidification-pass.md)
- [AGENTS.md](https://agents.md/)
- [Claude Code memory](https://code.claude.com/docs/en/memory)
- [Memory for Autonomous LLM Agents](https://arxiv.org/abs/2603.07670)
- [OpenAI Agents SDK memory](https://openai.github.io/openai-agents-js/guides/sandbox-agents/memory/)
- [LangGraph memory](https://docs.langchain.com/oss/python/langgraph/add-memory)
- [Mem0 ingestion controls](https://docs.mem0.ai/cookbooks/essentials/controlling-memory-ingestion)
- [OWASP Agent Memory Guard](https://owasp.org/www-project-agent-memory-guard/)
- [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/)
- [MCP specification](https://modelcontextprotocol.io/specification)
- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP logging](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging)
- [Hidden in Memory](https://arxiv.org/abs/2605.15338)
- [Poison Once, Exploit Forever](https://arxiv.org/abs/2604.02623)
- [MCPSecBench](https://arxiv.org/abs/2508.13220)
- [OEP: Poisoning Self-Evolving LLM Agents](https://arxiv.org/abs/2605.18930)
- [Memory poisoning and secure multi-agent systems](https://arxiv.org/abs/2603.20357)
