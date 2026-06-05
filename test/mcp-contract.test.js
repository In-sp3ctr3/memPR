import assert from "node:assert/strict";
import test from "node:test";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SPEC_REVIEWED_ON,
  MEMPR_MCP_AUTHORIZATION,
  MEMPR_MCP_LOGGING,
  MEMPR_MCP_RESOURCES,
  MEMPR_MCP_RESOURCE_TEMPLATES,
  MEMPR_MCP_TOOLS
} from "../dist/mcp-contract.js";

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
const KNOWN_SCOPES = new Set([
  "mempr.records.read",
  "mempr.records.admin",
  "mempr.review.read",
  "mempr.relationships.read",
  "mempr.proposals.write",
  "mempr.review.write",
  "mempr.live.write",
  "mempr.export.write",
  "mempr.consistency.read"
]);
const GENERIC_FILE_INPUTS = new Set([
  "root",
  "path",
  "file",
  "filePath",
  "fileUri",
  "resource",
  "resourceUri",
  "uri"
]);
const READ_CONTEXT_TOOL_NAMES = new Set(["mempr.context", "mempr.context.status"]);
const READ_CONTEXT_RESOURCE_URIS = new Set(["mempr://context/MEMORY.md", "mempr://contexts"]);
const READ_CONTEXT_TEMPLATE_URIS = new Set([
  "mempr://context/{destination}",
  "mempr://contexts/{destination}"
]);
const READ_CONTEXT_PERMISSION_INPUT_KEYS = ["readPermission"];
const READ_CONTEXT_PERMISSION_SCHEMA_FIELDS = [
  "mempr.context.inputSchema.properties.readPermission.properties.actor",
  "mempr.context.inputSchema.properties.readPermission.properties.allowedScopes",
  "mempr.context.inputSchema.properties.readPermission.properties.validUntil",
  "mempr.context.inputSchema.properties.readPermission.properties.excludeConflicts",
  "mempr.context.inputSchema.properties.readPermission.properties.excludeSupersedes",
  "mempr.context.inputSchema.properties.readPermission.required.actor",
  "mempr.context.inputSchema.properties.readPermission.required.allowedScopes"
];
const READ_CONTEXT_PERMISSION_DENIAL_METADATA_KEYS = [
  "action",
  "surface",
  "resource",
  "destination",
  "scopes",
  "contractVersion",
  "contentReturned",
  "sideEffects"
];
const READ_PERMISSION_SCHEMA_FIELD_NAMES = new Set([
  "actor",
  "actors",
  "allowed scope",
  "allowed scopes",
  "valid until",
  "authorization",
  "authorize",
  "authorized",
  "enforcement",
  "enforced",
  "evidence privacy",
  "exclude conflicts",
  "exclude supersedes",
  "identities",
  "identity",
  "missing identity",
  "missing identity behavior",
  "permission",
  "permission decision",
  "permission enforcement",
  "permissions",
  "principal",
  "principals",
  "read decision"
]);
const READ_GOVERNANCE_NAME_PATTERNS = [
  /\bactor\b/i,
  /\bprincipal\b/i,
  /\bidentity\b/i,
  /\bpermission(?:s|ed)?\b/i,
  /\bauthorization\b/i,
  /\baccess control\b/i,
  /\bpolicy\b.*\benforc\w*\b/i,
  /\benforc\w*\b.*\bpolicy\b/i,
  /\bread governance\b/i,
  /\bredact(?:ed|ion|ing)?\b/i,
  /\bscan(?:ned|ning|ner)?\b/i,
  /\bsafety\b/i,
  /\bsecurity\b/i,
  /\bproof\b/i,
  /\battestation\b/i
];
const READ_GOVERNANCE_DESCRIPTION_PATTERNS = [
  /\bactor\b/i,
  /\bprincipal\b/i,
  /\bidentity\b/i,
  /\bpermission(?:s|ed)?\b/i,
  /\baccess control\b/i,
  /\bpolicy\b.*\benforc\w*\b/i,
  /\benforc\w*\b.*\bpolicy\b/i,
  /\bread governance\b/i,
  /\bredact(?:ed|ion|ing)?\b/i,
  /\bscan(?:ned|ning|ner)?\b/i,
  /\b(?:safety|security)\b.*\b(?:proof|attestation|guarantee|verification|verified)\b/i,
  /\bproof\b.*\b(?:authorization|permission|policy|safety|security)\b/i,
  /\bauthorization\b.*\b(?:decision|enforc\w*|proof|attestation|verification|verified)\b/i
];

