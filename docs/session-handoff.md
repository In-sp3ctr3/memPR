# MemPR Session Handoff

**Date:** 2026-05-22
**Workspace:** `/Users/jadanjones/Dev/github.com/In-sp3ctr3/memPR`
**Purpose:** Give a fresh Codex session enough context to continue without
reconstructing the long implementation thread.

## Read This First

MemPR is a local-first governance layer for durable AI memory. The current work
has moved far past the original v0.1 skeleton: docs, ADRs, source, tests, MCP,
local adapters, read-context governance, permission-shaped read constraints,
and the post-7L backlog have all been developed in one broad worktree.

The repository has since been merged to `main` and published through the
local-first 1.0 release trail. Always check `git status --short --branch`
before editing, and do not reset, checkout, or revert files unless the user
explicitly asks for that.

Canonical docs:

- [PRD](prd.md)
- [ADR index](adr/README.md)
- [Remaining backlog council](council/2026-05-22-remaining-backlog-solidification-pass.md)
- [Post-1.0 product slice council](council/2026-05-22-post-1-0-product-slices-council.md)
- [Phase 7L actor identity/auth boundary ADR](adr/0029-read-actor-identity-auth-boundary.md)

## Current Status

The originally detailed implementation slices are complete through Phase 7L and
R1-R11. There is no approved `7M` implementation slice. The current release
boundary is local-first 1.0.

The latest important implementation pass completed the R-streams:

- `READ_PERMISSION_CONTRACT_VERSION` is now `r5-read-policy`.
- R1 adds schema-versioned event hashes, hash-chain validation, policy-config
  hashes, `mempr check` hash drift reporting, and `mempr repair --from-events`.
- R2 makes `sourceTrust: "untrusted"` require review; `trusted` never bypasses
  blockers.
- R3-R5 add local Ed25519 read principals, `.mempr/read-policy.json`, and
  fail-closed read enforcement when that policy exists.
- R6-R7 add redacted diagnostics, support bundles, accepted-memory secret
  blockers, and sensitive-content warnings.
- R8-R9 add relationship retirement/override evidence and dry-run/confirmed live
  adapter sync.
- R10 adds self-hosted `mempr-mcp-http` with protected-resource metadata, Bearer
  token audience/scope checks, Origin/Host defenses, Accept validation, and rate
  limiting.
- R11 sets the package to local-first `1.0.0` and adds release/migration
  checklists plus package smoke tests.

## Verification Already Run

After Phase 7L source/tests/docs integration:

- `npm run build` passed.
- Focused contract tests passed: `16/16`.
- Focused API/CLI/MCP tests passed: `57/57`.
- `npm run lint` passed.
- Full `npm test` passed during the 1.0 completion and docs-publication pass:
  `209/209`.
- `git diff --check` passed for the touched Phase 7L files.
- Stale wording scans found no accidental docs-only/`7M` shipped-claim drift
  after cleanup.

After the backlog-solidification docs pass:

- `git diff --check -- README.md docs/prd.md docs/adr/README.md docs/council/2026-05-22-remaining-backlog-solidification-pass.md` passed.
- `rg` scans found no `Phase 7M` implementation slice and no accidental
  R-stream shipped-claim wording in the consolidated backlog docs.

If a new session changes source or tests, rerun at minimum:

```bash
npm run build
npm run lint
npm test
```

For docs-only changes, at minimum run:

```bash
git diff --check -- README.md docs/prd.md docs/adr/README.md docs/council
rg -n "Phase 7M|Later Phase 7 deliverables|R[0-9]+ .*shipped|auth-backed.*shipped|remote MCP.*shipped|live.*shipped|redaction.*shipped" README.md docs/prd.md docs/adr/README.md docs/council
```

## Completed Phase Map

The PRD is the source of truth, but this is the quick map:

- Phase 0: Documentation consolidation.
- Phase 1: v0.1 hardening.
- Phase 2: event ledger, consistency, migration, locking.
- Phase 3: policy config, source trust metadata, TTL, conflicts/supersession,
  export governance.
- Phase 4: reviewer ergonomics and history CLI.
- Phase 5: local stdio MCP surface, read-only calls/resources, confirmed
  mutations.
- Phase 6: local destination adapters, grouped output, dry-run/export preview,
  MCP export preview.
- Phase 7A: local read-context assembly.
- Phase 7B: MCP `mempr.context`.
- Phase 7C: MCP `mempr://context/{destination}` resources/templates.
- Phase 7D: read-context status observability.
- Phase 7E: read-context expiry warnings.
- Phase 7F: permissioned read-governance boundary.
- Phase 7G: static read actor/permission contract.
- Phase 7H: opt-in read-context allowed-scope constraint.
- Phase 7I: opt-in read-context `validUntil` constraint.
- Phase 7J: opt-in read-context conflict/supersession exclusion constraints.
- Phase 7K: optional non-secret read-context permission-denied evidence.
- Phase 7L: caller-asserted actor identity/auth boundary.

## R1-R11 Completion Map

R1-R11 are now shipped for the local-first 1.0 boundary. Further work should use
new ADRs for concrete changes rather than extending Phase 7 alphabetically.

