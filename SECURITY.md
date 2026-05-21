# Security Policy

MemPR handles memory proposals and may see sensitive text before deciding whether
to reject it. Treat this project as security-sensitive even though the first
version is local-first.

## Supported Versions

MemPR is pre-1.0. Security fixes will target the latest commit on `main` until
versioned releases begin.

## Reporting a Vulnerability

Please do not open a public issue for a vulnerability.

Use GitHub private vulnerability reporting when available. If that is not
available, contact the maintainer through the repository owner profile with:

- a short description of the issue
- steps to reproduce
- expected impact
- affected version or commit

## Security Scope

Examples of in-scope issues:

- secrets being written to durable memory
- unsafe memory exports
- policy bypasses
- path traversal in local file writes
- MCP tool behavior that leaks memory across scopes

Out of scope:

- unsupported local modifications
- vulnerabilities in unrelated memory backends
- social engineering outside project infrastructure

