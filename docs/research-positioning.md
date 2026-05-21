# Research Positioning

## Claim

MemPR should not claim to be the first memory system for AI agents. That would be
too broad and too easy to challenge.

The stronger claim is narrower:

> Agents need a review layer for durable memory writes.

That makes MemPR complementary to existing memory tools instead of competitive
with all of them.

## Category

MemPR sits in the category of agent trust infrastructure:

- memory governance
- provenance
- policy enforcement
- audit trails
- review workflow
- storage-agnostic memory middleware

## Differentiation

The key distinction:

```txt
Memory store:
What should the agent remember and retrieve?

MemPR:
Should this memory be written, and can we audit why?
```

The public phrase should be:

> Memory PRs for AI agents.

The more technical phrase should be:

> A storage-agnostic governance layer for agent memory writes.

## Why This Matters

As agents become more capable, memory becomes part of the execution environment.
Bad memory is not just a bad note. It can steer future decisions, tool calls,
code changes, and user interactions.

That creates failure modes:

- context drift
- stale project assumptions
- prompt-injection persistence
- accidental storage of secrets
- overbroad personalization
- unreviewable changes to agent behavior

MemPR makes those changes visible before they become durable.

## Best First Demo

The first demo should be intentionally small:

```txt
Claude Code or Codex learns a repo fact
-> proposes it through MemPR
-> MemPR shows the memory diff and source
-> low-risk repo fact is accepted
-> accepted memory exports to MEMORY.md
```

That demo is easy to understand because developers already know pull requests.

## Naming

Recommended project name:

> MemPR

Expanded:

> Pull requests for AI memory.

Why it works:

- short
- developer-native
- clear once explained
- not tied to one memory backend
- leaves room for CLI, MCP, and adapters

Avoid leading with "memory ledger." It is accurate internally, but sounds heavier
and more financial than the product needs to feel.
