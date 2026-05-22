import { READ_PERMISSION_CONTRACT_VERSION } from "./read-permissions.js";

const JSON_SCHEMA_OBJECT = "object";

export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const MCP_SPEC_REVIEWED_ON = "2026-05-21";

export type McpOperationKind = "read" | "write";
export type McpConfirmation = "none" | "required";
export type McpTransportStatus = "supported";
export type McpScopeUse = "protocol_metadata_only";
export type McpRuntimeScopeCheck = "not_performed";
export type McpHttpRuntimeScopeCheck = "bearer_scope_enforced";
export type McpLogFieldPolicyScope = "server_logging_only";
export type McpDomainEvent =
  | "memory_proposed"
  | "memory_status_changed"
  | "memory_exported"
  | "memory_live_synced"
  | "none";

export type McpAuthorizationScope =
  | "mempr.records.read"
  | "mempr.relationships.read"
  | "mempr.proposals.write"
  | "mempr.review.write"
  | "mempr.live.write"
  | "mempr.export.write"
  | "mempr.consistency.read";

export interface JsonSchema {
  type?: "object" | "string" | "array" | "boolean" | "number" | "null";
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: Array<string | boolean>;
  anyOf?: JsonSchema[];
  required?: string[];
  additionalProperties?: boolean;
}

