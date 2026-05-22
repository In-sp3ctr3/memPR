# Post-1.0 Product Slice Council

**Date:** 2026-05-22  
**Scope:** Three-pass council review for proposed ADR-0036 through ADR-0043.

## Goal

Convert the remaining post-1.0 product slices into proposed ADRs without
claiming implementation, weakening local-first guarantees, or smuggling scope
changes into maintenance work.

Acceptance criteria:

- Each future product slice has a proposed ADR.
- Each ADR is reviewed by the council at least three times.
- The ADR index points to the new proposals.
- The proposals preserve local-first 1.0 claim boundaries.
- Sub-agent draft reviews are reconciled into the final ADR wording.

## Council Round 1: Scope And Product Fit

Contrarian: Several slices can easily become a different product. Retrieval can
turn MemPR into a memory database; hosted service can turn it into SaaS;
compliance can turn local hash evidence into legal overclaiming.

First Principles: The core question is still whether memory writes are
reviewable, scoped, and backed by evidence. Future slices must either strengthen
that question or explicitly accept a product-scope change.

Expansionist: Proposed ADRs can unlock a credible roadmap while protecting the
1.0 release boundary. The strongest path is to name the future capability and
its proof obligations before implementation starts.

Outsider: A new maintainer needs to know which ideas are normal hardening and
which require product signoff.

Executor: Create proposed ADRs for adapter hardening, scanner/redaction,
diagnostics retention, reviewer identity, hosted service, retrieval, model
classification, and compliance/legal retention.

Round 1 outcome:

| ADR | Finding | Required adjustment |
| --- | --- | --- |
| 0036 | Adapter hardening fits local-first if profile-based | Avoid managed integration-platform language |
| 0037 | Scanner config fits; automatic redaction is separate | Do not claim safe or redacted output |
| 0038 | Retention is operations hygiene | Keep compliance audit out |
| 0039 | Reviewer identity precedes multi-user approval | Reject caller-asserted reviewer labels |
| 0040 | Hosted service is scope-change work | Keep self-hosted HTTP distinct from SaaS |
| 0041 | Retrieval is a product-scope change | Preserve exact destination and blocker order |
| 0042 | Models can assist but not decide | Keep deterministic policy authoritative |
| 0043 | Compliance needs legal/product signoff | Do not stretch hash chains into legal proof |

## Council Round 2: Security And Privacy

Contrarian: The biggest risks are side channels: diagnostics that leak hidden
records, redaction that preserves secrets in events, retrieval that crosses
destinations, hosted service that stores memory text, and models that send
private memory to external providers.

First Principles: A future slice is acceptable only if missing proof fails
closed and denied flows remain content-free.

Expansionist: Stronger privacy boundaries make the roadmap more credible for
teams that care about memory governance.

Outsider: Users should understand that "configured", "classified", "redacted",
or "hosted" does not automatically mean safe.

Executor: Add explicit no-leak, no-silent-rewrite, no-default-network, and
no-compliance-claim language to the relevant ADRs.

Round 2 outcome:

| ADR | Finding | Required adjustment |
| --- | --- | --- |
| 0036 | Provider sync can leak credentials and payloads | Require content-minimized events and no credential logging |
| 0037 | Redaction can corrupt provenance | Require reviewable new records/events, not silent rewrites |
| 0038 | Retention pruning can destroy useful evidence | Limit pruning to diagnostics and require dry-run/confirm |
| 0039 | Reviewer identity can be spoofed | Forbid OS/env/git/MCP/client inference |
| 0040 | Hosted memory text expands blast radius | Require content minimization before hosted storage |
| 0041 | Retrieval can leak hidden relationships | Run authorization and blockers before ranking/traversal |
| 0042 | External model calls can exfiltrate memory | Make provider use explicit and opt-in |
| 0043 | Retention can conflict with privacy/deletion | Require legal owner and deletion/hold policy |

Sub-agent reconciliation:

- Provider adapter review added provider payload fields, custom HTTP claim
  boundaries, and no-automatic-rollback wording to ADR-0036.
- Scanner review added non-weakenable built-in blockers, malformed-config
  fail-closed behavior, and redaction proposals to ADR-0037.
- Identity review added `.mempr/reviewers.json` and
  `.mempr/approval-policy.json` as proposed local-first shapes in ADR-0039.
- Hosted review sharpened the distinction between self-hosted HTTP and hosted
  SaaS in ADR-0040.
- Retrieval review shifted ADR-0041 toward adapter-facing retrieval metadata
  before native vector search.
- Model review added explicit advisory-metadata and no raw prompt/completion
  storage boundaries to ADR-0042.
- Compliance review added compliance-ready controls without compliance claims to
  ADR-0043.

## Council Round 3: Implementation Sequencing

Contrarian: If these ADRs imply all features are equally ready, implementation
will start in the wrong order. Hosted and compliance should not jump ahead of
identity, retention, and security proof.

First Principles: Build prerequisite proof before larger surfaces: local
profiles before provider claims, scanner config before redaction, reviewer
identity before multi-user approvals, and product/legal signoff before
compliance.

Expansionist: Sequencing lets MemPR grow without losing trust. Each ADR should
be a gate for implementation tasks, tests, and docs.

Outsider: The roadmap should feel deliberate, not like a pile of future wants.

Executor: Keep all ADRs `Proposed`, add review triggers, update the ADR index,
and require new tests plus claim scans for any implementation PR.

Round 3 outcome:

| ADR | Finding | Required adjustment |
| --- | --- | --- |
| 0036 | Provider hardening can ship before hosted work | Require provider profile fixtures |
| 0037 | Config can ship before redaction | Keep automatic redaction behind a separate decision |
| 0038 | Retention controls can ship as local hygiene | Keep audit-grade logging out |
| 0039 | Local reviewer principals can precede hosted accounts | Require migration wording for legacy reviews |
| 0040 | Hosted service depends on identity and retention | Do not build hosted UI first |
| 0041 | External retrieval sync can precede internal vectors | Require index drift/deletion design later |
| 0042 | Fake classifier tests precede providers | Keep model output advisory |
| 0043 | Compliance requires non-engineering signoff | Block compliance release wording until accepted |

## Final Consensus

ADR-0036 through ADR-0043 should be added as proposed future-product ADRs. They
are not shipped behavior. They are gates for future implementation plans,
tests, release claims, and public wording.

## Verification Plan

- Check ADR index links for ADR-0036 through ADR-0043.
- Check every new ADR has `Status: Proposed`.
- Run `git diff --check`.
- Run a claim scan for accidental shipped/compliance wording.
