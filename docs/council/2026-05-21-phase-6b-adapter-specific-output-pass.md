# Phase 6B Adapter-Specific Output Council

**Date:** 2026-05-21
**Scope:** Documentation and adversarial review for adapter-specific local file
output for `AGENTS.md` and `CLAUDE.md`.

## Goal

Document Phase 6B as a local output-format pass layered on top of the Phase 6A
file-adapter boundary. Generic Markdown output remains stable, while
`AGENTS.md` and `CLAUDE.md` receive deterministic managed-block headings,
preambles, and empty-state copy tailored to their Markdown use cases.

Phase 6B must not claim enforcement, security, identity, authorization, live
memory synchronization, export-time scanning/redaction, downstream IDs,
retries/auth, live network writes, or read-side governance.

## Council Pass 1: Design Boundary

### Decision Being Tested

Phase 6B should specialize local Markdown output for `AGENTS.md` and
`CLAUDE.md` without changing the Phase 6A adapter boundary or generic Markdown
export.

### Council Review

Contrarian: Adapter-specific headings and preambles could be mistaken for a new
adapter behavior layer if docs do not say what stays unchanged: accepted-only
filtering, exact destination matching, destination validation, managed markers,
outside-block preservation, and `memory_exported` events.

First Principles: The real goal is deterministic local file output. The minimum
coherent change is copy and heading specialization inside the existing managed
block, not a new export policy or live integration.

Expansionist: If the named file outputs are stable now, future adapters can make
their own output decisions without weakening the generic Markdown contract.

Outsider: A reader should see three buckets: generic Markdown output, Phase 6A
local file-adapter boundary, and Phase 6B adapter-specific local output.

Executor: Update README, PRD, ADR-0006, and this council note. Do not edit
source or tests in Worker C's docs-only ownership.

### Consensus

Phase 6B is an adapter-specific local output pass. It may tailor deterministic
headings, preambles, and empty-state copy for `AGENTS.md` and `CLAUDE.md`, but
it must leave generic Markdown output and Phase 6A export invariants stable.

## Council Pass 2: Evidence Needed

### Decision Being Tested

The docs can describe Phase 6B only if the required evidence is specific enough
for implementation workers to verify.

### Council Review

Contrarian: Golden tests that only check non-empty output could miss the real
risks: generic output drift, misleading empty states, or changed event behavior.

First Principles: Evidence must prove both stability and specialization:
generic Markdown remains byte-stable, named adapters get deterministic copy,
and export semantics do not change.

Expansionist: Adapter-specific empty-state fixtures are useful future evidence
because they prevent vague "no memories" text from implying hidden state or live
sync.

Outsider: The rationale should cite plain facts, not product mythology:
`AGENTS.md` is standard Markdown for agent instructions with no required fields;
`CLAUDE.md` is persistent Markdown project context for Claude.

Executor: PRD test requirements should call for generic stability fixtures,
adapter golden outputs, deterministic empty states, unchanged destination
validation/filtering, outside-block preservation, and unchanged event behavior.

### Consensus

Phase 6B evidence should include generic Markdown stability fixtures plus
`AGENTS.md` and `CLAUDE.md` golden outputs for headings, preambles, and
empty-state copy. It should also prove that destination validation, exact
destination filtering, outside-block preservation, and `memory_exported` event
behavior are unchanged.

## Council Pass 3: Final Docs Risk And Residuals

### Decision Being Tested

The final docs should explain the adapter rationale without overclaiming
security, enforcement, identity, authorization, or live memory behavior.

### Council Review

Contrarian: Saying `AGENTS.md` is for agents and `CLAUDE.md` is for Claude can
sound like MemPR controls those tools. The docs must keep the claim to local
Markdown output only.

First Principles: MemPR writes accepted records into local files. It does not
prove memories are true, authenticate a reviewer, enforce agent behavior, scan
exports for sensitive data, or govern reads.

Expansionist: Cleanly naming deferred live-adapter work now creates review
triggers for Mem0, LangGraph, LLM-wiki, custom network adapters, downstream IDs,
retries/auth, and network failure handling.

Outsider: The public README should say the difference in one short block; the
PRD and ADR should hold the detailed contract and non-goals.

Executor: Run stale-wording searches and `git diff --check` after patching.
Report that Worker C changed docs only and did not verify implementation tests.

### Consensus

Finalize the docs with a strict Phase 6A/6B split: Phase 6A defines the local
file-adapter boundary; Phase 6B defines adapter-specific local Markdown output.
All live/network adapter behavior, export scanning/redaction, downstream IDs,
retries/auth, and read-side governance remain deferred.

## Residual Risks

- Worker C did not edit source or tests; implementation workers must ensure
  runtime output and golden tests match the documented Phase 6B contract.
- Adapter-specific copy can still become misleading if future edits imply
  enforcement, security, identity, authorization, live memory sync, or hidden
  state.
- Accepted sensitive content can still be exported because Phase 6B does not add
  export-time scanning or redaction.
- Live adapters need separate ADR coverage for Mem0, LangGraph, LLM-wiki,
  custom network adapters, downstream IDs, retries/auth, duplicate writes, and
  network failure recovery.
