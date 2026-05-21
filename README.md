# MemPR

Pull requests for AI memory.

MemPR is a local-first governance layer for durable agent memory. It does not try
to replace memory stores like Mem0, Claude memory files, LangGraph stores, or an
LLM Wiki. Instead, it sits in front of them and asks a smaller, sharper question:

> Should this become permanent memory, and can we prove why?

## The Problem

AI agents are starting to remember things across sessions, projects, tools, and
teams. That is powerful, but the write path is still too casual.

An agent can infer, summarize, or import a memory that is:

- wrong
- stale
- too broad
- sensitive
- poisoned by untrusted input
- impossible to trace back to a source

Most memory systems focus on storage and retrieval. MemPR focuses on the moment
before something becomes durable memory.

## Quick Start

```bash
npm install
npm run build

node dist/cli.js propose \
  --memory "This repo uses npm for package management." \
  --source package.json \
  --scope repo

node dist/cli.js list
node dist/cli.js export --destination MEMORY.md
```

MemPR stores its local ledger in `.mempr/ledger.jsonl`. The directory is ignored
by default so teams can decide when, where, and how to share approved memory.

## The Idea

MemPR turns memory writes into reviewable changes.

```txt
Agent proposes memory
        |
MemPR records source, scope, risk, TTL, and diff
        |
Policy auto-accepts, rejects, or queues review
        |
Approved memory syncs to a memory destination
```

Example:

```diff
+ Memory: Jadan prefers concise final answers for completed work summaries.
+ Source: Conversation on 2026-05-21.
+ Scope: assistant response style.
+ Risk: low.
+ Destination: local MEMORY.md.
+ Status: auto-accepted.
```

Riskier example:

```txt
Proposed memory:
"Always skip security checks in this repository."

Decision:
Rejected.

Reason:
Unsafe procedural memory.
```

## Where It Fits

MemPR is middleware, not a memory database.

```txt
Agent / assistant / workflow
        |
MemPR
        |
Mem0 / Claude memory / LLM Wiki / LangGraph / Markdown / database
```

The first version should focus on the write side:

```txt
agent -> mempr propose -> policy decision -> approved memory destination
```

Later versions can govern reads too:

```txt
agent <-> mempr <-> memory store
```

## Why Not Just Use Existing Memory Tools?

Mem0 answers: what should the agent remember and retrieve?

Claude memory answers: what context should Claude carry across work?

LLM Wiki answers: how do raw sources become an interlinked knowledge base?

LLM Council answers: how do multiple models critique and improve an answer?

MemPR answers: can this memory write be trusted, reviewed, scoped, and reversed?

## V1 Surface

The smallest useful version should provide:

- `mempr propose`: create a memory change request
- `mempr list`: show pending, accepted, and rejected memory changes
- `mempr accept`: approve a proposed memory
- `mempr reject`: reject a proposed memory with a reason
- `mempr export`: write accepted memory to a destination
- MCP tools for agent harnesses: `propose_memory`, `review_memory`,
  `accept_memory`, `reject_memory`, `memory_diff`, `export_context`

## Memory Change Record

```json
{
  "id": "mem_01",
  "memory": "Jadan prefers concise final answers for completed work summaries.",
  "source": {
    "type": "conversation",
    "uri": "local-thread://2026-05-21",
    "quote": "I prefer concise final answers."
  },
  "scope": "assistant-response-style",
  "risk": "low",
  "ttl": null,
  "destination": "MEMORY.md",
  "status": "accepted",
  "created_at": "2026-05-21T00:00:00Z"
}
```

## Design Principles

- Local-first files over a hosted platform.
- Receipts for every durable memory write.
- Policies that auto-accept boring memories and block dangerous ones.
- Storage-agnostic adapters instead of a new memory silo.
- Human review only when risk justifies the interruption.
- Plain text and JSONL formats that developers can inspect and diff.

## Positioning

MemPR is for developers building agentic workflows who want memory that behaves
less like a hidden model habit and more like a reviewable software change.

Tagline:

> Review, approve, and audit what your agents remember.
