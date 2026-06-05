import {
  arrayOfStrings,
  booleanSchema,
  enumSchema,
  numberSchema,
  objectSchema,
  readAccessSchema,
  readContextIssuesSchema,
  readContextWarningsSchema,
  readPermissionConstraintSchema,
  stringOrNullSchema,
  stringSchema
} from "./mcp-contract-schemas.js";
import type { MemprMcpToolContract } from "./mcp-contract-types.js";

export const MEMPR_MCP_TOOLS: readonly MemprMcpToolContract[] = [
  {
    name: "mempr.propose",
    title: "Propose Memory",
    description: "Create a MemPR memory proposal in the server-bound workspace.",
    operation: "write",
    authorizationScope: "mempr.proposals.write",
    requiresHumanConfirmation: "required",
    domainEvent: "memory_proposed",
    inputSchema: objectSchema({
      memory: stringSchema("Proposed durable memory text."),
      source: stringSchema("Source URI or local provenance label."),
      sourceType: enumSchema(["conversation", "file", "url", "manual", "other"], "Optional source type."),
      sourceTrust: enumSchema(["trusted", "unknown", "untrusted"], "Optional source trust metadata."),
      quote: stringSchema("Optional source quote supporting the memory."),
      verifySource: booleanSchema("When true, source verification evidence is required."),
      sourceLineStart: numberSchema("1-based source line range start."),
      sourceLineEnd: numberSchema("1-based source line range end."),
      sourceHash: stringSchema("Expected SHA-256 hex hash for the full source content."),
      gitCommit: stringSchema("Optional source git commit label."),
      kind: enumSchema(
        ["fact", "preference", "instruction", "procedure", "decision", "warning", "constraint"],
        "Optional memory kind."
      ),
      tags: arrayOfStrings("Optional normalized memory tags."),
      confidence: numberSchema("Optional confidence score from 0 to 1."),
      retentionClass: stringSchema("Optional retention label."),
      priority: numberSchema("Optional integer priority from 1 to 5."),
      appliesToPaths: arrayOfStrings("Optional repo-relative paths the memory applies to."),
      scope: stringSchema("Memory scope such as repo, project, or user."),
      risk: enumSchema(["low", "medium", "high"], "Optional explicit risk."),
      ttl: stringSchema("Optional TTL value such as 30d or 2026-12-31."),
      destination: stringSchema("Destination path managed by MemPR export."),
      supersedes: arrayOfStrings("Memory record IDs superseded by this proposal."),
      conflictsWith: arrayOfStrings("Memory record IDs this proposal conflicts with."),
      confirm: booleanSchema("Must be true to create the proposal.")
    }, ["memory", "confirm"]),
    outputSchema: objectSchema({
      record: objectSchema({}, [])
    }, ["record"])
  },
  {
    name: "mempr.suggest",
    title: "Suggest Memory Candidates",
    description: "Deterministically suggest MemPR candidate memories from local artifacts without writes.",
    operation: "read",
    authorizationScope: "mempr.records.read",
    requiresHumanConfirmation: "none",
    domainEvent: "none",
    inputSchema: objectSchema({
      fromTranscript: stringSchema("Local transcript path to scan."),
      fromGitDiff: {
        anyOf: [
          booleanSchema("Use the current local git diff when true."),
          stringSchema("Optional git diff range.")
        ],
        description: "Scan local git diff for deterministic memory suggestions."
      },
      fromMemoryFile: stringSchema("Existing AGENTS.md, CLAUDE.md, or MEMORY.md path to scan."),
      observation: stringSchema("Single observation string to scan."),
      destination: stringSchema("MemPR destination for suggested candidates."),
      scope: stringSchema("Suggested memory scope."),
      sourceTrust: enumSchema(["trusted", "unknown", "untrusted"], "Suggested source trust."),
      limit: numberSchema("Maximum suggestions to return.")
    }, []),
    outputSchema: objectSchema({
      suggestions: {
        type: "array",
        description: "Suggested candidate memories.",
        items: objectSchema({}, [])
      }
    }, ["suggestions"])
  },
  {
    name: "mempr.propose_from_observation",
    title: "Propose Memory From Observation",
    description: "Suggest candidates from one observation and create confirmed MemPR proposals.",
    operation: "write",
    authorizationScope: "mempr.proposals.write",
    requiresHumanConfirmation: "required",
    domainEvent: "memory_proposed",
    inputSchema: objectSchema({
      observation: stringSchema("Observation text to scan and propose from."),
      destination: stringSchema("MemPR destination for created proposals."),
      scope: stringSchema("Suggested memory scope."),
      sourceTrust: enumSchema(["trusted", "unknown", "untrusted"], "Suggested source trust."),
      limit: numberSchema("Maximum suggestions to propose."),
      confirm: booleanSchema("Must be true to create proposals.")
    }, ["observation", "confirm"]),
    outputSchema: objectSchema({
      suggestions: {
        type: "array",
        description: "Redacted suggestion previews.",
        items: objectSchema({}, [])
      },
      proposalReport: objectSchema({}, [])
    }, ["suggestions", "proposalReport"])
  },
  {
    name: "mempr.preview_memory_diff",
    title: "Preview Memory Proposal",
    description: "Classify and preview a candidate memory proposal without ledger, event, or destination writes.",
    operation: "read",
    authorizationScope: "mempr.records.read",
    requiresHumanConfirmation: "none",
    domainEvent: "none",
    inputSchema: objectSchema({
      memory: stringSchema("Candidate memory text."),
      source: stringSchema("Source URI or local provenance label."),
      sourceType: enumSchema(["conversation", "file", "url", "manual", "other"], "Optional source type."),
      sourceTrust: enumSchema(["trusted", "unknown", "untrusted"], "Optional source trust metadata."),
      quote: stringSchema("Optional source quote supporting the memory."),
      kind: enumSchema(
        ["fact", "preference", "instruction", "procedure", "decision", "warning", "constraint"],
        "Optional memory kind."
      ),
      tags: arrayOfStrings("Optional memory tags."),
      confidence: numberSchema("Optional confidence score from 0 to 1."),
      scope: stringSchema("Memory scope."),
      risk: enumSchema(["low", "medium", "high"], "Optional explicit risk."),
      ttl: stringSchema("Optional TTL value such as 30d or 2026-12-31."),
      destination: stringSchema("MemPR destination path."),
      supersedes: arrayOfStrings("Memory record IDs superseded by this candidate."),
      conflictsWith: arrayOfStrings("Memory record IDs this candidate conflicts with.")
    }, ["memory"]),
    outputSchema: objectSchema({
      preview: objectSchema({}, [])
    }, ["preview"])
  },
  {
    name: "mempr.request_human_review",
    title: "Request Human Review",
    description: "Format a human-readable review prompt for an existing pending MemPR record.",
    operation: "read",
    authorizationScope: "mempr.review.read",
    requiresHumanConfirmation: "none",
    domainEvent: "none",
    inputSchema: objectSchema({
      id: stringSchema("Pending memory record ID.")
    }, ["id"]),
    outputSchema: objectSchema({
      record: objectSchema({}, []),
      prompt: stringSchema("Human-readable review prompt.")
    }, ["record", "prompt"])
  },
  {
    name: "mempr.list",
    title: "List Memory Records",
    description: "List MemPR records by status, risk, or destination in the server-bound workspace.",
    operation: "read",
    authorizationScope: "mempr.records.read",
    requiresHumanConfirmation: "none",
    domainEvent: "none",
    inputSchema: objectSchema({
      status: enumSchema(["pending", "accepted", "rejected", "retired"], "Optional record status filter."),
      risk: enumSchema(["low", "medium", "high"], "Optional risk filter."),
      destination: stringSchema("Optional MemPR destination filter."),
      reviewOnly: {
        type: "boolean",
        description: "When true, return pending records only."
      },
      readAccess: readAccessSchema()
    }, []),
    outputSchema: objectSchema({
      records: {
        type: "array",
        description: "Matching MemPR records.",
        items: objectSchema({}, [])
      }
    }, ["records"])
  },
  {
    name: "mempr.inspect",
    title: "Inspect Memory Record",
    description: "Inspect one MemPR record with direct review context.",
    operation: "read",
    authorizationScope: "mempr.review.read",
    requiresHumanConfirmation: "none",
    domainEvent: "none",
    inputSchema: objectSchema({
      id: stringSchema("Memory record ID."),
      readAccess: readAccessSchema()
    }, ["id"]),
    outputSchema: objectSchema({
      record: objectSchema({}, []),
      reviewContext: objectSchema({}, [])
    }, ["record"])
  },
  {
    name: "mempr.history",
    title: "Read Memory History",
    description: "Read one MemPR record's summarized local event timeline.",
    operation: "read",
    authorizationScope: "mempr.review.read",
    requiresHumanConfirmation: "none",
    domainEvent: "none",
    inputSchema: objectSchema({
      id: stringSchema("Memory record ID."),
      readAccess: readAccessSchema()
    }, ["id"]),
    outputSchema: objectSchema({
      record: objectSchema({}, []),
      events: {
        type: "array",
        description: "Summarized event participation for the target record.",
        items: objectSchema({}, [])
      },
      issues: {
        type: "array",
        description: "Non-secret local event-history issues.",
        items: objectSchema({}, [])
      }
    }, ["record", "events", "issues"])
  },
  {
    name: "mempr.context",
    title: "Assemble Read Context",
    description: "Assemble accepted local read context for one MemPR destination without writes or events.",
    operation: "read",
    authorizationScope: "mempr.records.read",
    requiresHumanConfirmation: "none",
    domainEvent: "none",
    inputSchema: objectSchema({
      destination: stringSchema("MemPR destination path to assemble; defaults to MEMORY.md."),
      readPermission: readPermissionConstraintSchema(),
      readAccess: readAccessSchema(),
      scope: stringSchema("Optional comma-separated context scope filter."),
      scopes: arrayOfStrings("Optional context scope filters.")
    }, []),
    outputSchema: objectSchema({
      ok: booleanSchema("Whether context assembly found no destination-level blockers."),
      destination: stringSchema("Normalized MemPR destination path."),
      scope: stringOrNullSchema(
        "Single requested scope when exactly one scope filter is present; otherwise null."
      ),
      scopes: arrayOfStrings("Normalized requested scope filters."),
      recordIds: arrayOfStrings("Accepted record IDs included in the assembled context."),
      recordCount: numberSchema("Count of accepted records included in the assembled context."),
      records: {
        type: "array",
        description: "Accepted records included in the assembled context.",
        items: objectSchema({}, [])
      },
      issues: readContextIssuesSchema("Non-secret read-context assembly blockers when ok is false."),
      warnings: readContextWarningsSchema("Non-secret informational stale read-context warnings.")
    }, [
      "ok",
      "destination",
      "scope",
      "scopes",
      "recordIds",
      "recordCount",
      "records",
      "issues",
      "warnings"
    ])
  },
  {
    name: "mempr.context.status",
    title: "Read Context Status",
    description: "Summarize destination-level MemPR read-context blockers and warnings without returning memory text.",
    operation: "read",
    authorizationScope: "mempr.records.read",
    requiresHumanConfirmation: "none",
    domainEvent: "none",
    inputSchema: objectSchema({
      destination: stringSchema("Optional MemPR destination path to summarize exactly."),
      readAccess: readAccessSchema()
    }, []),
    outputSchema: objectSchema({
      ok: booleanSchema("Whether every summarized destination has no read-context blockers."),
      blocked: booleanSchema("Whether any summarized destination is blocked."),
      destination: stringOrNullSchema("Exact requested destination when a filter is present."),
      destinationCount: numberSchema("Number of summarized destinations."),
      blockedCount: numberSchema("Number of blocked summarized destinations."),
      warningCount: numberSchema("Number of informational stale warnings across summarized destinations."),
      destinations: {
        type: "array",
        description: "Destination-level read-context blocker and warning summaries.",
        items: objectSchema({
          destination: stringSchema("MemPR destination path."),
          ok: booleanSchema("Whether this destination has no read-context blockers."),
          blocked: booleanSchema("Whether this destination is blocked."),
          counts: objectSchema({
            total: numberSchema("Total record count for this destination."),
            accepted: numberSchema("Accepted record count for this destination."),
            pending: numberSchema("Pending record count for this destination."),
            rejected: numberSchema("Rejected record count for this destination.")
          }, ["total", "accepted", "pending", "rejected"]),
          acceptedRecordIds: arrayOfStrings("Accepted record IDs for this destination."),
          issues: readContextIssuesSchema("Non-secret destination blocker metadata."),
          warnings: readContextWarningsSchema("Non-secret informational destination stale warning metadata.")
        }, [
          "destination",
          "ok",
          "blocked",
          "counts",
          "acceptedRecordIds",
          "issues",
          "warnings"
        ])
      },
      issues: readContextIssuesSchema("Non-secret top-level status issues.")
    }, [
      "ok",
      "blocked",
      "destination",
      "destinationCount",
      "blockedCount",
      "warningCount",
      "destinations",
      "issues"
    ])
  },
  {
    name: "mempr.review",
    title: "Review Memory Record",
    description: "Accept or reject one MemPR record after explicit user confirmation.",
    operation: "write",
    authorizationScope: "mempr.review.write",
    requiresHumanConfirmation: "required",
    domainEvent: "memory_status_changed",
    inputSchema: objectSchema({
      id: stringSchema("Memory record ID."),
      decision: enumSchema(["accept", "reject", "retire"], "Review decision to apply."),
      reason: stringSchema("Reviewer rationale."),
      reviewer: stringSchema("Caller-asserted reviewer label."),
      retireSuperseded: booleanSchema("When accepting, retire accepted same-destination records this memory supersedes."),
      overrideRelationships: booleanSchema("When accepting, record explicit unresolved relationship override evidence."),
      confirm: booleanSchema("Must be true to apply the review decision.")
    }, ["id", "decision", "reason", "confirm"]),
    outputSchema: objectSchema({
      record: objectSchema({}, []),
      relationshipResolution: objectSchema({}, [])
    }, ["record"])
  },
  {
    name: "mempr.relationships",
    title: "Analyze Memory Relationships",
    description: "Analyze incoming relationship links, missing references, and supersession cycles.",
    operation: "read",
    authorizationScope: "mempr.relationships.read",
    requiresHumanConfirmation: "none",
    domainEvent: "none",
    inputSchema: objectSchema({
      id: stringSchema("Optional memory record ID to narrow graph output."),
      readAccess: readAccessSchema()
    }, []),
    outputSchema: objectSchema({
      graph: objectSchema({}, [])
    }, ["graph"])
  },
  {
    name: "mempr.live.sync",
    title: "Sync Live Adapter",
    description: "Dry-run or confirm sync of accepted memory to a live adapter.",
    operation: "write",
    authorizationScope: "mempr.live.write",
    requiresHumanConfirmation: "required",
    domainEvent: "memory_live_synced",
    inputSchema: objectSchema({
      adapter: enumSchema(["fake", "mem0", "langgraph", "llm-wiki", "custom"], "Live adapter ID."),
      destination: stringSchema("MemPR destination path to sync; defaults to MEMORY.md."),
      dryRun: booleanSchema("Preview sync operations without network, ledger, event, or destination side effects."),
      maxRetries: numberSchema("Retry count for confirmed adapter operations."),
      confirm: booleanSchema("Must be true unless dryRun is true.")
    }, []),
    outputSchema: objectSchema({
      report: objectSchema({}, [])
    }, ["report"])
  },
  {
    name: "mempr.export.preview",
    title: "Preview Memory Export",
    description: "Preview the local MemPR export output without writing destination files or events.",
    operation: "read",
    authorizationScope: "mempr.records.read",
    requiresHumanConfirmation: "none",
    domainEvent: "none",
    inputSchema: objectSchema({
      destination: stringSchema("MemPR destination path to preview; defaults to MEMORY.md."),
      readAccess: readAccessSchema()
    }, []),
    outputSchema: objectSchema({
      dryRun: booleanSchema("Always true for export preview results."),
      destination: stringSchema("Normalized MemPR destination path."),
      adapter: objectSchema({
        id: stringSchema("Local export adapter ID."),
        title: stringSchema("Local export adapter title.")
      }, ["id", "title"]),
      recordIds: arrayOfStrings("Accepted record IDs included in the preview."),
      recordCount: numberSchema("Count of accepted records included in the preview."),
      destinationExists: booleanSchema("Whether the destination file currently exists."),
      warnings: readContextWarningsSchema("Non-secret informational export preview warnings."),
      safe_content_preview: stringSchema("Safe preview of destination content that a committing local export would write.")
    }, [
      "dryRun",
      "destination",
      "adapter",
      "recordIds",
      "recordCount",
      "destinationExists",
      "warnings",
      "safe_content_preview"
    ])
  },
  {
    name: "mempr.export",
    title: "Export Memory Context",
    description: "Export accepted MemPR records to a destination after explicit user confirmation.",
    operation: "write",
    authorizationScope: "mempr.export.write",
    requiresHumanConfirmation: "required",
    domainEvent: "memory_exported",
    inputSchema: objectSchema({
      destination: stringSchema("MemPR destination path to export."),
      confirm: booleanSchema("Must be true to export memory context.")
    }, ["confirm"]),
    outputSchema: objectSchema({
      destination: stringSchema("Normalized repo-relative destination written by MemPR export.")
    }, ["destination"])
  },
  {
    name: "mempr.check",
    title: "Check Ledger Consistency",
    description: "Compare the current MemPR ledger with local event replay.",
    operation: "read",
    authorizationScope: "mempr.consistency.read",
    requiresHumanConfirmation: "none",
    domainEvent: "none",
    inputSchema: objectSchema({
      readAccess: readAccessSchema()
    }, []),
    outputSchema: objectSchema({
      status: objectSchema({}, [])
    }, ["status"])
  }
];
