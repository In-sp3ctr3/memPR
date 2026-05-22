# ADR-0006: Export Boundary and Adapter Contract

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** MemPR maintainers

## Context

Export turns accepted records into future agent context. That makes export a
trust and exfiltration boundary, not a harmless read.

V0.1 only supports generic Markdown export through a managed block and exact
destination filtering. Phase 6A introduces the local file-adapter boundary for
`AGENTS.md` and `CLAUDE.md` without adding live memory-store or network
adapters.

Phase 6B builds on that boundary with adapter-specific local file output for
the two named files. It does not change generic Markdown output, accepted-only
filtering, destination validation, outside-block preservation, or event
semantics.

Phase 6C adds deterministic scope grouping for `AGENTS.md` and `CLAUDE.md`
local output only. It does not change generic Markdown output, accepted-only
filtering, destination validation, outside-block preservation, event semantics,
or read-side governance.

Phase 6D adds local export dry-run/preview before live or downstream adapters.
It previews the same local output a committing export would write while
preserving the same validation and blocking rules and avoiding write/event side
effects.

Phase 6E exposes that same dry-run preview through local stdio MCP as the
read-only `mempr.export.preview` tool. It does not change committing export
semantics, does not append `memory_exported`, and does not make preview an
arbitrary file/resource passthrough.

## Decision

Treat export as a trust-sensitive exfiltration boundary. MemPR must preserve
the invariant that only accepted records are exported and that exports are
deterministic, scoped, local, and testable before live downstream adapters
exist.

Base export contract:

- accepted records only
- exact destination match against the requested destination
- deterministic Markdown managed block bounded by MemPR markers
- stable generic Markdown heading, preamble, and empty-state copy
- stable flat generic Markdown record list, without scope grouping
- preserve user-written content outside the managed block
- include memory text, scope, source URI, source-trust metadata, and record ID
- block expired accepted records and accepted same-destination relationship
  pairs before writing
- emit the normal `memory_exported` event after successful export

Phase 6A local file-adapter contract:

- `AGENTS.md` and `CLAUDE.md` are explicit local file adapters.
- File adapters reuse the base managed-block mechanics and markers.
- File adapters perform export-time destination compatibility checks before
  writing.
- File adapters filter accepted records by exact destination only.
- File adapters preserve user content outside the managed block.
- File-adapter destinations are repo-relative strings only.
- File-adapter destination validation rejects empty destinations, absolute
  paths, traversal or dot segments, backslashes, URL-like schemes, and null
  bytes.
- Golden output tests cover the named file adapters and the preserved managed
  block contract.
- Successful file-adapter exports use the existing `memory_exported` event
  behavior, not a new adapter-specific event type.

Phase 6B adapter-specific local output contract:

- Generic Markdown output remains stable.
- `AGENTS.md` receives deterministic adapter-specific managed-block headings,
  preamble text, and empty-state copy.
- `CLAUDE.md` receives deterministic adapter-specific managed-block headings,
  preamble text, and empty-state copy.
- Adapter-specific output stays inside the MemPR managed block markers and
  preserves user content outside the block.
- Adapter-specific output keeps accepted-only exact destination filtering,
  destination validation, relationship/TTL export blocking, and normal
  `memory_exported` event behavior unchanged from Phase 6A.
- `AGENTS.md` is treated as standard Markdown for agent instructions with no
  required fields; MemPR does not claim that writing this block enforces
  behavior, proves identity, or provides security.
- `CLAUDE.md` is treated as persistent Markdown project context for Claude;
  MemPR does not claim live memory synchronization, identity, authorization,
  security, or read-side governance.
- Empty-state copy must be deterministic and must not imply hidden records,
  live downstream state, or export-time scanning/redaction.

Phase 6C scope-grouped local output contract:

- Generic Markdown output remains stable and flat.
- `AGENTS.md` and `CLAUDE.md` group accepted records by scope inside the MemPR
  managed block for readability.
- Group order is deterministic: `repo`, `project`, `user`, then custom scopes
  alphabetically by scope value.
- Records preserve their filtered input order within each scope group.
- Every rendered record keeps per-record provenance fields, including memory
  text, scope, source URI, source-trust metadata, and record ID.
- Scope grouping changes output organization only. It is not read-side
  governance, scope filtering, permissioning, enforcement, identity, security,
  authorization, or live memory synchronization.
- Phase 6C keeps accepted-only exact destination filtering, destination
  validation, relationship/TTL export blocking, outside-block preservation, and
  normal `memory_exported` event behavior unchanged from Phase 6A and 6B.

Phase 6D local export dry-run/preview contract:

- Dry-run/preview is local preflight only, not a committing export.
- Dry-run/preview uses the same destination validation, adapter compatibility
  checks, accepted-only exact destination filtering, relationship blocking, TTL
  blocking, and rendering path as committing export.
- Dry-run/preview previews exactly what would be written to the requested
  destination after managed-block replacement.
- Dry-run/preview does not write destination files.
- Dry-run/preview does not create parent directories.
- Dry-run/preview does not append `memory_exported` events.
- Dry-run/preview does not imply export-time scanning, redaction,
  authorization, downstream synchronization, read-side governance, or
  compliance/security evidence.

Phase 6E MCP export preview contract:

- `mempr.export.preview` is read-only and separate from the confirmed
  `mempr.export` mutation.
- MCP preview reuses the Phase 6D validation, blocker, adapter, and rendering
  path.
- MCP preview does not require `confirm`, write destination files, create
  directories, or append `memory_exported` events.