test("MCP contract pins the reviewed official protocol version", () => {
  assert.equal(MCP_PROTOCOL_VERSION, "2025-11-25");
  assert.equal(MCP_SPEC_REVIEWED_ON, "2026-05-21");
});

test("MCP tool contracts use safe names, schemas, scopes, and confirmation markers", () => {
  const names = new Set();

  for (const tool of MEMPR_MCP_TOOLS) {
    assert.match(tool.name, TOOL_NAME_PATTERN);
    assert.equal(names.has(tool.name), false, `Duplicate tool name ${tool.name}`);
    names.add(tool.name);

    assert(KNOWN_SCOPES.has(tool.authorizationScope), `Unknown scope ${tool.authorizationScope}`);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema.type, "object");
    assert.equal(tool.outputSchema.additionalProperties, false);

    const properties = Object.keys(tool.inputSchema.properties ?? {});
    const disallowed = properties.filter((property) => GENERIC_FILE_INPUTS.has(property));
    assert.deepEqual(disallowed, [], `${tool.name} exposes generic file/resource input(s)`);

    if (
      tool.name === "mempr.propose"
      || tool.name === "mempr.propose_from_observation"
      || tool.name === "mempr.review"
      || tool.name === "mempr.export"
      || tool.name === "mempr.live.sync"
    ) {
      assert.equal(tool.operation, "write");
      assert.equal(tool.requiresHumanConfirmation, "required");
    }
  }

  const previewTool = MEMPR_MCP_TOOLS.find((tool) => tool.name === "mempr.export.preview");
  assert(previewTool);
  assert.equal(previewTool.operation, "read");
  assert.equal(previewTool.requiresHumanConfirmation, "none");
  assert.equal(previewTool.domainEvent, "none");
  assert.equal(previewTool.authorizationScope, "mempr.records.read");
  assert.deepEqual(Object.keys(previewTool.inputSchema.properties ?? {}), [
    "destination",
    "readAccess"
  ]);
  assert.equal(Object.hasOwn(previewTool.outputSchema.properties ?? {}, "outputPath"), false);

  for (const toolName of ["mempr.inspect", "mempr.history", "mempr.request_human_review"]) {
    const tool = MEMPR_MCP_TOOLS.find((candidate) => candidate.name === toolName);
    assert(tool);
    assert.equal(tool.authorizationScope, "mempr.review.read");
  }

  const contextTool = MEMPR_MCP_TOOLS.find((tool) => tool.name === "mempr.context");
  assert(contextTool);
  assert.equal(contextTool.operation, "read");
  assert.equal(contextTool.requiresHumanConfirmation, "none");
  assert.equal(contextTool.domainEvent, "none");
  assert.equal(contextTool.authorizationScope, "mempr.records.read");
  assert.deepEqual(Object.keys(contextTool.inputSchema.properties ?? {}), [
    "destination",
    "readPermission",
    "readAccess",
    "scope",
    "scopes"
  ]);
  for (const flatAlias of [
    "actor",
    "allowedScopes",
    "validUntil",
    "excludeConflicts",
    "excludeSupersedes",
    "readExcludeConflicts",
    "readExcludeSupersedes",
    "readValidUntil",
    "permission",
    "readPermissionConstraint"
  ]) {
    assert.equal(
      Object.hasOwn(contextTool.inputSchema.properties ?? {}, flatAlias),
      false,
      `mempr.context must not expose flat ${flatAlias} permission aliases`
    );
  }
  assert.equal(contextTool.inputSchema.required?.includes("confirm"), false);
  assert.equal(Object.hasOwn(contextTool.inputSchema.properties ?? {}, "confirm"), false);
  assert.deepEqual(Object.keys(contextTool.outputSchema.properties ?? {}), [
    "ok",
    "destination",
    "scope",
    "scopes",
    "recordIds",
    "recordCount",
    "records",
    "issues",
    "warnings"
  ]);
  assert.equal(Object.hasOwn(contextTool.outputSchema.properties ?? {}, "warnings"), true);
  assert(
    contextTool.outputSchema.properties?.issues?.items?.properties?.code?.enum?.includes(
      "read_permission_invalid_relationship_constraint"
    ),
    "mempr.context output issues must expose the relationship permission issue code"
  );

  const contextStatusTool = MEMPR_MCP_TOOLS.find((tool) => {
    return tool.name === "mempr.context.status";
  });
  assert(contextStatusTool);
  assert.equal(contextStatusTool.operation, "read");
  assert.equal(contextStatusTool.requiresHumanConfirmation, "none");
  assert.equal(contextStatusTool.domainEvent, "none");
  assert.equal(contextStatusTool.authorizationScope, "mempr.records.read");
  assert.deepEqual(Object.keys(contextStatusTool.inputSchema.properties ?? {}), [
    "destination",
    "readAccess"
  ]);
  assert.equal(contextStatusTool.inputSchema.required?.includes("confirm"), false);
  assert.equal(Object.hasOwn(contextStatusTool.inputSchema.properties ?? {}, "confirm"), false);
  assert.deepEqual(Object.keys(contextStatusTool.outputSchema.properties ?? {}), [
    "ok",
    "blocked",
    "destination",
    "destinationCount",
    "blockedCount",
    "warningCount",
    "destinations",
    "issues"
  ]);
  const destinationSchema = contextStatusTool.outputSchema.properties?.destinations?.items;
  assert(destinationSchema && typeof destinationSchema === "object");
  assert.equal(Object.hasOwn(destinationSchema.properties ?? {}, "warnings"), true);
  assert.equal(destinationSchema.required?.includes("warnings"), true);

  assert.deepEqual([...names].sort(), [
    "mempr.check",
    "mempr.context",
    "mempr.context.status",
    "mempr.export",
    "mempr.export.preview",
    "mempr.history",
    "mempr.inspect",
    "mempr.list",
    "mempr.live.sync",
    "mempr.preview_memory_diff",
    "mempr.propose",
    "mempr.propose_from_observation",
    "mempr.relationships",
    "mempr.request_human_review",
    "mempr.review",
    "mempr.suggest"
  ]);
});

