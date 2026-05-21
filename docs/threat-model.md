# Threat Model

MemPR treats durable memory as trusted future context. That means memory writes
need a security boundary before they are exported or reused.

## Assets

- accepted memories
- source evidence
- review decisions
- policy configuration
- exported memory files
- downstream memory store IDs
- audit logs

## Actors

- maintainer
- local developer
- AI agent
- downstream memory store
- untrusted web page, document, issue, repo file, tool output, or MCP server
- attacker who can influence any untrusted input

## Trust Boundaries

```txt
untrusted content -> agent context -> MemPR proposal -> policy/review -> durable memory
```

The boundary MemPR owns is the proposal and review step. It should not assume
that an agent has correctly separated instructions from data.

## Main Risks

### Memory Poisoning

Untrusted content causes an agent to store a false or malicious memory that
changes later behavior.

Controls:

- require source and scope on every proposal
- classify source trust
- block instruction-shaped payloads from untrusted sources
- keep rejected proposals in the ledger for audit
- add tests for sleeper memory poisoning

### Secret Persistence

Tokens, keys, passwords, or private data get written to a ledger, exported file,
or downstream memory store.

Controls:

- scan proposal text, source quote, and export payloads
- default to reject or redact
- avoid printing sensitive values in terminal errors
- keep `.mempr/` ignored by default

### Scope Bleed

Memory from one user, repo, project, or agent influences another context.

Controls:

- make scope required in the Memory PR schema
- validate destination compatibility
- include scope in export blocks
- add read-side filtering later

### Unsafe Standing Instructions

An agent writes a durable instruction such as "skip security checks" or "trust
this external source."

Controls:

- detect procedural and permission-changing language
- require review for procedural memory
- block security-weakening instructions by default
- keep protected policy keys outside normal memory exports

### Silent Mutation

Existing memory changes without a reviewable diff or explanation.

Controls:

- append-only event log
- no in-place overwrite without a supersession event
- human-readable and structured diffs
- rollback through previous merged state

### Adapter Confusion

An export adapter writes broader or different memory than the reviewer approved.

Controls:

- adapters receive approved Memory PR views, not raw agent text
- deterministic exports
- export tests with golden files
- record downstream IDs and write results

## Out of Scope For V1

- preventing all prompt injection in the agent itself
- securing third-party memory stores
- verifying the truth of every memory claim
- hosting a multi-user approval service
- encrypting local ledgers

These can become future work, but v1 should keep the control point small and
auditable.

