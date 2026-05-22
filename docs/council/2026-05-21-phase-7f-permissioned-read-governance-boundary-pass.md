# Phase 7F Permissioned Read-Governance Boundary Council

**Date:** 2026-05-21
**Scope:** Permissioned read-governance boundary and prerequisite map, with
docs, contract metadata, and regression guardrails. No runtime enforcement.

## Goal

Document Phase 7F as the boundary that keeps current read-context surfaces from
being mistaken for permissioned reads. Existing scope filtering, read-context
status, and expiry warnings are useful prerequisites, but they are not actor
identity, authentication, authorization, permissioning, enforcement, security,
scanning, redaction, HTTP/OAuth, or live-store behavior.

The execution-pipeline triad for this pass is: plan the narrow prerequisite
scope, execute docs/contract/test guardrails, then adversarially review
enforcement overclaims, prerequisite completeness, and deferred risks. The
council roles below act as the local review sub-agents for the slice.

Acceptance criteria:

- README and PRD describe Phase 7F as prerequisite boundary work, not
  permission enforcement.
- ADR-0023 defines the binding boundary and review triggers.
- The ADR index and deferred backlog point to ADR-0023.
- The PRD current-status matrix and read-governance sections keep permissioned
  reads deferred.
- No read-context eligibility, permission behavior, ledger/event behavior, or
  destination-file behavior changes.
- Source changes, if any, are limited to contract wording/metadata that clarifies
  local stdio scope metadata is not runtime enforcement.
- Tests guard against premature permissioned-read fields or claims.
- Markdown/rg checks verify that Phase 7F does not claim shipped permissioned
  runtime behavior.

## Council Pass 1: Scope Selection

### Decision Being Tested

Phase 7F should document a permissioned read-governance boundary and
prerequisite checklist, rather than implement enforcement or leave the topic
fully deferred without a binding ADR.

### Council Review

Contrarian: A boundary ADR can still be misread as a shipped permission system
if it uses strong words without repeatedly saying "no runtime enforcement."

First Principles: The real problem is claim control. MemPR has local context,
status, and warning surfaces, but it still lacks an actor, auth model,
permission semantics, redaction/scanning, HTTP/OAuth posture, and live-store
boundary.

Expansionist: A prerequisite map gives future permissioned reads a cleaner
launch point. It can define the missing decisions before any code tries to
enforce access.

Outsider: A maintainer should be able to read one paragraph and understand:
scope filters choose less output, status reports readiness, warnings flag
expiry, and none of those are permissions.

Executor: Create ADR-0023 and update README, PRD, and the ADR index. Keep any
source/test work limited to non-enforcement contract metadata and boundary
regressions.

### Consensus

Phase 7F is a prerequisite boundary. It should explicitly say that current
scope filtering, status readiness, and warning metadata are not auth,
permissioning, enforcement, security, or compliance evidence. Permissioned
reads remain deferred until separate decisions define the missing identity,
auth, permission, redaction/scanning, HTTP/OAuth, and live-store pieces.

## Council Pass 2: Drafted Docs Review

### Decision Being Tested

The drafted README, PRD, ADR-0023, and ADR index updates are precise enough to
avoid implying permissioned runtime behavior.

### Council Review

Contrarian: The phrase "read governance" appears throughout prior Phase 7 docs.
If Phase 7F only adds another ADR, readers may assume the governance now
enforces access. The docs need non-enforcement language near every Phase 7F
summary.

First Principles: Current behavior is still local exact-destination assembly,
post-blocker scope filtering, content-free status, and non-blocking warning
metadata. None of those decides who may read.

Expansionist: The prerequisite list should be concrete enough to become future
ADR entry criteria: actor identity, auth model, permission semantics,
missing-identity behavior, scanning/redaction, HTTP/OAuth posture, live-store
boundaries, evidence privacy, and tests.

Outsider: The README should not require reading every ADR to catch the point.
It needs a plain warning that scope/status/warnings are not permissions.

Executor: Patch the PRD matrix, Phase 7F behavior, read-governance
requirements, security deferred controls, Phase 7 implementation plan, open
questions, ADR index, ADR-0023, this council note, MCP metadata wording, and
boundary tests.

### Consensus

The docs are acceptable only if the current-status matrix and read-governance
sections both state that Phase 7F adds no command/API read behavior, no new MCP
tool/resource, and no permission checks. The ADR must keep full permissioned
read governance in the deferred backlog with concrete prerequisites.

## Council Pass 3: Final Preflight

### Decision Being Tested

The Phase 7F documentation and guardrail set is ready to ship as a
boundary/prerequisite slice without runtime overclaims.

### Council Review

Contrarian: Search must check for accidental enforcement or shipped-runtime
language. A single overclaim in the PRD matrix would undo the boundary.

First Principles: The final state should have exactly one new decision:
permissioned reads are still deferred, and the prerequisites are named.

Expansionist: This leaves the project in a better posture for a later
permissioned-read ADR because the future work has explicit design gates rather
than vague "read governance" language.

Outsider: The final wording is understandable if a reader can answer three
questions: what exists now, what does not exist, and what must be decided next.

Executor: Run markdown/rg checks, confirm only allowed files changed in this
slice, and report residual risk that accepted sensitive content may still exist
and users may still overread readiness/warnings as safety signals.

### Consensus

Phase 7F is ready when checks show no new runtime-enforcement claim and the
changed docs, contract metadata, and tests consistently say: scope filtering is
selection, status is readiness, warnings are advisory metadata, local stdio
scope metadata is protocol metadata only, and permissioned reads remain
deferred until the prerequisite decisions exist.

## Residual Risks

- Readers may still see "read governance" and infer access control unless the
  Phase 7F non-enforcement language stays visible in future edits.
- Accepted sensitive content can still exist in accepted records.
- Future work could accidentally attach permission semantics to scope filters
  before actor identity and auth semantics exist.
- HTTP/OAuth and live-store boundaries remain undecided.
- Scanning and redaction remain deferred, so no read-context surface can claim
  non-sensitivity or redaction proof.
