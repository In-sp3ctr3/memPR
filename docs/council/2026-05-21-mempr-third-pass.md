# MemPR Council Round 3 (2026-05-21)

## Scope

- Confirm v0.1 implementation claims against current code and docs.
- Cross-check adjacent memory and MCP security research published in 2025–2026.
- Validate whether ADRs remain coherent and actionable for an open-source-first
  repository posture.

## Research Inputs (Fresh Pass)

- Persistent-memory attacks remain a concrete risk signal in 2026 literature:
  [Hidden in Memory: Sleeper Memory Poisoning in LLM Agents](https://arxiv.org/abs/2605.15338),
  [OEP: Poisoning Self-Evolving LLM Agents](https://arxiv.org/abs/2605.18930),
  and [Memory poisoning and secure multi-agent systems](https://arxiv.org/abs/2603.20357).
- MCP security work has moved into protocol-level benchmarking, including
  [MCPSecBench](https://arxiv.org/abs/2508.13220), and MCP tooling guidance now
  explicitly distinguishes hints from guarantees in tool annotations.
- Adjacent systems continue to formalize versioned memory and Git-like controls
  (for example, Memoria’s Git-style claims), which reinforces that MemPR should not
  claim to be a replacement store.

## Council Review (Five Roles)

### Contrarian

The risk is overpromising a “full PR system” before the runtime supports it.
Current implementation is a minimal policy+export loop, so docs and claims need to stay
honest about that. Also, source-trust as a field is not yet stored in v0.1; claiming it as implemented would be wrong.

### First Principles Thinker

The core problem is still valid: memory transitions from inference to durability are a
control boundary, and we currently skip direct approval there. MemPR addresses the
minimal set of needed actions (classify, record, decide, export) and should not solve
retrieval/evaluation before that boundary is stable.

### Expansionist

Strongest growth edge is still: governance-first write control with deterministic output.
Next meaningful upgrades:
- source-trust metadata
- append-only event stream
- explicit read-side filters (scope/conflict/expiry checks before reuse)
- MCP lifecycle tools with structured audit output.

### Outsider

“Memory PR” messaging still works as long as onboarding text says it is a
governance layer, not a memory engine. Replacing unsupported CLI verbs in docs (`inbox`,
`diff`, `merge`) is necessary for trust and onboarding clarity.

### Executor

The implementation is in a good place for v0.1 if we commit to explicit scope:
- shipped: propose/list/accept/reject/export + risk decisions
- deferred: true PR lifecycle (`open/review/merge/close`), append-event storage,
  source trust, and MCP.

## Decision

Pass outcome: **approve with documentation fixes and explicit scope tagging**.

MemPR remains technically sound for its stated boundary, and the architecture is credible
if the team publicly distinguishes:

- v0.1 shipped behavior
- roadmap behavior

## Decision Changes

- Keep `docs/` claims about review workflow aligned to implemented record states.
- Keep ADR-0001 as conceptual direction and ADR-0002 as v0.1 alignment correction.
- Add explicit governance docs for release/maintainer practices so repository posture
  matches an open-source maintenance path.
