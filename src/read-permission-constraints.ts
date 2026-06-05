import {
  READ_PERMISSION_CONTRACT_VERSION
} from "./read-permissions.js";
import type {
  ReadContextPermissionIssueCode,
  ReadPermissionDeniedEvidence
} from "./read-permissions.js";
import { normalizeOptionalText, normalizeUnknownText } from "./text-normalization.js";
import { normalizeExpiry } from "./ttl.js";

export interface NormalizedReadPermissionConstraint {
  actor: string;
  allowedScopes: string[];
  effectiveScopes: string[];
  validUntil: string | null;
  excludeConflicts: boolean;
  excludeSupersedes: boolean;
}

export interface ReadPermissionConstraintIssue {
  code: ReadContextPermissionIssueCode;
  message: string;
  recordIds: string[];
  metadata?: ReadPermissionDeniedEvidence;
}

export type ReadPermissionConstraintResult =
  | { supplied: false }
  | { supplied: true; ok: true; value: NormalizedReadPermissionConstraint }
  | { supplied: true; ok: false; issue: ReadPermissionConstraintIssue };

type PermissionIssueLike = {
  code: string;
  message: string;
  recordIds: string[];
  metadata?: ReadPermissionDeniedEvidence;
};

export function normalizeReadPermissionConstraint(
  options: object,
  requestedScopes: readonly string[]
): ReadPermissionConstraintResult {
  const input = readPermissionConstraintInput(options);

  if (!input.supplied) {
    return { supplied: false };
  }

  const constraint = input.value;
  const actor = isObjectRecord(constraint)
    ? normalizeUnknownText(constraint.actor)
    : undefined;

  if (!actor) {
    return {
      supplied: true,
      ok: false,
      issue: readPermissionScopeIssue(
        "read_permission_missing_actor",
        "Read context assembly blocked because the supplied read constraint is missing an actor label."
      )
    };
  }

  const allowedScopes = isObjectRecord(constraint)
    ? normalizeScopeList(constraint.allowedScopes)
    : [];

  if (allowedScopes.length === 0) {
    return {
      supplied: true,
      ok: false,
      issue: readPermissionScopeIssue(
        "read_permission_missing_allowed_scopes",
        "Read context assembly blocked because the supplied read constraint has no allowed scopes."
      )
    };
  }

  const allowed = new Set(allowedScopes);
  const deniedScopes = requestedScopes.filter((scope) => !allowed.has(scope));

  if (deniedScopes.length > 0) {
    return {
      supplied: true,
      ok: false,
      issue: readPermissionScopeIssue(
        "invalid_scope",
        "Read context assembly blocked because a requested scope is outside the supplied allowed scopes."
      )
    };
  }

  const validUntilInput = isObjectRecord(constraint) ? constraint.validUntil : undefined;
  const validUntilResult = normalizePermissionValidUntil(validUntilInput);

  if (!validUntilResult.ok) {
    return {
      supplied: true,
      ok: false,
      issue: readPermissionScopeIssue(
        "read_permission_invalid_expiry_constraint",
        "Read context assembly blocked because the supplied read expiry constraint is invalid."
      )
    };
  }

  const relationshipConstraintResult = normalizePermissionRelationshipConstraint(constraint);

  if (!relationshipConstraintResult.ok) {
    return {
      supplied: true,
      ok: false,
      issue: readPermissionScopeIssue(
        "read_permission_invalid_relationship_constraint",
        "Read context assembly blocked because the supplied read relationship constraint is invalid."
      )
    };
  }

  return {
    supplied: true,
    ok: true,
    value: {
      actor,
      allowedScopes,
      effectiveScopes: requestedScopes.length > 0 ? [...requestedScopes] : allowedScopes,
      validUntil: validUntilResult.value,
      excludeConflicts: relationshipConstraintResult.excludeConflicts,
      excludeSupersedes: relationshipConstraintResult.excludeSupersedes
    }
  };
}