- MCP preview rejects unmanaged existing destinations so preview cannot become
  arbitrary repository-file disclosure.

Non-decisions:

- No export-time sensitive-data scanning.
- No export redaction.
- No downstream ID reconciliation.
- No retries/auth contract for live adapters.
- No live network writes.
- No read-side governance.
- No compliance-grade or security-product guarantee.
- No runtime enforcement, identity, or authorization claim from writing
  `AGENTS.md` or `CLAUDE.md`.
- No scope-based permissioning, read-side filtering, or security claim from
  Phase 6C output grouping.
- No live-adapter rehearsal, downstream write reservation, downstream ID
  allocation, or authorization proof from Phase 6D dry-run/preview.

## Options Considered

### Option A: Add Adapters Immediately

Pros:

- More useful demos.
- Faster ecosystem validation.

Cons:

- Risks exporting broader memory than accepted.
- Spreads weak export guarantees across multiple destinations.
- Conflates local file writes with live store/network behavior.

### Option B: Harden Generic Export First

Pros:

- Keeps adapter behavior deterministic.
- Creates reusable tests and invariants.
- Aligns with local-first v0.1 scope.

Cons:

- Slower path to Mem0, LangGraph, and agent-specific files.

### Option C: Phase 6A Local File Adapters First

Pros:

- Validates adapter compatibility without network side effects.
- Gives `AGENTS.md` and `CLAUDE.md` a concrete contract.
- Creates golden tests before live adapters can diverge.

Cons:

- Does not prove retry, auth, or downstream reconciliation behavior for live
  adapters.
- Leaves adapter-specific copy and scope-grouped local output for later phases.

### Option D: Phase 6B Adapter-Specific Local Output

Pros:

- Gives `AGENTS.md` and `CLAUDE.md` deterministic local output that matches
  their Markdown use cases.
- Keeps generic Markdown output stable for existing users.
- Creates focused golden fixtures for headings, preambles, and empty-state copy.

Cons:

- Adds a second output layer that docs and tests must distinguish from the
  Phase 6A boundary.
- Still does not prove live adapter retries, auth, downstream IDs, or network
  failure behavior.

### Option E: Phase 6C Scope-Grouped Local Output

Pros:

- Improves readability for `AGENTS.md` and `CLAUDE.md` without changing generic
  Markdown output.
- Keeps scope ordering deterministic and testable.
- Preserves per-record provenance while making grouped local files easier to
  scan.

Cons:

- Scope headings could be mistaken for policy, permissioning, or read-side
  governance unless the docs and tests keep the boundary explicit.
- Adds another output fixture dimension for the two named local file adapters.

### Option F: Phase 6D Local Export Dry-Run/Preview

Pros:

- Lets maintainers inspect the exact local export output before file writes.
- Proves export blockers and destination validation run before preview results
  are trusted.
- Creates a safer preflight habit before live/downstream adapters introduce
  retries, authentication, external IDs, and partial-failure modes.

Cons:

- Could be misunderstood as a weaker export path unless it shares the same
  validation and blocking rules.
- Could be misunderstood as export-time scanning, redaction, authorization, or
  downstream readiness unless the docs keep those claims deferred.
- Requires tests that assert absence of file, directory, and
  `memory_exported` event side effects.

## Consequences

- `AGENTS.md` and `CLAUDE.md` become the Phase 6A local file-adapter boundary.
- Phase 6B may specialize the local Markdown managed-block heading, preamble,
  and empty-state copy for those two files.
- Phase 6C may group accepted `AGENTS.md` and `CLAUDE.md` records by scope for
  readability only.
- Phase 6D may preview the exact local export output before a write while
  preserving the same validation and blocking rules.
- Generic Markdown output remains stable and flat unless this ADR is superseded.
- Mem0, LangGraph, LLM-wiki, and custom network adapters remain deferred until
  live adapter contracts are separately designed.
- Export should be treated as potentially leaking sensitive data.
- Adapter docs must distinguish current generic destination support from
  Phase 6A local file-adapter behavior, Phase 6B adapter-specific local output,
  Phase 6C scope-grouped local output, Phase 6D dry-run preview, and later live
  adapter behavior.
- Golden tests are required evidence for the named file adapters.
- Phase 6B golden tests must cover adapter-specific headings, preambles, and
  empty-state copy while preserving generic output stability.
- Phase 6C golden tests must cover deterministic group order, preserved input
  order within groups, per-record provenance fields, and generic flat-output
  stability.
- Phase 6D tests must prove exact preview parity with committing output, same
  validation/blocking behavior, and no destination-file, directory-creation, or
  `memory_exported` event side effects.
- Destination validation is part of the adapter boundary, not optional UI polish.

## Deferred Risks

- export-time sensitive-data scanning
- redaction
- scope bleed beyond exact destination filtering
- live destination compatibility beyond local files
- live adapter retries/auth
- downstream write failure recovery
- downstream ID reconciliation
- duplicate downstream writes
- read-side governance
- scope grouping being mistaken for permissioning, enforcement, or read-side
  scope filtering
- dry-run/preview being mistaken for a weaker export path, export scanning,
  redaction, authorization, or live-adapter readiness

## Review Triggers

- adding a new destination adapter
- changing Markdown output format
- changing adapter-specific heading, preamble, or empty-state copy
- changing scope grouping order, grouping eligibility, or per-record provenance
  fields
- changing dry-run/preview output shape or side-effect behavior
- changing `memory_exported` event shape
- adding downstream IDs
- adding retries/auth for live adapters
- adding read-side context export
- adding export scanning or redaction
- loosening destination validation
