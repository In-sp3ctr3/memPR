<p align="center">
  <img src="docs/assets/mempr-readme-header.png" alt="MemPR - Pull requests for AI memory." width="900">
</p>

# MemPR

[![CI](https://github.com/In-sp3ctr3/memPR/actions/workflows/ci.yml/badge.svg)](https://github.com/In-sp3ctr3/memPR/actions/workflows/ci.yml)
[![CodeQL](https://github.com/In-sp3ctr3/memPR/actions/workflows/codeql.yml/badge.svg)](https://github.com/In-sp3ctr3/memPR/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/In-sp3ctr3/memPR?sort=semver)](https://github.com/In-sp3ctr3/memPR/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)

Pull requests for AI memory.

MemPR is not a memory database. MemPR is the write-control and review layer for
durable AI memory.

MemPR gives AI memory a pull-request workflow. Agents and humans can propose
durable memories, but MemPR decides whether those memories should be accepted,
rejected, expired, blocked without persistence, or exported into downstream
context files such as AGENTS.md, CLAUDE.md, and MEMORY.md.

MemPR does not replace Mem0, LangGraph memory, vector databases, Obsidian, or
wiki systems. It sits before them on the write path.

## Features

- Review proposed memories before they become durable context.
- Track provenance, source trust, policy versions, and hash-aware events.
- Record source verification, memory kind, tags, confidence, priority, reviewer,
  approval, retention, and path-application metadata.
- Suggest candidate memories from local transcripts, git diffs, existing memory
  files, and observations without network or LLM calls.
- Guard pull requests with `diff-export`, `guard`, and `blame` workflows.
- Enforce TTL, relationship, supersession, and read-policy constraints.
- Export accepted memories into managed local destinations.
- Run local MCP stdio and self-hosted MCP HTTP surfaces.
- Dry-run or confirm live sync through fake, Mem0, LangGraph, LLM-wiki, and
  custom adapters.
- Keep diagnostics and support bundles redacted and separate from domain events.

MemPR is local-first. It does not provide hosted SaaS, organization admin UI,
vector search, embeddings, model-assisted classification, legal retention, or
compliance-grade audit guarantees.

## Safety Model

MemPR protects the write path for durable memory:

- secret-like proposal content and persisted user-controlled metadata are
  blocked before raw ledger persistence;
- accepted records are scanned before export/read context assembly;
- local export destinations are repository-relative managed Markdown files
  outside MemPR internals, Git internals, dependencies, build outputs, and
  coverage outputs;
- managed Markdown blocks are encoded to avoid marker injection;
- event history is hash chained for local tamper evidence.

MemPR does not provide compliance-grade audit guarantees, hosted organization
policy, legal retention management, or full OAuth authorization-server behavior.
Local-key read policy verifies signed request payloads when a read-policy file
exists, but MemPR 1.0 does not provide nonce replay protection or session
authentication.

## Installation

Current package metadata is local-first release `1.0.0`.

Install from npm:

```bash
npm install -g mempr
```

Install with Homebrew:

```bash
brew install In-sp3ctr3/tap/mempr
```

Install the latest GitHub release tarball:

```bash
npm install -g https://github.com/In-sp3ctr3/memPR/releases/download/v1.0.0/mempr-1.0.0.tgz
```

Or build from source:

```bash
git clone https://github.com/In-sp3ctr3/memPR.git
cd memPR
npm install
npm run build
```

## Quick Start

Propose a memory:

```bash
mempr propose \
  --memory "This repo uses npm for package management." \
  --source package.json \
  --scope repo \
  --source-trust trusted \
  --verify-source \
  --source-hash <sha256>
```

Review pending memories:

```bash
mempr inbox
mempr diff <id>
mempr accept <id> --reason "Confirmed by maintainer."
```

Export accepted memory into a managed destination:

```bash
mempr export --destination MEMORY.md
```

Check local consistency:

```bash
mempr check
```

Suggest memory candidates from local artifacts:

```bash
mempr suggest --from-git-diff --json
mempr suggest --observation "remember that this repo uses npm" --propose --confirm
```

Guard a pull request:

```bash
mempr diff-export --destination AGENTS.md
mempr guard --destination AGENTS.md
mempr blame <id>
```

MemPR stores local state under `.mempr/`. That directory is ignored by default
so teams can decide how, when, and whether approved memory state is shared.

## Common Commands

| Command | Purpose |
| --- | --- |
| `mempr propose` | Create a memory proposal. |
| `mempr suggest` | Suggest candidate memories from local transcripts, git diffs, memory files, or observations. |
| `mempr inbox` | Show records waiting for review. |
| `mempr diff <id>` | Inspect one proposal and its relationship context. |
| `mempr diff-export` | Compare the current destination file with the accepted-memory export preview. |
| `mempr guard` | CI-friendly check that a destination matches the accepted-memory export preview. |
| `mempr blame <id>` | Show accountability metadata and status changes for one memory. |
| `mempr accept <id>` | Accept a proposal with a reason. |
| `mempr reject <id>` | Reject a proposal with a reason. |
| `mempr retire <id>` | Retire an accepted memory without deleting history. |
| `mempr relationships <id>` | Inspect incoming links, outgoing links, and cycles. |
| `mempr context` | Assemble accepted local read context. |
| `mempr export` | Write accepted memories to one managed destination. |
| `mempr check` | Verify ledger consistency against event replay. |
| `mempr repair --from-events` | Recover the current view from verified events. |
| `mempr diagnostics` | Build a redacted admin support bundle. |
| `mempr sync-live` | Dry-run or confirm live adapter sync. |

Important proposal flags:

- `--verify-source`, `--source-line-start`, `--source-line-end`,
  `--source-hash`, and `--git-commit` attach provenance checks when a memory is
  backed by a local source file.
- `--kind`, `--tags`, `--confidence`, `--retention-class`, `--priority`, and
  `--applies-to-paths` attach richer memory metadata for review and export.
- Secret-like proposal text, quotes, and source metadata are blocked without raw
  ledger persistence. Blocked proposal events store hashes and redacted previews
  only.
- Source verification statuses are `verified`, `failed`, `unverified`, and
  `not_applicable`. Failed verification prevents auto-accept; file evidence must
  match before MemPR records it as verified. `gitCommit` is caller-supplied
  metadata unless a future verifier explicitly checks that commit.

## MCP

MemPR ships two local MCP entrypoints:

```bash
mempr-mcp
mempr-mcp-http
```

The self-hosted HTTP entrypoint is also available as an OCI image:

```bash
docker run --rm -p 3927:3927 \
  -e MEMPR_MCP_HTTP_TOKENS='[{"token":"dev-token","subject":"local","scopes":["mempr.records.read"]}]' \
  -v "$PWD:/workspace" \
  ghcr.io/in-sp3ctr3/mempr:1.0.0
```

The stdio server is intended for local agent integrations. The HTTP server is a
local/self-hosted HTTP transport with static bearer-token checks, audience
checks, per-tool scope checks, protected-resource metadata, host/origin
validation, body-size limits, and rate limiting. It is not a full OAuth authorization server.
Neither entrypoint turns MemPR into a hosted service.

All MCP mutation tools require an explicit `confirm: true` argument. This is a
protocol-level mutation guard, not proof of human approval. Human approval must
be enforced by the MCP host/client UI or an external policy layer. Proposal
tools share the same secret blocking, source verification, destination
validation, and memory-kind schema as the CLI. `gitCommit` is caller-supplied
provenance metadata; MemPR does not yet verify source content against that
commit.

## SDK

The package root exposes the stable local SDK boundary:

```js
import {
  proposeMemory,
  listRecords,
  exportMarkdown,
  assembleReadContext,
  scanPersistentFields
} from "mempr";
```

Avoid deep imports from `dist/`; only package-root exports and `mempr/mcp` are
part of the supported package boundary.

## Documentation

- [Migration guide](docs/migration-guide.md)
- [Integrations](docs/integrations.md)
- [MCP integration notes](docs/mcp.md)
- [GitHub Actions guard](docs/github-actions.md)
- [Changelog](CHANGELOG.md)
- [Release checklist](docs/release-checklist.md)
- [Release hardening audit](docs/release-hardening-audit.md)
- [Architecture decisions](docs/adr/README.md)
- [Product specification](docs/product-spec.md)
- [Threat model](docs/threat-model.md)
- [Council notes](docs/council)

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), keep
pull requests focused, and include tests for behavior changes.

For security reports, please follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## License

MemPR is released under the [MIT License](LICENSE).
