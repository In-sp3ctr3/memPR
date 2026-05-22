# ADR-0005: Policy Engine and Review State Machine

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** MemPR maintainers

## Context

MemPR's value depends on controlling which candidate memories become durable.
Current policy behavior is deterministic and local, but transition guards and
review reasons need to be hardened before integrations expand.

## Decision

Keep deterministic policy as the primary decision engine and harden status
transitions before MCP or downstream adapters.

Policy decisions remain:

- `auto_accept`
- `review`
- `reject`

Record statuses remain:

- `pending`
- `accepted`
- `rejected`

Current policy order:

1. Reject secret-like content.
2. Reject unsafe security-weakening standing instructions.
3. Review sensitive personal or regulated information.
4. Use explicit risk if supplied.
5. Infer low risk for `repo` or `project` scope.
6. Default to medium risk and review.

## Options Considered

### Option A: Add Model-Assisted Classification Now

Pros:

- May catch subtler policy cases.
- Could improve classification language.

Cons:

- Adds non-determinism and possible network/provider dependency.
- Makes tests and trust guarantees harder.

### Option B: Harden Deterministic Policy First

Pros:

- Testable and local-first.
- Easier to explain.
- Fits v0.1 scope.

Cons:

- Pattern checks will miss some adversarial or ambiguous cases.

## Consequences

- Medium and high-risk flows need stronger tests.
- Status transitions should be validated centrally.
- Rejected-to-accepted changes should require explicit reviewer reason or
  supersession.
- Source-trust metadata is planned but not part of v0.1.

## Deferred Risks

- subtle prompt injection
- source-trust scoring
- policy config format
- policy versioning
- reviewer identity
- conflict/supersession semantics

## Review Triggers

- changing policy order
- adding model-assisted classification
- adding policy config
- changing status names
- adding PR-like lifecycle states
