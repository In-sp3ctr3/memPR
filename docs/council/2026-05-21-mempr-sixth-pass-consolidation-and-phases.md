# MemPR Council Round 6 (2026-05-21)

## Decision Being Tested

Should the repository consolidate product documentation into one PRD and one
canonical ADR path, then use council-reviewed phases for implementation from
current v0.1 through project completion?

## Sub-Agent Inputs

Four sub-agents were spawned. Each ran three internal council passes:

- PRD consolidation: scope, shipped-vs-roadmap honesty, cut/reference decisions.
- ADR path: taxonomy, current vs later ADRs, stale-claim risk.
- Implementation phases: phase ordering, security gates, test/release sequencing.
- Security/MCP validation: security claim accuracy, MCP claim accuracy, implementation-risk gaps.

## Council Pass 1: Documentation Consolidation

### Contrarian

A single PRD could become bloated and stale if it copies every threat, research
source, council note, and adapter detail. Consolidation only helps if old docs no
longer compete as parallel sources of truth.

### First Principles Thinker

The docs need one place that answers what MemPR is, what is shipped, what is
planned, what is deferred, and what must be true before implementation expands.

### Expansionist

The PRD can become the status spine. README stays an entrypoint, ADRs stay
binding decisions, and council docs stay evidence.

### Outsider

A newcomer should not read six docs and four council passes to learn that v0.1
is records/status/export, not a full PR runtime.

### Executor

Create `docs/prd.md`, convert duplicate docs to stubs, and link README to the
PRD and ADR index.

## Council Pass 2: ADR Path

### Contrarian

Turning every council pass into an ADR makes ADRs noisy and stale.

### First Principles Thinker

ADRs should record decisions that constrain implementation: product boundary,
runtime scope, maintenance posture, record schema, policy state machine, and
export boundary.

### Expansionist

A flat ADR path with an index gives maintainers durable traceability without
turning the docs into a research archive.

### Outsider

`Accepted` must mean the project operates by this decision now, not that the
team likes the future idea.

### Executor

Add `docs/adr/README.md`, an ADR template, and ADRs for record/ledger contract,
policy/state machine, and export/adapters.

## Council Pass 3: Implementation Phases

### Contrarian

Starting with MCP or adapters would amplify weak guarantees: no append-only
events, actor identity, source trust, transition guards, TTL enforcement, or
export scan yet.

### First Principles Thinker

The project must mature the durable write boundary before broad integration
surfaces.

### Expansionist

The right path compounds: hard schema, then event history, then stronger policy,
then PR UX, then MCP/adapters, then read governance.

### Outsider

Phase names should make it obvious what not to do too early.

### Executor

Implementation phases should be:

1. documentation consolidation
2. v0.1 hardening
3. audit/event ledger core
4. policy, TTL, source trust, and conflicts
5. review UX and PR lifecycle
6. MCP agent surface
7. destination adapters
8. read-side governance
9. mature release/project completion

## Consensus

Proceed with consolidation.

The canonical documentation structure is:

- `docs/prd.md` for product requirements and phase plan
- `docs/adr/` for binding architecture decisions
- `docs/council/` for historical council evidence
- README as the user entrypoint

The implementation should not move to MCP or destination adapters until v0.1
record, policy, transition, export, and test guarantees are hardened.

## Implementation Move

Create the canonical PRD and ADR path, convert superseded docs to redirects, and
preserve council history as an archive.

## Deferred Risks

- old external links may point to stubbed docs
- ADR titles may need filename cleanup later
- implementation phases may change once tests expose ledger constraints
- MCP spec must be re-verified immediately before implementation
