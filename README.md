# MemPR

[![CI](https://github.com/In-sp3ctr3/memPR/actions/workflows/ci.yml/badge.svg)](https://github.com/In-sp3ctr3/memPR/actions/workflows/ci.yml)
[![CodeQL](https://github.com/In-sp3ctr3/memPR/actions/workflows/codeql.yml/badge.svg)](https://github.com/In-sp3ctr3/memPR/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/In-sp3ctr3/memPR?sort=semver)](https://github.com/In-sp3ctr3/memPR/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)

Pull requests for AI memory.

MemPR is a local-first governance layer for durable agent memory. It helps
developers review, accept, reject, retire, and export memories before they
become long-lived context for agents or memory stores.

Most memory systems focus on storage and retrieval. MemPR focuses on the write
path: where a memory came from, why it was accepted, what policy applied, and
whether it is still safe to export.

## Features

- Review proposed memories before they become durable context.
- Track provenance, source trust, policy versions, and hash-aware events.
- Enforce TTL, relationship, supersession, and read-policy constraints.
- Export accepted memories into managed local destinations.
- Run local MCP stdio and self-hosted MCP HTTP surfaces.
- Dry-run or confirm live sync through fake, Mem0, LangGraph, LLM-wiki, and
  custom adapters.
- Keep diagnostics and support bundles redacted and separate from domain events.

MemPR is local-first. It does not provide hosted SaaS, organization admin UI,
vector search, embeddings, model-assisted classification, legal retention, or
compliance-grade audit guarantees.

## Installation

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
  --source-trust trusted
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

MemPR stores local state under `.mempr/`. That directory is ignored by default
so teams can decide how, when, and whether approved memory state is shared.

## Common Commands

| Command | Purpose |
| --- | --- |
| `mempr propose` | Create a memory proposal. |
| `mempr inbox` | Show records waiting for review. |
| `mempr diff <id>` | Inspect one proposal and its relationship context. |
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

## MCP

MemPR ships two local MCP entrypoints:

```bash
mempr-mcp
mempr-mcp-http
```

The stdio server is intended for local agent integrations. The HTTP server is
self-hosted and requires OAuth-style bearer-token validation, audience checks,
scope checks, origin validation, and rate limiting. Neither entrypoint turns
MemPR into a hosted service.

## Documentation

- [Migration guide](docs/migration-guide.md)
- [Changelog](CHANGELOG.md)
- [Release checklist](docs/release-checklist.md)
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
