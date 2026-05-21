# Build Plan

MemPR should ship as a small, useful tool before it grows into an integration
platform. The goal is to make durable memory writes reviewable without asking
users to replace their memory store.

## Product Boundary

MemPR owns:

- Memory PR creation
- provenance capture
- policy decisions
- review history
- diffs
- export adapters
- audit logs

MemPR does not own:

- embeddings
- vector search
- chat history storage
- model orchestration
- wiki compilation
- hosted dashboards

## V1 Workflow

```txt
mempr init
mempr propose "Use pnpm for this repo" --scope repo --source package.json
mempr inbox
mempr diff mpr_123
mempr review mpr_123 --approve --body "Matches package manager"
mempr merge mpr_123
mempr export --to memory.md
```

Agent flow:

```txt
agent finds a durable fact
agent calls propose_memory
MemPR creates a Memory PR
policy auto-merges low-risk proposals or leaves them open
approved proposals export to files or downstream memory stores
```

## Milestones

### Milestone 1: Memory PR Core

Deliver:

- `mempr init`
- Memory PR IDs using `mpr_` prefix
- append-only ledger events
- materialized current view
- states: `open`, `merged`, `closed`, `superseded`, `expired`
- commands: `propose`, `inbox`, `show`, `diff`, `review`, `merge`, `close`

Acceptance:

- A user can create, inspect, review, and merge a Memory PR locally.
- A reviewer can explain why a memory exists from the terminal output alone.
- Existing ledger files can be migrated or read without data loss.

### Milestone 2: Policy and Safety

Deliver:

- policy config file
- secret detection
- unsafe instruction detection
- source trust levels
- scope validation
- TTL and expiry support
- conflict and supersession fields

Acceptance:

- Low-risk repo facts can auto-merge.
- Secrets and unsafe standing instructions are blocked.
- Medium-risk personal or procedural memories stay open for review.
- Tests cover poisoning, secrets, scope bleed, stale memory, and conflicts.

### Milestone 3: File Adapters

Deliver:

- `MEMORY.md` adapter
- `AGENTS.md` adapter
- `CLAUDE.md` adapter
- generic Markdown adapter
- JSON export for custom agents

Acceptance:

- Exports are short, scoped, and deterministic.
- Managed blocks can be updated without damaging user-written content.
- Each exported memory points back to a Memory PR ID.

### Milestone 4: MCP Server

Deliver:

- `mempr mcp`
- MCP tools for the Memory PR lifecycle
- read-only MCP resources for open PRs and diffs
- structured tool output
- clear rejection messages for blocked writes

Initial tools:

```txt
propose_memory
list_memory_prs
get_memory_pr
diff_memory_pr
review_memory_pr
merge_memory_pr
close_memory_pr
export_memory_context
```

Acceptance:

- Claude Code, Codex, or another MCP client can propose memory without direct
  file writes.
- Risky writes stay reviewable by default.
- MCP responses include structured IDs and statuses.

### Milestone 5: Downstream Adapters

Deliver:

- Mem0 adapter
- LangGraph store wrapper
- generic MCP proxy adapter
- LLM Wiki file-change adapter

Acceptance:

- MemPR can front a real memory store without becoming that store.
- Approved writes record downstream IDs or file paths.
- Failed downstream exports do not lose the review event.

## Data Model Direction

Use two layers:

1. Append-only event log.
2. Materialized view for current Memory PR state.

Event examples:

```json
{
  "event_id": "evt_123",
  "memory_pr_id": "mpr_123",
  "type": "proposed",
  "created_at": "2026-05-21T00:00:00Z",
  "actor": "agent",
  "payload": {
    "memory": "Use pnpm for this repo.",
    "scope": "repo",
    "source": "package.json",
    "destination": "AGENTS.md"
  }
}
```

Current view example:

```json
{
  "id": "mpr_123",
  "status": "open",
  "memory": "Use pnpm for this repo.",
  "scope": "repo",
  "risk": "low",
  "decision": "auto_merge",
  "source": {
    "type": "file",
    "uri": "package.json"
  },
  "destination": "AGENTS.md",
  "created_at": "2026-05-21T00:00:00Z",
  "updated_at": "2026-05-21T00:00:00Z"
}
```

## Testing Strategy

Use fixtures that look like real agent mistakes:

- secret proposed as memory
- malicious webpage asks agent to remember an instruction
- repo fact changes and supersedes an older memory
- user correction conflicts with existing memory
- project-scoped memory tries to export into user scope
- accepted memory expires
- downstream export fails after merge

Tests should be part of CI and should not require network access.

## Release Shape

Early releases should stay boring:

- npm package
- TypeScript library API
- CLI
- local files
- no hosted service
- no default telemetry

The first public demo should show a coding agent proposing a repo convention,
MemPR reviewing the diff, and approved memory exporting to `AGENTS.md` or
`CLAUDE.md`.

