import { READ_PERMISSION_CONTRACT_VERSION } from "./read-permissions.js";
import type { JsonSchema } from "./mcp-contract-types.js";

const JSON_SCHEMA_OBJECT = "object";

export function objectSchema(
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

export function stringSchema(description: string): JsonSchema {
  return {
    type: "string",
    description
  };
}

export function stringOrNullSchema(description: string): JsonSchema {
  return {
    description,
    anyOf: [
      { type: "string" },
      { type: "null" }
    ]
  };
}

export function enumSchema(values: string[], description: string): JsonSchema {
  return {
    type: "string",
    description,
    enum: values
  };
}

export function booleanLiteralSchema(value: boolean, description: string): JsonSchema {
  return {
    type: "boolean",
    description,
    enum: [value]
  };
}

export function arrayOfStrings(description: string): JsonSchema {
  return {
    type: "array",
    description,
    items: {
      type: "string"
    }
  };
}

export function stringOrArrayOfStrings(description: string): JsonSchema {
  return {
    description,
    anyOf: [
      stringSchema(`${description} May be comma-separated.`),
      arrayOfStrings(description)
    ]
  };
}

export function readPermissionConstraintSchema(): JsonSchema {
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

export function readAccessSchema(): JsonSchema {
  return objectSchema({
    principalId: stringSchema("Local-key principal id from .mempr/principals.json."),
    signature: stringSchema("Base64 Ed25519 signature over the deterministic MemPR read request payload."),
    signedAt: stringSchema("Optional signed request timestamp included in the signed payload."),
    nonce: stringSchema("Optional signed request nonce included in the signed payload.")
  }, ["principalId", "signature"]);
}

export function readContextIssuesSchema(description: string): JsonSchema {
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
        "managed_block_marker_content",
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

export function readContextPermissionDeniedEvidenceSchema(): JsonSchema {
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

export function readContextWarningsSchema(description: string): JsonSchema {
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

export function booleanSchema(description: string): JsonSchema {
  return {
    type: "boolean",
    description
  };
}

export function numberSchema(description: string): JsonSchema {
  return {
    type: "number",
    description
  };
}

export function numberOrNullSchema(description: string): JsonSchema {
  return {
    description,
    anyOf: [
      { type: "number" },
      { type: "null" }
    ]
  };
}
