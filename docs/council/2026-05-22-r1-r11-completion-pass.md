# R1-R11 Completion Council

**Date:** 2026-05-22
**Scope:** Final adversarial review for the R1-R11 local-first 1.0 completion
pass.

## Acceptance Criteria

- R1-R11 are represented in source, tests, docs, and ADRs.
- No shipped feature is still described as deferred in current release docs.
- Denied reads and diagnostics remain content-free where required.
- HTTP MCP does not reuse local stdio confirmation or caller labels as auth.
- 1.0 public claims remain local-first and avoid compliance-grade wording.

## Council Review

Contrarian: The biggest risk is overclaiming. Hash chains are useful local
tamper evidence, not legal retention. HTTP Bearer checks are self-hosted runtime
checks, not hosted SaaS authorization. Scanner warnings are not proof that memory
is safe.

First Principles: The release needs concrete mechanisms: canonical event hashes,
local-key principals, deterministic read policy, explicit diagnostics, boundary
scanning, relationship lifecycle, adapter sync evidence, HTTP request checks, and
package smoke tests. Each mechanism needs a matching non-claim.

Expansionist: The implementation leaves good growth paths: provider-specific
adapter hardening, hosted review UI, automatic redaction, richer policy language,
and future scope-changing features can all be added without weakening the 1.0
core.

Outsider: A maintainer should be able to see how to migrate, how to repair, what
files are new, how to run the HTTP server, and what MemPR does not promise.

Executor: Keep the final patches scoped to stale contract language, release
checklists, package smoke tests, and the missing R-stream ADRs. Then run the full
gate.

## Consensus

Accept the R1-R11 completion as a local-first 1.0 release boundary if the final
verification passes:

- `npm run build`
- `npm run lint`
- focused R1/R10/R11 tests
- full `npm test`
- `git diff --check`
- claim-drift scan for stale deferred wording and compliance-grade overclaims

## Residual Risks

- Provider adapters are credential-gated generic HTTP adapters; real provider
  compatibility needs ongoing contract tests.
- The scanner is deterministic but heuristic.
- Local file trust roots do not provide hosted multi-user administration.
- Compliance-grade audit, legal retention, and third-party security guarantees
  remain out of scope.
