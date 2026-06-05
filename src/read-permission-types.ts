import type {
  READ_PERMISSION_CONTRACT_OWNER,
  READ_PERMISSION_CONTRACT_VERSION
} from "./read-permission-constants.js";

export type ReadPermissionActorKind =
  | "local_user"
  | "local_agent"
  | "mcp_client"
  | "automation"
  | "unknown";

export type ReadPermissionTransport =
  | "cli"
  | "mcp_stdio"
  | "mcp_http"
  | "internal";

export type ReadPermissionSurface =
  | "records_list"
  | "record_inspect"
  | "record_history"
  | "read_context"
  | "read_context_status"
  | "export_preview"
  | "consistency_status"
  | "policy_summary";

export type ReadPermissionDimension =
  | "action"
  | "actor_kind"
  | "actor_id"
  | "client_name"
  | "session_id"
  | "transport"
  | "surface"
  | "workspace_root"
  | "destination"
  | "valid_until"
  | "relationship_constraints"
  | "denial_evidence"
  | "scope_filters"
  | "record_ids"
  | "status_filter"
  | "risk_filter"
  | "evidence_privacy"
  | "missing_identity_behavior"
  | "payload_classes"
  | "request_purpose";

export type ReadPermissionRequiredDimensionId =
  | "actor"
  | "action"
  | "destination"
  | "scopes"
  | "evidence_privacy"
  | "missing_identity_behavior";

export type ReadPermissionPayloadClass =
  | "memory_content"
  | "record_metadata"
  | "relationship_context"
  | "event_summary"
  | "status_metadata"
  | "policy_metadata"
  | "export_content";

export type ReadPermissionPurpose =
  | "context_assembly"
  | "review_support"
  | "status_observability"
  | "export_preview"
  | "consistency_check"
  | "policy_inspection"
  | "unspecified";

export type ReadPermissionEnforcementStatus = "active_when_read_policy_exists";
export type ReadPermissionRuntimeCheckStatus = "read_policy_evaluated_when_policy_exists";
export type ReadPermissionRuntimeDecisionStatus = "deny_precedence_then_allow_when_policy_exists";
export type ReadPermissionSideEffectStatus = "none";
export type ReadPermissionDenialEvidenceStatus = "documented";
export type ReadPermissionActorBoundaryStatus = "caller_asserted_label_only";
export type ReadPermissionActorMeaning = "caller_asserted_label";
export type ReadPermissionIdentityInferenceStatus = "not_inferred_or_stored";
export type ReadPermissionIdentityStorageStatus = "not_stored";
export type ReadPermissionIdentitySource =
  | "cli"
  | "mcp"
  | "environment"
  | "session"
  | "oauth";
export type ReadPermissionMissingActorBehavior =
  "fail_closed_only_when_explicit_read_context_permission_constraint_supplied";
export type ReadPermissionDefaultReadBehavior =
  "unchanged_when_constraint_absent";
export type ReadPermissionDeniedAction = "read";
export type ReadPermissionDeniedResource = "context";
export type ReadPermissionDeniedEvidenceField =
  | "action"
  | "surface"
  | "resource"
  | "destination"
  | "scopes"
  | "contractVersion"
  | "contentReturned"
  | "sideEffects";
export type ReadPermissionDeniedForbiddenField =
  | "memory_text"
  | "source_quotes"
  | "record_ids"
  | "actor_labels"
  | "allowed_scopes"
  | "valid_until"
  | "exclude_flags"
  | "policy_details"
  | "permission_grants";

export type ReadContextPermissionIssueCode =
  | "read_permission_missing_actor"
  | "read_permission_missing_allowed_scopes"
  | "read_permission_invalid_expiry_constraint"
  | "read_permission_invalid_relationship_constraint"
  | "invalid_scope";

export type ReadPermissionScopeConstraintStatus = "opt_in";
export type ReadPermissionExpiryConstraintStatus = "opt_in";
export type ReadPermissionRelationshipConstraintStatus = "opt_in";
export type ReadPolicyGateStatus = "active_when_read_policy_exists";

