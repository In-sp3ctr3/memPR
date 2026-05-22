# Phase 6A File Adapter Boundary Council

**Date:** 2026-05-21
**Scope:** Documentation and adversarial review for the local file-adapter
boundary, adapter golden tests, and deferred live adapters.

## Goal

Document Phase 6A as a local file-adapter slice that keeps the existing export
trust boundary boring: deterministic managed Markdown, accepted-only exact
destination filtering, destination compatibility checks, user-content
preservation outside the managed block, and golden output tests for `AGENTS.md`
and `CLAUDE.md`.

Phase 6A must not claim export-time sensitive-data scanning, redaction,
downstream ID reconciliation, live network writes, read-side governance, or
compliance/security guarantees.

## Council Pass 1: Design Boundary

### Decision Being Tested

Phase 6A should promote `AGENTS.md` and `CLAUDE.md` to explicit local file
adapters while keeping Mem0, LangGraph, LLM-wiki, and custom network adapters
deferred.

### Council Review

Contrarian: Calling every destination an "adapter" would blur the difference
between generic Markdown export and named file adapters. It could also make live
store integrations sound closer than they are.

First Principles: The minimum useful boundary is local and deterministic: take
accepted records for exactly one destination, render the managed Markdown block,
preserve everything else in the file, and write only after compatibility and
destination validation pass.

Expansionist: Once `AGENTS.md` and `CLAUDE.md` have golden outputs, later
adapters can reuse the same contract instead of inventing their own export
semantics.

Outsider: A maintainer should understand three buckets immediately: current
generic Markdown export, Phase 6A local file adapters, and still-deferred live
adapters.

Executor: Update README, PRD, and ADR-0006 to name the boundary, the two file
adapters, and the explicit non-goals.

### Consensus

Phase 6A is a local file-adapter boundary, not a live integration phase.
`AGENTS.md` and `CLAUDE.md` are the named adapters; Mem0, LangGraph, LLM-wiki,
and custom network adapters stay deferred.

## Council Pass 2: Evidence Needed

### Decision Being Tested

The docs can describe Phase 6A only if the evidence requirements are concrete
enough to verify.

### Council Review

Contrarian: Golden tests can become decorative if they do not prove filtering,
outside-block preservation, and invalid destination rejection.

First Principles: Evidence must map to the export trust boundary: accepted-only
records, exact destination matching, deterministic managed block output,
destination compatibility, preserved user content, and normal event emission.

Expansionist: Validating empty destinations, absolute paths, traversal or dot
segments, backslashes, URL-like schemes, and null bytes now makes future
adapters inherit a stricter local path posture.

Outsider: The docs should say the exact rejected destination shapes rather than
"safe path" or "validated path."

Executor: Add PRD acceptance/test requirements and ADR contract language for
golden outputs, destination validation, and `memory_exported` event behavior.

### Consensus

Phase 6A evidence must include adapter golden tests for `AGENTS.md` and
`CLAUDE.md`, destination validation cases, exact destination filtering,
outside-block preservation, and unchanged `memory_exported` event behavior.

## Council Pass 3: Final Docs Risk And Residuals

### Decision Being Tested

The final docs should be strict enough that readers do not infer security,
network, or read-governance guarantees from local file-adapter support.

### Council Review

Contrarian: The phrase "export boundary" can sound like export scanning or
redaction. The docs must explicitly say those are not part of Phase 6A.

First Principles: Phase 6A governs what MemPR writes to local files. It does
not prove memories are true, classify secrets at export time, reconcile external
IDs, or govern reads.

Expansionist: Naming the deferred live-adapter risks now gives future workers a
clean ADR trigger for retries, authentication, reconciliation, and network
failure behavior.

Outsider: The README needs a short public explanation; the PRD and ADR can hold
the precise contract details.

Executor: Run stale-wording greps and whitespace checks after patching, then
record residual implementation drift risk because Worker C owns docs only.

### Consensus

Finalize the docs with explicit non-goals and defer live adapters. The residual
risk is implementation drift: source and test workers must ensure the runtime
and golden tests match the documented Phase 6A contract.

## Residual Risks

- Worker C did not edit source or tests; Phase 6A implementation and golden
  tests must remain aligned with these docs.
- Local file adapters can still export accepted sensitive content because
  export-time scanning and redaction are not in this slice.
- Destination validation must stay centralized so later adapters do not loosen
  the repo-relative, no-traversal, no-scheme boundary.
- Live adapters need separate ADR coverage for authentication, retries,
  downstream IDs, duplicate writes, and network failure recovery.
