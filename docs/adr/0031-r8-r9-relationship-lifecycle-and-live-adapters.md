# ADR-0031: R8-R9 Relationship Lifecycle and Live Adapters

## Status

Accepted.

## Context

Earlier relationship support stored `supersedes` and `conflicts_with` metadata,
forced review for linked proposals, and blocked export/read-context when accepted
same-destination records still conflicted or superseded one another. That left
two gaps:

- reviewers could not inspect incoming links or supersession cycles;
- superseded accepted records remained accepted unless a maintainer manually
changed status without relationship-specific evidence.

Live-store work was also deferred because network adapters need confirmation,
idempotency, downstream IDs, credential handling, retry posture, reconciliation,
and partial-failure reporting.

## Decision

MemPR adds an explicit `retired` record status. Retired records remain in
`.mempr/ledger.jsonl` and `.mempr/events.jsonl`; they are not silently deleted,
rewritten, or hidden from list/history flows.

Relationship graph analysis reports outgoing links, incoming links, missing
references, and directed `supersedes` cycles. Review context includes incoming
records and cycle evidence. Export/read-context continue to block unresolved
accepted same-destination conflicts/supersessions and now also report accepted
supersession cycles.

MemPR adds an explicit acceptance path that can:

- accept a candidate and retire accepted same-destination records it supersedes;
- accept with unresolved relationship override evidence;
- append `memory_status_changed` events plus a content-free
  `memory_relationship_resolved` evidence event.

MemPR adds a live adapter contract with:

- dry-run planning without destination, ledger, event, or network side effects;
- confirmed sync only with explicit confirmation;
- deterministic idempotency keys;
- downstream ID reconciliation from prior successful sync events;
- per-record retry counts and partial-failure outcomes;
- a fake no-network adapter for tests;
- credential-gated `mem0`, `langgraph`, `llm-wiki`, and `custom` HTTP adapters.

Confirmed live sync appends a content-minimized `memory_live_synced` event with
record IDs, idempotency keys, downstream IDs, attempts, and error codes. It does
not store downstream IDs inside memory records.

## Consequences

- `pending`, `accepted`, `rejected`, and `retired` are valid statuses.
- Relationship retirement is explicit and reviewable through history.
- Maintainer overrides are evidence, not export bypasses; unresolved accepted
  conflicts can still block export/read-context.
- Fake adapter tests can run without network.
- Provider adapters are credential-gated and endpoint-configured; provider-
  specific payload hardening remains a future compatibility task.

## Review Triggers

- Record status model changes.
- Relationship graph/cycle policy changes.
- Export/read-context relationship blocker behavior changes.
- Live adapter payload, credential, retry, idempotency, reconciliation, or event
  schema changes.
