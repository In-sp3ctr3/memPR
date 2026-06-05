import { isRecordExpired } from "./ledger-records.js";
import { reportableDestination } from "./destination-safety.js";
import { analyzeRelationships } from "./relationships.js";
import { scanAcceptedMemoryRecords } from "./scanner.js";
import { reportableRecordId } from "./safety.js";
import type { MemoryScanFinding } from "./scanner.js";
import type {
  ReadContextIssue,
  ReadContextWarning
} from "./read-context-types.js";
import type { MemoryRecord } from "./types.js";

const READ_CONTEXT_STALE_WARNING_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function readContextWarnings(
  records: readonly MemoryRecord[],
  now = new Date()
): ReadContextWarning[] {
  const expiryWarnings = records.flatMap((record) => {
    const warning = expiringRecordWarning(record, now);
    return warning ? [warning] : [];
  });
  const scan = scanAcceptedMemoryRecords(records);
  const scanWarnings = scan.warnings.map(scanFindingWarning);

  return [
    ...expiryWarnings,
    ...scanWarnings
  ];
}

export function formatExportBlockingIssue(issue: ReadContextIssue): string {
  if (issue.code === "expired_record") {
    return formatExpiredExportError(issue.recordIds);
  }

  if (issue.code === "secret_like_content" || issue.code === "managed_block_marker_content") {
    return [
      "Cannot export accepted memory records with blocked content.",
      `Record IDs: ${issue.recordIds.join(", ")}.`,
      issue.message
    ].join(" ");
  }

  if (issue.code === "relationship_conflict") {
    return formatRelationshipExportError(
      "conflict",
      "conflicts_with",
      issue.recordIds[0],
      issue.recordIds[1]
    );
  }

  if (issue.code === "relationship_supersession") {
    return formatRelationshipExportError(
      "supersession",
      "supersedes",
      issue.recordIds[0],
      issue.recordIds[1]
    );
  }

  if (issue.code === "relationship_cycle") {
    return [
      "Cannot export accepted memory records with a supersession cycle.",
      `Record IDs: ${issue.recordIds.join(", ")}.`
    ].join(" ");
  }

  return "Cannot export accepted memory records while read-context assembly is blocked.";
}

export function readContextIssues(records: readonly MemoryRecord[]): ReadContextIssue[] {
  const expiredIds = expiredRecordIds(records);
  const scan = scanAcceptedMemoryRecords(records);
  const issues: ReadContextIssue[] = [];

  if (expiredIds.length > 0) {
    issues.push({
      code: "expired_record",
      message: `Read context assembly blocked by ${expiredIds.length} expired accepted memory record(s).`,
      recordIds: expiredIds
    });
  }

  issues.push(...readContextRelationshipIssues(records));
  issues.push(...scan.issues.map(scanFindingIssue));
  return issues;
}

function expiredRecordIds(records: readonly MemoryRecord[], now = new Date()): string[] {
  return records
    .filter((record) => isRecordExpired(record, now))
    .map((record) => reportableRecordId(record.id));
}

function expiringRecordWarning(
  record: MemoryRecord,
  now: Date
): ReadContextWarning | undefined {
  if (!record.expires_at || isRecordExpired(record, now)) {
    return undefined;
  }

  const expiresAtMs = Date.parse(record.expires_at);

  if (Number.isNaN(expiresAtMs)) {
    return undefined;
  }

  const msUntilExpiry = expiresAtMs - now.getTime();
  const daysUntilExpiry = Math.ceil(msUntilExpiry / DAY_IN_MS);

  if (daysUntilExpiry > READ_CONTEXT_STALE_WARNING_DAYS) {
    return undefined;
  }

  return {
    code: "expiring_record",
    message: `Accepted memory record expires within ${READ_CONTEXT_STALE_WARNING_DAYS} day(s).`,
    destination: reportableDestination(record.destination),
    recordIds: [reportableRecordId(record.id)],
    expiresAt: record.expires_at,
    daysUntilExpiry: Math.max(0, daysUntilExpiry),
    warningWindowDays: READ_CONTEXT_STALE_WARNING_DAYS
  };
}

