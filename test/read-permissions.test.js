import assert from "node:assert/strict";
import test from "node:test";

const REQUIRED_READ_PERMISSION_DIMENSIONS = [
  {
    label: "actor",
    names: ["actor", "actor id", "actor kind", "caller", "principal", "subject"]
  },
  {
    label: "action",
    names: ["action", "read action"]
  },
  {
    label: "destination",
    names: ["destination"]
  },
  {
    label: "scopes",
    names: ["scope filters", "scopes"]
  },
  {
    label: "evidence privacy",
    names: ["evidence privacy", "evidence privacy behavior", "evidence privacy policy"]
  },
  {
    label: "missing identity behavior",
    names: ["missing identity", "missing identity behavior", "missing actor behavior"]
  }
];
const DISALLOWED_DECISION_FUNCTION_PATTERN =
  /\b(authori[sz]e|evaluate)\b|\bread\b.*\bdecision\b|\bdecision\b.*\bread\b/i;

let readPermissionsModule;

test("read-permission contract records conditional local read-policy enforcement", async () => {
  const readPermissions = await loadReadPermissionsModule();
  const contract = readPermissionContract(readPermissions);
  const enforcement = contract.enforcement;

  assertNoFunctionValues(contract, "MEMPR_READ_PERMISSION_CONTRACT");
  assert.equal(enforcement.status, "active_when_read_policy_exists");
  assert.equal(enforcement.runtimeCheck, "read_policy_evaluated_when_policy_exists");
  assert.equal(enforcement.runtimeDecision, "deny_precedence_then_allow_when_policy_exists");
  assert.equal(enforcement.authorizesReads, "when_policy_allows");
  assert.equal(enforcement.activeGate, "when_policy_exists");
  assert.equal(enforcement.ledgerEffect, "none");
  assert.equal(enforcement.eventEffect, "none");
  assert.equal(enforcement.fileEffect, "none");
});

test("read-permission contract records required future decision dimensions", async () => {
  const readPermissions = await loadReadPermissionsModule();
  const dimensions = readPermissionDimensionNames(readPermissionContract(readPermissions));

  for (const { label, names } of REQUIRED_READ_PERMISSION_DIMENSIONS) {
    assert(
      names.some((name) => dimensions.includes(name)),
      `read-permission contract must require ${label}`
    );
  }
});

test("read-permission contract records the Phase 7H opt-in scope constraint", async () => {
  const readPermissions = await loadReadPermissionsModule();
  const contract = readPermissionContract(readPermissions);
  const constraint = contract.scopeConstraint;

  assert(isRecord(constraint), "contract.scopeConstraint must be an object");
  assert.equal(constraint.status, "opt_in");
  assert.equal(constraint.surface, "read_context");
  assert.equal(constraint.actorLabelRequired, true);
  assert.equal(constraint.allowedScopesRequired, true);
  assert.equal(constraint.defaultBehavior, "unchanged_when_absent");
  assert.equal(constraint.requestedScopeBehavior, "requested_scopes_must_be_allowed");
  assert.equal(constraint.omittedScopeBehavior, "use_allowed_scopes");
  assert.equal(constraint.deniedBehavior, "fail_closed_no_content");
  assert.equal(constraint.ttlRelationshipBlockers, "preserved");
  assert.equal(constraint.ledgerEffect, "none");
  assert.equal(constraint.eventEffect, "none");
  assert.equal(constraint.fileEffect, "none");
  assert.deepEqual(readPermissions.READ_CONTEXT_PERMISSION_ISSUE_CODES, [
    "read_permission_missing_actor",
    "read_permission_missing_allowed_scopes",
    "read_permission_invalid_expiry_constraint",
    "read_permission_invalid_relationship_constraint",
    "invalid_scope"
  ]);
});

test("read-permission contract records the Phase 7I opt-in expiry constraint", async () => {
  const readPermissions = await loadReadPermissionsModule();
  const contract = readPermissionContract(readPermissions);
  const constraint = contract.expiryConstraint;

  assert(isRecord(constraint), "contract.expiryConstraint must be an object");
  assert.equal(constraint.status, "opt_in");
  assert.equal(constraint.surface, "read_context");
  assert.equal(constraint.field, "validUntil");
  assert.equal(constraint.defaultBehavior, "unchanged_when_absent");
  assert.equal(constraint.filterOrder, "after_blockers_and_scope_filtering");
  assert.equal(
    constraint.expiringRecordBehavior,
    "exclude_records_expiring_at_or_before_valid_until"
  );
  assert.equal(constraint.noExpiryBehavior, "include_as_non_expiring");
  assert.equal(constraint.expiredBlockerBehavior, "preserved_before_filtering");
  assert.equal(
    constraint.warningBehavior,
    "returned_records_only_when_permission_constrained"
  );
  assert.equal(constraint.deniedBehavior, "fail_closed_no_content");
  assert.equal(constraint.ledgerEffect, "none");
  assert.equal(constraint.eventEffect, "none");
  assert.equal(constraint.fileEffect, "none");
});