export function withPermissionDeniedEvidence<T extends PermissionIssueLike>(
  issue: T,
  destination: string,
  scopes: readonly string[]
): T {
  if (!isReadPermissionDeniedIssue(issue.code)) {
    return issue;
  }

  return {
    ...issue,
    metadata: {
      action: "read",
      surface: "read_context",
      resource: "context",
      destination,
      scopes: [...scopes],
      contractVersion: READ_PERMISSION_CONTRACT_VERSION,
      contentReturned: false,
      sideEffects: "none"
    }
  };
}

function readPermissionConstraintInput(
  options: object
): { supplied: false } | { supplied: true; value: unknown } {
  const record = options as Record<string, unknown>;
  const keys = ["readPermission", "permission", "readPermissionConstraint"] as const;

  if (
    Object.hasOwn(record, "actor")
    || Object.hasOwn(record, "allowedScopes")
  ) {
    return {
      supplied: true,
      value: {
        actor: record.actor,
        allowedScopes: record.allowedScopes
      }
    };
  }

  for (const key of keys) {
    if (Object.hasOwn(record, key)) {
      return {
        supplied: true,
        value: record[key]
      };
    }
  }

  return { supplied: false };
}

function normalizePermissionValidUntil(
  value: unknown
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined) {
    return {
      ok: true,
      value: null
    };
  }

  if (typeof value !== "string" || !normalizeOptionalText(value)) {
    return { ok: false };
  }

  try {
    return {
      ok: true,
      value: normalizeExpiry(value).expires_at
    };
  } catch {
    return { ok: false };
  }
}

function normalizePermissionRelationshipConstraint(
  constraint: unknown
): { ok: true; excludeConflicts: boolean; excludeSupersedes: boolean } | { ok: false } {
  if (!isObjectRecord(constraint)) {
    return {
      ok: true,
      excludeConflicts: false,
      excludeSupersedes: false
    };
  }

  const excludeConflicts = normalizePermissionRelationshipFlag(
    constraint,
    "excludeConflicts"
  );
  const excludeSupersedes = normalizePermissionRelationshipFlag(
    constraint,
    "excludeSupersedes"
  );

  if (!excludeConflicts.ok || !excludeSupersedes.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    excludeConflicts: excludeConflicts.value,
    excludeSupersedes: excludeSupersedes.value
  };
}

function normalizePermissionRelationshipFlag(
  constraint: Record<string, unknown>,
  key: "excludeConflicts" | "excludeSupersedes"
): { ok: true; value: boolean } | { ok: false } {
  if (!Object.hasOwn(constraint, key) || constraint[key] === undefined) {
    return {
      ok: true,
      value: false
    };
  }

  if (typeof constraint[key] !== "boolean") {
    return { ok: false };
  }

  return {
    ok: true,
    value: constraint[key]
  };
}

function normalizeScopeList(value: unknown): string[] {
  const rawScopes = typeof value === "string"
    ? value.split(",")
    : Array.isArray(value)
      ? value
      : [];
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawScope of rawScopes) {
    if (typeof rawScope !== "string") {
      return [];
    }

    const scope = normalizeOptionalText(rawScope);

    if (!scope || seen.has(scope)) {
      continue;
    }

    seen.add(scope);
    normalized.push(scope);
  }

  return normalized;
}

function readPermissionScopeIssue(
  code: ReadContextPermissionIssueCode,
  message: string
): ReadPermissionConstraintIssue {
  return {
    code,
    message,
    recordIds: []
  };
}

function isReadPermissionDeniedIssue(
  code: string
): code is ReadContextPermissionIssueCode {
  return (
    code === "read_permission_missing_actor"
    || code === "read_permission_missing_allowed_scopes"
    || code === "read_permission_invalid_expiry_constraint"
    || code === "read_permission_invalid_relationship_constraint"
    || code === "invalid_scope"
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