export interface MemprMcpToolContract {
  name: string;
  title: string;
  description: string;
  operation: McpOperationKind;
  authorizationScope: McpAuthorizationScope;
  requiresHumanConfirmation: McpConfirmation;
  domainEvent: McpDomainEvent;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export interface MemprMcpResourceContract {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: "application/json";
}

export interface MemprMcpResourceTemplateContract {
  uriTemplate: string;
  name: string;
  title: string;
  description: string;
  mimeType: "application/json";
}

export interface MemprMcpAuthorizationContract {
  scopeUse: McpScopeUse;
  runtimeScopeCheck: McpRuntimeScopeCheck;
  stdio: {
    transport: "stdio";
    status: McpTransportStatus;
    credentialSource: "environment";
  };
  http: {
    transport: "streamable_http";
    status: McpTransportStatus;
    requiresFutureAdr: false;
    protectedResourceMetadata: true;
    bearerAuthRequired: true;
    audienceValidation: "required";
    originValidation: "required";
    dnsRebindingDefense: "host_header_validation";
    runtimeScopeCheck: McpHttpRuntimeScopeCheck;
    scopes: readonly McpAuthorizationScope[];
  };
}

export interface MemprMcpLoggingContract {
  separateFromEventLedger: true;
  redactedFields: readonly string[];
  fieldPolicyScope: McpLogFieldPolicyScope;
  minimumDefaultLevel: "warning";
}

export const MEMPR_MCP_AUTHORIZATION: MemprMcpAuthorizationContract = {
  scopeUse: "protocol_metadata_only",
  runtimeScopeCheck: "not_performed",
  stdio: {
    transport: "stdio",
    status: "supported",
    credentialSource: "environment"
  },
  http: {
    transport: "streamable_http",
    status: "supported",
    requiresFutureAdr: false,
    protectedResourceMetadata: true,
    bearerAuthRequired: true,
    audienceValidation: "required",
    originValidation: "required",
    dnsRebindingDefense: "host_header_validation",
    runtimeScopeCheck: "bearer_scope_enforced",
    scopes: [
      "mempr.records.read",
      "mempr.relationships.read",
      "mempr.proposals.write",
      "mempr.review.write",
      "mempr.live.write",
      "mempr.export.write",
      "mempr.consistency.read"
    ]
  }
};

export const MEMPR_MCP_LOGGING: MemprMcpLoggingContract = {
  separateFromEventLedger: true,
  redactedFields: [
    "memory",
    "quote",
    "content",
    "secret",
    "token",
    "authorization"
  ],
  fieldPolicyScope: "server_logging_only",
  minimumDefaultLevel: "warning"
};

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
    authorizationScope: "mempr.records.read",
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
    authorizationScope: "mempr.records.read",
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
      outputPath: stringSchema("Absolute local path that a committing export would write."),
      adapter: objectSchema({
        id: stringSchema("Local export adapter ID."),
        title: stringSchema("Local export adapter title.")
      }, ["id", "title"]),
      recordIds: arrayOfStrings("Accepted record IDs included in the preview."),
      recordCount: numberSchema("Count of accepted records included in the preview."),
      destinationExists: booleanSchema("Whether the destination file currently exists."),
      warnings: readContextWarningsSchema("Non-secret informational export preview warnings."),
      content: stringSchema("Exact destination content that a committing local export would write.")
    }, [
      "dryRun",
      "destination",
      "outputPath",
      "adapter",
      "recordIds",
      "recordCount",
      "destinationExists",
      "warnings",
      "content"
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
      destination: stringSchema("Absolute path written by MemPR export.")
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

export const MEMPR_MCP_RESOURCES: readonly MemprMcpResourceContract[] = [
  {
    uri: "mempr://records",
    name: "records",
    title: "MemPR Records",
    description: "Current MemPR record summaries for the server-bound workspace.",
    mimeType: "application/json"
  },
  {
    uri: "mempr://policy",
    name: "policy",
    title: "MemPR Policy",
    description: "Current MemPR policy summary for the server-bound workspace.",
    mimeType: "application/json"
  },
  {
    uri: "mempr://status",
    name: "status",
    title: "MemPR Status",
    description: "Current ledger/event consistency status for the server-bound workspace.",
    mimeType: "application/json"
  },
  {
    uri: "mempr://context/MEMORY.md",
    name: "context",
    title: "MemPR Default Read Context",
    description: "Accepted read context for the default MEMORY.md destination.",
    mimeType: "application/json"
  },
  {
    uri: "mempr://contexts",
    name: "contexts",
    title: "MemPR Read Context Status",
    description: "Destination-level MemPR read-context blocker and warning summaries.",
    mimeType: "application/json"
  }
];

export const MEMPR_MCP_RESOURCE_TEMPLATES: readonly MemprMcpResourceTemplateContract[] = [
  {
    uriTemplate: "mempr://records/{id}",
    name: "record",
    title: "MemPR Record",
    description: "One MemPR record by ID.",
    mimeType: "application/json"
  },
  {
    uriTemplate: "mempr://records/{id}/review",
    name: "record-review",
    title: "MemPR Record Review Context",
    description: "One MemPR record with direct conflict and supersession context.",
    mimeType: "application/json"
  },
  {
    uriTemplate: "mempr://records/{id}/history",
    name: "record-history",
    title: "MemPR Record History",
    description: "One MemPR record with summarized local event participation.",
    mimeType: "application/json"
  },
  {
    uriTemplate: "mempr://context/{destination}",
    name: "context-destination",
    title: "MemPR Read Context",
    description: "Accepted read context for one MemPR destination path.",
    mimeType: "application/json"
  },
  {
    uriTemplate: "mempr://contexts/{destination}",
    name: "contexts-destination",
    title: "MemPR Read Context Status",
    description: "Read-context blocker and warning summary for one MemPR destination path.",
    mimeType: "application/json"
  }
];

export function listMcpToolContracts(): readonly MemprMcpToolContract[] {
  return MEMPR_MCP_TOOLS;
}

export function listMcpResourceContracts(): readonly MemprMcpResourceContract[] {
  return MEMPR_MCP_RESOURCES;
}

export function listMcpResourceTemplateContracts(): readonly MemprMcpResourceTemplateContract[] {
  return MEMPR_MCP_RESOURCE_TEMPLATES;
}

function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[]
): JsonSchema {
  return {
    type: JSON_SCHEMA_OBJECT,
    properties,
    required,
    additionalProperties: false
  };
}

function stringSchema(description: string): JsonSchema {
  return {
    type: "string",
    description
  };
}

function stringOrNullSchema(description: string): JsonSchema {
  return {
    description,
    anyOf: [
      { type: "string" },
      { type: "null" }
    ]
  };
}

function enumSchema(values: string[], description: string): JsonSchema {
  return {
    type: "string",
    description,
    enum: values
  };
}

function booleanLiteralSchema(value: boolean, description: string): JsonSchema {
  return {
    type: "boolean",
    description,
    enum: [value]
  };
}

function arrayOfStrings(description: string): JsonSchema {
  return {
    type: "array",
    description,
    items: {
      type: "string"
    }
  };
}

function stringOrArrayOfStrings(description: string): JsonSchema {
  return {
    description,
    anyOf: [
      stringSchema(`${description} May be comma-separated.`),
      arrayOfStrings(description)
    ]
  };
}

