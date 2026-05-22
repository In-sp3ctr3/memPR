# MemPR Local-First 1.0 Release Checklist

This checklist freezes the 1.0 claim boundary for the local-first release line.
It is a release discipline document, not a compliance or legal-retention claim.

## Compatibility

- Node.js support: `>=20`; current smoke coverage runs on the active workspace
  Node runtime.
- Package bins: `mempr`, `mempr-mcp`, and `mempr-mcp-http`.
- No-network default tests: provider adapters are credential-gated; fake live
  adapter and local HTTP MCP tests do not call external services.
- Migration posture: legacy ledgers can be backfilled with `mempr migrate`; a
  drifted current view can be rebuilt from verified events with
  `mempr repair --from-events --confirm`.

## Security Checklist

- Denied read-policy responses must not return memory text, source quotes, hidden
  IDs, grants, or policy internals.
- `.mempr/diagnostics.jsonl` is separate from `.mempr/events.jsonl`.
- Secret-like accepted content blocks context/export boundaries with correlation
  IDs; sensitive accepted content warns without claiming safety.
- `mempr-mcp-http` must validate Bearer tokens, token audience, per-tool scopes,
  Origin, Host, Accept headers, and rate limits.
- Local stdio MCP scope metadata remains protocol metadata only.

## Claim Freeze

MemPR 1.0 claims local-first memory review, deterministic policy gates, current
view plus event replay, local-key read policy, diagnostics/scanning boundaries,
relationship lifecycle, credential-gated live sync, and self-hosted MCP HTTP.

MemPR 1.0 does not claim hosted SaaS, organization admin UI, vector search,
embeddings, model-assisted classification, automatic redaction, third-party
store security, legal retention, or compliance-grade audit guarantees.

## Deprecation Policy

- Keep CLI flags and JSON fields stable across patch releases.
- Additive JSON fields are allowed when old clients can ignore them.
- Breaking CLI/API/MCP changes require a new ADR, migration note, and release
  note before the change ships.
- Deprecated behavior should stay available for at least one minor release unless
  it leaks content, weakens authorization, or corrupts state.
