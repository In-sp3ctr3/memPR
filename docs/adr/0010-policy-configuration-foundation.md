# ADR-0010: Policy Configuration Foundation

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** MemPR maintainers

## Context

ADR-0005 made policy deterministic and intentionally small: secrets and unsafe
standing instructions are rejected, sensitive personal or regulated information
requires review, and ordinary low-risk repo or project memories can be
auto-accepted.

That default posture is useful, but each repository needs a local way to add
project-specific deny terms, sensitive terms, and risk defaults without changing
source code. The first policy configuration pass must improve operator control
without pretending that TTL enforcement, source-trust scoring, policy config
hashes, or conflict resolution already exist.

## Decision

Add a local `.mempr/policy.json` configuration file. Missing config preserves
the built-in policy defaults; a present config file must be valid JSON.

The supported fields are:

- `denyTerms`: local term snippets that force high-risk rejection when matched.
- `sensitiveTerms`: local term snippets that force high-risk review when
  matched.
- `autoAcceptScopes`: scopes that infer low risk when no explicit risk is
  supplied.
- `defaultRisk`: fallback inferred risk for proposals without explicit risk,
  configured auto-accept scope, or TTL.
- `ttlRisk`: inferred risk for proposals with a TTL and no explicit risk.

Configured deny and sensitive terms are matched against memory text and source
quotes. Match reasons must not echo the matched term, memory, or quote.

Config risk fields only influence inferred risk. Built-in secret, unsafe
instruction, and sensitive checks still run before explicit or inferred risk,
and explicit proposal risk still wins over configured inference knobs.

Malformed config fails closed for proposal writes. Error messages must identify
the config file as invalid without echoing secret values from the file.

## Options Considered

### Option A: Hard-Code More Built-In Policy Terms

Pros:

- Minimal implementation.
- Keeps one deterministic policy surface.

Cons:

- Does not let repositories encode local embargoes or domain-specific sensitive
  terms.
- Encourages source edits for policy changes.

### Option B: Add `.mempr/policy.json` With Narrow Fields

Pros:

- Keeps policy local-first and inspectable.
- Adds useful repository-specific controls without a policy language.
- Preserves deterministic tests and CLI behavior.

Cons:

- Requires validation and non-leaky errors.
- Does not solve trust scoring, expiry, or conflict handling.

### Option C: Add a Full Policy Rule Language

Pros:

- More expressive long-term.
- Could eventually support source trust, destinations, and policy versions in
  one format.

Cons:

- Too much surface before the basic write lifecycle is stable.
- Harder to document, test, and reason about safely.

## Consequences

- Repositories can customize local deny and sensitive terms without code
  changes.
- Default policy behavior remains stable for repositories without config.
- Risk inference becomes configurable, but only after higher-priority safety
  checks and explicit proposal risk.
- Config validation becomes part of the proposal trust boundary.

## Non-Goals

- TTL expiry enforcement or stale export blocking.
- Source-trust scoring, source identity, or source confidence decisions.
- Policy config hashes or replay proofs.
- Conflict detection, supersession, or read-side governance.
- A general policy expression language.

## Verification

Phase 3A verification lives in `test/policy-config.test.js`.

The tests cover missing config defaults, deny term rejection without matched
content in reasons, sensitive term high-risk review, inferred-risk config knobs,
explicit-risk precedence, and malformed/invalid config errors that do not echo
secret values, invalid values, or invalid field names.

## Review Triggers

- adding new policy config fields
- changing deny or sensitive term matching behavior
- changing policy order or explicit-risk precedence
- changing policy-version semantics or adding policy config hashes
- adding TTL enforcement, source-trust scoring, or conflict/supersession
  behavior
