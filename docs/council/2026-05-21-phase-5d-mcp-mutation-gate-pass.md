# Phase 5D MCP Mutation Gate Council

**Date:** 2026-05-21
**Scope:** Documentation and adversarial review for local stdio MCP mutation
tools gated by explicit `confirm: true` arguments.

## Goal

Update the public Phase 5 MCP documentation so it distinguishes:

- Phase 5C: local stdio read-only `tools/call` handlers and constrained
  `mempr://` resource reads
- Phase 5D: local stdio mutation handlers for `mempr.propose`,
  `mempr.review`, and `mempr.export`, available only when the tool arguments
  include literal boolean `confirm: true`

The docs must keep HTTP/OAuth, prompts, sampling, elicitation, proxy mode,
migration tools, arbitrary file/URL/resource passthrough, identity proof,
signatures, authorization proof, and audit-grade security claims out of scope.

## Council Pass 1: Design Claim

### Decision Being Tested

Phase 5D should be documented as a local stdio mutation slice, not as a remote
authorization or audit slice.

### Council Review

Contrarian: A `confirm: true` flag can be supplied by a local MCP caller. If the
docs call that "human confirmation" too casually, readers may infer identity,
authorization, signature, or non-repudiation that MemPR does not have.

First Principles: The actual boundary is server-side mutation intent. Before
MemPR writes a proposal, review status, export file, or event, the local server
must see an explicit boolean confirmation in the tool arguments.

Expansionist: Keeping the gate at the server boundary gives local agents a
useful write path while preserving a clean future split for identity,
HTTP/OAuth scopes, hosted review, and stronger audit evidence.

Outsider: The docs should say plainly that Phase 5C could read only, while
Phase 5D can write only after `confirm: true`.

Executor: Update README, PRD, and ADR-0017 to state the confirmed mutation
boundary and remove old planned-mutation wording.

### Consensus

Document Phase 5D as confirmed local stdio mutations only. Do not describe the
confirmation flag as proof of who clicked, signed, authorized, or audited the
operation.

## Council Pass 2: Implementation Evidence Needed

### Decision Being Tested

The docs can mention Phase 5D only if the evidence expected from implementation
is concrete enough to verify.

### Council Review

Contrarian: Worker C's first source inspection during this docs pass still
found Phase 5C-era mutation blocking in `src/mcp-server.ts` and no visible
`confirm: true` server gate. A later workspace status and source inspection
showed companion Phase 5D implementation evidence in `src/mcp-server.ts`,
`src/mcp-contract.ts`, and `test/mcp-mutations.test.js`. Because those source
and test changes are owned by other workers, docs must still name the risk of
drift before release.

First Principles: The minimum implementation evidence is not the contract
metadata. It is server behavior: missing, false, string, and otherwise
non-boolean `confirm` values must reject before side effects; `confirm: true`
must reach the same proposal, review, export, policy, event, TTL, and
relationship-governance paths as the CLI lifecycle.

Expansionist: The same tests should prove destination guarding for MCP
propose/export. This keeps confirmed mutation support from becoming arbitrary
file write or URL passthrough.

Outsider: A maintainer should not need to infer safety from code shape. The PRD
and ADR should list the exact evidence expected: confirm gate, no-write failure
modes, CLI-equivalent mutation semantics, and destination rejection cases.

Executor: Document the Phase 5D evidence requirements and name the integration
risk that source/test changes must match these docs before release.

### Consensus

The docs can describe the Phase 5D product boundary because the visible
companion implementation now has concrete confirm-gate and destination-guard
evidence. The residual risk is integration drift, not an undefined design.

## Council Pass 3: Final Documentation Risk

### Decision Being Tested

The final docs should be strict enough that future readers do not mistake
confirmed local mutation support for a broader MCP trust surface.

### Council Review

Contrarian: Adding write tools increases risk even with confirmation. A local
agent can still propose bad memory, accept the wrong record, or export stale
context if another guard fails. The docs must not claim memory safety.

First Principles: The durable facts are narrow: local stdio only, reviewed
tool names, `confirm: true` before write side effects, repo-relative
destinations for propose/export, constrained `mempr://` resource projections,
and no remote auth or proxy behavior.

Expansionist: This documentation sets a stable contract for later adapters and
hosted flows. Future HTTP/OAuth work can add identity and scopes without
rewriting the local mutation semantics.

Outsider: The README needs the shortest possible public distinction: Phase 5C
is read-only; Phase 5D writes only with `confirm: true`; no HTTP/OAuth or file
passthrough exists.

Executor: Run text checks for stale Phase 5C-only claims, destination-guard
wording, deferred MCP features, and Markdown whitespace.

### Consensus

Finalize the docs with explicit Phase 5C versus Phase 5D wording. Keep the
trust boundary honest: `confirm: true` is a local interaction signal, not
identity, signature, authorization, or audit proof.

## Final Outcome

README, PRD, and ADR-0017 now describe Phase 5D as local stdio MCP mutation
tools gated by explicit `confirm: true` at the server boundary. They also name
the MCP-level destination guard for propose/export destinations: repo-relative
only, with absolute paths, traversal, backslashes, and URL-like destination
strings rejected.

Verification after the docs pass ran `npm test`; 110 tests passed, including
the Phase 5D mutation confirmation and destination-guard coverage.

## Residual Risks

- Companion implementation and tests were inspected but not edited by Worker C;
  they must remain aligned with these docs before release.
- A local caller can still provide `confirm: true`; the flag is not identity,
  authorization, signature, or audit evidence.
- Confirmed mutation tools can still write bad memory if policy, review, TTL,
  or relationship checks are bypassed or regress.
- Destination validation must stay centralized so future adapters do not loosen
  the repo-relative/no-file-or-URL-passthrough boundary.
- Future HTTP/OAuth, prompts, sampling, elicitation, proxy mode, and hosted
  review flows need separate threat modeling and ADR updates.
