# ADR-0001: Build MemPR as Memory Write Governance

**Status:** Accepted (foundational, with v0.1 implementation scope adjusted by ADR-0002)
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
- how it can be reviewed, accepted/rejected, expired, superseded, or rolled back

The initial repo already has a local JSONL ledger and CLI commands. This ADR
sets the product and architecture boundary before the implementation grows.

## Decision

MemPR will be a storage-agnostic governance layer for durable memory writes.

The public model is:

```txt
agent proposes memory -> MemPR applies policy -> accepted/review/rejected records -> exported memory
```

The internal model is:

```txt
proposal input -> (current) JSONL record ledger -> policy decision -> materialized current record view -> adapter export
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
turns an abstract memory safety issue into a review workflow developers already know.

V0.1 uses a narrower status model (`pending`, `accepted`, `rejected`) and a simpler
command set. PR-like states (`open`, `merged`, `closed`, etc.) are planned.

The security model still matters, but it should support the governance workflow
instead of replacing it. Policy decisions should decide whether a proposal is
auto-accepted, left pending for review, or rejected.

## Consequences

- MemPR needs a strong proposal schema before more adapters are added.
- The CLI keeps its v0.1 surface and may adopt additional PR language in later
  milestones.
- The target ledger should evolve toward append-only events so decisions are
  auditable; v0.1 currently uses current-state JSONL records.
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

- [Memory for Autonomous LLM Agents](https://arxiv.org/abs/2603.07670),
  write-manage-read memory loop
- [MemBench](https://arxiv.org/abs/2506.21605), multi-dimensional memory evaluation
- [Hidden in Memory](https://arxiv.org/abs/2605.15338), sleeper memory poisoning
- [Poison Once, Exploit Forever](https://arxiv.org/abs/2604.02623),
  environment-injected memory poisoning
- [OWASP Agent Memory Guard](https://owasp.org/www-project-agent-memory-guard/)
  and [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/)
- Claude Code memory docs, Mem0 docs, LangGraph memory docs, and MCP tools spec

## Action Items

1. [ ] If/when the full PR lifecycle ships, rename the proposal object in code
       and docs from generic memory record to Memory PR.
2. [ ] Add an append-only event model for proposal, review, merge, close,
       supersede, and expire events.
3. [ ] Add human-readable and machine-readable diffs.
4. [ ] Add policy rules that classify auto-accept, review, and block decisions.
5. [ ] Add Markdown export adapters for `MEMORY.md`, `AGENTS.md`, and
       `CLAUDE.md`.
6. [ ] Add an MCP server exposing the Memory PR lifecycle.
7. [ ] Add a security eval suite for poisoning, secrets, scope bleed, stale
       memory, and unsafe instruction persistence.
