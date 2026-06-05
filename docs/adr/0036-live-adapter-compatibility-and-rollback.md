# ADR-0036: Live Adapter Compatibility and Rollback Posture

**Status:** Proposed  
**Date:** 2026-05-22  
**Deciders:** MemPR maintainers

## Context

ADR-0031 shipped dry-run and confirmed live sync for fake, Mem0, LangGraph,
LLM-wiki, and custom adapters. The shipped contract covers confirmation,
idempotency keys, downstream IDs, retries, reconciliation, and partial-failure
reports. It intentionally leaves provider-specific payload compatibility,
rollback posture, and third-party store security claims as follow-up work.

The next adapter slice must decide how far MemPR goes in adapting provider data
models without becoming a hosted integration platform or claiming that third
party stores are secure.

## Decision

MemPR will add provider contract profiles before expanding live adapter support.
Each profile must define:

- supported payload shape and version;
- required credentials and endpoint fields;
- allowed metadata fields and size limits;
- idempotency key placement;
- downstream ID extraction rules;
- dry-run validation rules;
- idempotency key construction;
- downstream ID reconciliation behavior;
- retryable and permanent error classes;
- rollback posture for partial confirmed sync;
- content and metadata that must not be logged.

Confirmed sync remains a MemPR local event plus downstream attempt record, not
proof of downstream acceptance quality, provider retention, deletion, access
control, or security posture.

Rollback will be explicit and provider-scoped. MemPR may record compensating
sync evidence and surface manual rollback instructions, but it will not perform
automatic downstream rollback unless a provider-specific reversible operation is
explicitly modeled, confirmed, and tested.

## Options Considered

### Option A: Provider Contract Profiles

Pros:

- Keeps provider behavior reviewable and testable.
- Preserves fake no-network contract tests.
- Makes payload drift visible before confirmed sync.
- Avoids third-party security guarantees.

Cons:

- Requires more fixtures and compatibility tests per provider.
- Does not solve all provider rollback gaps.

### Option B: Generic HTTP Adapter Only

Pros:

- Smaller local implementation.
- Avoids provider-specific maintenance.

Cons:

- Pushes too much correctness onto users.
- Makes idempotency, reconciliation, and error handling inconsistent.

### Option C: Full Managed Integration Layer

Pros:

- Strongest user experience if fully staffed.
- Could centralize credentials, sync state, and rollback.

Cons:

- Changes product scope toward hosted integration infrastructure.
- Requires security review, credential storage decisions, and support burden.

## Consequences

- Adapter changes need provider fixtures and no-network compatibility tests.
- Confirmed sync must keep partial-failure evidence content-minimized.
- Provider-specific payload support remains additive and profile-based.
- Rollback claims stay narrow unless a provider proves stronger guarantees.
- The custom HTTP adapter remains caller-owned endpoint behavior, not a
  certified integration.

## Deferred Risks

- Provider APIs may change without warning.
- Provider delete/update semantics may not support rollback.
- Credential handling remains local and environment-based until a separate
  hosted or secrets-storage ADR exists.
- MemPR still cannot guarantee third-party store security.
- Downstream stores may mutate, enrich, deduplicate, or reject memory in ways
  MemPR cannot verify.

## Council Validation

- Round 1, scope fit: keep this inside R9 hardening, not hosted integration.
- Round 2, security/privacy: never log credentials, payload bodies, memory text,
  or source quotes in adapter diagnostics.
- Round 3, execution: require provider profile fixtures and fake no-network
  contract tests before adding or changing provider behavior.

## Review Triggers

- New live adapter provider.
- Provider payload schema change.
- Rollback or compensating-sync behavior change.
- Credential handling, sync-state, or downstream ID storage changes.
- Any claim about third-party store safety, security, or atomicity.
