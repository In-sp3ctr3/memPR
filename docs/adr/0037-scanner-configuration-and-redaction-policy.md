# ADR-0037: Scanner Configuration and Redaction Policy

**Status:** Proposed  
**Date:** 2026-05-22  
**Deciders:** MemPR maintainers

## Context

ADR-0033 shipped accepted-memory scanning at read-context and export boundaries.
Secret-like content blocks; sensitive content warns; explicit redaction marker
values can be recognized. MemPR does not automatically rewrite accepted memory
and does not claim returned memory is safe, non-sensitive, or redacted.

Users will need configurable scanner rules and false-positive handling, but
configuration and automatic redaction can create dangerous overclaims if they
silently modify memory or imply safety.

## Decision

MemPR will add scanner policy configuration before automatic redaction.
Configuration must be local, deterministic, versioned, and validated. It may
control:

- enabled scanner families;
- additional custom secret-like blockers;
- custom sensitive-warning patterns;
- warning versus blocking mode for configured rules;
- surface applicability for read-context, export preview, export, and
  diagnostics summaries;
- redaction marker vocabulary;
- per-destination scanner policy selection.

Built-in secret-like blockers are non-weakenable. Malformed active scanner
configuration fails closed for boundary reads and exports.

Automatic redaction remains a separate opt-in design. If added, it must create
a new redaction proposal linked to the original record through
supersession/retirement metadata rather than silently rewriting accepted memory.
Original accepted memory must remain available in history subject to existing
read-policy gates.

## Options Considered

### Option A: Configurable Scanner Policy First

Pros:

- Lets users tune local behavior without rewriting content.
- Keeps denial and warning semantics testable.
- Preserves current no-safety-claim boundary.

Cons:

- Users may still need manual remediation.
- Pattern configuration can produce false confidence if docs are sloppy.

### Option B: Immediate Automatic Redaction

Pros:

- Faster path to cleaner exports.
- Reduces manual review for obvious secrets.

Cons:

- Risks silent memory corruption.
- Can hide provenance and create misleading safety claims.

### Option C: No Configuration

Pros:

- Keeps scanner behavior simple and predictable.

Cons:

- Forces all users into one pattern set.
- Makes false positives harder to manage.

## Consequences

- Scanner policy needs schema validation and claim-drift tests.
- Denials must remain content-free.
- Redaction must be reviewable and reversible through explicit records/events.
- Docs must keep saying scanner output is heuristic.
- Early scanner configuration should prefer constrained rule types before
  arbitrary regular expressions.

## Deferred Risks

- Regex-based patterns can miss secrets or flag harmless content.
- Regex-based patterns can create performance hazards if arbitrary expressions
  are accepted too early.
- Destination-specific scanner policy can become hard to reason about.
- Automatic redaction needs a separate ADR before implementation.
- Whether redaction proposals should rewrite source quotes remains undecided.

## Council Validation

- Round 1, scope fit: config is acceptable; silent redaction is not.
- Round 2, security/privacy: redaction output must not leak the original value
  through previews, diagnostics, event payloads, or denial evidence.
- Round 3, execution: ship scanner policy schema and tests before any automatic
  redaction path.

## Review Triggers

- Scanner policy schema changes.
- New blocker/warning families.
- Any automatic redaction behavior.
- Any claim that returned memory is safe, complete, non-sensitive, or redacted.
