# Phase 7A Read-Context Governance Council

**Date:** 2026-05-21
**Scope:** Local read-context assembly for accepted MemPR records.

## Goal

Add the first read-side governance slice without turning MemPR into a
permission system, truth verifier, sensitive-data scanner, or live retrieval
engine.

The execution-pipeline triad for this pass is: plan the narrow local assembly
contract, execute docs that bind the contract, then adversarially review
overclaims around permissioning, security, truth, scanning, and side effects.

Phase 7A must assemble local context for one exact destination from accepted
records only. It must reuse export-parity TTL and accepted relationship
blockers before optional scope filtering, and it must have no destination-file,
directory, ledger, or event side effects.

## Council Pass 1: Boundary

### Decision Being Tested

Phase 7A should add a local read-context assembly command/API instead of
claiming full read governance.

### Council Review

Contrarian: A `context` command can easily sound like permissioned access or
safe retrieval. If docs imply safety, authorization, or redaction, the feature
overclaims what local JSONL records can prove.

First Principles: The real job is narrower: collect accepted records for one
destination while refusing stale or contradictory accepted state.

Expansionist: A local assembly contract creates a future extension point for
MCP resources, live stores, and permissioned reads after the local semantics are
stable.

Outsider: The plain model is understandable if phrased as "what accepted
records would be handed to an agent for this destination?" rather than "who is
allowed to read?"

Executor: Implement `assembleReadContext`/`assembleContext` and `mempr context`
with exact-destination eligibility and no write path.

### Consensus

Ship local read-context assembly only. Keep full permissioning, identity,
security, safety scoring, truth validation, scanning, redaction, and live store
reads deferred. Scope filtering is not identity, authorization, permissioning,
enforcement, or security.

## Council Pass 2: Blocker Order

### Decision Being Tested

TTL and accepted relationship blockers must run before optional scope
filtering.

### Council Review

Contrarian: If scope filtering runs first, a caller can hide an expired or
contradictory accepted record by asking for a narrower scope.

First Principles: Destination integrity is the invariant. Scope is only a
presentation selector after that invariant passes.

Expansionist: Keeping blocker order equal to export makes future shared
governance code easier and avoids separate read/export interpretations of
stale state.

Outsider: "This destination has a blocker" is easier to understand than
"this scope looks clean while another accepted record for the same destination
is stale."

Executor: Filter to accepted exact-destination records, run TTL and accepted
relationship blockers, then apply optional scope filters to returned records.

### Consensus

Scope filters cannot bypass destination-level read-context integrity blockers.

## Council Pass 3: Evidence And Side Effects

### Decision Being Tested

Blocking output can include record IDs and relationship type, but not memory
text or quotes, and context assembly must be read-only.

### Council Review

Contrarian: Failure messages that echo memory content or quotes can leak the
very content the blocker is trying to withhold.

First Principles: Blockers need enough evidence for maintainers to inspect
locally through explicit review commands, not full record content in an error.

Expansionist: A strict no-side-effect contract makes this API safe to reuse in
preview flows and future agent integrations.

Outsider: If the command is called `context`, users will not expect it to write
`MEMORY.md` or emit `memory_exported`.

Executor: Tests must assert no destination file, no parent directory creation,
no event append, no `memory_exported`, and non-leaky blocked JSON/text.

### Consensus

Return accepted context content only on successful assembly. On blocked
assembly, return issue codes, record IDs, and relationship metadata without
memory text or quotes. Never write destination files, create directories, mutate
ledger state, or append events. Returned context is not proof that memories are
true, safe, non-sensitive, or redacted; accepted sensitive content can still
appear.

## Residual Risks

- Accepted memory content can still appear in successful returned context.
- Scope filters may be mistaken for permissions unless docs stay explicit.
- Actor identity, authorization, enforcement, security, scanning, redaction,
  truth scoring, live retrieval, and MCP exposure require separate decisions.