function readPermissionConstraintSchema(): JsonSchema {
  return objectSchema({
    actor: stringSchema(
      "Read-context actor label supplied by the caller; caller-asserted and not proof of identity."
    ),
    allowedScopes: stringOrArrayOfStrings(
      "Read-context scopes this caller-supplied constraint allows."
    ),
    validUntil: stringSchema(
      "Optional expiry threshold; records expiring at or before this time are omitted."
    ),
    excludeConflicts: booleanSchema(
      "Optional read-context filter that omits records whose conflicts_with array is non-empty."
    ),
    excludeSupersedes: booleanSchema(
      "Optional read-context filter that omits records whose supersedes array is non-empty."
    )
  }, ["actor", "allowedScopes"]);
}

function readAccessSchema(): JsonSchema {
  return objectSchema({
    principalId: stringSchema("Local-key principal id from .mempr/principals.json."),
    signature: stringSchema("Base64 Ed25519 signature over the deterministic MemPR read request payload."),
    signedAt: stringSchema("Optional signed request timestamp included in the signed payload."),
    nonce: stringSchema("Optional signed request nonce included in the signed payload.")
  }, ["principalId", "signature"]);
}

function readContextIssuesSchema(description: string): JsonSchema {
  return {
    type: "array",
    description,
    items: objectSchema({
      code: enumSchema([
        "invalid_destination",
        "ledger_read_failed",
        "read_permission_missing_actor",
        "read_permission_missing_allowed_scopes",
        "read_permission_invalid_expiry_constraint",
        "read_permission_invalid_relationship_constraint",
        "invalid_scope",
        "expired_record",
        "secret_like_content",
        "relationship_conflict",
        "relationship_supersession",
        "relationship_cycle"
      ], "Read-context issue code."),
      message: stringSchema("Non-secret issue summary."),
      recordIds: arrayOfStrings("Related memory record IDs."),
      relationship: enumSchema(
        ["conflicts_with", "supersedes"],
        "Relationship field involved in this issue when applicable."
      ),
      metadata: readContextPermissionDeniedEvidenceSchema()
    }, ["code", "message", "recordIds"])
  };
}

function readContextPermissionDeniedEvidenceSchema(): JsonSchema {
  return objectSchema({
    action: enumSchema(
      ["read"],
      "Read-context action involved in this denied result."
    ),
    surface: enumSchema(
      ["read_context"],
      "Read surface involved in this denied result."
    ),
    resource: enumSchema(
      ["context"],
      "Read-context resource involved in this denied result."
    ),
    destination: stringSchema("MemPR destination path involved in this denied result."),
    scopes: arrayOfStrings("Requested read-context scope filters involved in this denied result."),
    contractVersion: enumSchema(
      [READ_PERMISSION_CONTRACT_VERSION],
      "Static read contract version that defines this evidence shape."
    ),
    contentReturned: booleanLiteralSchema(
      false,
      "Denied read-context results do not return records or memory content."
    ),
    sideEffects: enumSchema(
      ["none"],
      "Always none; denied read-context results do not write files, ledger records, or events."
    )
  }, [
    "action",
    "surface",
    "resource",
    "destination",
    "scopes",
    "contractVersion",
    "contentReturned",
    "sideEffects"
  ]);
}

function readContextWarningsSchema(description: string): JsonSchema {
  return {
    type: "array",
    description,
    items: objectSchema({
      code: enumSchema(["expiring_record", "sensitive_content"], "Read-context warning code."),
      message: stringSchema("Non-secret informational warning summary."),
      destination: stringSchema("MemPR destination path for the warning."),
      recordIds: arrayOfStrings("Related memory record IDs."),
      expiresAt: stringOrNullSchema("Canonical expiry timestamp when the warning is expiry-related."),
      daysUntilExpiry: numberOrNullSchema("Whole days until expiry when the warning is expiry-related."),
      warningWindowDays: numberOrNullSchema("Configured warning window when the warning is expiry-related.")
    }, [
      "code",
      "message",
      "destination",
      "recordIds",
      "expiresAt",
      "daysUntilExpiry",
      "warningWindowDays"
    ])
  };
}

function booleanSchema(description: string): JsonSchema {
  return {
    type: "boolean",
    description
  };
}

function numberSchema(description: string): JsonSchema {
  return {
    type: "number",
    description
  };
}

function numberOrNullSchema(description: string): JsonSchema {
  return {
    description,
    anyOf: [
      { type: "number" },
      { type: "null" }
    ]
  };
}
