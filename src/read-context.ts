import { createCorrelationId } from "./diagnostics.js";
import {
  normalizeDestinationForOperation,
  reportableDestination
} from "./destination-safety.js";
import { reportableRecordId } from "./safety.js";
import { readRecords, resolveLedgerPaths } from "./ledger-store.js";
import {
  evaluateReadAccess,
  MEMPR_READ_POLICY_DENIED_MESSAGE
} from "./read-policy.js";
import {
  normalizeReadPermissionConstraint,
  withPermissionDeniedEvidence
} from "./read-permission-constraints.js";
import type {
  NormalizedReadPermissionConstraint
} from "./read-permission-constraints.js";
import {
  readContextIssues,
  readContextWarnings
} from "./read-context-issues.js";
import type {
  ContextMemoryRecord,
  ReadContext,
  ReadContextDestinationStatus,
  ReadContextIssue,
  ReadContextOptions,
  ReadContextStatus,
  ReadContextStatusOptions
} from "./read-context-types.js";
import { normalizeOptionalText } from "./text-normalization.js";
import type { MemoryRecord } from "./types.js";

export {
  formatExportBlockingIssue,
  readContextIssues,
  readContextWarnings
} from "./read-context-issues.js";
export type {
  ContextMemoryRecord,
  ReadContext,
  ReadContextDestinationStatus,
  ReadContextIssue,
  ReadContextIssueCode,
  ReadContextOptions,
  ReadContextStatus,
  ReadContextStatusCounts,
  ReadContextStatusOptions,
  ReadContextWarning,
  ReadContextWarningCode
} from "./read-context-types.js";

export async function assembleReadContext(
  options: ReadContextOptions = {},
  root = process.cwd()
): Promise<ReadContext> {
  const requestedDestination = options.destination ?? "MEMORY.md";
  const scopes = normalizeScopeFilters(options);
  const permissionConstraint = normalizeReadPermissionConstraint(options, scopes);
  const paths = resolveLedgerPaths(root);
  let targetDestination: string;

  try {
    targetDestination = normalizeDestinationForOperation(requestedDestination, "context");
  } catch {
    const destination = reportableDestination(requestedDestination);
    return readContextBlocked(destination, scopes, {
      code: destination === requestedDestination.trim() ? "invalid_destination" : "secret_like_content",
      message: destination === requestedDestination.trim()
        ? "Read context assembly blocked by an invalid destination path."
        : "Read context assembly blocked by secret-like destination content.",
      recordIds: []
    });
  }

  if (permissionConstraint.supplied && !permissionConstraint.ok) {
    return readContextBlocked(
      targetDestination,
      scopes,
      withPermissionDeniedEvidence(permissionConstraint.issue, targetDestination, scopes)
    );
  }

  const effectiveScopes = permissionConstraint.supplied
    ? permissionConstraint.value.effectiveScopes
    : scopes;

  const readDecision = await evaluateReadAccess(paths.root, {
    action: "read",
    surface: "read_context",
    resource: "context",
    destination: targetDestination,
    scopes: effectiveScopes
  }, options.readAccess ?? {});

  if (!readDecision.ok) {
    return readContextBlocked(targetDestination, effectiveScopes, {
      code: readDecision.code,
      message: `${MEMPR_READ_POLICY_DENIED_MESSAGE} Correlation ID: ${createCorrelationId()}.`,
      recordIds: []
    });
  }

  let records: MemoryRecord[];

  try {
    records = await readRecords(paths);
  } catch {
    return readContextBlocked(targetDestination, effectiveScopes, {
      code: "ledger_read_failed",
      message: "Read context assembly blocked because ledger records could not be read.",
      recordIds: []
    });
  }

  const accepted = records.filter((record) => {
    return record.status === "accepted" && record.destination === targetDestination;
  });
  const issues = readContextIssues(accepted);

  if (issues.length > 0) {
    return {
      ok: false,
      destination: reportableDestination(targetDestination),
      scope: displayScope(effectiveScopes),
      scopes: effectiveScopes,
      recordIds: [],
      recordCount: 0,
      records: [],
      issues,
      warnings: permissionConstraint.supplied ? [] : readContextWarnings(accepted)
    };
  }

  const scopedRecords = effectiveScopes.length === 0
    ? accepted
    : accepted.filter((record) => effectiveScopes.includes(record.scope));
  const expiryFilteredRecords = permissionConstraint.supplied
    ? filterRecordsByPermissionExpiry(scopedRecords, permissionConstraint.value.validUntil)
    : scopedRecords;
  const contextRecords = permissionConstraint.supplied
    ? filterRecordsByPermissionRelationships(expiryFilteredRecords, permissionConstraint.value)
    : expiryFilteredRecords;
  const warnings = permissionConstraint.supplied
    ? readContextWarnings(contextRecords)
    : readContextWarnings(accepted);

  return {
    ok: true,
    destination: reportableDestination(targetDestination),
    scope: displayScope(effectiveScopes),
    scopes: effectiveScopes,
    recordIds: contextRecords.map((record) => reportableRecordId(record.id)),
    recordCount: contextRecords.length,
    records: contextRecords.map(contextMemoryRecord),
    issues: [],
    warnings
  };
}