function scanFindingWarning(finding: MemoryScanFinding): ReadContextWarning {
  return {
    code: "sensitive_content",
    message: `${finding.message} Correlation ID: ${finding.correlationId}.`,
    destination: reportableDestination(finding.destination),
    recordIds: finding.recordIds.map(reportableRecordId),
    expiresAt: null,
    daysUntilExpiry: null,
    warningWindowDays: null
  };
}

function formatExpiredExportError(recordIds: readonly string[]): string {
  return [
    `Cannot export ${recordIds.length} expired accepted memory record(s).`,
    `Record IDs: ${recordIds.join(", ")}.`
  ].join(" ");
}

function scanFindingIssue(finding: MemoryScanFinding): ReadContextIssue {
  if (finding.code === "invalid_destination") {
    return {
      code: "invalid_destination",
      message: `${finding.message} Correlation ID: ${finding.correlationId}.`,
      recordIds: finding.recordIds.map(reportableRecordId)
    };
  }

  return {
    code: finding.code === "managed_block_marker_content"
      ? "managed_block_marker_content"
      : "secret_like_content",
    message: `${finding.message} Correlation ID: ${finding.correlationId}.`,
    recordIds: finding.recordIds.map(reportableRecordId)
  };
}

function readContextRelationshipIssues(records: readonly MemoryRecord[]): ReadContextIssue[] {
  const acceptedIds = new Set(records.map((record) => record.id));
  const issues: ReadContextIssue[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    for (const linkedRecordId of record.conflicts_with) {
      if (acceptedIds.has(linkedRecordId)) {
        pushReadContextRelationshipIssue(
          issues,
          seen,
          "relationship_conflict",
          "conflicts_with",
          record.id,
          linkedRecordId
        );
      }
    }

    for (const linkedRecordId of record.supersedes) {
      if (acceptedIds.has(linkedRecordId)) {
        pushReadContextRelationshipIssue(
          issues,
          seen,
          "relationship_supersession",
          "supersedes",
          record.id,
          linkedRecordId
        );
      }
    }
  }

  for (const cycle of analyzeRelationships(records).cycles) {
    pushReadContextCycleIssue(issues, seen, cycle.recordIds);
  }

  return issues;
}

function pushReadContextRelationshipIssue(
  issues: ReadContextIssue[],
  seen: Set<string>,
  code: "relationship_conflict" | "relationship_supersession",
  relationship: "conflicts_with" | "supersedes",
  recordId: string,
  linkedRecordId: string
): void {
  const key = [
    code,
    ...[recordId, linkedRecordId].sort()
  ].join(":");

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  issues.push({
    code,
    message: `Read context assembly blocked by accepted ${relationship} relationship.`,
    recordIds: [reportableRecordId(recordId), reportableRecordId(linkedRecordId)],
    relationship
  });
}

function pushReadContextCycleIssue(
  issues: ReadContextIssue[],
  seen: Set<string>,
  recordIds: readonly string[]
): void {
  const key = [
    "relationship_cycle",
    ...recordIds
  ].join(":");

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  issues.push({
    code: "relationship_cycle",
    message: "Read context assembly blocked by accepted supersession cycle.",
    recordIds: recordIds.map(reportableRecordId),
    relationship: "supersedes"
  });
}

function formatRelationshipExportError(
  relationship: "conflict" | "supersession",
  fieldName: "conflicts_with" | "supersedes",
  recordId: string,
  linkedRecordId: string
): string {
  return [
    `Cannot export accepted memory records with a ${relationship} relationship (${fieldName}).`,
    `Record IDs: ${recordId}, ${linkedRecordId}.`
  ].join(" ");
}
