# Phase 3C TTL Export Pass Council

**Date:** 2026-05-21  
**Scope:** TTL expiry metadata, stale export blocking, and documentation.

## Goal

Verify that Phase 3C prevents expired accepted memories from being exported
without expanding into read governance, conflict detection, supersession, or
source-trust scoring.

## Council Review

### Contrarian

The dangerous failure mode is a stale accepted record silently reaching a memory
destination. The export error must provide enough evidence to remediate the
record, but it must not leak memory text or source quotes into logs or terminal
output.

### First Principles

TTL is a boundary condition for durable memory reuse. The minimum coherent
runtime rule is: if an accepted record for the target destination is expired,
do not export that destination.

### Expansionist

Canonical `expires_at` creates a clean future hook for read-side filtering,
destination-specific warnings, and conflict/supersession work. This phase should
not implement those behaviors yet.

### Outsider

Users may assume TTL affects listing, review state, or policy decisions. Docs
must say that Phase 3C is export-time stale blocking only.

### Executor

Add focused tests in `test/ttl-export.test.js`, update the ADR/PRD/README, and
leave production behavior changes to the smallest existing TTL/export hooks.

## Findings And Fixes

- Added tests for no-TTL defaults, canonical expiry, legacy normalization,
  invalid-TTL privacy/no-write behavior, and destination-scoped export blocking.
- Updated record-schema expectations to include `expires_at`.
- Updated docs to remove stored-only TTL claims and explicitly defer
  read-governance, conflict, and supersession semantics.
- Updated CLI help text so `--ttl` describes export-time enforcement.

## Remaining Risks

- Date-only TTL semantics are now end-of-day UTC; changing that requires an ADR
  review because it affects stale-export timing.
- Export-time blocking does not remediate stale records by itself. Maintainers
  still need to reject, refresh, or move expired accepted records.
- Read-side governance remains deferred.