test("MCP contract keeps resources constrained to mempr URIs", () => {
  for (const resource of MEMPR_MCP_RESOURCES) {
    assert(resource.uri.startsWith("mempr://"), resource.uri);
    assert.equal(resource.mimeType, "application/json");
    assert(KNOWN_SCOPES.has(resource.authorizationScope));
    assert.doesNotMatch(resource.uri, /file:\/\/|https?:\/\/|\.\./);
  }

  for (const template of MEMPR_MCP_RESOURCE_TEMPLATES) {
    assert(template.uriTemplate.startsWith("mempr://"), template.uriTemplate);
    assert.equal(template.mimeType, "application/json");
    assert(KNOWN_SCOPES.has(template.authorizationScope));
    assert.doesNotMatch(template.uriTemplate, /file:\/\/|https?:\/\/|\.\.|\{path\}/);
  }

  const contextResource = MEMPR_MCP_RESOURCES.find((resource) => {
    return resource.uri === "mempr://context/MEMORY.md";
  });
  assert(contextResource, "Expected default read-context resource");
  assert.equal(contextResource.name, "context");
  assert.equal(contextResource.authorizationScope, "mempr.records.read");

  const contextsResource = MEMPR_MCP_RESOURCES.find((resource) => {
    return resource.uri === "mempr://contexts";
  });
  assert(contextsResource, "Expected context-status resource");
  assert.equal(contextsResource.name, "contexts");
  assert.equal(contextsResource.authorizationScope, "mempr.records.read");

  const policyResource = MEMPR_MCP_RESOURCES.find((resource) => {
    return resource.uri === "mempr://policy";
  });
  assert(policyResource, "Expected policy resource");
  assert.equal(policyResource.authorizationScope, "mempr.records.admin");

  const contextTemplate = MEMPR_MCP_RESOURCE_TEMPLATES.find((template) => {
    return template.uriTemplate === "mempr://context/{destination}";
  });
  assert(contextTemplate, "Expected read-context destination template");
  assert.equal(contextTemplate.name, "context-destination");
  assert.equal(contextTemplate.authorizationScope, "mempr.records.read");

  const contextsTemplate = MEMPR_MCP_RESOURCE_TEMPLATES.find((template) => {
    return template.uriTemplate === "mempr://contexts/{destination}";
  });
  assert(contextsTemplate, "Expected context-status destination template");
  assert.equal(contextsTemplate.name, "contexts-destination");
  assert.equal(contextsTemplate.authorizationScope, "mempr.records.read");

  const reviewTemplate = MEMPR_MCP_RESOURCE_TEMPLATES.find((template) => {
    return template.uriTemplate === "mempr://records/{id}/review";
  });
  assert(reviewTemplate, "Expected record review template");
  assert.equal(reviewTemplate.authorizationScope, "mempr.review.read");
});

