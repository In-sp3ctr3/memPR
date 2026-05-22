# Phase 6C Scope-Grouped File Output Council

**Date:** 2026-05-21
**Scope:** Documentation and adversarial review for deterministic
scope-grouped local output in `AGENTS.md` and `CLAUDE.md`.

## Goal

Document Phase 6C as a local readability pass layered on top of the Phase 6A
file-adapter boundary and Phase 6B adapter-specific headings, preambles, and
empty-state copy. Generic Markdown output remains stable and flat, while
`AGENTS.md` and `CLAUDE.md` group accepted records by scope inside the MemPR
managed block.

Phase 6C must not claim read-side governance, scope filtering, permissioning,
enforcement, identity, authorization, security, live memory synchronization,
export-time scanning/redaction, downstream IDs, retries/auth, live network
writes, or live adapter behavior.

## Council Pass 1: Design Boundary

### Decision Being Tested

Phase 6C should group accepted `AGENTS.md` and `CLAUDE.md` records by scope for
readability without changing generic Markdown export or export eligibility.

### Council Review

Contrarian: Scope headings could look like policy scopes or access controls if
the docs do not say grouping is output organization only. A reader might assume
`repo`, `project`, or `user` headings govern what an agent may read.

First Principles: The real goal is a deterministic local file layout. The
minimum coherent behavior is to partition the already accepted, exact
destination-filtered records for display, while leaving acceptance, filtering,
validation, relationship/TTL blocking, and events unchanged.

Expansionist: Stable grouping makes `AGENTS.md` and `CLAUDE.md` easier to scan
without inventing a new schema. It also creates a precise future review trigger
if MemPR later adds real read-side scope governance.

Outsider: A maintainer should see four buckets now: generic flat Markdown,
Phase 6A local file-adapter boundary, Phase 6B adapter copy, and Phase 6C
scope-grouped local output for the two named files.

Executor: Update README, PRD, ADR-0006, and this council note. Do not edit
source or tests in Worker C's docs-only ownership.

### Consensus

Phase 6C is a deterministic output-organization pass. It groups accepted
`AGENTS.md` and `CLAUDE.md` records by scope for readability only; generic
Markdown stays stable and flat.

## Council Pass 2: Evidence Needed

### Decision Being Tested

The docs can describe Phase 6C only if implementation evidence is concrete and
separates grouping from governance.

### Council Review

Contrarian: A golden test that merely sees headings would miss dangerous drift:
generic Markdown might become grouped, provenance fields might move to group
headers only, or records might get re-sorted within a group.

First Principles: Evidence must prove deterministic order and unchanged export
semantics: groups render as `repo`, `project`, `user`, then custom scopes
alphabetically; records preserve filtered input order within each group; every
record still carries provenance fields.

Expansionist: Fixtures with multiple custom scopes will make future changes
safer because they pin both canonical scope order and alphabetical custom
ordering.

Outsider: The term "input order" should mean the filtered accepted record
sequence the base export would have rendered, not a hidden priority model.

Executor: Require golden output coverage for `AGENTS.md` and `CLAUDE.md`,
generic flat-output stability, preserved per-record provenance, and unchanged
destination validation, exact destination filtering, relationship/TTL blocking,
outside-block preservation, and `memory_exported` event behavior.

### Consensus

Phase 6C evidence must include generic flat-output stability plus named-adapter
golden outputs that prove group order, custom-scope alphabetical ordering,
input-order preservation within groups, and per-record provenance retention.

## Council Pass 3: Final Docs Risk And Residuals

### Decision Being Tested

The final docs should be precise enough that scope grouping cannot be confused
with read-side governance, security, permissioning, enforcement, or live memory
sync.

### Council Review

Contrarian: Scope grouping can sound like access control. The docs must repeat
that this is not scope filtering, permissioning, identity, authorization,
security, or read-side enforcement.

First Principles: MemPR is still writing accepted local records into files. It
does not prove memories are true, decide who may read them, govern runtime
agent behavior, scan exports for secrets, reconcile downstream IDs, retry
network writes, or synchronize live memory stores.

Expansionist: Naming these non-goals now leaves clean room for later ADRs on
read-side governance, export-time scanning/redaction, and live adapters.

Outsider: README should hold the short distinction; PRD and ADR should carry
the exact order, invariants, and deferred items.

Executor: Run stale-wording searches and `git diff --check` after patching.
Report that Worker C changed docs only and did not verify implementation tests.

### Consensus

Finalize the docs with a strict Phase 6A/6B/6C split: Phase 6A defines the
local file-adapter boundary, Phase 6B defines adapter-specific local copy, and
Phase 6C defines deterministic scope grouping for `AGENTS.md` and `CLAUDE.md`
local output. Live adapters, downstream IDs, retries/auth, export-time
scanning/redaction, and read-side governance remain out of scope.

## Residual Risks

- Worker C did not edit source or tests; implementation workers must ensure
  runtime output and golden tests match the documented Phase 6C contract.
- Scope headings could still be misread as policy controls if future copy
  implies filtering, permissioning, enforcement, identity, security, or live
  memory sync.
- Accepted sensitive content can still be exported because Phase 6C does not
  add export-time scanning or redaction.
- Live adapters still need separate ADR coverage for Mem0, LangGraph,
  LLM-wiki, custom network adapters, downstream IDs, retries/auth, duplicate
  writes, and network failure recovery.
