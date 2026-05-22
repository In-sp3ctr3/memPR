# ADR-0040: Hosted Service Deployment Boundary

**Status:** Proposed  
**Date:** 2026-05-22  
**Deciders:** MemPR maintainers

## Context

MemPR 1.0 is local-first. It ships local CLI, local files, local stdio MCP, and
self-hosted MCP HTTP. Hosted SaaS, organization admin UI, hosted sessions,
multi-user approvals, and hosted security claims are out of scope.

Moving to a hosted service is a product-scope change. It introduces account
identity, tenant isolation, credential storage, billing/support posture, abuse
handling, availability expectations, and security operations.

## Decision

MemPR will not present self-hosted MCP HTTP as hosted SaaS. A hosted service
requires a separate product plan and architecture decision covering:

- account and organization model;
- tenant isolation;
- hosted session authentication;
- reviewer identity and delegation;
- secrets and credential storage;
- data retention and deletion;
- backup, restore, and disaster recovery posture;
- incident response;
- abuse and rate-limit policy;
- supported deployment regions;
- support and release operations.

The first hosted milestone, if accepted, should be a narrow hosted coordination
surface for review metadata, not a general memory-store proxy.

## Options Considered

### Option A: Keep Hosted Service Deferred

Pros:

- Preserves local-first promise.
- Avoids premature account/security infrastructure.
- Keeps current open-source package credible.

Cons:

- Teams must self-host or use local files for collaboration.

### Option B: Hosted Review Coordination

Pros:

- Could unlock team approvals without storing full memory content.
- Smaller blast radius than a full hosted memory store.

Cons:

- Still requires identity, tenant isolation, retention, and support policies.

### Option C: Full Hosted Memory Platform

Pros:

- Complete managed product experience.

Cons:

- Changes MemPR into a hosted memory platform and requires a much larger
  security, privacy, and operations program.

## Consequences

- Public docs must continue to distinguish self-hosted HTTP from hosted SaaS.
- Hosted work cannot start by adding remote storage behind current commands.
- Any hosted prototype needs content-minimization defaults.
- Hosted sessions must not be inferred from Bearer tokens, OAuth scopes, MCP
  client labels, local principals, reviewer identities, or organization role
  labels unless a hosted identity ADR defines that mapping.

## Deferred Risks

- Tenant isolation mistakes.
- Credential leakage.
- Hosted data deletion and retention requirements.
- Support burden and uptime expectations.
- Migration between local `.mempr` stores and hosted workspaces.

## Council Validation

- Round 1, scope fit: hosted service is a product-scope ADR, not an R10 follow-up.
- Round 2, security/privacy: hosted must minimize or avoid storing memory text
  until identity, retention, and deletion are designed.
- Round 3, execution: do not build hosted UI before account, tenant, and
  incident-response designs exist.

## Review Triggers

- Any hosted MemPR service.
- Hosted account, organization, session, or admin UI.
- Remote storage of memory content, proposals, diagnostics, credentials, or
  events.
- Hosted availability, security, or compliance claims.
