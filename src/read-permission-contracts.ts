import {
  READ_PERMISSION_CONTRACT_OWNER,
  READ_PERMISSION_CONTRACT_VERSION
} from "./read-permission-constants.js";
import type {
  MemprReadPermissionContract,
  ReadContextPermissionIssueCode,
  ReadPermissionActorIdentityBoundary,
  ReadPermissionActorKind,
  ReadPermissionDenialEvidenceContract,
  ReadPermissionDimension,
  ReadPermissionEnforcement,
  ReadPermissionExpiryConstraintContract,
  ReadPermissionRelationshipConstraintContract,
  ReadPermissionRequestContract,
  ReadPermissionRequestDimensions,
  ReadPermissionRequiredDimension,
  ReadPermissionScopeConstraintContract,
  ReadPermissionSurface,
  ReadPermissionSurfaceContract,
  ReadPermissionTransport,
  ReadPolicyGateContract
} from "./read-permission-types.js";

export const READ_PERMISSION_ACTOR_KINDS: readonly ReadPermissionActorKind[] = [
  "local_user",
  "local_agent",
  "mcp_client",
  "automation",
  "unknown"
] as const;

export const READ_PERMISSION_TRANSPORTS: readonly ReadPermissionTransport[] = [
  "cli",
  "mcp_stdio",
  "mcp_http",
  "internal"
] as const;

export const READ_PERMISSION_DIMENSIONS: readonly ReadPermissionDimension[] = [
  "action",
  "actor_kind",
  "actor_id",
  "client_name",
  "session_id",
  "transport",
  "surface",
  "workspace_root",
  "destination",
  "valid_until",
  "relationship_constraints",
  "denial_evidence",
  "scope_filters",
  "record_ids",
  "status_filter",
  "risk_filter",
  "evidence_privacy",
  "missing_identity_behavior",
  "payload_classes",
  "request_purpose"
] as const;

export const READ_PERMISSION_ENFORCEMENT: ReadPermissionEnforcement = {
  status: "active_when_read_policy_exists",
  runtimeCheck: "read_policy_evaluated_when_policy_exists",
  runtimeDecision: "deny_precedence_then_allow_when_policy_exists",
  authorizesReads: "when_policy_allows",
  activeGate: "when_policy_exists",
  ledgerEffect: "none",
  eventEffect: "none",
  fileEffect: "none",
  rationale: "R5 activates local-key read enforcement only when .mempr/read-policy.json exists. Missing policy keeps existing reads unchanged; present malformed policy, missing identity, invalid signature, explicit deny, or lack of allow fails closed without returning memory content."
};

export const READ_PERMISSION_ACTOR_IDENTITY_BOUNDARY: ReadPermissionActorIdentityBoundary = {
  status: "caller_asserted_label_only",
  actorField: "readPermission.actor",
  actorMeaning: "caller_asserted_label",
  authenticatedIdentity: false,
  identityInference: "not_inferred_or_stored",
  identityStorage: "not_stored",
  identitySourcesNotInferredOrStored: [
    "cli",
    "mcp",
    "environment",
    "session",
    "oauth"
  ],
  missingActorBehavior: "fail_closed_only_when_explicit_read_context_permission_constraint_supplied",
  defaultReadBehavior: "unchanged_when_constraint_absent",
  ledgerEffect: "none",
  eventEffect: "none",
  fileEffect: "none",
  rationale: "readPermission.actor is a caller-asserted read-context label, not proof of an authenticated identity. MemPR does not infer or store read identities from CLI flags, MCP metadata, environment credentials, sessions, or OAuth; missing actor fails closed only when a caller supplies an explicit read-context permission constraint."
};

export const READ_CONTEXT_PERMISSION_ISSUE_CODES: readonly ReadContextPermissionIssueCode[] = [
  "read_permission_missing_actor",
  "read_permission_missing_allowed_scopes",
  "read_permission_invalid_expiry_constraint",
  "read_permission_invalid_relationship_constraint",
  "invalid_scope"
] as const;

