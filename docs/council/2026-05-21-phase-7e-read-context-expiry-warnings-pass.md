# Phase 7E Read-Context Expiry Warnings Council

**Date:** 2026-05-21
**Scope:** Read-only, non-blocking stale/upcoming-expiry warnings on
read-context outputs and read-context status outputs.

## Goal

Document Phase 7E as the next safe read-governance slice after Phase 7D status:
content-free warning metadata for accepted records approaching expiry. The
warning entries stay content-free; read-context surfaces may still return
accepted records as Phase 7A already allows, while status surfaces remain
content-free. The goal is earlier maintainer visibility, not permissioned
reads, authorization, enforcement, scanning, redaction, or safety proof.

The execution-pipeline triad for this pass is: plan the warning contract,
execute README/PRD/ADR/council docs that bind it, then adversarially review
warning-vs-blocker confusion, evidence privacy, side effects, and deferred
security/read-governance claims.

Expired accepted records must still hard-block Phase 7A context assembly, Phase
7D status readiness, and export through the existing accepted-only TTL blocker.
Phase 7E warnings are advisory and non-blocking.

## Council Pass 1: Warning Boundary

### Decision Being Tested

Phase 7E should add upcoming-expiry warnings without changing readiness or
export/context eligibility.

### Council Review

Contrarian: If upcoming expiry becomes a blocker, the warning window becomes an
implicit policy gate and can break valid reads before the TTL has actually
expired.

First Principles: The real job is maintainer attention. A still-valid accepted
record can be highlighted for refresh without changing whether it may be read
or exported.

Expansionist: Advisory warnings create a path to dashboards and local refresh
workflows while preserving the clean Phase 7A/7D blocker contract.

Outsider: The plain explanation is: expired blocks; expiring soon warns.

Executor: Document warnings as non-blocking metadata on read-context outputs
and Phase 7D status outputs, and repeat that expired accepted records remain
hard blockers through the existing TTL issue.

### Consensus

Phase 7E warnings are advisory. They do not make destination `ok` false, do not
change context assembly eligibility, do not change export eligibility, and do
not replace the hard blocker for expired accepted records.

## Council Pass 2: Evidence And Privacy

### Decision Being Tested

Warnings should expose enough non-secret evidence to act without returning
memory content.

### Council Review

Contrarian: A warning can leak content if implementers include snippets,
source quotes, or whole records to explain why a record matters.

First Principles: The warning only needs to identify the local timing evidence:
destination, record ID, expiry timestamp, and warning window.

Expansionist: Stable warning metadata lets future tools group refresh work by
destination or urgency without parsing memory text.

Outsider: A maintainer can understand "record mem_x expires soon" without
seeing the memory itself.

Executor: Allow warning code, destination, accepted record IDs, `expires_at`,
warning-window metadata, and time-to-expiry metadata. Forbid memory text,
source quotes, assembled records, rendered context, destination-file content,
preview content, and full record payloads inside warning entries.

### Consensus

Warnings are content-free evidence. They may reveal local record IDs and
expiry metadata, but they must not return memory text, source quotes, assembled
context, export preview content, or full records.

## Council Pass 3: Side Effects And Deferred Claims

### Decision Being Tested

Warnings must remain read-only observability and avoid permission/security
overclaims.

### Council Review

Contrarian: "No warnings" can sound like "safe" or "fresh enough," and that is
false if accepted records are inaccurate, sensitive, or unauthorized.

First Principles: Phase 7E observes TTL metadata. It does not add actor
identity, caller permissions, truth validation, safety validation, scanning, or
redaction.

Expansionist: Keeping warnings small makes later permissioned expiry filtering
easier because advisory metadata and enforcement are separate concepts.

Outsider: Users should see that this is a maintenance reminder, not an access
control system.

Executor: Document no writes, no domain events, no destination-file side
effects, no directory creation, no ledger mutation, and no `memory_exported`.
Keep identity/auth/security/redaction/safety/truth claims deferred.

### Consensus

Phase 7E warnings are read-only metadata. They create no files, events, or
ledger changes, and they do not prove authorization, permissioning,
enforcement, security, truth, safety, non-sensitivity, scanning, or redaction.

## Residual Risks

- Record IDs and expiry metadata still reveal local ledger structure.
- Users may misread no warnings as proof of safety or freshness unless docs and
  tests keep the non-claim language visible.
- Warning-window defaults may need later policy review.
- Accepted sensitive content can still exist in accepted records.
- Permissioned expiry filtering, scope-filtered reads, scanning, redaction,
  live stores, retrieval ranking, and remote MCP HTTP/OAuth remain future work.