export async function assembleContext(
  options: ReadContextOptions = {},
  root = process.cwd()
): Promise<ReadContext> {
  return assembleReadContext(options, root);
}

export async function summarizeReadContextStatus(
  options: ReadContextStatusOptions = {},
  root = process.cwd()
): Promise<ReadContextStatus> {
  const requestedDestination = options.destination;
  const paths = resolveLedgerPaths(root);
  let targetDestination: string | null = null;

  if (requestedDestination !== undefined && requestedDestination !== null) {
    try {
      targetDestination = normalizeDestinationForOperation(requestedDestination, "context_status");
    } catch {
      const destination = reportableDestination(requestedDestination);
      const issue: ReadContextIssue = {
        code: destination === requestedDestination.trim() ? "invalid_destination" : "secret_like_content",
        message: destination === requestedDestination.trim()
          ? "Read context status summary blocked by an invalid destination path."
          : "Read context status summary blocked by secret-like destination content.",
        recordIds: []
      };

      return {
        ok: false,
        blocked: true,
        destination,
        destinationCount: 1,
        blockedCount: 1,
        warningCount: 0,
        destinations: [
          emptyReadContextDestinationStatus(
            destination,
            issue
          )
        ],
        issues: [issue]
      };
    }
  }

  const readDecision = await evaluateReadAccess(paths.root, {
    action: "read",
    surface: "read_context_status",
    resource: "context_status",
    destination: targetDestination
  }, options.readAccess ?? {});

  if (!readDecision.ok) {
    const issue: ReadContextIssue = {
      code: readDecision.code,
      message: `${MEMPR_READ_POLICY_DENIED_MESSAGE} Correlation ID: ${createCorrelationId()}.`,
      recordIds: []
    };

    return {
      ok: false,
      blocked: true,
      destination: targetDestination,
      destinationCount: targetDestination ? 1 : 0,
      blockedCount: targetDestination ? 1 : 0,
      warningCount: 0,
      destinations: targetDestination
        ? [emptyReadContextDestinationStatus(targetDestination, issue)]
        : [],
      issues: [issue]
    };
  }

  let records: MemoryRecord[];

  try {
    records = await readRecords(paths);
  } catch {
    const issue: ReadContextIssue = {
      code: "ledger_read_failed",
      message: "Read context status summary blocked because ledger records could not be read.",
      recordIds: []
    };

    return {
      ok: false,
      blocked: true,
      destination: targetDestination,
      destinationCount: targetDestination ? 1 : 0,
      blockedCount: targetDestination ? 1 : 0,
      warningCount: 0,
      destinations: targetDestination
        ? [emptyReadContextDestinationStatus(targetDestination, issue)]
        : [],
      issues: [issue]
    };
  }

  const destinations = targetDestination
    ? [targetDestination]
    : readContextStatusDestinations(records);
  const summaries = destinations.map((destination) => {
    return summarizeReadContextDestination(destination, records);
  });
  const blockedCount = summaries.filter((summary) => summary.blocked).length;
  const warningCount = summaries.reduce((total, summary) => {
    return total + summary.warnings.length;
  }, 0);

  return {
    ok: blockedCount === 0,
    blocked: blockedCount > 0,
    destination: targetDestination ? reportableDestination(targetDestination) : null,
    destinationCount: summaries.length,
    blockedCount,
    warningCount,
    destinations: summaries,
    issues: []
  };
}

export async function getReadContextStatus(
  options: ReadContextStatusOptions = {},
  root = process.cwd()
): Promise<ReadContextStatus> {
  return summarizeReadContextStatus(options, root);
}