export const READ_PERMISSION_DENIAL_EVIDENCE_CONTRACT: ReadPermissionDenialEvidenceContract = {
  status: "documented",
  surface: "read_context",
  metadataField: "metadata",
  appliesToIssueCodes: READ_CONTEXT_PERMISSION_ISSUE_CODES,
  fields: [
    "action",
    "surface",
    "resource",
    "destination",
    "scopes",
    "contractVersion",
    "contentReturned",
    "sideEffects"
  ],
  forbiddenFields: [
    "memory_text",
    "source_quotes",
    "record_ids",
    "actor_labels",
    "allowed_scopes",
    "valid_until",
    "exclude_flags",
    "policy_details",
    "permission_grants"
  ],
  contentReturned: false,
  sideEffects: "none",
  rationale: "Read-context permission-denied issues may include only stable non-secret denial evidence and must not include memory text, source quotes, record IDs, actor labels, allowed scopes, expiry thresholds, relationship filter flags, policy details, or grants."
};

export const READ_PERMISSION_SCOPE_CONSTRAINT: ReadPermissionScopeConstraintContract = {
  status: "opt_in",
  surface: "read_context",
  actorLabelRequired: true,
  allowedScopesRequired: true,
  defaultBehavior: "unchanged_when_absent",
  requestedScopeBehavior: "requested_scopes_must_be_allowed",
  omittedScopeBehavior: "use_allowed_scopes",
  deniedBehavior: "fail_closed_no_content",
  ttlRelationshipBlockers: "preserved",
  ledgerEffect: "none",
  eventEffect: "none",
  fileEffect: "none",
  rationale: "A caller may supply a caller-asserted actor label and allowed scopes to constrain read-context records. That label is separate from R5 local-key principal verification and is not inferred, authenticated, or stored as identity."
};

export const READ_PERMISSION_EXPIRY_CONSTRAINT: ReadPermissionExpiryConstraintContract = {
  status: "opt_in",
  surface: "read_context",
  field: "validUntil",
  defaultBehavior: "unchanged_when_absent",
  filterOrder: "after_blockers_and_scope_filtering",
  expiringRecordBehavior: "exclude_records_expiring_at_or_before_valid_until",
  noExpiryBehavior: "include_as_non_expiring",
  expiredBlockerBehavior: "preserved_before_filtering",
  warningBehavior: "returned_records_only_when_permission_constrained",
  deniedBehavior: "fail_closed_no_content",
  ledgerEffect: "none",
  eventEffect: "none",
  fileEffect: "none",
  rationale: "A caller may supply a validUntil threshold so read-context records expiring at or before that timestamp are omitted after existing blockers and scope filters pass, without relaxing expired-record blockers or creating writes, events, or destination files."
};

export const READ_PERMISSION_RELATIONSHIP_CONSTRAINT: ReadPermissionRelationshipConstraintContract = {
  status: "opt_in",
  surface: "read_context",
  fields: ["excludeConflicts", "excludeSupersedes"],
  defaultBehavior: "unchanged_when_absent_or_false",
  filterOrder: "after_blockers_scope_and_expiry_filtering",
  conflictingRecordBehavior: "exclude_records_with_non_empty_conflicts_with",
  supersedingRecordBehavior: "exclude_records_with_non_empty_supersedes",
  sameDestinationRelationshipBlockers: "preserved_before_filtering",
  relationshipScope: "own_record_metadata_only",
  warningBehavior: "returned_records_only_when_permission_constrained",
  deniedBehavior: "fail_closed_no_content",
  ledgerEffect: "none",
  eventEffect: "none",
  fileEffect: "none",
  rationale: "A caller may supply boolean relationship constraints so read-context output omits records that themselves declare conflicts_with or supersedes links after existing blockers, scope filtering, and expiry filtering, without relaxing accepted same-destination relationship blockers or creating writes, events, destination files, graph traversal, or redaction."
};

