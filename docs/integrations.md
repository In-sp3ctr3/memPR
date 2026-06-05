# Integrations

MemPR is the write-control and review layer for durable AI memory. It can sit in
front of memory databases, vector stores, knowledge bases, agent frameworks, or
plain Markdown context files.

MemPR does not replace Mem0, LangGraph memory, vector databases, Obsidian, or
wiki systems. It decides what may become durable memory before downstream tools
store, retrieve, or sync it.

## Local Files

Accepted memories can be exported into managed blocks in local files such as
`AGENTS.md`, `CLAUDE.md`, and `MEMORY.md`.

Use:

```bash
mempr export --destination AGENTS.md
mempr diff-export --destination AGENTS.md
mempr guard --destination AGENTS.md
```

Managed blocks are encoded to prevent marker injection, and destinations are
validated as repository-relative local paths.

## Suggestion Ingestion

`mempr suggest` can derive candidate memories from:

- local transcript files;
- local git diffs;
- existing memory files outside MemPR managed blocks;
- a single observation string.

Suggestions are deterministic and local. They do not call external APIs and do
not use an LLM.

## Live Adapters

Live adapter sync remains confirm-gated. Use dry runs before confirmed writes:

```bash
mempr sync-live --adapter fake --dry-run
mempr sync-live --adapter fake --confirm
```

Future adapter-specific contracts should be captured in ADRs before
implementation.

## MCP

See [MCP integration notes](mcp.md) for stdio and self-hosted HTTP details.