test("MCP read-context contracts expose permission scope constraint only on context input", () => {
  const readContextTools = MEMPR_MCP_TOOLS.filter((tool) => {
    return READ_CONTEXT_TOOL_NAMES.has(tool.name);
  });
  assert.deepEqual(
    readContextTools.map((tool) => tool.name).sort(),
    [...READ_CONTEXT_TOOL_NAMES].sort()
  );

  for (const tool of readContextTools) {
    assert.equal(
      tool.authorizationScope,
      "mempr.records.read",
      `${tool.name} should keep protocol authorization metadata only`
    );
    assertNoReadGovernanceName(tool.name, `${tool.name}.name`);
    assertNoReadGovernanceSchemaClaims(tool.outputSchema, `${tool.name}.outputSchema`);
  }

  const contextTool = readContextTools.find((tool) => tool.name === "mempr.context");
  assert(contextTool);
  assert.deepEqual(
    READ_CONTEXT_PERMISSION_INPUT_KEYS.filter((key) => {
      return !Object.hasOwn(contextTool.inputSchema.properties ?? {}, key);
    }),
    [],
    "mempr.context must expose the opt-in permission constraint arguments"
  );
  const permissionSchema = contextTool.inputSchema.properties?.readPermission;
  assert(permissionSchema && typeof permissionSchema === "object");
  assert.deepEqual(Object.keys(permissionSchema.properties ?? {}), [
    "actor",
    "allowedScopes",
    "validUntil",
    "excludeConflicts",
    "excludeSupersedes"
  ]);
  assert.deepEqual(permissionSchema.required, ["actor", "allowedScopes"]);
  assert.equal(
    Object.hasOwn(contextTool.outputSchema.properties ?? {}, "actor"),
    false,
    "mempr.context output must not echo actor identity"
  );
  assert.equal(
    Object.hasOwn(contextTool.outputSchema.properties ?? {}, "allowedScopes"),
    false,
    "mempr.context output must not echo permission grants"
  );
  assert.equal(
    Object.hasOwn(contextTool.outputSchema.properties ?? {}, "validUntil"),
    false,
    "mempr.context output must not echo permission expiry thresholds"
  );
  assert.equal(
    Object.hasOwn(contextTool.outputSchema.properties ?? {}, "excludeConflicts"),
    false,
    "mempr.context output must not echo permission relationship filters"
  );
  assert.equal(
    Object.hasOwn(contextTool.outputSchema.properties ?? {}, "excludeSupersedes"),
    false,
    "mempr.context output must not echo permission relationship filters"
  );
  assert.equal(
    Object.hasOwn(contextTool.outputSchema.properties ?? {}, "readPermission"),
    false,
    "mempr.context output must not echo permission grants"
  );

  const contextStatusTool = readContextTools.find((tool) => {
    return tool.name === "mempr.context.status";
  });
  assert(contextStatusTool);
  assertNoReadGovernanceDescription(contextStatusTool.title, "mempr.context.status.title");
  assertNoReadGovernanceDescription(
    contextStatusTool.description,
    "mempr.context.status.description"
  );
  assertNoReadGovernanceSchemaClaims(
    contextStatusTool.inputSchema,
    "mempr.context.status.inputSchema"
  );

  const readContextResources = MEMPR_MCP_RESOURCES.filter((resource) => {
    return READ_CONTEXT_RESOURCE_URIS.has(resource.uri);
  });
  assert.deepEqual(
    readContextResources.map((resource) => resource.uri).sort(),
    [...READ_CONTEXT_RESOURCE_URIS].sort()
  );

  for (const resource of readContextResources) {
    assertNoReadGovernanceName(resource.name, `${resource.uri}.name`);
    assertNoReadGovernanceDescription(resource.title, `${resource.uri}.title`);
    assertNoReadGovernanceDescription(resource.description, `${resource.uri}.description`);
  }

  const readContextTemplates = MEMPR_MCP_RESOURCE_TEMPLATES.filter((template) => {
    return READ_CONTEXT_TEMPLATE_URIS.has(template.uriTemplate);
  });
  assert.deepEqual(
    readContextTemplates.map((template) => template.uriTemplate).sort(),
    [...READ_CONTEXT_TEMPLATE_URIS].sort()
  );

  for (const template of readContextTemplates) {
    assertNoReadGovernanceName(template.name, `${template.uriTemplate}.name`);
    assertNoReadGovernanceDescription(template.title, `${template.uriTemplate}.title`);
    assertNoReadGovernanceDescription(template.description, `${template.uriTemplate}.description`);
  }
});

