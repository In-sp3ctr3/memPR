# ADR-0033: R6-R7 diagnostics and accepted-memory scanning

Status: Accepted

## Context

Read denials, context assembly, and export previews needed operator-visible
diagnostics without leaking memory content. Accepted memory also needed a
deterministic boundary scan for obvious secret-like content.

## Decision

- Diagnostics are written only by explicit admin action through `mempr diagnostics`.
- Diagnostics go to `.mempr/diagnostics.jsonl`, separate from domain events.
- Support bundles use correlation IDs and redact memory text and source quotes.
- Read-context, status, export preview, and export paths do not write diagnostics.
- Accepted records are scanned at read-context/export boundaries.
- Secret-like accepted content blocks context/export with content-free evidence.
- Sensitive personal or regulated patterns produce warnings, not safety claims.
- Redaction markers are recognized only for explicit redacted marker values;
  MemPR does not rewrite accepted memory.

## Consequences

- Operators can get enough evidence to debug local state without turning normal
  denied responses into a side channel.
- Scanner results are heuristic. MemPR must not claim returned memory is safe,
  complete, non-sensitive, or redacted.

## Verification

- Diagnostics/scanner tests cover blockers, warnings, marker handling, and
  diagnostics separation.
- Context/export/MCP tests preserve no-write and no-content-denial behavior.
