# Security Policy

MemPR handles memory proposals and may inspect sensitive text before deciding
whether a record should be accepted, rejected, retired, exported, or synced.
Please treat the project as security-sensitive.

## Supported Versions

| Version | Supported |
| --- | --- |
| 1.x | Supported |
| 0.x prerelease | Best effort legacy support |

Security fixes target the latest supported release and `main`.

## Reporting a Vulnerability

Please do not open a public issue for a vulnerability.

Use GitHub private vulnerability reporting when available. If that is not
available, contact the maintainer through the repository owner profile with:

- a short description of the issue
- steps to reproduce
- expected impact
- affected version or commit
- any relevant logs with secrets and memory text removed

## Scope

Examples of in-scope issues:

- secret-like content being written to durable memory or exports
- read-policy bypasses
- source-trust bypasses
- unsafe memory exports
- path traversal in local file writes
- diagnostics or denial responses leaking memory text
- MCP behavior that leaks memory across scopes or principals
- live adapter sync that ignores confirmation, idempotency, or policy blockers

Out of scope:

- unsupported local modifications
- vulnerabilities in unrelated third-party memory backends
- social engineering outside project infrastructure
- legal retention or compliance certification requests

## Expectations

MemPR is local-first software. It is designed to improve provenance, review, and
policy handling for agent memory, but it does not provide compliance-grade audit
guarantees or hosted security monitoring. Local-key read policy verifies
signatures over request payloads when configured; it does not provide nonce
replay protection or session authentication in MemPR 1.0.
