# Phase 5B MCP Stdio Skeleton Council

**Date:** 2026-05-21
**Scope:** Documentation and adversarial review for the first local MCP stdio
server skeleton.

## Goal

Document that Phase 5B ships a deliberately narrow local stdio MCP skeleton.
The shipped slice supports protocol discovery only:

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `resources/list`
- `resources/templates/list`
- `logging/setLevel`

The skeleton does not execute MemPR lifecycle tools yet, does not read resource
contents yet, does not mutate the ledger through MCP, does not expose HTTP or
OAuth, does not pass through arbitrary resources, and does not expose MCP
prompts, sampling, elicitation, or proxy behavior.

## Acceptance Criteria

- Public docs distinguish Phase 5B skeleton support from future callable MCP
  lifecycle tools.
- `tools/list` is described as metadata discovery, not executable tool support.
- `resources/list` and `resources/templates/list` are described as metadata
  discovery, not `resources/read` support.
- `logging/setLevel` is described as accepting the client's minimum log level,
  not as audit logging or MemPR event-ledger writes.
- Docs explicitly keep `tools/call`, resource reads, review/export/propose
  mutations, HTTP/OAuth, arbitrary file/URL/resource passthrough, prompts,
  sampling, elicitation, and proxy mode out of scope.
- References remain aligned with ADR-0017 and the official MCP pages cited
  there: specification, transports, tools, resources, authorization, logging,
  prompts, sampling, and elicitation.

## Council Pass 1: Before Docs

### Contrarian

The easy documentation bug is to say "MCP server shipped" and let readers infer
that agents can now propose, review, export, or read MemPR resources through
MCP. That would be false and risky because `tools/call` and `resources/read`
are not implemented in this slice.

### First Principles

Phase 5B proves protocol shape, not product capability. The minimum coherent
server skeleton should let an MCP client initialize, discover the reserved tool
and resource contracts from ADR-0017, and send a logging level preference
without gaining a mutation path or data-read path.

### Expansionist

This skeleton is still useful because it validates the stdio envelope before
ledger mutations enter the protocol surface. Future workers can add callable
tools against an already-reviewed contract rather than debating HTTP, prompts,
proxying, or arbitrary resources again.

### Outsider

A maintainer skimming README or PRD should understand that `mempr-mcp` exists
for local protocol discovery, but it is not yet a working agent interface for
memory writes, reviews, exports, or resource content.

### Executor

Update README, PRD, and ADR-0017 language to name the exact skeleton methods
and the exact absent methods. Add this council note as the adversarial review
record. Do not edit source, package metadata, or tests.

## Consensus

Document Phase 5B as a local stdio MCP skeleton only. It can initialize, list
tool/resource/template metadata, accept a logging level, and answer ping. It
does not execute `tools/call`, does not implement `resources/read`, and does
not perform MemPR mutations or content reads through MCP.

## Council Pass 2: After Docs

### Contrarian

The documentation still needs to avoid saying "MCP tools shipped" without the
qualifier "listed only." The most dangerous ambiguity is the existing ADR-0017
tool table, which names future lifecycle tools; Phase 5B docs must say those
tools are discoverable contracts, not callable behavior.

### First Principles

The shipped boundary is method-level: JSON-RPC requests for `initialize`,
discovery list methods, `ping`, and `logging/setLevel` are in scope. Anything
that would read MemPR state content or change MemPR state is out of scope until
a later callable-tool implementation.

### Expansionist

Naming the skeleton in the capability matrix creates a cleaner next phase: a
future implementation can add `tools/call` and constrained `resources/read`
incrementally while preserving the same no-HTTP/no-proxy/no-arbitrary-resource
posture.

### Outsider

"Server skeleton" is understandable if immediately followed by the supported
method list. "MCP agent surface" alone is too broad for what shipped.

### Executor

Keep README and PRD concise, add a Phase 5B implementation note in ADR-0017,
and preserve the references to the official MCP docs already cited there.

## Council Pass 3: Final Adversarial Review

### Contrarian

`logging/setLevel` could be misread as durable logging. The docs must say it
accepts a client log-level preference only; it is not `.mempr/events.jsonl`,
audit evidence, or proof that an operation occurred.

### First Principles

The skeleton has no capability to validate human confirmation, enforce OAuth
scopes, read resources, or apply policy-backed mutations. Those claims stay
deferred until actual handlers and tests exist.

### Expansionist

This phase reduces integration uncertainty without opening the high-risk paths.
It gives MCP clients a stable discovery surface and gives maintainers a small
acceptance target for stdio behavior.

### Outsider

The final docs should answer "Can I use this to change memory from an MCP
client?" with a plain "not yet." They should answer "Can my MCP client discover
MemPR's planned shape?" with "yes, locally over stdio."

### Executor

Finalize after `rg` checks confirm the docs mention the shipped skeleton and
the absent `tools/call` / `resources/read` surface, then run formatting/diff
checks and the practical test command.

## Final Outcome

Phase 5B is documented as a local stdio MCP skeleton only. The supported method
surface is `initialize`, `notifications/initialized`, `ping`, `tools/list`,
`resources/list`, `resources/templates/list`, and `logging/setLevel`. Callable
tool mutations, resource content reads, HTTP/OAuth, arbitrary resources,
prompts, sampling, elicitation, proxy mode, and audit/security claims remain
deferred.

## Verification Notes

- `rg` confirmed the docs name the Phase 5B skeleton and the absent
  `tools/call` / `resources/read` surface.
- `git diff --check` and no-index whitespace checks produced no whitespace
  warnings for the touched docs.
- Initial `npm test` during the docs pass reported 91 passing tests and 9
  failing MCP stdio tests because `dist/mcp-server.js` exited without
  responding while tests expected it to serve stdio.
- Integration fixed the entrypoint alignment by making `src/mcp-server.ts`
  serve stdio when executed directly while keeping `mempr-mcp` pointed at the
  thin `src/mcp-stdio.ts` wrapper.
- After that fix, `node --test test/mcp-server.test.js` passed all 9 MCP stdio
  tests.

## References

- [ADR-0017 MCP local agent surface](../adr/0017-mcp-local-agent-surface.md)
- [MCP specification](https://modelcontextprotocol.io/specification)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- [MCP logging](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging)
