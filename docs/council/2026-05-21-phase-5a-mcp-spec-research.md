# Phase 5A MCP Spec Research Council

**Date:** 2026-05-21
**Scope:** Official MCP `2025-11-25` requirements relevant to MemPR's planned
local MCP surface before implementation.

## Goal

Verify the current official MCP requirements before Phase 5 implementation and
turn them into narrow MemPR recommendations for a local-first server exposing
the existing CLI lifecycle through MCP tools and constrained resources.

## Source Boundary

Spec facts below are drawn from official Model Context Protocol pages only:

- [Specification index](https://modelcontextprotocol.io/specification)
- [Key changes](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- [Base protocol overview](https://modelcontextprotocol.io/specification/2025-11-25/basic)
- [Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [Resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [Logging](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging)
- [Roots](https://modelcontextprotocol.io/specification/2025-11-25/client/roots)
- [Security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
  is official guidance, but not the normative spec. Findings from that page are
  labeled as security guidance or MemPR inference.

## Council Pass 1: Before Research

### Contrarian

The riskiest Phase 5A failure is treating MCP as a safety layer. MCP standardizes
transport, lifecycle, tools, resources, auth, and logging, but MemPR still owns
write authorization, confirmation, export boundaries, URI allowlists, output
redaction, and contract tests.

### First Principles

MemPR needs a local agent surface for the same lifecycle already present in the
CLI: propose, inspect/list, review decision, and export context. The minimum
secure surface is not "read any file and run any command"; it is a typed facade
over MemPR records and export operations.

### Expansionist

If Phase 5 pins a disciplined tool/resource contract now, later hosted HTTP,
proxy, and adapter work can reuse the same schemas, scopes, and safety gates.

### Outsider

A maintainer should understand that MCP support means "another way to review and
act on MemPR records," not a broad filesystem browser, generic shell, or hidden
memory daemon.

### Executor

Research the official spec, separate normative requirements from local
recommendations, and produce an ADR-ready checklist. Do not edit implementation
files in this pass.

## Official Spec Findings

### Latest Version

- `/specification` currently redirects to `2025-11-25` and labels it latest.
- The `2025-11-25` key-changes page says it lists changes since `2025-06-18`.
- Phase 5 should pin `protocolVersion: "2025-11-25"` in the MCP ADR and require
  one final spec check immediately before implementation or release.

### JSON-RPC and Lifecycle

- All client/server messages must follow JSON-RPC 2.0. Request IDs must be
  string or integer, non-null, and not reused by the same requestor in the same
  session.
- All implementations must support the base protocol and lifecycle management.
- Initialization is capability negotiation: the client sends `initialize`, the
  server returns protocol version, capabilities, implementation metadata, and
  optional instructions, then the client sends `notifications/initialized`.
- After initialization, both sides must respect the negotiated protocol version
  and use only successfully negotiated capabilities.
- The spec recommends timeouts for all sent requests and cancellation after
  timeout to avoid hung connections and resource exhaustion.

### Transport and Local Stdio

- MCP defines two standard transports: `stdio` and Streamable HTTP.
- The `stdio` transport launches the server as a subprocess; messages flow over
  stdin/stdout, are newline-delimited JSON-RPC messages, and must not contain
  embedded newlines.
- A stdio server may write UTF-8 logs to stderr, but must not write non-MCP
  content to stdout.
- HTTP has additional obligations: single MCP endpoint supporting POST/GET,
  Origin validation to prevent DNS rebinding, localhost binding when local, and
  proper authentication.

### Tools

- Tools are model-controlled; a model can discover and invoke them. The spec
  does not mandate a UI pattern, but says there should always be a human in the
  loop with the ability to deny tool invocations.
- Servers that support tools must declare the `tools` capability.
- Tools are listed through `tools/list` and called through `tools/call`.
- Each tool has a unique name, description, valid JSON `inputSchema`, optional
  `outputSchema`, optional annotations, and optional execution metadata.
- Tool annotations are behavior hints and clients must treat them as untrusted
  unless they come from trusted servers.
- If `outputSchema` is provided, servers must return structured results that
  conform to it; clients should validate structured results.
- `structuredContent` is a JSON object in a tool result. For compatibility, a
  tool returning structured content should also return serialized JSON in a text
  content block.
- Tool execution errors should be returned as tool results with `isError: true`;
  malformed protocol requests remain JSON-RPC errors.
- Tool security requires server-side input validation, access controls, rate
  limiting, and output sanitization. Clients should confirm sensitive operations,
  show tool inputs before invocation, validate results, apply timeouts, and log
  tool usage.

### Resources and URI Schemes

- Resources expose contextual data to clients and are uniquely identified by
  URI.
- Resources are application-driven; host applications decide how to include them
  in context.
- Servers that support resources must declare the `resources` capability.
- Clients discover resources through `resources/list`, read content with
  `resources/read`, and can use resource templates from
  `resources/templates/list`.
- Resource content can be text or binary. Binary data must be encoded.
- The spec defines common schemes including `https://`, `file://`, and
  `git://`, and allows custom URI schemes if they comply with RFC 3986.
- Resource security requires servers to validate all resource URIs, check
  permissions before operations, and implement access controls for sensitive
  resources.

### Authorization

- MCP authorization is optional overall, but when supported it is an HTTP-based
  framework.
- HTTP transport implementations should conform to MCP authorization. Stdio
  implementations should not follow the HTTP authorization spec and should get
  credentials from the environment.
- For HTTP, MCP servers must advertise authorization-server location through
  protected-resource metadata discovery, and clients must support the discovery
  mechanisms.
- Tokens must be sent with the Authorization header, not the URI query string.
- MCP servers must validate that access tokens were issued specifically for that
  MCP server/resource and must reject or avoid token passthrough.
- Runtime insufficient-scope errors should use `403` plus a
  `WWW-Authenticate` challenge naming required scopes.

### Logging

- Servers that emit MCP log notifications must declare the `logging` capability.
- Clients may set minimum log level through `logging/setLevel`; servers send log
  notifications using `notifications/message`.
- Logging uses syslog-style severity levels.
- Servers should rate-limit log messages and remove sensitive information.
- Log messages must not contain credentials, secrets, personal identifying
  information, or internal system details that could aid attacks.

### Roots

- Roots are a client feature for exposing filesystem boundaries to servers.
- Root URIs must be `file://` URIs in the current spec.
- Clients must expose only permitted roots, validate root URIs against path
  traversal, implement access controls, and monitor accessibility.
- Servers should respect root boundaries and validate paths against provided
  roots.

## Council Pass 2: After Source Review

### Contrarian

The spec permits `file://` resources and resource templates, which is exactly
where MemPR could accidentally become an arbitrary file passthrough. A
`file:///{path}` template would satisfy the protocol but violate Phase 5 exit
criteria.

### First Principles

The MCP server should expose MemPR domain objects, not the host filesystem.
Resources should be stable views over records, inboxes, histories, policy
summaries, and export previews.

### Expansionist

Structured output schemas are an advantage: MemPR can make tool results easy to
contract-test and safe for host clients to validate without relying on prose.

### Outsider

The user-facing distinction should be plain: read tools inspect MemPR state;
write tools propose or change MemPR review state; export tools prepare context
and require confirmation.

### Executor

Recommend stdio-only first, no HTTP auth surface yet, no generic resource
templates, no arbitrary path input, static tool definitions, explicit schemas,
and separate MCP logs from `.mempr/events.jsonl`.

## MemPR Phase 5A Recommendations

### Transport and Versioning

- Ship `stdio` first only. Do not implement Streamable HTTP, remote server mode,
  proxy mode, SSE, sessions, or OAuth in the first MCP release.
- Pin MCP `2025-11-25` in the future MCP ADR and contract tests.
- Use an SDK or a narrow protocol wrapper that enforces JSON-RPC IDs, lifecycle
  ordering, negotiated capabilities, newline-delimited stdio, request timeouts,
  and protocol-vs-tool error distinctions.
- Keep all ordinary logs on stderr or MCP logging notifications; stdout must
  contain only MCP messages.

### Tool Contract

- Start with static, reviewed tools only:
  - `mempr_propose`
  - `mempr_list`
  - `mempr_inspect`
  - `mempr_history`
  - `mempr_review`
  - `mempr_accept`
  - `mempr_reject`
  - `mempr_export_preview`
  - `mempr_export`
- Mark annotations as advisory only; do not rely on them for policy.
- Every tool needs an `inputSchema`; every non-trivial tool should have an
  `outputSchema` and return `structuredContent`.
- For compatibility, structured tool results should also include a redacted text
  summary.
- Mutating tools and export tools must validate inputs server-side, produce
  `isError: true` business errors for policy failures, and avoid dumping full
  unrelated record contents in errors.

### Human Confirmation and Tool Safety

- The spec puts tool confirmation primarily on the host/client, but MemPR should
  still require an explicit confirmation token or two-step flow for
  `mempr_accept`, `mempr_reject`, and `mempr_export`.
- Tool responses for sensitive operations should return a structured preview
  first, including IDs, target status/destination, and non-leaky policy evidence;
  the committing call should require the exact preview token.
- Do not treat model intent, tool annotations, or client-side UI confirmation as
  sufficient authorization for MemPR state changes.

### Resource Contract

- Expose only a constrained `mempr://` namespace. Recommended first resources:
  - `mempr://records`
  - `mempr://records/{id}`
  - `mempr://records/{id}/history`
  - `mempr://inbox`
  - `mempr://policy`
  - `mempr://exports/{destination}/preview`
- Do not expose `file://` resource templates in Phase 5. Do not publish a
  generic `mempr://file/{path}` or `file:///{path}` bridge.
- Treat every URI as untrusted input. Parse with a real URI parser, enforce the
  `mempr` scheme, validate known path shapes, reject traversal-like or encoded
  path confusion, and return `-32002` for unknown resources.
- If roots are used later, treat them as an additional boundary, not permission
  to expose arbitrary repo files.

### Authorization

- For stdio, do not implement the HTTP OAuth authorization flow. If any
  credentials are needed, read them from the environment as the spec expects for
  stdio.
- Before HTTP support, define least-privilege scopes in an ADR. Candidate scope
  split:
  - `mempr:read`
  - `mempr:propose`
  - `mempr:review`
  - `mempr:export-preview`
  - `mempr:export`
- HTTP must stay deferred until Origin validation, localhost binding, auth
  metadata discovery, token audience validation, no token passthrough, step-up
  scope handling, and session security have contract tests.

### Logging and Audit Separation

- MCP logging is operational telemetry, not MemPR's audit/event ledger.
- Keep `.mempr/events.jsonl` limited to MemPR lifecycle events. Do not mirror MCP
  log notifications into the event ledger.
- Redact all MCP logs by default: no memory text, source secrets, credentials,
  tokens, absolute sensitive paths, or unrelated record payloads.
- Log only coarse operation metadata such as tool name, record IDs, status,
  destination, error code, correlation ID, and elapsed time.

### No Arbitrary File Passthrough

This is a MemPR requirement inferred from the spec's resource and roots safety
rules plus Phase 5 exit criteria, not a standalone MCP prohibition. MCP allows
`file://` resources and custom schemes, but it also requires resource URI
validation and permission checks. MemPR should therefore make "no arbitrary
file/resource passthrough" a hard local invariant:

- no generic file read resource
- no generic shell/tool runner
- no path-shaped tool argument except reviewed export destination values already
  governed by MemPR export rules
- no embedded resource content from arbitrary files
- no tool result `resource_link` to arbitrary `file://` URIs

## ADR-Ready Acceptance Criteria

- MCP ADR pins official spec version `2025-11-25` and records a final re-check
  date.
- Server initializes with only negotiated `tools`, constrained `resources`, and
  optional `logging` capabilities.
- Contract tests cover JSON-RPC lifecycle, tool list, tool call, resource list,
  resource read, structured outputs, business errors with `isError: true`, and
  log redaction.
- Contract tests prove `file://`, unknown schemes, traversal-like `mempr://`
  paths, arbitrary path templates, and unrelated file/resource reads are
  rejected.
- Accept, reject, and export require explicit confirmation beyond a single model
  tool call.
- HTTP transport and OAuth scopes remain out of scope until a separate ADR.

## Council Pass 3: Final Adversarial Pass

### Contrarian

The remaining danger is over-specifying behavior the official spec leaves to
hosts, especially confirmation UX. MemPR should require its own two-step
confirmation for sensitive tools because host prompts are important but not a
portable server-side guarantee.

### First Principles

Phase 5A succeeds when it turns MCP from "generic agent access" into a typed
review/export surface over MemPR records. Anything that reads arbitrary files,
runs arbitrary commands, or mutates state without MemPR review semantics is
outside the product boundary.

### Expansionist

The constrained `mempr://` namespace and structured outputs give future
adapters a stable contract: hosted HTTP and proxy mode can add auth scopes later
without redesigning the local domain model.

### Outsider

The memo now makes the important distinction visible: MCP allows many ways to
expose data, but MemPR is choosing a narrow, reviewable subset for safety and
testability.

### Executor

Use this file as supporting research for a future MCP ADR. Implementation should
not start until the ADR pins version, tool schemas, resource URI patterns,
confirmation flow, log redaction, and no-file-passthrough contract tests.

## Deferred Risks

- Host/client UIs vary, so MemPR cannot assume every client will present
  confirmation exactly as desired.
- Stdio local servers still execute with user privileges; installation and
  sandboxing risks are mostly host/client concerns, but MemPR should avoid
  widening filesystem or network access.
- Future HTTP support will introduce OAuth, session, DNS rebinding, and token
  audience risks that are intentionally deferred here.
