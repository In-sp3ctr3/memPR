# MemPR Product Spec

## One-Line Pitch

MemPR gives AI agents pull requests for durable memory writes.

## Core User

The first user is a developer running agentic workflows in tools like Claude
Code, Codex, Cursor, LangGraph, custom MCP agents, or local scripts.

They already understand that memory is useful. Their pain is that memory writes
are hard to inspect, hard to reverse, and hard to trust.

## Root Problem

Memory systems usually optimize for recall. Agent builders still lack a simple
control surface for memory mutation:

- What exactly changed?
- What source justified the change?
- Is this memory scoped to a repo, user, organization, or task?
- Is it sensitive?
- Does it expire?
- Does it conflict with older memory?
- Should it be written automatically, reviewed, or blocked?

MemPR treats every durable memory write as a Memory PR.

## Product Shape

MemPR should be a small local tool with three layers:

1. CLI for humans and scripts.
2. MCP server for agents.
3. Adapters for memory destinations.

The tool should work even if the only destination is a local Markdown file.

## Default Workflow

```txt
1. Agent decides something might be useful to remember.
2. Agent calls `propose_memory`.
3. MemPR opens a Memory PR.
4. Policy classifies the proposal as low, medium, or high risk.
5. Low-risk proposals can be auto-merged.
6. Medium-risk proposals stay open for review.
7. High-risk proposals are closed or require explicit approval.
8. Merged Memory PRs are exported to one or more memory destinations.
```

## Example CLI Flow

```bash
mempr propose "This repo uses pnpm for package management." \
  --source package.json \
  --scope repo \
  --destination AGENTS.md

mempr inbox

mempr diff mpr_01

mempr review mpr_01 --approve --body "Matches repo convention."

mempr merge mpr_01

mempr export --to agents
```

## Example Agent Rule

Add this to an agent instruction file:

```txt
Do not write durable memory directly. When you discover something that may be
useful across sessions, call MemPR to open a Memory PR with a source, scope,
risk level, and destination.
```

## Policy Model

Policy should be boring and inspectable.

```json
{
  "auto_merge": [
    {
      "scope": "repo",
      "risk": "low"
    }
  ],
  "leave_open": [
    {
      "risk": "medium"
    },
    {
      "contains_personal_inference": true
    }
  ],
  "close": [
    {
      "contains_secret": true
    },
    {
      "unsafe_instruction": true
    }
  ]
}
```

## Risk Classes

Low risk:

- formatting preferences
- repo commands
- verified project facts
- non-sensitive workflow preferences

Medium risk:

- broad user preferences
- long-lived project assumptions
- claims derived from summaries
- organization-specific process notes

High risk:

- secrets
- credentials
- medical, financial, legal, or deeply personal facts
- instructions that weaken security checks
- memories sourced from untrusted web content
- subjective judgments about a person

## Destination Adapters

V1 should support:

- local JSONL ledger
- Markdown memory file
- `AGENTS.md`
- Claude-style memory file

Later adapters:

- Mem0
- LLM Wiki repositories
- LangGraph stores
- SQLite
- Postgres

## Non-Goals

MemPR should not begin as:

- a vector database
- a hosted SaaS dashboard
- a full personal knowledge manager
- a replacement for Mem0 or LLM Wiki
- a complex ontology system

The wedge is governance around memory writes.

## V1 Acceptance Criteria

The repo is useful when a developer can:

- install it locally
- open a Memory PR from the CLI
- see a diff-like pending record
- auto-merge low-risk memory
- close high-risk memory
- export merged memory into a Markdown file
- connect an agent through MCP

## Future Direction

Once write governance works, MemPR can expand into read governance:

- warn when memory is stale
- detect conflicting memories
- filter memories by scope
- avoid injecting sensitive memory into untrusted agents
- explain why a recalled memory was selected
