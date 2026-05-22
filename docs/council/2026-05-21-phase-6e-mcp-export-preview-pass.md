# Phase 6E MCP Export Preview Council

**Date:** 2026-05-21
**Scope:** Local stdio MCP read-only export preview.

## Goal

Expose the Phase 6D local export dry-run through MCP without creating a second
export path, a mutation shortcut, or arbitrary repository-file passthrough.

Phase 6E must keep `mempr.export` as the confirmed write tool and add
`mempr.export.preview` as a read-only tool that reuses the dry-run export
validation, blockers, adapter selection, and rendering path.

## Council Pass 1: Tool Boundary

### Decision Being Tested

Phase 6E should add a separate read-only MCP tool named `mempr.export.preview`
instead of overloading `mempr.export`.

### Council Review

Contrarian: Overloading `mempr.export` with a dry-run flag would blur the
confirmation boundary and make it harder to tell a preview from a write.

First Principles: The user needs a no-write MCP preflight. The minimum clear
shape is a read-only tool with no domain event and no confirmation argument.

Expansionist: A separate tool lets future MCP clients show export previews
before asking for confirmed export.

Outsider: The name `mempr.export.preview` says what it does and why it is not
the committing export.

Executor: Add one contract entry, one server route, and focused MCP tests.

### Consensus

Use `mempr.export.preview` as the canonical Phase 6E MCP surface.

## Council Pass 2: Disclosure And Side Effects

### Decision Being Tested

MCP preview can safely return exact preview content if destination access stays
constrained.

### Council Review

Contrarian: Phase 6D preview includes existing destination text outside the
managed block. If MCP accepts any repo-relative destination, preview becomes an
arbitrary file reader.

First Principles: MCP preview exists to inspect MemPR export output, not to
read arbitrary repository files.

Expansionist: A managed-block guard still supports real MemPR destinations
while keeping missing destinations useful for first export previews.

Outsider: The rule is simple: missing destinations are okay; existing
destinations must already be MemPR-managed.

Executor: Reject existing destinations without a complete MemPR managed block
before calling the preview path.

### Consensus

MCP preview must reject unmanaged existing destinations and must not write
destination files, create parent directories, or append `memory_exported`
events.

## Council Pass 3: Verification And Residuals

### Decision Being Tested

The slice is complete only if tests prove both read-only MCP shape and export
preview parity.

### Council Review

Contrarian: A contract-only test could pass while the server route writes or
skips blockers.

First Principles: Evidence must cover contract metadata, `tools/list`
annotations, successful preview content, same export blockers, unsafe
destinations, and no side effects.

Expansionist: This gives future live adapters a safer preflight pattern before
network writes are considered.

Outsider: Docs must separate Phase 5D confirmed export, Phase 6D CLI/library
dry-run, and Phase 6E MCP preview.

Executor: Run MCP contract/server/read-only/mutation tests plus full suite.

### Consensus

Ship Phase 6E with read-only MCP contract tests, stdio tool listing tests,
tool-call preview tests, blocker tests, disclosure-guard tests, and docs that
keep live adapters and security claims deferred.

## Residual Risks

- Preview can still expose accepted memory content because this slice does not
  add export-time scanning or redaction.
- Existing MemPR-managed destination files may include non-MemPR text outside
  the managed block; MCP preview returns the exact would-be file content by
  design.
- HTTP/OAuth authorization, live adapters, downstream IDs, retries/auth,
  read-side governance, and compliance/security guarantees remain deferred.
