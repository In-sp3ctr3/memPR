# ADR-0043: Compliance and Legal Retention Boundary

**Status:** Proposed  
**Date:** 2026-05-22  
**Deciders:** MemPR maintainers

## Context

MemPR has local event hashes, record hashes, hash-chain validation, repair from
verified events, diagnostics separation, and release/security checklists. It
does not provide signatures, non-repudiation, cross-file transactions, legal
retention, immutable storage, regulated-data handling, or compliance-grade
audit guarantees.

Compliance and legal-retention claims are product, legal, operational, and
security decisions. They cannot be created by wording alone.

## Decision

MemPR will keep compliance-grade audit, legal retention, and regulated-data
guarantees out of scope until a dedicated product/legal ADR is accepted.

Any future compliance slice must define:

- target framework or regulation;
- legal owner and retention authority;
- identity and non-repudiation model;
- signing and timestamping model;
- immutable storage or retention backend;
- deletion and litigation-hold behavior;
- incident and access-review process;
- explicit claim wording and disclaimers.

Local hash chains remain tamper-evidence for developer workflows, not legal
proof.

Compliance-ready engineering controls may be considered before compliance
claims. Examples include retention class metadata, retention-until metadata,
deletion eligibility, hold status, disposal evidence, and policy-aware preflight
checks for destructive operations. Those controls are not compliance guarantees
by themselves.

## Options Considered

### Option A: Keep Compliance Out Of Scope

Pros:

- Keeps current claims honest.
- Avoids legal overreach.
- Preserves local-first developer focus.

Cons:

- Regulated teams must do their own assessment.

### Option B: Compliance-Ready Building Blocks

Pros:

- Could add signatures, timestamps, and retention hooks gradually.

Cons:

- Still cannot claim compliance without legal and operational controls.

### Option C: Compliance Product Track

Pros:

- Could open regulated use cases.

Cons:

- Requires legal counsel, security program, identity, immutable storage,
  support, and audits beyond this repository's current scope.

## Consequences

- Docs must avoid compliance-grade claims.
- Hash-chain and diagnostics language must stay developer-audit oriented.
- Any legal-retention feature requires explicit signoff beyond engineering.
- Destructive actions may need policy-aware preflight checks if retention
  metadata ships.

## Deferred Risks

- Users may over-read tamper evidence as legal audit proof.
- Hosted deployments may create new retention obligations.
- Third-party store exports may fall under policies MemPR cannot enforce.
- Right-to-delete requirements may conflict with legal hold expectations.

## Council Validation

- Round 1, scope fit: compliance is not a patch to the event ledger.
- Round 2, security/privacy: legal retention can conflict with deletion,
  redaction, and privacy expectations.
- Round 3, execution: require legal/product signoff before any compliance
  language, feature flag, or release note.

## Review Triggers

- Any legal retention, litigation hold, immutable storage, or audit-grade claim.
- Signature, timestamping, or non-repudiation features.
- Hosted service or organization admin features that store user memory.
- Regulated-data positioning or sales/support material.
