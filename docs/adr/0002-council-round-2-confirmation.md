# ADR-0002: V0.1 Runtime Scope and Claim Boundaries

## Status

Accepted (with implementation-alignment addendum)

## Date

2026-05-21

## Context

An initial ADR (0001) selected a memory-write governance middleware as the MemPR core.
Council passes rechecked that decision against new sources, current code, and
active adjacent tooling:

- persistent memory integrity risks are still high
- MCP integrations still expose protocol-level trust and observability risks
- adjacent projects (Memoria, Mem0, LangGraph, LLM-wiki compilers) address other parts of the stack

## Decision

Continue with MemPR as a storage-agnostic write governance layer and explicitly
reject claims that it is a standalone memory database.

Align the documented workflow with what is implemented today:

- v0.1 supports `propose`, `list`, `accept`, `reject`, `export` and status
  `pending|accepted|rejected`.
- PR-like lifecycle terms (`inbox`, `diff`, `review`, `merge`, `close`) remain
  roadmap language, not current runtime behavior.

Canonical product scope now lives in [the PRD](../prd.md). ADRs record binding
decisions; council files remain evidence.

## Consequences

- Keep the memory governance model as the canonical behavior (`propose`, policy
  decision, record status, export).
- Keep a durable ledger and record state visible through `list` in v0.1.
- Keep adapters thin and explicit: adapters receive accepted records and return export results.
- Keep security controls focused on write-time policy in v0.1:
  - scope validation
  - source trust metadata (planned)
  - risk classification
  - secret/injection rejection
  - TTL storage now, with expiry enforcement planned
- Defer broader read-time governance until write-side lifecycle is stable and measurable.

## Notes

The same five-role council review identified two hardening points:

- strengthen wording in positioning materials so users clearly understand what MemPR is and is not
- align MCP implementation details with the current MCP spec before implementation
  (especially model-controlled tools, resources, logging, and auth scopes) so
  auditability remains a MemPR application-layer guarantee rather than a protocol assumption.
