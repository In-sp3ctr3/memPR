# ADR-0030: R3-R5 identity and read-policy foundation

**Status:** Accepted  
**Date:** 2026-05-22  
**Deciders:** MemPR maintainers

## Context

Phase 7L intentionally treated `readPermission.actor` as a caller-supplied
label, not identity. R3/R4/R5 need a small runtime foundation that can gate
selected reads without changing existing no-policy behavior or leaking memory
content through denied responses.

## Decision

MemPR accepts a local-only read enforcement foundation:

- Trusted read principals live in `.mempr/principals.json`.
- Principals are local Ed25519 public keys with `id`, `kind: "local_key"`,
  `algorithm: "ed25519"`, `publicKey`, and optional `status`.
- Read requests are signed over deterministic canonical JSON produced from the
  action, surface, resource, destination, scopes, record IDs, filters,
  principal id, optional `signedAt`, and optional `nonce`.
- Read policy lives in `.mempr/read-policy.json`.
- Policy `rules` use `effect: "allow" | "deny"` and optional matchers for
  principals, actions, surfaces, resources, destinations, scopes, and record
  IDs.
- Evaluation is deterministic: malformed policy denies, missing/invalid
  identity denies, matching deny wins over matching allow, and no matching allow
  denies.
- Enforcement is dormant when `.mempr/read-policy.json` is absent.
- Denied read-context/status outputs remain content-free: no records, memory
  text, source quotes, record IDs, policy internals, or principal material.

## Consequences

- Existing default reads remain unchanged unless a workspace opts in by adding
  `.mempr/read-policy.json`.
- CLI read commands accept `--read-principal`, `--read-signature`,
  `--read-signed-at`, and `--read-nonce`.
- MCP read tools accept `readAccess` with `principalId`, `signature`,
  `signedAt`, and `nonce`; `auth` is accepted as a compatibility alias.
- Read policy currently gates ledger read APIs such as list, inspect, history,
  context, context status, export preview, consistency, and MCP resource reads
  that call those APIs.

## Deferred Risks

- `signedAt` and `nonce` are signed but not yet checked against replay windows
  or a nonce store.
- Local files are the trust root; this is not remote OAuth, hosted auth,
  compliance-grade audit, or multi-user administration.
- Relationship graph and live-adapter policy semantics need separate hardening
  before they are treated as permissioned read/write surfaces.
- Denied-response diagnostics are intentionally generic; admin-only diagnostic
  views remain deferred.

## Review Triggers

- Adding new read surfaces or returning memory text from a new tool/resource.
- Changing the principal file schema, signing payload, or policy matcher
  semantics.
- Introducing replay protection, remote HTTP/OAuth, sessions, delegation,
  reviewer identity, or admin diagnostics.
- Expanding denied-response evidence beyond content-free status/code metadata.
