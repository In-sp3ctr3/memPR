# ADR-0034: R10 self-hosted MCP HTTP transport

Status: Accepted

## Context

The local stdio MCP server was already useful, but the R10 plan required a
self-hosted Streamable HTTP entrypoint with OAuth-style protected-resource
metadata and real request checks. Hosted SaaS remains out of scope.

## Decision

- Add `mempr-mcp-http` as a package bin.
- Expose a self-hosted HTTP MCP endpoint at `/mcp` by default.
- Expose protected-resource metadata at
  `/.well-known/oauth-protected-resource`.
- Require Bearer tokens on HTTP MCP requests.
- Validate token audience against the configured resource.
- Enforce per-tool least-privilege scopes before dispatch.
- Validate `Origin`, `Host`, and MCP `Accept` headers.
- Add simple per-subject rate limiting and structured JSON error responses.
- Keep local stdio MCP scope metadata as protocol metadata only.

## Consequences

- `mempr-mcp-http` is self-hosted and local-first; it is not a hosted service or
  a general proxy.
- Caller-asserted actor labels and stdio confirmation flags are not HTTP
  authorization proof.
- Prompts, sampling, elicitation, arbitrary URL/file passthrough, and hosted
  security claims remain out of scope.

## Verification

- HTTP subprocess tests cover protected-resource metadata, valid tool listing,
  invalid token, wrong audience, wrong origin, wrong host, insufficient scope,
  invalid Accept headers, and rate limiting.
- MCP contract tests distinguish stdio metadata from HTTP enforcement.