test("MCP read-context schemas keep permission fields off status and outputs", () => {
  const contextTool = MEMPR_MCP_TOOLS.find((tool) => {
    return tool.name === "mempr.context";
  });
  const contextStatusTool = MEMPR_MCP_TOOLS.find((tool) => {
    return tool.name === "mempr.context.status";
  });
  assert(contextTool);
  assert(contextStatusTool);

  assert.deepEqual(
    collectReadPermissionSchemaFields(contextTool.inputSchema, "mempr.context.inputSchema"),
    READ_CONTEXT_PERMISSION_SCHEMA_FIELDS,
    "mempr.context input schema should expose only the opt-in permission arguments"
  );
  assert.deepEqual(
    collectReadPermissionSchemaFields(contextTool.outputSchema, "mempr.context.outputSchema"),
    [],
    "mempr.context output schema must not expose read-permission fields"
  );

  assert.deepEqual(
    collectReadPermissionSchemaFields(
      contextStatusTool.inputSchema,
      "mempr.context.status.inputSchema"
    ),
    [],
    "mempr.context.status input schema must remain unchanged"
  );
  assert.deepEqual(
    collectReadPermissionSchemaFields(
      contextStatusTool.outputSchema,
      "mempr.context.status.outputSchema"
    ),
    [],
    "mempr.context.status output schema must not expose read-permission fields"
  );
});