export async function assembleContextStatus(
  options: ReadContextStatusOptions = {},
  root = process.cwd()
): Promise<ReadContextStatus> {
  return summarizeReadContextStatus(options, root);
}

export async function getContextStatus(
  options: ReadContextStatusOptions = {},
  root = process.cwd()
): Promise<ReadContextStatus> {
  return summarizeReadContextStatus(options, root);
}

function filterRecordsByPermissionExpiry(
  records: readonly MemoryRecord[],
  validUntil: string | null
): MemoryRecord[] {
  if (!validUntil) {
    return [...records];
  }

  const validUntilMs = Date.parse(validUntil);

  return records.filter((record) => {
    if (!record.expires_at) {
      return true;
    }

    return Date.parse(record.expires_at) > validUntilMs;
  });
}

function filterRecordsByPermissionRelationships(
  records: readonly MemoryRecord[],
  constraint: Pick<NormalizedReadPermissionConstraint, "excludeConflicts" | "excludeSupersedes">
): MemoryRecord[] {
  if (!constraint.excludeConflicts && !constraint.excludeSupersedes) {
    return [...records];
  }

  return records.filter((record) => {
    if (constraint.excludeConflicts && record.conflicts_with.length > 0) {
      return false;
    }

    if (constraint.excludeSupersedes && record.supersedes.length > 0) {
      return false;
    }

    return true;
  });
}

function readContextBlocked(
  destination: string,
  scopes: readonly string[],
  issue: ReadContextIssue
): ReadContext {
  return {
    ok: false,
    destination,
    scope: displayScope(scopes),
    scopes: [...scopes],
    recordIds: [],
    recordCount: 0,
    records: [],
    issues: [issue],
    warnings: []
  };
}

function emptyReadContextDestinationStatus(
  destination: string,
  issue: ReadContextIssue
): ReadContextDestinationStatus {
  return {
    destination,
    ok: false,
    blocked: true,
    counts: {
      total: 0,
      accepted: 0,
      pending: 0,
      rejected: 0
    },
    acceptedRecordIds: [],
    issues: [issue],
    warnings: []
  };
}

function readContextStatusDestinations(records: readonly MemoryRecord[]): string[] {
  const destinations: string[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.destination)) {
      continue;
    }

    seen.add(record.destination);
    destinations.push(record.destination);
  }

  return destinations.sort();
}

function summarizeReadContextDestination(
  destination: string,
  records: readonly MemoryRecord[]
): ReadContextDestinationStatus {
  const destinationRecords = records.filter((record) => record.destination === destination);
  const accepted = destinationRecords.filter((record) => record.status === "accepted");
  const pending = destinationRecords.filter((record) => record.status === "pending");
  const rejected = destinationRecords.filter((record) => record.status === "rejected");
  const issues = readContextIssues(accepted);
  const warnings = readContextWarnings(accepted);

  return {
    destination: reportableDestination(destination),
    ok: issues.length === 0,
    blocked: issues.length > 0,
    counts: {
      total: destinationRecords.length,
      accepted: accepted.length,
      pending: pending.length,
      rejected: rejected.length
    },
    acceptedRecordIds: accepted.map((record) => reportableRecordId(record.id)),
    issues,
    warnings
  };
}

function displayScope(scopes: readonly string[]): string | null {
  return scopes.length === 1 ? scopes[0] : null;
}

function normalizeScopeFilters(options: ReadContextOptions): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const scope of rawScopeFilters(options)) {
    const value = normalizeOptionalText(scope);

    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function contextMemoryRecord(record: MemoryRecord): ContextMemoryRecord {
  return {
    id: reportableRecordId(record.id),
    memory: record.memory,
    kind: record.kind,
    tags: [...record.tags],
    source: {
      type: record.source.type,
      uri: record.source.uri,
      verification: {
        status: record.source.verification?.status ?? "unverified",
        method: record.source.verification?.method ?? "none"
      }
    },
    source_trust: record.source_trust,
    scope: record.scope,
    destination: record.destination,
    confidence: record.confidence,
    priority: record.priority,
    applies_to_paths: [...record.applies_to_paths],
    expires_at: record.expires_at
  };
}

function rawScopeFilters(options: ReadContextOptions): string[] {
  return [
    ...scopeFilterValues(options.scopes),
    ...scopeFilterValues(options.scope)
  ];
}

function scopeFilterValues(value: string | readonly string[] | null | undefined): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return value.split(",");
  }

  return [...value];
}
