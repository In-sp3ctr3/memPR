# MemPR Council Round 2 (2026-05-21)

## Scope

This pass re-validates MemPR against:

- Current project documents in this repository (`docs/*`, `README.md`)
- Security guidance from OWASP and related protocol docs
- Fresh adjacent-memory and MCP governance work
- New 2026 research around agent memory safety and protocol vulnerabilities

## New Research Signals

### 1) Persistent memory is still a hard control surface

- OWASP Agent Memory Guard describes memory as a writable, persistent control surface and frames memory poisoning + injection as the top concern, with policy-driven read/write checks and rollback/snapshots.
- OWASP AI Agent Security and MCP Top-10 guidance both stress human-in-the-loop for high-impact actions, least privilege for tools, and anti-injection behavior around memory/context.
- Recent MCP-focused security work keeps finding protocol-level gaps (attestation, message integrity, trust propagation), which supports explicit governance on write/read flows rather than silent trust of tool outputs.
- Memoria and MemArchitect show that full memory-versioning layers are being built, so MemPR should not claim to be the first memory store itself.

### 2) MCP protocol fit is real and specific

- MCP tool invocation is model-controlled and designed around tool descriptions, capabilities, and optional annotations.
- The protocol defines capabilities like logging, resources, and tool invocation schemas, which aligns with MemPR’s plan to expose review lifecycle via MCP tools/resources in one deterministic surface.
- This is especially important because MCP guidance explicitly warns on over-privileged tooling and lack of end-to-end observability for agent systems.

### 3) Adjacent ecosystem signals overlap by function, not by exact role

- Mem0, LangGraph, and LLM-wiki style compilers each solve parts of memory, storage, context, or knowledge compilation.
- Adjacent projects solve storage, retrieval, context compilation, and memory
  management in different ways. MemPR should avoid broad uniqueness claims and
  instead claim the narrower differentiation: it gates proposed writes before
  durable storage or export.

## Council Review (Five Roles)

### Contrarian

The idea is not revolutionary if we marketed it as a “new memory system.” It is valid if we keep it clearly framed as governance middleware. The strongest claim is “review gate for durable memory writes.”

### First Principles

The root issue remains durable-context integrity:

- false durable claims
- unsafe/unsafe-origin facts
- stale assumptions becoming hard state
- provenance loss after the fact

MemPR addresses the write transition from inference → durability, which is still a missing control boundary.

### Expansionist

The strongest moat is the PR workflow language:

- target lifecycle beyond v0.1: `propose -> review -> merge -> close`
- append-only event ledger + materialized state as roadmap architecture
- policy decisions encoded with risk/TTL/scope
- dual surface (CLI + MCP) with consistent IDs

### Outsider

`MemPR` + “Memory PRs for AI agents” is understandable.

The project should avoid heavy terms like “ledger engine” in top-level marketing copy and stay close to PR and policy semantics.

### Executor

The design is implementable in short milestones:

1. Write-side governance now; event model + append-only audit as roadmap work
2. Policy + secret/instruction/scope checks
3. Deterministic exports to local targets and downstream memory backends
4. MCP tool parity with CLI lifecycle

### Consensus

Approve continuation with one refinement:

- **Keep** the write governance wedge.
- **Narrow** wording to “storage-agnostic write approval layer.”
- **Surface** that MemPR is a governance layer in front of existing memory systems.
- Add explicit references that existing products already handle persistence/retrieval to avoid category confusion.

## Council-Driven Action List

- Add a short compatibility section in docs:
  - MemPR complements Mem0, Memoria, LangGraph store/checkpoints, and LLM-wiki compilers.
  - It is not responsible for vectorization, retrieval ranking, or long-term embedding policy.
- Add explicit policy vocabulary in code and docs:
  - `risk`, `ttl`, `scope`, `source_trust`, `decision`.
  - Mark `source_trust` as planned until it is stored in records.
- Add explicit rejection and future supersession explanation in output so users can see why blocked facts are rejected.
- Add MCP `logging` and `resource` usage notes in integration docs so implementers can export audit trails in one place.
- Consider a follow-up ADR for read-side governance (staleness/conflict filtering) only after write-side lifecycle is stable.

## Decision

MemPR remains on a strong path for the second research-backed review.
Its wedge is still defensible and timely:

> A storage-agnostic, reviewable, policy-driven gate for durable agent memory writes.