export const READ_POLICY_GATE_CONTRACT: ReadPolicyGateContract = {
  status: "active_when_read_policy_exists",
  principalStore: ".mempr/principals.json",
  policyStore: ".mempr/read-policy.json",
  signatureAlgorithm: "ed25519",
  defaultBehavior: "unchanged_when_policy_absent",
  identityBehavior: "signed_local_key_principal_required_when_policy_exists",
  evaluationBehavior: "deny_precedence_then_allow_required",
  deniedBehavior: "fail_closed_no_content",
  surfaces: [
    "records_list",
    "record_inspect",
    "record_history",
    "read_context",
    "read_context_status",
    "export_preview",
    "consistency_status",
    "policy_summary"
  ],
  ledgerEffect: "none",
  eventEffect: "none",
  fileEffect: "none",
  rationale: "R3/R4/R5 activates read enforcement only when .mempr/read-policy.json exists. Local Ed25519 principals in .mempr/principals.json sign deterministic read requests; malformed policy, missing or invalid identity, explicit deny, or lack of matching allow fail closed without returning memory content."
};

const COMMON_READ_PERMISSION_DIMENSIONS: readonly ReadPermissionDimension[] = [
  "action",
  "actor_kind",
  "actor_id",
  "client_name",
  "session_id",
  "transport",
  "surface",
  "workspace_root",
  "evidence_privacy",
  "missing_identity_behavior",
  "payload_classes",
  "request_purpose"
] as const;

export const READ_PERMISSION_SURFACE_CONTRACTS: readonly ReadPermissionSurfaceContract[] = [
  {
    surface: "records_list",
    purpose: "review_support",
    payloadClasses: ["memory_content", "record_metadata"],
    dimensions: [
      ...COMMON_READ_PERMISSION_DIMENSIONS,
      "destination",
      "status_filter",
      "risk_filter"
    ],
    mcpToolNames: ["mempr.list"],
    mcpResourcePatterns: ["mempr://records"]
  },
  {
    surface: "record_inspect",
    purpose: "review_support",
    payloadClasses: ["memory_content", "record_metadata", "relationship_context"],
    dimensions: [
      ...COMMON_READ_PERMISSION_DIMENSIONS,
      "record_ids"
    ],
    mcpToolNames: ["mempr.inspect"],
    mcpResourcePatterns: ["mempr://records/{id}", "mempr://records/{id}/review"]
  },
  {
    surface: "record_history",
    purpose: "review_support",
    payloadClasses: ["memory_content", "record_metadata", "event_summary"],
    dimensions: [
      ...COMMON_READ_PERMISSION_DIMENSIONS,
      "record_ids"
    ],
    mcpToolNames: ["mempr.history"],
    mcpResourcePatterns: ["mempr://records/{id}/history"]
  },
  {
    surface: "read_context",
    purpose: "context_assembly",
    payloadClasses: ["memory_content", "record_metadata"],
    dimensions: [
      ...COMMON_READ_PERMISSION_DIMENSIONS,
      "destination",
      "valid_until",
      "relationship_constraints",
      "denial_evidence",
      "scope_filters"
    ],
    mcpToolNames: ["mempr.context"],
    mcpResourcePatterns: ["mempr://context/MEMORY.md", "mempr://context/{destination}"]
  },
  {
    surface: "read_context_status",
    purpose: "status_observability",
    payloadClasses: ["record_metadata", "status_metadata"],
    dimensions: [
      ...COMMON_READ_PERMISSION_DIMENSIONS,
      "destination"
    ],
    mcpToolNames: ["mempr.context.status"],
    mcpResourcePatterns: ["mempr://contexts", "mempr://contexts/{destination}"]
  },
  {
    surface: "export_preview",
    purpose: "export_preview",
    payloadClasses: ["memory_content", "record_metadata", "export_content"],
    dimensions: [
      ...COMMON_READ_PERMISSION_DIMENSIONS,
      "destination"
    ],
    mcpToolNames: ["mempr.export.preview"],
    mcpResourcePatterns: []
  },
  {
    surface: "consistency_status",
    purpose: "consistency_check",
    payloadClasses: ["status_metadata"],
    dimensions: COMMON_READ_PERMISSION_DIMENSIONS,
    mcpToolNames: ["mempr.check"],
    mcpResourcePatterns: ["mempr://status"]
  },
  {
    surface: "policy_summary",
    purpose: "policy_inspection",
    payloadClasses: ["policy_metadata"],
    dimensions: COMMON_READ_PERMISSION_DIMENSIONS,
    mcpToolNames: [],
    mcpResourcePatterns: ["mempr://policy"]
  }
] as const;