test("read-permission contract records the Phase 7J opt-in relationship constraint", async () => {
  const readPermissions = await loadReadPermissionsModule();
  const contract = readPermissionContract(readPermissions);
  const constraint = contract.relationshipConstraint;
  const readContextDimensions = readContextDimensionNames(contract);

  assert(isRecord(constraint), "contract.relationshipConstraint must be an object");
  assert.equal(constraint.status, "opt_in");
  assert.equal(constraint.surface, "read_context");
  assert.deepEqual(relationshipConstraintFields(constraint), [
    "excludeConflicts",
    "excludeSupersedes"
  ]);
  assert.equal(constraint.defaultBehavior, "unchanged_when_absent_or_false");
  assert.equal(constraint.filterOrder, "after_blockers_scope_and_expiry_filtering");
  assert.equal(
    constraint.conflictingRecordBehavior,
    "exclude_records_with_non_empty_conflicts_with"
  );
  assert.equal(
    constraint.supersedingRecordBehavior,
    "exclude_records_with_non_empty_supersedes"
  );
  assert.equal(constraint.sameDestinationRelationshipBlockers, "preserved_before_filtering");
  assert.equal(
    constraint.warningBehavior,
    "returned_records_only_when_permission_constrained"
  );
  assert.equal(constraint.deniedBehavior, "fail_closed_no_content");
  assert.equal(constraint.ledgerEffect, "none");
  assert.equal(constraint.eventEffect, "none");
  assert.equal(constraint.fileEffect, "none");
  assert(
    readContextDimensions.includes("relationship constraints"),
    "read-context surface must record the relationship constraint dimension"
  );
  assert.deepEqual(readPermissions.READ_CONTEXT_PERMISSION_ISSUE_CODES, [
    "read_permission_missing_actor",
    "read_permission_missing_allowed_scopes",
    "read_permission_invalid_expiry_constraint",
    "read_permission_invalid_relationship_constraint",
    "invalid_scope"
  ]);
});

test("read-permission contract records the current denial evidence contract", async () => {
  const readPermissions = await loadReadPermissionsModule();
  const contract = readPermissionContract(readPermissions);
  const evidenceContract = contract.denialEvidence;

  assert.equal(readPermissions.READ_PERMISSION_CONTRACT_VERSION, "r5-read-policy");
  assert.equal(contract.contractVersion, "r5-read-policy");
  assert(isRecord(evidenceContract), "contract.denialEvidence must be an object");
  assert.equal(evidenceContract.status, "documented");
  assert.equal(evidenceContract.surface, "read_context");
  assert.equal(evidenceContract.metadataField, "metadata");
  assert.deepEqual(evidenceContract.appliesToIssueCodes, [
    "read_permission_missing_actor",
    "read_permission_missing_allowed_scopes",
    "read_permission_invalid_expiry_constraint",
    "read_permission_invalid_relationship_constraint",
    "invalid_scope"
  ]);
  assert.equal(evidenceContract.contentReturned, false);
  assert.equal(evidenceContract.sideEffects, "none");
  assert.deepEqual(evidenceContract.fields, [
    "action",
    "surface",
    "resource",
    "destination",
    "scopes",
    "contractVersion",
    "contentReturned",
    "sideEffects"
  ]);
  assert.deepEqual(evidenceContract.forbiddenFields, [
    "memory_text",
    "source_quotes",
    "record_ids",
    "actor_labels",
    "allowed_scopes",
    "valid_until",
    "exclude_flags",
    "policy_details",
    "permission_grants"
  ]);
});

