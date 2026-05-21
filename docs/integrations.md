# Integrations

MemPR should integrate with memory tools without becoming one. The adapter rule
is simple:

> MemPR reviews durable memory writes before a destination stores or exports them.

## File Adapters

### MEMORY.md

Use for local projects and simple agents.

Behavior:

- write a managed block
- include Memory PR IDs
- keep existing user-written content
- avoid dumping the full ledger

### AGENTS.md

Use for Codex and other coding agents that read repo instructions.

Behavior:

- export only repo-scoped memories
- prefer short operational facts
- avoid personal preferences unless explicitly scoped to the repo

### CLAUDE.md

Use for Claude Code project instructions.

Behavior:

- export project instructions and repo conventions
- keep personal preferences out unless destination is user-scoped
- support `.claude/rules/*.md` later for narrower scopes

## Memory Store Adapters

### Mem0

Mem0 should stay the retrieval and personalization layer. MemPR should front
write operations:

```txt
agent -> MemPR proposal -> review/merge -> Mem0 add/update
```

Store the downstream Mem0 memory ID on export success.

### LangGraph

MemPR should wrap long-term store writes, not checkpoint writes.

Target shape:

```txt
BaseStore.put -> MemPR proposal -> approved write -> downstream store
```

Short-term checkpoints are runtime state and should not require Memory PR review.

### LLM Wiki

MemPR should review durable wiki mutations, not compile the wiki.

Target shape:

```txt
source change -> wiki candidate -> MemPR proposal -> approved page update
```

The wiki remains responsible for source ingestion, page generation, and query.

## MCP

MemPR should expose an MCP server and later support proxy mode.

Server mode:

- agents call MemPR tools directly
- resources expose open Memory PRs and diffs
- tools return structured IDs and status

Proxy mode:

- MemPR sits before another memory MCP server
- write-like tools create Memory PRs
- approved writes call the downstream MCP server

MemPR should not rely on implicit MCP session state. Tool calls should carry
explicit Memory PR IDs and destinations.

