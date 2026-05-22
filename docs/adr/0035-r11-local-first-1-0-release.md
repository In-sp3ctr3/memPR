# ADR-0035: R11 local-first 1.0 release

Status: Accepted

## Context

After R1-R10, MemPR needed a credible local-first release boundary with package
smoke coverage, migration notes, and a clear claim freeze.

## Decision

- Set the package version to `1.0.0`.
- Keep Node.js compatibility at `>=20`.
- Ship package bins for `mempr`, `mempr-mcp`, and `mempr-mcp-http`.
- Add package dry-run smoke tests for packed files and bin metadata.
- Add a migration guide for check/migrate/repair and new optional state files.
- Add a release checklist covering compatibility, security checks, claim freeze,
  and deprecation policy.
- Freeze public claims to local-first governance only.

## Consequences

- 1.0 means stable local-first memory review, not hosted collaboration or
  compliance-grade audit guarantees.
- Future breaking changes require ADR, migration note, and release note coverage.

## Verification

- `npm pack --dry-run --json` smoke test.
- Full build/lint/test gates plus `git diff --check`.
