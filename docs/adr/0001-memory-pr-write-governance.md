# ADR-0001: Build MemPR as Memory Write Governance

**Status:** Proposed
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

Durable agent memory is becoming part of the execution environment. A memory
written today can change what an agent believes, retrieves, exports, or does in a
later session.

The hard part is no longer only recall. Current memory systems still need better
controls around the write and management path:

- what deserves to become durable memory
- which source justified it
- whether it is scoped correctly
- whether it conflicts with existing memory
- whether it contains secrets or sensitive claims
- whether it came from untrusted context
- how it can be reviewed, merged, expired, or rolled back

The initial repo already has a local JSONL ledger and CLI commands. This ADR
sets the product and architecture boundary before the implementation grows.

## Decision

MemPR will be a storage-agnostic governance layer for durable memory writes.

The public model is:

```txt
agent proposes memory -> MemPR opens a Memory PR -> policy/human review -> approved memory is exported
```

The internal model is:

```txt
proposal event -> append-only ledger -> policy decision -> materialized memory view -> adapter export
```

MemPR will not try to be the primary memory database. It will sit before memory
stores, files, wikis, and agent frameworks.

## Options Considered

### Option A: Build a Full Memory Store

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Cost | High |
| Scalability | Hard to prove early |
| Team familiarity | Medium |

**Pros:** Owns the whole memory lifecycle. Easier to demo recall.

**Cons:** Competes directly with Mem0, Letta, LangGraph stores, Zep, Memoria,
and other mature memory layers. The project would spend early effort on storage,
retrieval, embeddings, and ranking instead of the core trust problem.

### Option B: Build a Runtime Memory Firewall

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Medium |
| Scalability | Depends on framework adapters |
| Team familiarity | Medium |

**Pros:** Directly addresses memory poisoning, secret leakage, and policy
enforcement. Clear security story.

**Cons:** This overlaps with dedicated security middleware. It also frames MemPR
as a defensive filter, which is narrower than the review workflow developers
already understand.

### Option C: Build Memory PR Middleware

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Low at v1 |
| Scalability | Good through adapters |
| Team familiarity | High |

**Pros:** Clear developer mental model. Complements existing memory tools. Keeps
the first version local-first and inspectable. Makes provenance, policy, review,
diffs, and export the center of the product.

**Cons:** Requires careful language so users understand it is not a database.
Read-side governance and richer security controls will come later.

## Trade-Off Analysis

Option C is the best fit for the project.

The market already has memory stores and retrieval engines. MemPR should own the
control point before memory becomes durable. The PR metaphor is useful because it
turns an abstract memory safety issue into a workflow developers already know:
open, review, merge, close, supersede, expire.

The security model still matters, but it should support the Memory PR workflow
instead of replacing it. Policy decisions should decide whether a proposal is
auto-merged, left open for review, or blocked.

## Consequences

- MemPR needs a strong proposal schema before more adapters are added.
- The CLI should move toward PR language: `inbox`, `diff`, `review`, `merge`,
  and `close`.
- The ledger must stay append-only so decisions are auditable.
- Adapters must be replaceable and should not own policy.
- MCP support should expose the same proposal and review lifecycle, not a
  separate workflow.
- Read governance is deferred until write governance is useful.

## Evidence Considered

The decision is informed by recent work on agent memory lifecycle, memory
poisoning, MCP security, and current memory products. The relevant pattern is
consistent: durable memory needs provenance, policy, scope, and review before it
is trusted later.

Representative sources considered:

- Memory for Autonomous LLM Agents, write-manage-read memory loop
- MemBench, multi-dimensional memory evaluation
- MemLineage, lineage-guided enforcement for agent memory
- Hidden in Memory, sleeper memory poisoning
- OWASP Agent Memory Guard and OWASP LLM/MCP risk guidance
- Claude Code memory docs, Mem0 docs, LangGraph memory docs, and MCP tools spec

## Action Items

1. [ ] Rename the proposal object in code and docs from generic memory record to
       Memory PR.
2. [ ] Add an append-only event model for proposal, review, merge, close,
       supersede, and expire events.
3. [ ] Add human-readable and machine-readable diffs.
4. [ ] Add policy rules that classify auto-merge, review, and block decisions.
5. [ ] Add Markdown export adapters for `MEMORY.md`, `AGENTS.md`, and
       `CLAUDE.md`.
6. [ ] Add an MCP server exposing the Memory PR lifecycle.
7. [ ] Add a security eval suite for poisoning, secrets, scope bleed, stale
       memory, and unsafe instruction persistence.

