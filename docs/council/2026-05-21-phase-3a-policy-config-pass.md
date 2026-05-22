# Phase 3A Policy Config Pass

Date: 2026-05-21

## Decision Being Tested

MemPR should add a narrow `.mempr/policy.json` foundation for local policy terms
and inferred-risk defaults while leaving TTL enforcement, source-trust scoring,
policy versions, and conflict/supersession behavior out of scope.

## Council Review

### Contrarian

The risk is policy theater: a config file can look like a complete governance
layer even when it only handles local term matching and risk inference. Deny and
sensitive matches also become a privacy boundary because reasons and errors can
accidentally repeat the exact term, memory, or quote that triggered the policy.

### First Principles

The goal is not a policy language. The minimum useful workflow is deterministic:
load local config, validate it, preserve default behavior when missing, apply
local deny/sensitive terms before inference, and keep malformed config from
creating memory records.

### Expansionist

This foundation creates a future place for policy versions, source-trust hints,
destination-specific rules, and expiry rules. Keeping the first shape narrow
makes those additions easier to review later because each new field needs an ADR
and tests.

### Outsider

A maintainer should be able to read `policy.json` and understand what it can and
cannot do. At the Phase 3A boundary, the docs must say plainly that TTL
enforcement is still deferred, source trust is not scored, and conflicts are not
detected.

### Executor

Ship focused tests in `test/policy-config.test.js`, add ADR-0010, update the PRD
and README snippets, and avoid source edits in Worker C. Treat any failing tests
as evidence for Worker A/B production hooks unless a tiny exported test hook is
unavoidably missing.

## Consensus

Proceed with a narrow config foundation and verification-first tests. Do not
expand Phase 3A into TTL expiry, source trust, policy versions, conflict
detection, read governance, or a general policy expression language.

## Implementation Move

- Add integration tests through `proposeMemory` for missing config, deny terms,
  sensitive terms, inferred-risk knobs, explicit-risk precedence, and malformed
  config privacy.
- Keep validation errors from echoing invalid config values or invalid field
  names, because a malformed config can itself contain secrets.
- Add ADR-0010 and link it from the ADR index.
- Update PRD and README language so the feature claims match the actual Phase 3A
  boundary.

## Deferred Risks

- No TTL enforcement or stale export blocking.
- No source-trust scoring or confidence metadata.
- No policy version is recorded on memory records or events.
- No conflict detection, supersession model, or read-side governance.
- No general rule language.
