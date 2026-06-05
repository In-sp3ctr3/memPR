# MCP

MemPR exposes local MCP tools for agents that need to propose, review, inspect,
or export durable memory.

## Transports

- `mempr-mcp` starts the stdio server for local agent clients. It relies on the
  local client/process boundary.
- `mempr-mcp-http` starts a self-hosted HTTP transport with static bearer-token
  checks, audience checks, host/origin validation, scope enforcement, body size
  limits, and rate limiting.

The HTTP transport is not a full OAuth authorization server. Its protected
resource metadata helps compatible clients understand the resource, but token
issuance and organization authorization remain outside MemPR.

## Mutation Gates

All mutation tools require an explicit `confirm: true` argument:

- `mempr.propose`
- `mempr.propose_from_observation`
- `mempr.review`
- `mempr.live.sync`
- `mempr.export`

Read tools do not write ledger, event, or destination files.

`confirm: true` is a protocol-level mutation guard. It is not proof of human
approval. Human approval must be enforced by the MCP host/client UI or an
external policy layer.

## Proposal Safety

Proposal blocking is shared with the CLI. Secret-like memory text, source URI,
quotes, destinations, tags, retention labels, applies-to paths, relationship
metadata, review reasons, reviewer labels, and other persisted
user-controlled fields are scanned before writes. Blocked proposal events store
hashes and redacted previews only.

Tool schemas include source verification fields:

- `verifySource`
- `sourceLineStart`
- `sourceLineEnd`
- `sourceHash`
- `gitCommit`

`gitCommit` is stored as caller-supplied provenance metadata. MemPR does not
yet verify source content against that commit.

Tool schemas also include richer memory metadata:

- `kind`
- `tags`
- `confidence`
- `retentionClass`
- `priority`
- `appliesToPaths`

## Suggestion Tools

`mempr.suggest` returns local deterministic suggestions without writes.
`mempr.propose_from_observation` turns observation suggestions into confirmed
proposals only when `confirm: true`.
`mempr.preview_memory_diff` classifies a candidate proposal without writing.
`mempr.request_human_review` formats a review prompt for an existing pending
record.
