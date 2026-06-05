import { reportableDestination } from "./destination-safety.js";
import type { RecordHistory } from "./ledger-history.js";
import type { ReviewContext } from "./relationship-review.js";
import {
  redactedPreviewForReport,
  reportableRecordId,
  sanitizeJsonForBoundary
} from "./safety.js";
import type { MemoryRecord } from "./types.js";

export function safeMcpRecordSummary(record: MemoryRecord): Record<string, unknown> {
  return {
    id: reportableRecordId(record.id),
    memory_preview: redactedPreviewForReport(record.memory),
    status: record.status,
    risk: record.risk,
    decision: record.decision,
    decision_reason: redactedPreviewForReport(record.decision_reason),
    kind: record.kind,
    tags: record.tags.map((tag) => redactedPreviewForReport(tag)),
    source: {
      type: record.source.type,
      uri_preview: redactedPreviewForReport(record.source.uri),
      verification: {
        status: record.source.verification?.status ?? "unverified",
        method: record.source.verification?.method ?? "none"
      }
    },
    source_trust: record.source_trust,
    scope: redactedPreviewForReport(record.scope),
    destination: reportableDestination(record.destination),
    confidence: record.confidence,
    priority: record.priority,
    applies_to_paths: record.applies_to_paths.map((path) => redactedPreviewForReport(path)),
    expires_at: record.expires_at,
    supersedes: record.supersedes.map(reportableRecordId),
    conflicts_with: record.conflicts_with.map(reportableRecordId),
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

export function safeMcpRecordSummaries(records: readonly MemoryRecord[]): Array<Record<string, unknown>> {
  return records.map(safeMcpRecordSummary);
}

export function safeMcpReviewContext(reviewContext: ReviewContext): Record<string, unknown> {
  return {
    candidate: safeMcpRecordSummary(reviewContext.candidate),
    supersedes: safeMcpRecordSummaries(reviewContext.supersedes),
    conflicts_with: safeMcpRecordSummaries(reviewContext.conflicts_with),
    incoming: safeReferenceSet(reviewContext.incoming),
    incoming_superseded_by: safeMcpRecordSummaries(reviewContext.incoming_superseded_by),
    incoming_conflicts_with: safeMcpRecordSummaries(reviewContext.incoming_conflicts_with),
    cycles: reviewContext.cycles.map((cycle) => ({
      relationship: cycle.relationship,
      recordIds: cycle.recordIds.map(reportableRecordId),
      statuses: [...cycle.statuses],
      destinations: cycle.destinations.map(reportableDestination)
    }))
  };
}

export function safeMcpRecordHistory(history: RecordHistory): Record<string, unknown> {
  return sanitizeJsonForBoundary({
    record: safeMcpRecordSummary(history.record),
    events: history.events.map((event) => {
      return sanitizeJsonForBoundary({
        ...event,
        id: reportableEventId(event.id),
        record_id: reportableRecordId(event.record_id),
        retired_record_ids: "retired_record_ids" in event
          ? event.retired_record_ids.map(reportableRecordId)
          : undefined,
        override_record_ids: "override_record_ids" in event
          ? event.override_record_ids.map(reportableRecordId)
          : undefined,
        cycle_record_ids: "cycle_record_ids" in event
          ? event.cycle_record_ids.map((cycle) => cycle.map(reportableRecordId))
          : undefined
      });
    }),
    issues: history.issues
  }) as Record<string, unknown>;
}

export function safeHumanReviewPrompt(reviewContext: ReviewContext): string {
  const summary = safeMcpRecordSummary(reviewContext.candidate);

  return [
    `Review pending MemPR memory ${String(summary.id)}.`,
    "",
    `memory_preview: ${String(summary.memory_preview)}`,
    `status: ${String(summary.status)}`,
    `risk: ${String(summary.risk)}`,
    `destination: ${String(summary.destination)}`,
    "",
    "Decide whether to accept or reject it, and include a review reason."
  ].join("\n");
}

function safeReferenceSet(referenceSet: {
  supersedes: readonly string[];
  conflicts_with: readonly string[];
}): Record<string, string[]> {
  return {
    supersedes: referenceSet.supersedes.map(reportableRecordId),
    conflicts_with: referenceSet.conflicts_with.map(reportableRecordId)
  };
}

function reportableEventId(id: string): string {
  return redactedPreviewForReport(id, 120);
}
