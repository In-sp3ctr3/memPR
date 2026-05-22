# Phase 5C MCP Read-Only Handler Council

**Date:** 2026-05-21
**Scope:** Documentation and adversarial review for read-only MCP handler
support after the Phase 5B local stdio skeleton.

## Goal

Document Phase 5C only if the implementation has actually shipped read-only
MCP handlers:

- `tools/call` for `mempr.list`
- `tools/call` for `mempr.inspect`
- `tools/call` for `mempr.history`
- `tools/call` for `mempr.check`
- `resources/read` for constrained `mempr://` projections

Phase 5C must not document or imply support for `mempr.propose`,
`mempr.review`, or `mempr.export` mutations. It must not expose arbitrary
files, URLs, repositories, raw ledger lines, raw event payloads, HTTP/OAuth,
prompts, sampling, elicitation, proxy behavior, or audit/security guarantees.

## Current Implementation Finding

The first source inspection found the Phase 5B skeleton still in place.
`src/mcp-server.ts` handled `initialize`, `notifications/initialized`, `ping`,
`tools/list`, `resources/list`, `resources/templates/list`, and
`logging/setLevel`, without `tools/call` or `resources/read`.

A later inspection saw partial `tools/call` and `resources/read` cases appear
in `src/mcp-server.ts`, but `npm run build` failed on unresolved helper
functions and type errors in that same file. The observed partial handler code
therefore was not buildable or test-verified at that point.

A final inspection saw the read-only handler helpers and tests completed.
`npm test` passed 104 tests, including MCP read-only `tools/call`, mutation
blocking, constrained `resources/read`, and URI rejection coverage.
`src/mcp-server.ts` exposed the intended read-only `tools/call` subset and
constrained `resources/read` behavior. README, PRD, and ADR docs were then
updated to mark Phase 5C as a read-only local stdio slice, not a mutation,
HTTP/OAuth, proxy, arbitrary resource, or audit/security slice.

## Acceptance Criteria Before Shipped Docs

- `tools/call` accepts only read-only tools: `mempr.list`, `mempr.inspect`,
  `mempr.history`, and `mempr.check`.
- `tools/call` rejects `mempr.propose`, `mempr.review`, `mempr.export`,
  unknown tools, and maintenance mutations.
- `resources/read` accepts only reviewed `mempr://` projections.
- `resources/read` rejects arbitrary `file://`, `git://`, `http://`,
  `https://`, path traversal, repository path, raw ledger, and raw event
  passthrough attempts.
- Read-only handlers return projections of MemPR state, not raw source files,
  destination files, complete unrelated memory payloads, or event payloads.
- No HTTP/OAuth, prompts, sampling, elicitation, proxy mode, or upstream MCP
  aggregation is introduced.
- Docs describe MCP logs as operational telemetry only and avoid
  compliance-grade, tamper-proof, identity, authorization, or security
  overclaims.

## Council Pass 1: Before Docs

### Contrarian

The dangerous failure is saying Phase 5C is implemented because the contract
lists read-only tools. Contract metadata is not the same as callable
`tools/call` behavior, and `mempr://` resource listing is not the same as safe
`resources/read` projection handling.

### First Principles

The actual question is whether an MCP client can read MemPR state through
reviewed local projections without gaining a mutation path or arbitrary file
read path. The inspected server does not yet expose that behavior.

### Expansionist

Phase 5C can be a strong next slice if it stays read-only. It would make local
agent inspection useful while keeping propose/review/export mutations, OAuth,
and broader resource behavior out of the release.

### Outsider

A maintainer reading the docs should get a plain answer: Phase 5B discovery is
present, but Phase 5C read-only calls are not present in the inspected code.

### Executor

Record this finding and avoid shipped-language edits in README, PRD, or
ADR-0017 unless later inspection shows `tools/call` and `resources/read`
handlers exist.

## Interim Consensus

Do not document Phase 5C as shipped from the current implementation snapshot.
Keep public docs at Phase 5B shipped status and reserve Phase 5C shipped claims
for a later pass that can point to buildable handlers and passing tests.

## Council Pass 2: After Docs

### Contrarian

The partial source change makes the docs riskier, not safer. Seeing
`tools/call` and `resources/read` cases in the switch could tempt a shipped
claim, but the build currently fails and the initialized server instructions
still describe tool calls and resource reads as not implemented.

### First Principles

Documentation should describe an executable product boundary. A non-building
handler draft is implementation intent, not shipped behavior. The public docs
should keep Phase 5B as the current MCP status until compile and contract tests
prove otherwise.

### Expansionist

The attempted shape is directionally close to the intended Phase 5C slice:
read-only `mempr.list`, `mempr.inspect`, `mempr.history`, `mempr.check`, and
constrained resource reads. Once it builds, the docs can promote that exact
scope without reopening propose/review/export mutations.

### Outsider

The plain user-facing answer remains: the installed/shippable MCP surface is
not ready for read-only calls yet. The council note can say why without
requiring readers to interpret TypeScript errors.

### Executor

At that point, leave README, PRD, and ADR shipped-language unchanged. Rerun
source/docs searches before finalizing, because another worker may complete the
handlers while this docs pass is active.

## Council Pass 3: Final Adversarial Review

### Contrarian

The final docs must not let "read-only MCP" sound like a safe disclosure
boundary. `mempr.list`, `mempr.inspect`, `mempr.history`, and `resources/read`
can still reveal local memory contents. They are read-only with respect to
MemPR state mutation, not privacy guarantees.

### First Principles

The product fact now worth documenting is narrow: local stdio MCP can initialize
and discover contracts, can call four read-only handlers, and can read
constrained `mempr://` projections. It still cannot propose memory, accept or
reject memory, export memory, authenticate HTTP clients, proxy upstream MCP
servers, or provide audit-grade evidence.

### Expansionist

Phase 5C is useful because agents can inspect records and consistency state
without gaining write access. This makes MCP integration more practical while
keeping future mutation confirmation, actor identity, and HTTP/OAuth as
separate decisions.

### Outsider

The README now gives the plain distinction: Phase 5B was discovery, Phase 5C is
read-only calls and constrained resource reads, and write-side MCP tools remain
later.

### Executor

Finalize the docs as a read-only shipped slice, with the passing Phase 5C tests
noted as verification: read-only tool success, mutation-tool rejection,
constrained resource reads, and arbitrary URI rejection.

## Final Consensus

Document Phase 5C as implemented only in the narrow read-only sense:
`tools/call` for `mempr.list`, `mempr.inspect`, `mempr.history`, and
`mempr.check`, plus constrained `resources/read` for `mempr://` projections.
Keep `mempr.propose`, `mempr.review`, `mempr.export`, arbitrary resources,
HTTP/OAuth, prompts, sampling, elicitation, proxy behavior, and audit/security
claims explicitly out of scope.

## Final Outcome

README, PRD, ADR-0017, and this council record now align on the Phase 5C
boundary. The docs do not claim MCP mutations, arbitrary resource passthrough,
HTTP/OAuth, prompts, sampling, elicitation, proxy mode, or audit/security
guarantees.

## Deferred Risks

- Resource projection details need careful review so `mempr://` reads do not
  become raw file or raw event passthrough.
- Even read-only MCP output can disclose sensitive local memory content; docs
  must not present Phase 5C as a privacy or security guarantee.
