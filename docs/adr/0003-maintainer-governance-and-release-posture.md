# ADR-0003: Public Maintenance and Release Governance

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

MemPR is already at the point where public trust is driven as much by maintenance posture
as by feature correctness. The repository needs a documented operating model that is
small, realistic, and repeatable for open-source contributors.

## Decision

Treat project governance as part of the product:

- Keep design decisions explicitly scoped (shipped vs roadmap) in ADRs and docs.
- Define a minimal branch, review, and release contract in-repo for clarity.
- Document security reporting, incident response expectations, and PR quality bars.
- Keep branch protection and rules in GitHub UI, but codify required behavior in docs.

## Maintainer Rules

- **Branching:** default development continues on `main`; temporary work is done on
  branches with `codex/` or short descriptive prefixes (`codex/<topic>`).
- **PR scope:** keep PRs focused and reversible. Prefer one behavior change per PR.
- **Review path:** every non-trivial change requires a listed rationale in PR body and
  at least one approver.
- **Testing gate:** `npm test` must pass before merge.
- **Security incidents:** use private reporting and security labels for auth/policy/lint bypass
  issues.
- **Change transparency:** add a short changelog entry for externally meaningful changes.

## Repository Rule Additions

- `SECURITY.md` must remain the root entrypoint for vulnerabilities.
- `CONTRIBUTING.md` must include branch and PR expectations and command expectations.
- `CODE_OF_CONDUCT.md` and issue templates remain in use for healthy collaboration.
- `.github` workflows must include CI and security scanning, with future optional release
  automation after stable packaging.

## Consequences

- Documentation and implementation are now visibly versioned and inspectable.
- Users can infer how hard or risky a claim is from whether it is in ADR core or
  roadmap.
- Contributors can onboard quickly without guessing policy intent.

## Deferred

- Enforcing actual GitHub branch protection settings (required checks, review count,
  linear history) remains a repo settings action.
