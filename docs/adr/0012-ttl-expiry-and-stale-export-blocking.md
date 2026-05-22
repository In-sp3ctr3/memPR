# ADR-0012: TTL Expiry and Stale Export Blocking

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** MemPR maintainers

## Context

Earlier phases stored `ttl` as record metadata but did not enforce expiry.
That left an unsafe gap at the export boundary: an accepted memory could become
stale and still be written into future agent context.

Phase 3C needs the smallest enforcement pass that reduces stale-memory export
risk without expanding into read governance, conflict detection, supersession,
or destination adapter policy.

## Decision

MemPR stores canonical expiry metadata on records:

- `ttl`: `null` or a canonical ISO expiry timestamp.
- `expires_at`: `null` or the canonical ISO expiry timestamp used for runtime
  checks.

New proposals with no TTL store `expires_at: null`. New proposals with a valid
TTL store canonical expiry metadata. Date-only TTL values are interpreted as
the end of that UTC calendar day.

Legacy records missing `expires_at` normalize on read:

- parseable `ttl` becomes canonical `expires_at`
- missing or empty `ttl` becomes `expires_at: null`

Malformed TTL or expiry metadata fails closed. Errors must not echo memory text,
source quotes, or malformed secret-like values.

Export is the enforcement point for this phase. `mempr export` blocks when any
`accepted` record for the requested destination is expired. The error may
include the number of blocked records and record IDs so maintainers can inspect
or remediate them, but it must not include memory text or source quotes.

Expired records do not block export when they are `pending`, `rejected`, or
targeted at another destination.

## Options Considered

### Option A: Store TTL But Continue Deferring Enforcement

Pros:

- Keeps runtime behavior unchanged.
- Avoids expiry interpretation decisions.

Cons:

- Lets known-stale accepted memory reach future agent context.
- Keeps the export boundary weaker than the record schema implies.

### Option B: Block Stale Accepted Records At Export

Pros:

- Places enforcement at the exfiltration boundary.
- Keeps read-side behavior unchanged.
- Gives maintainers ID/count evidence without leaking memory content.

Cons:

- Export can fail until stale accepted records are rejected, refreshed, or moved.
- Does not solve stale memory used through future read adapters.

### Option C: Enforce TTL Throughout Reads, Lists, Conflicts, And Supersession

Pros:

- More complete stale-memory governance.
- Could support future read-side context assembly.

Cons:

- Too broad for Phase 3C.
- Requires a conflict/supersession model and read adapter semantics that do not
  exist yet.

## Consequences

- Export now fails closed for expired accepted records in the target
  destination.
- Pending, rejected, and other-destination expired records remain inspectable
  without blocking unrelated exports.
- TTL expiry is not a truth signal and does not prove non-expired memory is
  correct.
- This phase does not add conflict detection, supersession, read-governance
  filtering, destination adapter compatibility checks, or export redaction.

## Verification

Phase 3C verification lives in `test/ttl-export.test.js`.

The tests cover no-TTL defaults, canonical expiry storage, legacy normalization,
non-leaky invalid TTL failures, export blocking for expired accepted target
records, and non-blocking behavior for expired pending/rejected/other-destination
records.

## Review Triggers

- changing TTL parsing or date-only expiry semantics
- making expiry affect policy risk, status, source trust, or review decisions
- adding read-side expiry filtering
- adding conflict or supersession behavior
- changing stale export error evidence or privacy rules
