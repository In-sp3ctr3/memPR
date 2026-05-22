# MemPR Council Round 5 (2026-05-21)

## Decision Being Tested

After the fourth-pass corrections, can the project move toward implementation
without hidden documentation gaps?

## Council Review

### Contrarian

The largest remaining risk is implementation drift: code may keep evolving while
docs still speak in future-tense architecture. Add a standing rule that every new
capability is labeled shipped, planned, or deferred.

### First Principles Thinker

The minimum coherent next phase is not MCP or a new adapter. It is hardening the
write state machine: proposal schema, policy order, status transitions, current
record view, and export contract.

### Expansionist

Once the v0.1 boundary is trustworthy, MemPR can grow into a strong adapter layer:
Mem0, LangGraph stores, Claude/Codex memory files, and MCP proxy mode. The
foundation should be explicit IDs, stable schemas, and deterministic output.

### Outsider

The docs are now legible if the reader sees the current-vs-roadmap matrix before
they hit ambitious future language. Keep the README and product spec as the source
of truth for what exists today.

### Executor

Implementation can start with:

1. schema/reference docs
2. policy tests for risky and speculative proposals
3. transition guards and reason requirements
4. export tests for managed blocks and destination filtering
5. append-only event design only after current behavior is fully covered

## Consensus

Proceed to implementation only for v0.1 hardening. Defer MCP and downstream
adapters until the record lifecycle and export contract are boring, tested, and
documented.

## Implementation Move

Start with test-backed hardening of the current CLI and ledger behavior. Do not
start with MCP.

## Deferred Risks

- concurrent writes and file locking
- tamper evidence and retention policy
- reviewer identity
- sensitive export scanning
- source-trust scoring
- policy config and versioning