export interface ReadPermissionEnforcement {
  status: ReadPermissionEnforcementStatus;
  runtimeCheck: ReadPermissionRuntimeCheckStatus;
  runtimeDecision: ReadPermissionRuntimeDecisionStatus;
  authorizesReads: "when_policy_allows";
  activeGate: "when_policy_exists";
  ledgerEffect: ReadPermissionSideEffectStatus;
  eventEffect: ReadPermissionSideEffectStatus;
  fileEffect: ReadPermissionSideEffectStatus;
  rationale: string;
}

export interface ReadPermissionActorDescriptor {
  kind?: ReadPermissionActorKind;
  id?: string;
  clientName?: string;
  sessionId?: string;
}

export interface ReadPermissionFilters {
  status?: string;
  risk?: string;
}

export interface ReadPermissionEvidencePrivacyDescriptor {
  payloadClasses?: readonly ReadPermissionPayloadClass[];
  includesMemoryContent?: boolean;
  includesSourceQuote?: boolean;
}

export interface ReadPermissionRequestDimensions {
  actor?: ReadPermissionActorDescriptor;
  action?: string;
  transport?: ReadPermissionTransport;
  surface?: ReadPermissionSurface;
  workspaceRoot?: string;
  destination?: string | null;
  scopes?: readonly string[];
  recordIds?: readonly string[];
  filters?: ReadPermissionFilters;
  evidencePrivacy?: ReadPermissionEvidencePrivacyDescriptor;
  missingIdentityBehavior?: "record_unknown_actor" | "defer_without_runtime_gate";
  payloadClasses?: readonly ReadPermissionPayloadClass[];
  purpose?: ReadPermissionPurpose;
}

export interface ReadContextPermissionConstraint {
  actor?: string | null;
  allowedScopes?: string | readonly string[] | null;
  validUntil?: string | null;
  excludeConflicts?: boolean;
  excludeSupersedes?: boolean;
}

export interface ReadPermissionActorIdentityBoundary {
  status: ReadPermissionActorBoundaryStatus;
  actorField: "readPermission.actor";
  actorMeaning: ReadPermissionActorMeaning;
  authenticatedIdentity: false;
  identityInference: ReadPermissionIdentityInferenceStatus;
  identityStorage: ReadPermissionIdentityStorageStatus;
  identitySourcesNotInferredOrStored: readonly ReadPermissionIdentitySource[];
  missingActorBehavior: ReadPermissionMissingActorBehavior;
  defaultReadBehavior: ReadPermissionDefaultReadBehavior;
  ledgerEffect: ReadPermissionSideEffectStatus;
  eventEffect: ReadPermissionSideEffectStatus;
  fileEffect: ReadPermissionSideEffectStatus;
  rationale: string;
}

export interface ReadPermissionDeniedEvidence {
  action: ReadPermissionDeniedAction;
  surface: "read_context";
  resource: ReadPermissionDeniedResource;
  destination: string;
  scopes: readonly string[];
  contractVersion: typeof READ_PERMISSION_CONTRACT_VERSION;
  contentReturned: false;
  sideEffects: ReadPermissionSideEffectStatus;
}

export interface ReadPermissionDenialEvidenceContract {
  status: ReadPermissionDenialEvidenceStatus;
  surface: "read_context";
  metadataField: "metadata";
  appliesToIssueCodes: readonly ReadContextPermissionIssueCode[];
  fields: readonly ReadPermissionDeniedEvidenceField[];
  forbiddenFields: readonly ReadPermissionDeniedForbiddenField[];
  contentReturned: false;
  sideEffects: ReadPermissionSideEffectStatus;
  rationale: string;
}

export interface ReadPermissionScopeConstraintContract {
  status: ReadPermissionScopeConstraintStatus;
  surface: "read_context";
  actorLabelRequired: true;
  allowedScopesRequired: true;
  defaultBehavior: "unchanged_when_absent";
  requestedScopeBehavior: "requested_scopes_must_be_allowed";
  omittedScopeBehavior: "use_allowed_scopes";
  deniedBehavior: "fail_closed_no_content";
  ttlRelationshipBlockers: "preserved";
  ledgerEffect: ReadPermissionSideEffectStatus;
  eventEffect: ReadPermissionSideEffectStatus;
  fileEffect: ReadPermissionSideEffectStatus;
  rationale: string;
}

