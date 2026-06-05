# ADR-0039: Reviewer Identity and Multi-User Approval Workflow

**Status:** Proposed  
**Date:** 2026-05-22  
**Deciders:** MemPR maintainers

## Context

MemPR has local Ed25519 read principals and signed read-policy gates, but
reviewer identity is not shipped. Current review decisions record reasons, not
authenticated reviewer subjects. Hosted sessions, service delegation, team
approval workflows, and non-repudiation remain outside the local-first 1.0
boundary.

Multi-user approval changes both product scope and security claims. It must not
reuse caller-supplied actor labels as authenticated reviewer identity.

## Decision

MemPR will require an explicit reviewer identity model before multi-user
approval workflows. The model must define:

- reviewer principal type and key/session proof;
- caller, actor, reviewer, service, and delegated subject separation;
- review action payloads that are signed or otherwise verifiable;
- minimum evidence stored in events;
- no-content denial behavior for unauthorized review attempts;
- migration behavior for legacy unauthenticated review events.

The proposed local-first shape is:

- `.mempr/reviewers.json` stores reviewer IDs, display names, public keys,
  status, and optional local role labels.
- `.mempr/approval-policy.json` stores local quorum requirements for high-risk,
  sensitive, untrusted-source, relationship-conflicting, supersession-retiring,
  or destination-specific approvals.
- Approval events are appended to `.mempr/events.jsonl` and signed by reviewer
  keys.
- Existing single-review behavior remains unchanged when no approval policy is
  present.

Hosted or organization-wide approvals require this identity model plus a
separate hosted-service ADR. Local multi-reviewer workflows may be considered
first if they use local key material and do not claim hosted administration.

## Options Considered

### Option A: Local Reviewer Principals First

Pros:

- Builds on existing local-key read principal work.
- Keeps local-first scope.
- Creates clear migration path for signed review events.

Cons:

- Does not solve hosted session management.
- Requires new UX for key setup and reviewer selection.

### Option B: Hosted Accounts First

Pros:

- More familiar team workflow.

Cons:

- Requires hosted service, sessions, org admin, billing/support posture, and
  stronger security review.

### Option C: Caller-Asserted Reviewer Labels

Pros:

- Easy to implement.

Cons:

- Misleading and not acceptable for approvals, non-repudiation, or audit claims.

## Consequences

- Review events may need a new schema version.
- Legacy review history remains useful but unauthenticated.
- Approval thresholds require explicit policy configuration.
- Hosted multi-user administration stays blocked until hosted identity exists.
- `.mempr/principals.json` read principals do not automatically become
  reviewers.

## Deferred Risks

- Key recovery and rotation UX.
- Delegated service accounts.
- Organization policy administration.
- Comment threads, assignment, notifications, and web UI.
- Non-repudiation and compliance claims.

## Council Validation

- Round 1, scope fit: local reviewer principals can come before hosted accounts.
- Round 2, security/privacy: reviewer labels must never be inferred from OS,
  env, git, MCP client labels, or HTTP metadata.
- Round 3, execution: ship migration and legacy-evidence wording with any
  reviewer identity implementation.

## Review Triggers

- Reviewer identity schema changes.
- Review event evidence changes.
- Multi-reviewer threshold or approval policy changes.
- Hosted account, session, org, or delegation behavior.
- Any non-repudiation or audit-grade claim.
