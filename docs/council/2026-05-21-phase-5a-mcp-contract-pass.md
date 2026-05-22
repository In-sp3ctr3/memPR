# Phase 5A MCP Contract Council

**Date:** 2026-05-21
**Scope:** ADR and docs contract for the first MCP local agent surface.

## Goal

Document the Phase 5A MCP decision after re-reviewing the official MCP
`2025-11-25` specification. The contract should let implementation proceed
without overclaiming security, audit quality, identity, remote readiness, or
general resource access.

## Acceptance Criteria

- MCP spec `2025-11-25` is pinned.
- Local stdio-first transport is accepted; HTTP/OAuth enforcement is deferred.
- Least-privilege scope names may be reserved before HTTP support.
- The MCP surface is not a general proxy.
- No arbitrary file, URL, repository, or raw resource passthrough exists.
- Resources are constrained under `mempr://`.
- Tools mirror the CLI record lifecycle.
- Review/export mutations require confirmation.
- MCP logging is separate from MemPR's event ledger.
- Prompts, sampling, elicitation, and proxy mode are not included yet.
- Docs avoid audit-grade, security-product, identity-proof, or compliance
  claims.

## Council Pass 1: Before Drafting

### Contrarian

The biggest failure would be documenting MCP as a security boundary or file
gateway. MCP tools are model-invoked, resources can expose sensitive context,
and MemPR does not yet have actor identity, OAuth scope enforcement,
signatures, or tamper-proof events.

### First Principles

The problem is not "make MemPR MCP-native" in the broadest sense. The problem
is to expose the existing local memory write-governance lifecycle through MCP
while preserving the same review, export, and evidence limits already accepted
by earlier ADRs.

### Expansionist

A narrow contract is useful because it gives implementation tests a clear
shape: tool schemas, confirmation gates, `mempr://` resources, logging
redaction, and absent features can all be pinned before any server code lands.

### Outsider

A maintainer should be able to read the ADR and understand that this is local
agent access to MemPR, not a remote service, not a filesystem browser, and not a
proof that a human made a decision.

### Executor

Draft ADR-0017, index it, update PRD and README language, and leave runtime
files alone. Remove MCP from the deferred ADR backlog once the ADR is accepted,
but keep implementation as planned until MCP code and contract tests exist.

## Consensus

Phase 5A should accept a local, stdio-first MCP contract that mirrors the CLI
record lifecycle, constrains resources to `mempr://`, requires confirmation for
review/export mutations, separates operational MCP logging from the MemPR event
ledger, and explicitly defers HTTP/OAuth, prompts, sampling, elicitation,
proxy mode, migration tools, and audit/security claims. Scope names can be
reserved in the contract, but OAuth enforcement waits for a future HTTP ADR.

## Council Pass 2: After Drafting

### Contrarian

The draft was mostly narrow, but two edges needed tightening: "MCP tools" in
README could sound shipped rather than deferred, and the PRD capability matrix
still treated HTTP/OAuth as the generic next MCP item even though ADR-0017
reserves scope names while deferring enforcement.

### First Principles

The canonical shape is not "every CLI command over MCP." It is the CLI record
lifecycle over MCP: propose, list/inbox, inspect/diff, history, review,
export, and check. Maintenance mutation through `migrate` remains separate.

### Expansionist

Explicitly naming history/check in the PRD deliverable makes later contract
tests more complete while still keeping the surface local and non-proxy.

### Outsider

The README should read as "the decision exists, implementation is not shipped."
That distinction matters for someone skimming install docs.

### Executor

Revise README deferred wording, update the PRD MCP status row, and align the
Phase 5 deliverable list with ADR-0017's tool table.

## Council Pass 3: Final Adversarial Review

### Contrarian

The final docs still need implementation discipline: confirmation arguments can
be spoofed by a model if the client does not enforce a real user interaction,
so the ADR correctly avoids treating confirmation as identity, signature, or
audit proof. The `mempr://` boundary also needs tests because resource links
are an easy place to accidentally leak `file://` or destination paths.

### First Principles

Phase 5A is complete at the docs layer when the next worker can implement a
local MCP server without asking whether HTTP, OAuth, prompts, sampling,
elicitation, proxy mode, raw files, raw events, or migration tools belong in
scope. They do not.

### Expansionist

The contract leaves useful future doors open: HTTP/OAuth, prompts, sampling,
elicitation, stronger audit evidence, and maintenance tools can each get their
own ADR instead of being smuggled into the first MCP surface.

### Outsider

The public README now says there is an accepted MCP contract but no MCP server
implementation yet. That is the right reader-facing distinction.

### Executor

Finalize after verifying the assigned docs mention the pinned spec, stdio-first
transport, deferred HTTP/OAuth, constrained resources, confirmation, separate
logging, absent prompts/sampling/elicitation/proxy mode, and no audit-grade or
security-product claims.

## Final Outcome

ADR-0017 is accepted as the Phase 5A MCP local agent surface contract. The PRD,
README, and ADR index now point to that decision while preserving the
docs-only boundary: no source or test implementation was changed by this pass.