test("MCP read-context output schema exposes optional permission-denial issue metadata", () => {
  const contextTool = MEMPR_MCP_TOOLS.find((tool) => {
    return tool.name === "mempr.context";
  });
  const contextStatusTool = MEMPR_MCP_TOOLS.find((tool) => {
    return tool.name === "mempr.context.status";
  });
  assert(contextTool);
  assert(contextStatusTool);

  const issueSchema = contextTool.outputSchema.properties?.issues?.items;
  assert(issueSchema && typeof issueSchema === "object");
  const metadataSchema = issueSchema.properties?.metadata;

  assert(metadataSchema && typeof metadataSchema === "object");
  assert.equal(issueSchema.required?.includes("metadata"), false);
  assert.equal(metadataSchema.type, "object");
  assert.equal(metadataSchema.additionalProperties, false);
  assert.deepEqual(
    Object.keys(metadataSchema.properties ?? {}).sort(),
    [...READ_CONTEXT_PERMISSION_DENIAL_METADATA_KEYS].sort()
  );
  assert.deepEqual(
    metadataSchema.required,
    READ_CONTEXT_PERMISSION_DENIAL_METADATA_KEYS
  );
  assert.equal(metadataSchema.properties?.contractVersion?.type, "string");
  assert.equal(metadataSchema.properties?.contentReturned?.type, "boolean");
  assert.deepEqual(metadataSchema.properties?.sideEffects?.enum, ["none"]);
  for (const forbidden of [
    "actor",
    "allowedScopes",
    "grants",
    "memory",
    "quote",
    "records",
    "recordIds"
  ]) {
    assert.equal(
      Object.hasOwn(metadataSchema.properties ?? {}, forbidden),
      false,
      `permission-denial metadata schema must not expose ${forbidden}`
    );
  }

  assert.deepEqual(
    collectReadPermissionSchemaFields(
      contextStatusTool.inputSchema,
      "mempr.context.status.inputSchema"
    ),
    [],
    "mempr.context.status input schema must not accept read-permission fields"
  );
});

test("MCP read-context contracts keep actor labels caller supplied, not inferred auth", () => {
  const contextTool = MEMPR_MCP_TOOLS.find((tool) => {
    return tool.name === "mempr.context";
  });
  assert(contextTool);

  const permissionSchema = contextTool.inputSchema.properties?.readPermission;
  assert(permissionSchema && typeof permissionSchema === "object");
  const actorSchema = permissionSchema.properties?.actor;
  assert(actorSchema && typeof actorSchema === "object");

  assert.match(
    actorSchema.description,
    /actor label supplied by the caller/i
  );
  assert.equal(MEMPR_MCP_AUTHORIZATION.scopeUse, "protocol_metadata_only");
  assert.equal(MEMPR_MCP_AUTHORIZATION.runtimeScopeCheck, "not_performed");

  const permissionPropertyNames = new Set(Object.keys(permissionSchema.properties ?? {}));
  for (const forbidden of [
    "authorization",
    "authenticatedActor",
    "clientInfo",
    "clientName",
    "grant",
    "grants",
    "identity",
    "oauth",
    "oauthSubject",
    "principal",
    "session",
    "sessionId",
    "token"
  ]) {
    assert.equal(
      permissionPropertyNames.has(forbidden),
      false,
      `readPermission schema must not expose implicit ${forbidden} identity input`
    );
  }

  assert.doesNotMatch(
    JSON.stringify(permissionSchema),
    /\bauthenticated\b|\bverified\b|\boauth\b|\bsession\b|\btoken\b|\bgrant\b/i
  );
});