export interface ReadPermissionExpiryConstraintContract {
  status: ReadPermissionExpiryConstraintStatus;
  surface: "read_context";
  field: "validUntil";
  defaultBehavior: "unchanged_when_absent";
  filterOrder: "after_blockers_and_scope_filtering";
  expiringRecordBehavior: "exclude_records_expiring_at_or_before_valid_until";
  noExpiryBehavior: "include_as_non_expiring";
  expiredBlockerBehavior: "preserved_before_filtering";
  warningBehavior: "returned_records_only_when_permission_constrained";
  deniedBehavior: "fail_closed_no_content";
  ledgerEffect: ReadPermissionSideEffectStatus;
  eventEffect: ReadPermissionSideEffectStatus;
  fileEffect: ReadPermissionSideEffectStatus;
  rationale: string;
}

export interface ReadPermissionRelationshipConstraintContract {
  status: ReadPermissionRelationshipConstraintStatus;
  surface: "read_context";
  fields: readonly ["excludeConflicts", "excludeSupersedes"];
  defaultBehavior: "unchanged_when_absent_or_false";
  filterOrder: "after_blockers_scope_and_expiry_filtering";
  conflictingRecordBehavior: "exclude_records_with_non_empty_conflicts_with";
  supersedingRecordBehavior: "exclude_records_with_non_empty_supersedes";
  sameDestinationRelationshipBlockers: "preserved_before_filtering";
  relationshipScope: "own_record_metadata_only";
  warningBehavior: "returned_records_only_when_permission_constrained";
  deniedBehavior: "fail_closed_no_content";
  ledgerEffect: ReadPermissionSideEffectStatus;
  eventEffect: ReadPermissionSideEffectStatus;
  fileEffect: ReadPermissionSideEffectStatus;
  rationale: string;
}

export interface ReadPolicyGateContract {
  status: ReadPolicyGateStatus;
  principalStore: ".mempr/principals.json";
  policyStore: ".mempr/read-policy.json";
  signatureAlgorithm: "ed25519";
  defaultBehavior: "unchanged_when_policy_absent";
  identityBehavior: "signed_local_key_principal_required_when_policy_exists";
  evaluationBehavior: "deny_precedence_then_allow_required";
  deniedBehavior: "fail_closed_no_content";
  surfaces: readonly ReadPermissionSurface[];
  ledgerEffect: ReadPermissionSideEffectStatus;
  eventEffect: ReadPermissionSideEffectStatus;
  fileEffect: ReadPermissionSideEffectStatus;
  rationale: string;
}

export interface ReadPermissionRequestContract {
  contractVersion: typeof READ_PERMISSION_CONTRACT_VERSION;
  contractOwner: typeof READ_PERMISSION_CONTRACT_OWNER;
  enforcement: ReadPermissionEnforcement;
  actorIdentityBoundary: ReadPermissionActorIdentityBoundary;
  dimensions: ReadPermissionRequestDimensions;
}

export interface ReadPermissionSurfaceContract {
  surface: ReadPermissionSurface;
  purpose: ReadPermissionPurpose;
  payloadClasses: readonly ReadPermissionPayloadClass[];
  dimensions: readonly ReadPermissionDimension[];
  mcpToolNames: readonly string[];
  mcpResourcePatterns: readonly string[];
}

export interface ReadPermissionRequiredDimension {
  id: ReadPermissionRequiredDimensionId;
  description: string;
}

export interface MemprReadPermissionContract {
  contractVersion: typeof READ_PERMISSION_CONTRACT_VERSION;
  contractOwner: typeof READ_PERMISSION_CONTRACT_OWNER;
  enforcement: ReadPermissionEnforcement;
  actorIdentityBoundary: ReadPermissionActorIdentityBoundary;
  readPolicyGate: ReadPolicyGateContract;
  scopeConstraint: ReadPermissionScopeConstraintContract;
  expiryConstraint: ReadPermissionExpiryConstraintContract;
  relationshipConstraint: ReadPermissionRelationshipConstraintContract;
  denialEvidence: ReadPermissionDenialEvidenceContract;
  requiredDimensions: readonly ReadPermissionRequiredDimension[];
  surfaceContracts: readonly ReadPermissionSurfaceContract[];
}
