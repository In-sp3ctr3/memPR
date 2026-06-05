# ADR-0041: Retrieval Ranking, Vector Search, and Knowledge Graphs

**Status:** Proposed  
**Date:** 2026-05-22  
**Deciders:** MemPR maintainers

## Context

MemPR is a write-governance layer for durable memory. It is not a vector
database, retrieval engine, embedding pipeline, or knowledge graph. Current
read-context assembly is exact-destination, accepted-only, and blocker-aware.

Retrieval ranking, embeddings, and graph traversal could improve memory
selection, but they change the product from governing writes to selecting and
ranking reads. They can also bypass destination, TTL, relationship, policy, and
scanning boundaries if bolted on casually.

## Decision

MemPR will keep native retrieval ranking, vector search, embeddings, and
knowledge graphs outside the default local-first boundary until a product-scope
ADR accepts a specific read-selection model.

If accepted later, retrieval must operate after core eligibility checks:

1. exact destination or explicitly approved destination group;
2. accepted-only eligibility;
3. read-policy authorization when active;
4. TTL and relationship blockers;
5. scanning/redaction boundary;
6. only then ranking, vector search, or graph expansion.

MemPR may integrate with external retrieval systems as governed export/sync
destinations before it becomes a retrieval engine itself. The first acceptable
step is adapter-facing retrieval metadata: accepted record IDs, provenance,
scope, lifecycle, source trust, TTL, relationship, and policy metadata for
downstream systems that own ranking.

Embedding artifacts, if ever added, must be optional derived artifacts,
rebuildable from accepted records, and never the source of truth.

## Options Considered

### Option A: Keep Retrieval External

Pros:

- Preserves MemPR's write-governance identity.
- Avoids embedding storage and ranking claims.
- Lets specialized memory stores handle retrieval.

Cons:

- Users need another system for semantic lookup.

### Option B: Local Optional Index

Pros:

- Useful for local discovery and review.
- Could be no-network and inspectable.

Cons:

- Requires index invalidation, ranking explanation, and policy gating.

### Option C: Full Retrieval Engine

Pros:

- Stronger end-user memory experience.

Cons:

- Changes core product scope and creates substantial correctness and privacy
  risk.

## Consequences

- Existing context/export blockers remain authoritative.
- Retrieval cannot be used to bypass exact destination or permission gates.
- Any future index needs rebuild, drift, and deletion semantics.
- Docs should say MemPR governs retrieval inputs, not relevance, truth,
  completeness, semantic safety, or model recall quality.

## Deferred Risks

- Embedding model privacy.
- Vector store drift from source ledger.
- Ranking explanations and trust.
- Graph traversal leaking hidden relationships.

## Council Validation

- Round 1, scope fit: retrieval is a scope change, not a missing Phase 7 slice.
- Round 2, security/privacy: ranking must never run before authorization and
  blocker checks.
- Round 3, execution: start with export/sync integration to external retrieval
  systems before internal vector indexes.

## Review Triggers

- Any embedding generation or vector index.
- Any ranking or semantic retrieval API.
- Knowledge graph traversal beyond relationship blocker analysis.
- Destination-group reads or cross-destination retrieval.
