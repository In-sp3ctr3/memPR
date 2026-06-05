import {
  MEMPR_MCP_AUTHORIZATION
} from "./mcp-contract.js";
import type {
  JsonSchema,
  MemprMcpResourceContract,
  MemprMcpResourceTemplateContract,
  MemprMcpToolContract
} from "./mcp-contract.js";

export function renderTool(tool: MemprMcpToolContract): Record<string, unknown> {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: renderSchema(tool.inputSchema),
    outputSchema: renderSchema(tool.outputSchema),
    annotations: {
      readOnlyHint: tool.operation === "read",
      destructiveHint: tool.operation === "write",
      openWorldHint: false
    },
    _meta: {
      "mempr.dev/authorizationScope": tool.authorizationScope,
      "mempr.dev/scopeUse": MEMPR_MCP_AUTHORIZATION.scopeUse,
      "mempr.dev/runtimeScopeCheck": MEMPR_MCP_AUTHORIZATION.runtimeScopeCheck,
      "mempr.dev/requiresHumanConfirmation": tool.requiresHumanConfirmation,
      "mempr.dev/domainEvent": tool.domainEvent
    }
  };
}

export function renderResource(resource: MemprMcpResourceContract): Record<string, unknown> {
  return {
    uri: resource.uri,
    name: resource.name,
    title: resource.title,
    description: resource.description,
    mimeType: resource.mimeType,
    _meta: {
      "mempr.dev/authorizationScope": resource.authorizationScope,
      "mempr.dev/scopeUse": MEMPR_MCP_AUTHORIZATION.scopeUse,
      "mempr.dev/runtimeScopeCheck": MEMPR_MCP_AUTHORIZATION.runtimeScopeCheck
    }
  };
}

export function renderResourceTemplate(
  resourceTemplate: MemprMcpResourceTemplateContract
): Record<string, unknown> {
  return {
    uriTemplate: resourceTemplate.uriTemplate,
    name: resourceTemplate.name,
    title: resourceTemplate.title,
    description: resourceTemplate.description,
    mimeType: resourceTemplate.mimeType,
    _meta: {
      "mempr.dev/authorizationScope": resourceTemplate.authorizationScope,
      "mempr.dev/scopeUse": MEMPR_MCP_AUTHORIZATION.scopeUse,
      "mempr.dev/runtimeScopeCheck": MEMPR_MCP_AUTHORIZATION.runtimeScopeCheck
    }
  };
}

function renderSchema(schema: JsonSchema): JsonSchema {
  return schema;
}