test("MCP auth and logging contract separates stdio metadata from HTTP enforcement", () => {
  assert.equal(MEMPR_MCP_AUTHORIZATION.scopeUse, "protocol_metadata_only");
  assert.equal(MEMPR_MCP_AUTHORIZATION.runtimeScopeCheck, "not_performed");
  assert.equal(MEMPR_MCP_AUTHORIZATION.stdio.status, "supported");
  assert.equal(MEMPR_MCP_AUTHORIZATION.stdio.credentialSource, "environment");
  assert.equal(MEMPR_MCP_AUTHORIZATION.http.status, "supported");
  assert.equal(MEMPR_MCP_AUTHORIZATION.http.requiresFutureAdr, false);
  assert.equal(MEMPR_MCP_AUTHORIZATION.http.protectedResourceMetadata, true);
  assert.equal(MEMPR_MCP_AUTHORIZATION.http.bearerAuthRequired, true);
  assert.equal(MEMPR_MCP_AUTHORIZATION.http.audienceValidation, "required");
  assert.equal(MEMPR_MCP_AUTHORIZATION.http.originValidation, "required");
  assert.equal(MEMPR_MCP_AUTHORIZATION.http.dnsRebindingDefense, "host_header_validation");
  assert.equal(MEMPR_MCP_AUTHORIZATION.http.runtimeScopeCheck, "bearer_scope_enforced");

  for (const scope of MEMPR_MCP_AUTHORIZATION.http.scopes) {
    assert(KNOWN_SCOPES.has(scope), `Unknown HTTP scope ${scope}`);
  }

  assert.equal(MEMPR_MCP_LOGGING.separateFromEventLedger, true);
  assert.equal(MEMPR_MCP_LOGGING.fieldPolicyScope, "server_logging_only");
  assert.equal(MEMPR_MCP_LOGGING.minimumDefaultLevel, "warning");
  assert(MEMPR_MCP_LOGGING.redactedFields.includes("memory"));
  assert(MEMPR_MCP_LOGGING.redactedFields.includes("quote"));
  assert(MEMPR_MCP_LOGGING.redactedFields.includes("authorization"));
});

function assertNoReadGovernanceSchemaClaims(schema, path) {
  if (!schema || typeof schema !== "object") {
    return;
  }

  if (
    path.includes(".properties.issues.items.properties.metadata")
    || path.includes(".properties.readAccess")
  ) {
    return;
  }

  if (typeof schema.title === "string") {
    assertNoReadGovernanceDescription(schema.title, `${path}.title`);
  }

  if (typeof schema.description === "string") {
    assertNoReadGovernanceDescription(schema.description, `${path}.description`);
  }

  for (const property of Object.keys(schema.properties ?? {})) {
    if (property === "readAccess") {
      continue;
    }

    assertNoReadGovernanceName(property, `${path}.properties.${property}`);
    assertNoReadGovernanceSchemaClaims(schema.properties[property], `${path}.properties.${property}`);
  }

  if (schema.items) {
    assertNoReadGovernanceSchemaClaims(schema.items, `${path}.items`);
  }

  for (const [index, candidate] of (schema.anyOf ?? []).entries()) {
    assertNoReadGovernanceSchemaClaims(candidate, `${path}.anyOf.${index}`);
  }
}

function collectReadPermissionSchemaFields(schema, path) {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const matches = [];

  for (const property of Object.keys(schema.properties ?? {})) {
    if (property === "readAccess") {
      continue;
    }

    if (READ_PERMISSION_SCHEMA_FIELD_NAMES.has(normalizeNameForBoundaryCheck(property))) {
      matches.push(`${path}.properties.${property}`);
    }

    matches.push(
      ...collectReadPermissionSchemaFields(
        schema.properties[property],
        `${path}.properties.${property}`
      )
    );
  }

  for (const required of schema.required ?? []) {
    if (READ_PERMISSION_SCHEMA_FIELD_NAMES.has(normalizeNameForBoundaryCheck(required))) {
      matches.push(`${path}.required.${required}`);
    }
  }

  if (schema.items) {
    matches.push(...collectReadPermissionSchemaFields(schema.items, `${path}.items`));
  }

  for (const [index, candidate] of (schema.anyOf ?? []).entries()) {
    matches.push(...collectReadPermissionSchemaFields(candidate, `${path}.anyOf.${index}`));
  }

  return matches;
}

function assertNoReadGovernanceName(value, path) {
  const normalized = normalizeNameForBoundaryCheck(value);

  for (const pattern of READ_GOVERNANCE_NAME_PATTERNS) {
    assert.doesNotMatch(normalized, pattern, `${path} must not expose read-governance field/name`);
  }
}

function assertNoReadGovernanceDescription(value, path) {
  for (const pattern of READ_GOVERNANCE_DESCRIPTION_PATTERNS) {
    assert.doesNotMatch(value, pattern, `${path} must not claim read-governance enforcement`);
  }
}

function normalizeNameForBoundaryCheck(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
