# ADR-0018: Read-Side Context Governance

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

Earlier MemPR phases deliberately focused on write governance and export
governance. The shipped controls decide whether a proposed memory can become an
accepted record, whether accepted records can be written into one destination,
and whether local export preview can show the exact file output without write
side effects.

Those phases repeatedly deferred read-side governance. Phase 7A starts that
work with a narrower contract: local read-context assembly. It prepares context
from MemPR records for one destination, but it does not write files, mutate
state, authorize a caller, enforce permissions, scan/redact accepted content, or
prove that memory claims are true.

This distinction matters because export/write governance and read-side context
assembly share some blockers, but they are different operations:

- Export writes accepted memory into a destination and emits normal export
  events after successful committing writes.
- Export preview shows the exact local export output without writing files or
  events.
- Read-context assembly returns local context records for a caller without
  changing destination files, directories, ledger state, or event history.

## Decision

Phase 7A defines the first local read-side context assembly contract.

The contract is:

- A caller must request one exact destination.
- Eligible records are limited to `accepted` records whose `destination`
  exactly equals the requested destination.
- TTL blocking uses export parity. Any expired accepted record for the
  requested destination blocks the whole context assembly before context is
  returned.
- Accepted relationship blocking uses export parity. Any accepted
  same-destination conflict or supersession pair blocks the whole context
  assembly before context is returned.
- Optional scope filtering can run only after TTL and relationship blockers
  pass. Scope filters reduce the returned accepted records; they cannot bypass
  stale or relationship blockers.
- Blocking evidence may include record IDs, counts, destination, and
  relationship type. It must not include memory text or source quotes.
- Read-context assembly must not write destination files, create parent
  directories, mutate `.mempr/ledger.jsonl`, append `.mempr/events.jsonl`, or
  emit `memory_exported` events.
- Scope filtering is local presentation-time selection only. It is not actor
  identity, reviewer identity, authorization, permissioning, enforcement,
  security, or compliance evidence.
- Returned context is not proof that accepted memories are true, safe,
  complete, non-sensitive, authorized, or redacted.
- Accepted sensitive content can still appear in returned context because
  Phase 7A does not add scanning or redaction.

## Options Considered

### Option A: Keep Read-Side Governance Fully Deferred

Pros:

- Avoids any chance of confusing local context assembly with permissioning.
- Keeps the product focused on write/export governance.

Cons:

- Leaves no reusable contract for agents that need local context without
  writing destination files.
- Keeps TTL and relationship blockers export-only even though stale or
  contradictory accepted records are also risky as assembled read context.

### Option B: Add Full Permissioned Read Governance Now

Pros:

- Could eventually support identity-aware, scope-aware, and policy-enforced
  context reads.
- Better aligns with mature memory-store access control.

Cons:

- Requires actor identity, authorization semantics, permission models,
  enforcement boundaries, and likely remote transport rules MemPR does not
  have yet.
- Risks overclaiming security or compliance guarantees from local files.
- Would blur the currently tested write/export governance boundary.

### Option C: Add Local Read-Context Assembly Preflight

Pros:

- Gives local callers a no-write context assembly contract.
- Reuses the export-proven TTL and accepted relationship blockers.
- Keeps exact destination filtering and accepted-only eligibility consistent
  with export.
- Creates a clear place to add future read-side permissioning later.

Cons:

- Does not prove identity, authorization, enforcement, memory truth, or content
  safety.
- Can still return accepted sensitive content because scanning and redaction
  are deferred.
- Scope filtering may be mistaken for permissioning unless docs and tests keep
  the boundary explicit.

## Consequences

- Phase 7A is the first accepted read-side governance ADR, but it is deliberately
  limited to local context assembly.
- Export remains the write boundary for destination files and
  `memory_exported` events.
- Read-context assembly shares export TTL and relationship blockers but has no
  file, directory, ledger, or event side effects.
- Scope filters are optional post-blocker selectors, not access-control
  primitives.
- Docs and tests must keep accepted sensitive content, truth validation,
  scanning, redaction, permissioning, and security claims out of Phase 7A.

## Deferred Risks

- actor and reviewer identity
- authorization and permission semantics
- enforcement guarantees
- remote HTTP/OAuth read behavior
- live memory-store read adapters
- retrieval ranking or vector search
- read-side stale warnings instead of hard blocking
- read-side conflict resolution or winner selection
- read-context sensitive-data scanning
- read-context redaction
- truth, safety, or compliance-grade claims

## Review Triggers

- changing blocker order relative to optional scope filtering
- changing exact destination eligibility
- returning pending, rejected, or other-destination records
- adding read-context writes, events, or destination-file changes
- adding identity, authorization, permissioning, enforcement, or security
  claims to scope filtering
- adding scanning, redaction, truth scoring, or safety scoring
- exposing read-context assembly through MCP or another remote transport
- changing blocker error evidence or privacy rules

## Supporting Evidence

- [Phase 7A read-context governance council](../council/2026-05-21-phase-7a-read-context-governance-pass.md)