R1: audit integrity and replay proof

- Schema-versioned event hashes, record hashes, hash-chain links, policy-config
  hashes, hash drift reporting, and repair-from-events are shipped.
- Cross-file transactions, signatures, and compliance-grade audit claims remain
  out of scope.

R2: source-trust scoring and policy-version proof

- `untrusted` now requires review; `trusted` does not bypass blockers.
- Source truth/safety and implicit trust inference are not claimed.

R3: actor, reviewer, and caller identity foundation

- Local Ed25519 read principals are shipped for read-policy gates.
- Reviewer identity and hosted multi-user identity remain out of scope.

R4: permission policy storage and evaluation

- `.mempr/read-policy.json` allow/deny evaluation with deny precedence and
  malformed-policy fail-closed behavior is shipped.

R5: auth-backed read enforcement

- Read surfaces are gated when `.mempr/read-policy.json` exists.
- Denials remain content-free and no-side-effect.

R6: denied-response diagnostics, logging, and audit boundaries

- Explicit diagnostics, correlation IDs, redacted support bundles, and
  `.mempr/diagnostics.jsonl` separation are shipped.
- Must not leak hidden record existence, grants, actor secrets, memory text, or
  policy internals.

R7: scanning and redaction

- Accepted-memory boundary scanning is shipped: secret-like content blocks,
  sensitive content warns, marker values are recognized.
- Automatic redaction and safety/non-sensitivity claims remain out of scope.

R8: relationship lifecycle and graph policy

- Incoming-link analysis, cycle detection, explicit retirement,
  accept-and-retire, maintainer override evidence, and history are shipped.
- Must not silently delete, hide, or rewrite accepted memory.

R9: live store and workflow adapters

- Dry-run/confirmed live sync, fake no-network adapter, credential-gated Mem0,
  LangGraph, LLM-wiki, custom adapters, idempotency, retries, downstream ID
  reconciliation, and partial-failure reports are shipped.
- Provider-specific payload hardening and rollback posture remain follow-up work.

R10: self-hosted MCP HTTP transport

- `mempr-mcp-http` is shipped with protected-resource metadata, Bearer token
  audience/scope checks, Origin/Host defenses, Accept validation, and rate
  limiting.
- Hosted SaaS security claims remain out of scope.

R11: release hardening and project completion

- Package version `1.0.0`, package smoke tests, migration guide, release
  checklist, security checklist, and deprecation policy are shipped.

Scope-change work is outside the default backlog until a product-scope ADR
accepts it:

- retrieval ranking, vector search, embeddings, knowledge graphs
- hosted service or multi-user approval workflows
- model-assisted memory classification
- third-party memory-store security guarantees
- compliance-grade audit, legal retention, or regulated-data guarantees

## Recommended Next Move

Do not start implementation by saying "Phase 7M." The post-1.0 product slice
ADRs now live at ADR-0036 through ADR-0043 and remain `Proposed`. The right next
session move is to accept, revise, or reject a specific proposed ADR before
implementing that slice.

## Guardrails For The Next Session

- Keep using `rg`/`rg --files` for repo inspection.
- Use `apply_patch` for manual edits.
- Do not revert user or previous-agent changes.
- Treat README, PRD, ADR index, and council docs as coupled when public claims
  change.
- Any feature that touches identity, auth, policy, redaction, live stores,
  remote MCP, or audit/security/compliance claims needs a council pass before
  implementation.
- For MCP or OpenAI/API related current facts, verify against primary/official
  sources before changing claims.
- Keep no-content/no-side-effect denial behavior intact unless a new ADR
  explicitly supersedes it.
- Keep exact-destination, accepted-only, TTL blocker, and accepted relationship
  blocker behavior intact for read-context and export paths.

## Known Worktree Shape

`main` is expected to be clean after the publication and docs-polish merges.
Important recent docs/files include:

- `docs/prd.md`
- `docs/adr/README.md`
- `docs/adr/0029-read-actor-identity-auth-boundary.md`
- `docs/council/2026-05-22-remaining-backlog-solidification-pass.md`
- `docs/council/2026-05-22-post-1-0-product-slices-council.md`
- `docs/adr/0036-live-adapter-compatibility-and-rollback.md`
- `docs/adr/0037-scanner-configuration-and-redaction-policy.md`
- `docs/adr/0038-diagnostics-retention-and-audit-log-boundary.md`
- `docs/adr/0039-reviewer-identity-and-multi-user-approval.md`
- `docs/adr/0040-hosted-service-deployment-boundary.md`
- `docs/adr/0041-retrieval-ranking-vector-search-and-knowledge-graph.md`
- `docs/adr/0042-model-assisted-memory-classification.md`
- `docs/adr/0043-compliance-and-legal-retention-boundary.md`
- `src/read-permissions.ts`
- `src/mcp-contract.ts`
- `test/read-permissions.test.js`
- `test/context.test.js`
- `test/cli.test.js`
- `test/mcp-contract.test.js`
- `test/mcp-readonly.test.js`

Before finalizing any future slice, report both verification results and the
specific files changed. Do not imply files are staged or committed unless that
actually happened.
