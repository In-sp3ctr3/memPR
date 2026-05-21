# Design Review

This note records the product and architecture review behind the first build
plan. It is intentionally short. The detailed research belongs in issues,
benchmarks, and implementation PRs.

## Decision Tested

Should MemPR be built as a new memory store, a security firewall, or a Memory PR
workflow that fronts existing memory systems?

## Pass 1: Root Problem

The root problem is not that agents lack places to store memory. They have many:
files, vector stores, LangGraph stores, Mem0, Claude memory, wikis, and custom
databases.

The root problem is that durable memory writes are too easy to make and too hard
to inspect later.

MemPR should therefore own the write governance workflow:

```txt
propose -> review -> merge -> export -> audit
```

## Pass 2: Security

Persistent memory is a long-lived attack surface. If untrusted content gets
written as memory, it can affect future sessions after the original context is
gone.

Design requirements:

- every Memory PR needs source, scope, actor, destination, and risk
- secret-like memory is blocked by default
- instruction-shaped memory from untrusted content is blocked or reviewed
- policy decisions are recorded, not hidden
- rejected proposals stay auditable
- exported memory should be shorter and safer than the ledger

## Pass 3: Adoption

Developers should not need a new dashboard or a new memory backend to try MemPR.

The first useful version should work with:

- local JSONL
- Markdown exports
- `AGENTS.md`
- `CLAUDE.md`
- MCP clients

The PR language should be used in the product because it is already familiar:
open, diff, review, merge, close, supersede, expire.

## Council Outcome

The stronger version of MemPR is:

> A storage-agnostic review and policy layer for durable agent memory writes.

The weaker version would be:

> Another memory database.

## Implementation Guardrails

- Do not build embeddings in v1.
- Do not build a hosted dashboard in v1.
- Do not gate short-term checkpoints.
- Do not make humans approve every low-risk memory.
- Do not export the full ledger into agent context.
- Do not claim MemPR proves memory is true. It proves how memory was proposed,
  reviewed, merged, and exported.

