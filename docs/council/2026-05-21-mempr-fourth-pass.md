# MemPR Council Round 4 (2026-05-21)

## Decision Being Tested

After a second-pass research sweep, is MemPR still a sound product and architecture
idea, and are the docs honest enough to proceed toward implementation?

## Research Inputs

- Agent memory is now commonly modeled as an explicit lifecycle. The 2026 survey
  [Memory for Autonomous LLM Agents](https://arxiv.org/abs/2603.07670) frames
  memory around write, manage, and read behavior.
- OpenAI's Agents SDK memory docs separate generated memory artifacts from
  conversational session memory and expose read/generate controls:
  <https://openai.github.io/openai-agents-js/guides/sandbox-agents/memory/>.
- LangGraph separates short-term checkpointing from long-term stores:
  <https://docs.langchain.com/oss/python/langgraph/add-memory>.
- Mem0 documents controls for speculation, confidence thresholds, sensitive data,
  updates, and deletion before persistence:
  <https://docs.mem0.ai/cookbooks/essentials/controlling-memory-ingestion>.
- Current security research shows persistent memory can become a long-lived attack
  surface, including [Hidden in Memory](https://arxiv.org/abs/2605.15338) and
  [Poison Once, Exploit Forever](https://arxiv.org/abs/2604.02623).
- MCP `2025-11-25` confirms tools are model-controlled and annotations are
  untrusted unless they come from trusted servers:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>.

## Council Review

### Contrarian

The idea becomes weak if it overclaims. MemPR v0.1 is not a full PR lifecycle,
tamper-proof audit log, MCP security layer, or memory-poisoning prevention system.
The docs must say current-state JSONL, generic Markdown export, no actor identity,
and no source-trust field yet.

### First Principles Thinker

The real boundary is the transition from candidate memory to durable future
context. MemPR is valid because it controls that write transition. It should not
own retrieval ranking, vectorization, checkpointing, or truth verification.

### Expansionist

The strongest version is a storage-neutral write governance layer that later adds
append-only events, source trust, policy versions, scoped exports, and MCP tools
with explicit resources and auth scopes. That path remains differentiated without
claiming to replace memory stores.

### Outsider

"Memory PRs for AI agents" is understandable, but only if the first-run docs say
plainly that v0.1 uses memory records and statuses, not `merge`, `close`, and
diff commands yet.

### Executor

Proceed only after documentation fixes:

- fix the README quick start auto-accept mismatch
- move append-only audit language to roadmap
- mark `AGENTS.md`, `CLAUDE.md`, Mem0, LangGraph, and MCP as planned adapters
- add v0.1 limitations
- add MCP implementation constraints before writing MCP code

## Consensus

Approve the concept and architecture with narrowed claims.

MemPR should continue as:

> A local-first, storage-agnostic governance layer for proposed durable agent-memory writes.

It should not claim to prevent memory poisoning or provide enterprise-grade audit
until the implementation has event history, actor identity, redaction, retention,
and tamper-evidence.

## Implementation Move

Patch the docs before feature work. The next implementation step should be v0.1
hardening: schema clarity, policy tests, current-state ledger behavior, and export
rules. MCP should wait until its tool/resource/auth contracts are documented.

## Deferred Risks

- source-trust metadata and confidence signals
- append-only event stream
- actor/reviewer identity
- export redaction and destination compatibility
- MCP auth scopes and resource namespace
- read-side governance for stale, conflicting, or cross-scope memories
