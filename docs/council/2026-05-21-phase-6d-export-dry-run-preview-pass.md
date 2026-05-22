# Phase 6D Export Dry-Run Preview Council

**Date:** 2026-05-21
**Scope:** Documentation and adversarial review for local export dry-run/preview
before live or downstream adapters.

## Goal

Document Phase 6D as a local export preflight layered on top of the Phase 6A
file-adapter boundary, Phase 6B adapter-specific copy, and Phase 6C
scope-grouped local output.

Dry-run/preview must show exactly what a committing export would write while
preserving the same destination validation, adapter compatibility checks,
accepted-only exact destination filtering, relationship blocking, and TTL
blocking rules.

Phase 6D must not write destination files, create directories, append
`memory_exported` events, or claim live adapters, downstream IDs, retries/auth,
export-time scanning/redaction, read-side governance, or compliance/security
guarantees.

## Council Pass 1: Design Boundary

### Decision Being Tested

Phase 6D should add local export dry-run/preview before live/downstream
adapters, without changing committing export behavior.

### Council Review

Contrarian: "Preview" can become a loophole if it skips blockers or renders a
near-miss instead of the exact committing output. It can also sound like a
security scan if the docs do not state what it does not prove.

First Principles: The real goal is preflight confidence. The minimum coherent
workflow is to run the same export validation and blockers, render the same
destination content that a real export would write, and stop before any file,
directory, or event side effect.

Expansionist: A no-write preview creates a safer operator habit before MemPR
later considers live adapters with retries, auth, downstream IDs, duplicate
writes, and partial failures.

Outsider: A maintainer should see four separate local export phases: Phase 6A
defines the file-adapter boundary, Phase 6B defines adapter-specific copy,
Phase 6C defines scope grouping, and Phase 6D defines no-write preview.

Executor: Update README, PRD, ADR-0006, and this council note only. Worker C
must not edit source or tests.

### Consensus

Phase 6D is a local no-write preflight. It previews the exact output a
committing export would write, after the same validation and blockers pass.

## Council Pass 2: Side Effects And Evidence

### Decision Being Tested

The docs can describe Phase 6D only if they make absence of side effects a
testable requirement.

### Council Review

Contrarian: A dry-run that creates parent directories, rewrites an empty file,
or appends `memory_exported` for observability would violate the user's trust
even if the preview text looked correct.

First Principles: Committing export has three side-effect classes: destination
file content, parent directory creation, and event ledger append. Dry-run must
produce none of them.

Expansionist: Tests that compare dry-run output to committing export output
will protect generic Markdown, `AGENTS.md`, and `CLAUDE.md` from drifting into
separate render paths.

Outsider: "Same blockers" should be named plainly: destination validation,
adapter compatibility, accepted-only exact destination filtering,
relationship blocking, and TTL blocking.

Executor: Require fixture evidence for exact preview parity, same blocker
behavior, and no destination-file, directory, or `memory_exported` event side
effects.

### Consensus

Phase 6D evidence must prove both halves: the preview is exactly what would be
written, and no write/event side effects occur.

## Council Pass 3: Claim Boundaries And Residuals

### Decision Being Tested

The final docs should keep dry-run/preview from being confused with live
adapter readiness, security review, redaction, or read-side governance.

### Council Review

Contrarian: A preview can falsely reassure users that accepted sensitive
content is safe to export. The docs must say Phase 6D does not add export-time
scanning or redaction.

First Principles: Dry-run is still about local export mechanics. It does not
authenticate a caller, prove memory truth, reconcile downstream IDs, reserve
remote writes, retry network failures, or decide what an agent may read.

Expansionist: Naming those deferred items keeps future ADR space clean for live
adapters, downstream ID reconciliation, retries/auth, export-time
scanning/redaction, read-side governance, and compliance/security claims.

Outsider: README should carry the short version; PRD and ADR should carry the
exact contract, tests, and deferred risks.

Executor: Run targeted searches and whitespace/diff checks after patching.
Report docs-only changes and note that implementation/test workers own runtime
alignment.

### Consensus

Finalize Phase 6D as a strict local preflight: same export rules, exact preview,
zero file/directory/event side effects, and no live adapter or security claim.

## Residual Risks

- Worker C did not edit source or tests; implementation workers must ensure the
  runtime dry-run path and fixtures match the documented contract.
- Accepted sensitive content can still appear in preview because Phase 6D does
  not add export-time scanning or redaction.
- Future live adapters still need separate ADR coverage for Mem0, LangGraph,
  LLM-wiki, custom network adapters, retries/auth, downstream IDs, duplicate
  writes, and partial-failure recovery.
- Dry-run output must stay tied to the committing render path so preview cannot
  become a separate, misleading serializer.
