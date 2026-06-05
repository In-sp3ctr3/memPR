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
  | "mempr.records.admin"
  | "mempr.review.read"
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
  authorizationScope: McpAuthorizationScope;
}

export interface MemprMcpResourceTemplateContract {
  uriTemplate: string;
  name: string;
  title: string;
  description: string;
  mimeType: "application/json";
  authorizationScope: McpAuthorizationScope;
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
