# Phase 4 Reviewer Ergonomics Pass Council

**Date:** 2026-05-21
**Scope:** Phase 4 reviewer CLI documentation.

## Goal

Document Phase 4 as local reviewer ergonomics over the existing memory-record
lifecycle, not as a full pull-request lifecycle.

## Acceptance Criteria

- `inbox` lists pending records only.
- `inbox` supports risk and destination filtering.
- Reviewer commands support JSON output.
- `diff <id>` shows a local review view for one record and direct relationship
  context.
- `review <id> --accept|--reject --reason <text>` wraps existing status
  transitions with an explicit mode.
- Existing `accept` and `reject` remain supported.
- Docs do not claim actor/reviewer identity, comments, merge/close lifecycle,
  hosted review UI, or interactive prompts.
- Relationship context may show memory content only in explicit local review
  views; export/blocking errors remain non-leaky.

## Council Pass 1: Before Drafting

### Contrarian

The dangerous mistake is letting Memory PR language imply a code-review
lifecycle. If Phase 4 says merge, close, comments, or reviewer identity, users
will expect governance guarantees the product does not have.

### First Principles

The real job is smaller: help a maintainer find pending records, inspect one
record with enough context, and make an accept/reject decision through the same
state machine already in use.

### Expansionist

Clear local commands create a future path to MCP tools or hosted review without
prematurely committing to identities, comments, or merge semantics.

### Outsider

`inbox`, `diff`, and `review` sound familiar, but the docs must explain that
they operate on memory records, not branches or pull requests.

### Executor

Add ADR-0015, index it, update the README and PRD command/phase sections, and
verify the wording for overclaims and leak-prone ambiguity.

## Council Pass 2: After Drafting

### Contrarian

The first draft could read as already shipped in the README. Use "expected
Phase 4" in runtime-facing summaries while keeping the ADR decisive about the
accepted target behavior.

### First Principles

The compatibility invariant matters: `review --accept|--reject` is an
ergonomic wrapper, not a replacement for `accept` and `reject`.

### Expansionist

Documenting JSON support now gives future MCP and automation surfaces a stable
shape without adding the MCP server in Phase 4.

### Outsider

The privacy exception needs to be plain. A reviewer explicitly running `diff`
can see memory content; a failed export or malformed input error should not
echo memory text.

### Executor

Revise README/PRD headings to describe shipped Phase 4 behavior after
implementation lands, then run grep and diff checks before the practical test
command.

## Council Pass 3: Final Review

### Contrarian

The remaining risk is not documentation overclaim but implementation drift:
future changes could add comments, identity, or lifecycle verbs without
updating ADR-0015.

### First Principles

Phase 4 should be judged by whether it shortens the local review loop while
preserving the existing `pending` / `accepted` / `rejected` lifecycle.

### Expansionist

The ADR creates clean review triggers for richer collaboration features later:
identity, comments, hosted review, prompts, and merge/close states each need
their own design pass.

### Outsider

The README now gives a normal maintainer a simple distinction: shipped v0.1
commands first, Phase 4 ergonomics next, still-deferred collaboration features
last.

### Executor

Finalize after recording console evidence: docs grep checks, whitespace/diff
checks, markdown-linter availability, and `npm test`.

## Consensus

Phase 4 should be documented as local reviewer ergonomics. It adds `inbox`,
`diff`, and explicit `review` commands over the existing record statuses,
preserves `accept` and `reject`, permits memory content only in explicit local
review context, and leaves full PR lifecycle features deferred.

## Residual Risks

- Phase 4 implementation can still drift if future commands add identity,
  comments, prompts, or merge/close states without revisiting ADR-0015.
- Markdown lint tooling is not installed in the workspace, so verification used
  grep, whitespace checks, diff checks, and the project test suite.
- Concurrent code and test changes exist outside this docs worker's ownership.
