# Changelog

All notable changes to MemPR are tracked here.

## v1.0.0 - 2026-06-05

### Security

- Reject hardlinked internal `.mempr` store files, repo-relative file sources,
  suggestion inputs, Git-diff suggestion sources, and existing export
  destinations so linked inodes cannot cross the local repository boundary.
- Block secret-like proposal content and persisted user-controlled metadata
  without raw ledger persistence.
- Make built-in secret-like blocking non-weakenable by user policy config.
- Reject reserved/internal/build/dependency export destinations and non-Markdown
  local export destinations.
- Block accepted records containing secret-like content in any returned string
  field before context, MCP resource, export preview, or live-sync output.
- Prevent failed source verification from auto-accepting low-risk proposals.
- Harden managed Markdown export against marker injection.
- Validate proposal destinations before ledger writes.
- Use atomic writes for local export destinations.
- Harden MCP HTTP body size, token comparison, and root configuration.
- Add shared safety-boundary scanning to ledger, event, CLI, MCP, diagnostics,
  export, and live-adapter surfaces.
- Normalize auditable rejections to `reject_audited`; secret-like blockers use
  `block_no_persist`.

### Added

- Source verification metadata for memory provenance.
- Public SDK entrypoint.
- Memory kinds and richer record metadata.
- `mempr-record-v1` schema versioning for canonical memory records.
- Suggestion ingestion commands.
- Export guard/diff/blame review workflow commands.

## v0.2.0 - 2026-05-22

Local-first safety hardening prerelease.

- Added hash-aware event and ledger integrity checks.
- Added source-trust handling, local principals, and read-policy enforcement.
- Added diagnostics, accepted-memory scanning, and redacted support bundles.
- Added relationship lifecycle operations, retirement, and override evidence.
- Added live adapter dry-run/confirm sync for fake, Mem0, LangGraph, LLM-wiki,
  and custom adapters.
- Added local MCP stdio and self-hosted MCP HTTP entrypoints.
- Added migration, release, ADR, council, and package smoke coverage.

## v0.1.0 - 2026-05-22

Initial CLI preview.

- Added the first memory proposal command surface.
- Added local package metadata and project scaffolding.
