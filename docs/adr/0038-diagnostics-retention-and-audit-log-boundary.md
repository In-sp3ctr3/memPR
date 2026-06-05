# ADR-0038: Diagnostics Retention and Audit Log Boundary

**Status:** Proposed  
**Date:** 2026-05-22  
**Deciders:** MemPR maintainers

## Context

MemPR writes domain events to `.mempr/events.jsonl` and explicit admin support
bundles to `.mempr/diagnostics.jsonl`. ADR-0033 keeps diagnostics redacted,
correlated, separate from domain events, and out of normal read-denial paths.
Retention policy and audit-grade logging remain unresolved.

The next diagnostics slice must decide retention and cleanup behavior without
turning diagnostics into a compliance log.

## Decision

MemPR will add a local diagnostics retention policy for
`.mempr/diagnostics.jsonl`. The policy may define maximum entry count, maximum
age, manual prune behavior, and support-bundle export behavior. Pruning must
apply only to diagnostics entries, not domain events or current ledger records.
Any prune path must support dry-run and explicit confirmation.

MemPR will continue to describe diagnostics as operational support evidence,
not an audit log. Compliance-grade logging, legal retention, non-repudiation,
and immutable storage require separate ADRs and legal/product signoff.

MemPR keeps three evidence buckets separate:

- `.mempr/events.jsonl` is the local domain event trail.
- `.mempr/diagnostics.jsonl` is redacted support/debug evidence.
- MCP/server logs are operational telemetry only.

## Options Considered

### Option A: Local Retention Controls

Pros:

- Reduces unbounded diagnostics growth.
- Keeps support bundles separate from domain events.
- Preserves local-first operation.

Cons:

- Adds configuration and pruning edge cases.
- Users may mistake retention knobs for compliance controls.

### Option B: Append Diagnostics Forever

Pros:

- Simple and preserves all local support evidence.

Cons:

- Creates privacy and disk-growth risk.
- Makes stale diagnostics easy to over-trust.

### Option C: Compliance Audit Log

Pros:

- Could support regulated workflows if fully designed.

Cons:

- Requires identity, signatures, retention policy, legal review, and storage
  guarantees outside MemPR 1.0.

## Consequences

- Diagnostics pruning must be explicit, testable, and content-minimized.
- Domain events remain separate and are not pruned by diagnostics retention.
- Support bundle export must preserve redaction guarantees.
- Audit wording remains constrained.
- Prune output must state that diagnostics-only records were affected.

## Deferred Risks

- Users may need organization-specific retention policies.
- Local file deletion cannot prove legal disposal.
- Local filesystem backups may retain pruned diagnostics.
- Compliance logging remains outside this ADR.

## Council Validation

- Round 1, scope fit: retention controls are operational hygiene, not audit.
- Round 2, security/privacy: pruning and support exports must not expose hidden
  memory text, source quotes, grants, actor secrets, or policy internals.
- Round 3, execution: add prune dry-run and confirm paths before destructive
  diagnostics cleanup.

## Review Triggers

- Diagnostics schema changes.
- Retention or prune behavior changes.
- Support bundle export changes.
- Any audit-grade, legal-retention, or compliance wording.
