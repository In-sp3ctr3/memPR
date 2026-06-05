import { MEMPR_MCP_TOOLS } from "./mcp-tool-contracts.js";
import type {
  MemprMcpAuthorizationContract,
  MemprMcpLoggingContract,
  MemprMcpResourceContract,
  MemprMcpResourceTemplateContract,
  MemprMcpToolContract
} from "./mcp-contract-types.js";

export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const MCP_SPEC_REVIEWED_ON = "2026-05-21";

export { MEMPR_MCP_TOOLS } from "./mcp-tool-contracts.js";
export type {
  JsonSchema,
  McpAuthorizationScope,
  McpConfirmation,
  McpDomainEvent,
  McpHttpRuntimeScopeCheck,
  McpLogFieldPolicyScope,
  McpOperationKind,
  McpRuntimeScopeCheck,
  McpScopeUse,
  McpTransportStatus,
  MemprMcpAuthorizationContract,
  MemprMcpLoggingContract,
  MemprMcpResourceContract,
  MemprMcpResourceTemplateContract,
  MemprMcpToolContract
} from "./mcp-contract-types.js";

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
      "mempr.records.admin",
      "mempr.review.read",
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

export const MEMPR_MCP_RESOURCES: readonly MemprMcpResourceContract[] = [
  {
    uri: "mempr://records",
    name: "records",
    title: "MemPR Records",
    description: "Current MemPR record summaries for the server-bound workspace.",
    mimeType: "application/json",
    authorizationScope: "mempr.records.read"
  },
  {
    uri: "mempr://policy",
    name: "policy",
    title: "MemPR Policy",
    description: "Current MemPR policy summary for the trusted-admin server-bound workspace.",
    mimeType: "application/json",
    authorizationScope: "mempr.records.admin"
  },
  {
    uri: "mempr://status",
    name: "status",
    title: "MemPR Status",
    description: "Current ledger/event consistency status for the server-bound workspace.",
    mimeType: "application/json",
    authorizationScope: "mempr.consistency.read"
  },
  {
    uri: "mempr://context/MEMORY.md",
    name: "context",
    title: "MemPR Default Read Context",
    description: "Accepted read context for the default MEMORY.md destination.",
    mimeType: "application/json",
    authorizationScope: "mempr.records.read"
  },
  {
    uri: "mempr://contexts",
    name: "contexts",
    title: "MemPR Read Context Status",
    description: "Destination-level MemPR read-context blocker and warning summaries.",
    mimeType: "application/json",
    authorizationScope: "mempr.records.read"
  }
];

export const MEMPR_MCP_RESOURCE_TEMPLATES: readonly MemprMcpResourceTemplateContract[] = [
  {
    uriTemplate: "mempr://records/{id}",
    name: "record",
    title: "MemPR Record",
    description: "One MemPR record by ID.",
    mimeType: "application/json",
    authorizationScope: "mempr.records.read"
  },
  {
    uriTemplate: "mempr://records/{id}/review",
    name: "record-review",
    title: "MemPR Record Review Context",
    description: "One MemPR record with direct conflict and supersession context.",
    mimeType: "application/json",
    authorizationScope: "mempr.review.read"
  },
  {
    uriTemplate: "mempr://records/{id}/history",
    name: "record-history",
    title: "MemPR Record History",
    description: "One MemPR record with summarized local event participation.",
    mimeType: "application/json",
    authorizationScope: "mempr.review.read"
  },
  {
    uriTemplate: "mempr://context/{destination}",
    name: "context-destination",
    title: "MemPR Read Context",
    description: "Accepted read context for one MemPR destination path.",
    mimeType: "application/json",
    authorizationScope: "mempr.records.read"
  },
  {
    uriTemplate: "mempr://contexts/{destination}",
    name: "contexts-destination",
    title: "MemPR Read Context Status",
    description: "Read-context blocker and warning summary for one MemPR destination path.",
    mimeType: "application/json",
    authorizationScope: "mempr.records.read"
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