export const READ_PERMISSION_REQUIRED_DIMENSIONS: readonly ReadPermissionRequiredDimension[] = [
  {
    id: "actor",
    description: "Caller-asserted actor label and actor kind; not proof of authenticated identity."
  },
  {
    id: "action",
    description: "Future read action or surface being requested."
  },
  {
    id: "destination",
    description: "MemPR destination path involved in destination-scoped reads."
  },
  {
    id: "scopes",
    description: "Optional context scope filters requested by the caller."
  },
  {
    id: "evidence_privacy",
    description: "Payload exposure class, including whether memory text or source quotes may appear."
  },
  {
    id: "missing_identity_behavior",
    description: "Deferred marker: missing actor fails closed only when an explicit read-context permission constraint is supplied."
  }
] as const;

export const MEMPR_READ_PERMISSION_CONTRACT: MemprReadPermissionContract = {
  contractVersion: READ_PERMISSION_CONTRACT_VERSION,
  contractOwner: READ_PERMISSION_CONTRACT_OWNER,
  enforcement: READ_PERMISSION_ENFORCEMENT,
  actorIdentityBoundary: READ_PERMISSION_ACTOR_IDENTITY_BOUNDARY,
  readPolicyGate: READ_POLICY_GATE_CONTRACT,
  scopeConstraint: READ_PERMISSION_SCOPE_CONSTRAINT,
  expiryConstraint: READ_PERMISSION_EXPIRY_CONSTRAINT,
  relationshipConstraint: READ_PERMISSION_RELATIONSHIP_CONSTRAINT,
  denialEvidence: READ_PERMISSION_DENIAL_EVIDENCE_CONTRACT,
  requiredDimensions: READ_PERMISSION_REQUIRED_DIMENSIONS,
  surfaceContracts: READ_PERMISSION_SURFACE_CONTRACTS
};

export function listReadPermissionActorKinds(): readonly ReadPermissionActorKind[] {
  return READ_PERMISSION_ACTOR_KINDS;
}

export function listReadPermissionTransports(): readonly ReadPermissionTransport[] {
  return READ_PERMISSION_TRANSPORTS;
}

export function listReadPermissionDimensions(): readonly ReadPermissionDimension[] {
  return READ_PERMISSION_DIMENSIONS;
}

export function listReadPermissionSurfaceContracts(): readonly ReadPermissionSurfaceContract[] {
  return READ_PERMISSION_SURFACE_CONTRACTS;
}

export function describeReadPermissionSurface(
  surface: ReadPermissionSurface
): ReadPermissionSurfaceContract | undefined {
  return READ_PERMISSION_SURFACE_CONTRACTS.find((contract) => contract.surface === surface);
}

export function describeReadPermissionRequest(
  dimensions: ReadPermissionRequestDimensions = {}
): ReadPermissionRequestContract {
  return {
    contractVersion: READ_PERMISSION_CONTRACT_VERSION,
    contractOwner: READ_PERMISSION_CONTRACT_OWNER,
    enforcement: READ_PERMISSION_ENFORCEMENT,
    actorIdentityBoundary: READ_PERMISSION_ACTOR_IDENTITY_BOUNDARY,
    dimensions
  };
}
