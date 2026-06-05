import type { ReadContextOptions, ReadContextStatusOptions } from "./ledger.js";
import type { ArgResult } from "./mcp-tool-arg-types.js";
import { toolError } from "./mcp-tool-results.js";
import {
  isRecord,
  unsupportedKeys
} from "./mcp-tool-arg-validators.js";
import type { ReadAccessOptions } from "./read-policy.js";
import type { ReadContextPermissionConstraint } from "./read-permissions.js";

export function readContextOptionsArg(args: Record<string, unknown>): ArgResult<ReadContextOptions> {
  const destination = args.destination;
  const scope = optionalRawScopeArg(args, "scope");
  const scopes = optionalRawScopeArg(args, "scopes");
  const readPermission = optionalReadPermissionArg(args.readPermission);
  const readAccess = optionalReadAccessArg(args);

  if (destination !== undefined && destination !== null && typeof destination !== "string") {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid destination argument.")
    };
  }

  if (!scope.ok) {
    return scope;
  }

  if (!scopes.ok) {
    return scopes;
  }

  if (!readPermission.ok) {
    return readPermission;
  }

  if (!readAccess.ok) {
    return readAccess;
  }

  const options: ReadContextOptions = {};

  if (destination !== undefined) {
    options.destination = destination;
  }

  if (scope.value !== undefined) {
    options.scope = scope.value;
  }

  if (scopes.value !== undefined) {
    options.scopes = scopes.value;
  }

  if (readPermission.value !== undefined) {
    options.readPermission = readPermission.value;
  }

  options.readAccess = readAccess.value;

  return {
    ok: true,
    value: options
  };
}

export function readContextStatusOptionsArg(
  args: Record<string, unknown>
): ArgResult<ReadContextStatusOptions> {
  const destination = args.destination;

  if (destination !== undefined && destination !== null && typeof destination !== "string") {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid destination argument.")
    };
  }

  const options: ReadContextStatusOptions = {};
  const readAccess = optionalReadAccessArg(args);

  if (!readAccess.ok) {
    return readAccess;
  }

  if (destination !== undefined) {
    options.destination = destination;
  }

  options.readAccess = readAccess.value;

  return {
    ok: true,
    value: options
  };
}

export function optionalReadAccessArg(args: Record<string, unknown>): ArgResult<ReadAccessOptions> {
  const value = args.readAccess ?? args.auth;

  if (value === undefined || value === null) {
    return {
      ok: true,
      value: {}
    };
  }

  if (!isRecord(value)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid read access argument.")
    };
  }

  const unsupported = unsupportedKeys(value, [
    "principalId",
    "signature",
    "signedAt",
    "nonce"
  ]);

  if (unsupported.length > 0) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Unsupported read access argument(s).")
    };
  }

  const auth: NonNullable<ReadAccessOptions["auth"]> = {};

  for (const key of ["principalId", "signature", "signedAt", "nonce"] as const) {
    if (value[key] !== undefined && value[key] !== null) {
      if (typeof value[key] !== "string") {
        return {
          ok: false,
          error: toolError("invalid_arguments", `Invalid read access ${key} argument.`)
        };
      }

      auth[key] = value[key];
    }
  }

  return {
    ok: true,
    value: {
      auth
    }
  };
}

function optionalRawScopeArg(
  args: Record<string, unknown>,
  key: "scope" | "scopes"
): ArgResult<string | readonly string[] | null> {
  const value = args[key];

  if (value === undefined) {
    return { ok: true };
  }

  if (value === null || typeof value === "string") {
    return {
      ok: true,
      value
    };
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return {
      ok: true,
      value
    };
  }

  return {
    ok: false,
    error: toolError("invalid_arguments", `Invalid ${key} argument.`)
  };
}

function optionalReadPermissionArg(
  value: unknown
): ArgResult<ReadContextPermissionConstraint | null> {
  if (value === undefined) {
    return { ok: true };
  }

  if (value === null) {
    return {
      ok: true,
      value: null
    };
  }

  if (!isRecord(value)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid readPermission argument.")
    };
  }

  const unsupported = unsupportedKeys(value, [
    "actor",
    "allowedScopes",
    "validUntil",
    "excludeConflicts",
    "excludeSupersedes"
  ]);

  if (unsupported.length > 0) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Unsupported readPermission argument(s).")
    };
  }

  const constraint: ReadContextPermissionConstraint = {};

  if (value.actor !== undefined) {
    if (value.actor !== null && typeof value.actor !== "string") {
      return {
        ok: false,
        error: toolError("invalid_arguments", "Invalid readPermission.actor argument.")
      };
    }

    constraint.actor = value.actor;
  }

  if (value.allowedScopes !== undefined) {
    if (value.allowedScopes === null) {
      constraint.allowedScopes = null;
    } else if (typeof value.allowedScopes === "string") {
      constraint.allowedScopes = value.allowedScopes;
    } else if (
      Array.isArray(value.allowedScopes)
      && value.allowedScopes.every((item) => typeof item === "string")
    ) {
      constraint.allowedScopes = value.allowedScopes;
    } else {
      return {
        ok: false,
        error: toolError("invalid_arguments", "Invalid readPermission.allowedScopes argument.")
      };
    }
  }

  if (value.validUntil !== undefined) {
    if (value.validUntil !== null && typeof value.validUntil !== "string") {
      return {
        ok: false,
        error: toolError("invalid_arguments", "Invalid readPermission.validUntil argument.")
      };
    }

    constraint.validUntil = value.validUntil;
  }

  if (Object.hasOwn(value, "excludeConflicts")) {
    (constraint as Record<string, unknown>).excludeConflicts = value.excludeConflicts;
  }

  if (Object.hasOwn(value, "excludeSupersedes")) {
    (constraint as Record<string, unknown>).excludeSupersedes = value.excludeSupersedes;
  }

  return {
    ok: true,
    value: constraint
  };
}