test("read-permission contract treats actor labels as caller-asserted constraints", async () => {
  const readPermissions = await loadReadPermissionsModule();
  const contract = readPermissionContract(readPermissions);
  const enforcement = contract.enforcement;
  const actorBoundary = contract.actorIdentityBoundary;
  const scopeConstraint = contract.scopeConstraint;

  assert(isRecord(actorBoundary), "contract.actorIdentityBoundary must be an object");
  assert.equal(actorBoundary.status, "caller_asserted_label_only");
  assert.equal(actorBoundary.actorField, "readPermission.actor");
  assert.equal(actorBoundary.actorMeaning, "caller_asserted_label");
  assert.equal(actorBoundary.authenticatedIdentity, false);
  assert.equal(actorBoundary.identityInference, "not_inferred_or_stored");
  assert.equal(actorBoundary.identityStorage, "not_stored");
  assert.deepEqual(actorBoundary.identitySourcesNotInferredOrStored, [
    "cli",
    "mcp",
    "environment",
    "session",
    "oauth"
  ]);
  assert.equal(
    actorBoundary.missingActorBehavior,
    "fail_closed_only_when_explicit_read_context_permission_constraint_supplied"
  );
  assert.equal(actorBoundary.defaultReadBehavior, "unchanged_when_constraint_absent");
  assert.equal(actorBoundary.ledgerEffect, "none");
  assert.equal(actorBoundary.eventEffect, "none");
  assert.equal(actorBoundary.fileEffect, "none");
  assert.match(actorBoundary.rationale, /caller-asserted read-context label/i);
  assert.match(actorBoundary.rationale, /not proof of an authenticated identity/i);
  assert.match(actorBoundary.rationale, /does not infer or store read identities/i);
  assert.equal(scopeConstraint.status, "opt_in");
  assert.equal(scopeConstraint.actorLabelRequired, true);
  assert.equal(scopeConstraint.allowedScopesRequired, true);
  assert.equal(scopeConstraint.defaultBehavior, "unchanged_when_absent");
  assert.equal(enforcement.runtimeCheck, "read_policy_evaluated_when_policy_exists");
  assert.equal(enforcement.runtimeDecision, "deny_precedence_then_allow_when_policy_exists");
  assert.equal(enforcement.authorizesReads, "when_policy_allows");
  assert.equal(enforcement.activeGate, "when_policy_exists");
  assert.match(scopeConstraint.rationale, /caller-asserted actor label/i);
  assert.match(scopeConstraint.rationale, /separate from R5 local-key principal verification/i);
});

test("read-permission module does not export runtime read-decision functions", async () => {
  const readPermissions = await loadReadPermissionsModule();
  const disallowedFunctions = Object.entries(readPermissions)
    .filter(([_name, value]) => typeof value === "function")
    .map(([name]) => name)
    .filter((name) => DISALLOWED_DECISION_FUNCTION_PATTERN.test(normalizeName(name)));

  assert.deepEqual(disallowedFunctions, []);
});

async function loadReadPermissionsModule() {
  if (readPermissionsModule) {
    return readPermissionsModule;
  }

  try {
    readPermissionsModule = await import("../dist/read-permissions.js");
    return readPermissionsModule;
  } catch (error) {
    assert.fail(
      `Expected Phase 7G read-permission contract module at dist/read-permissions.js: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function readPermissionContract(readPermissions) {
  const contract = readPermissions.MEMPR_READ_PERMISSION_CONTRACT;

  assert(isRecord(contract), "MEMPR_READ_PERMISSION_CONTRACT must be exported as an object");
  assert(isRecord(contract.enforcement), "contract.enforcement must be an object");
  return contract;
}

function readPermissionDimensionNames(contract) {
  const dimensionSources = [
    contract.requiredDimensions,
    contract.dimensions
  ];

  for (const surfaceContract of contract.surfaceContracts ?? []) {
    if (isRecord(surfaceContract)) {
      dimensionSources.push(surfaceContract.dimensions);
    }
  }

  const dimensions = new Set();

  for (const source of dimensionSources) {
    if (!Array.isArray(source)) {
      continue;
    }

    for (const dimension of source) {
      dimensions.add(normalizedDimensionName(dimension));
    }
  }

  assert(dimensions.size > 0, "read-permission contract must export required dimensions");
  return [...dimensions].sort();
}

function readContextDimensionNames(contract) {
  const readContextContract = (contract.surfaceContracts ?? []).find((surfaceContract) => {
    return isRecord(surfaceContract) && surfaceContract.surface === "read_context";
  });

  assert(readContextContract, "contract must include a read_context surface contract");
  assert(Array.isArray(readContextContract.dimensions));
  return readContextContract.dimensions.map(normalizedDimensionName).sort();
}

function relationshipConstraintFields(constraint) {
  const fields = constraint.fields ?? [
    constraint.conflictField,
    constraint.supersessionField
  ];

  assert(Array.isArray(fields), "relationshipConstraint must list its nested fields");
  return fields.map((field) => {
    assert.equal(typeof field, "string", "relationshipConstraint fields must be strings");
    return field;
  });
}

function assertNoFunctionValues(value, path) {
  if (typeof value === "function") {
    assert.fail(`${path} must be static data, not a function`);
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoFunctionValues(item, `${path}.${index}`);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    assertNoFunctionValues(item, `${path}.${key}`);
  }
}

function normalizedDimensionName(dimension) {
  if (typeof dimension === "string") {
    return normalizeName(dimension);
  }

  assert(isRecord(dimension), "dimension entries must be strings or objects");
  const name = dimension.id ?? dimension.name ?? dimension.dimension;

  assert.equal(typeof name, "string", "dimension object entries must name a dimension");
  return normalizeName(name);
}

function normalizeName(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
