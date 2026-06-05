import {
  appendEvent,
  createEventId,
  readEvents,
  replayEvents,
} from "./events.js";
import type { LedgerConsistencyIssue } from "./ledger.js";
import { checkLedgerConsistency, resolveLedgerPaths } from "./ledger.js";
import {
  duplicateRecordIds,
  limitMigrationIds,
  MAX_REPORTED_MIGRATION_IDS,
  readLegacyLedger
} from "./migration-legacy-ledger.js";
import { withStoreLock } from "./storage.js";
import { safeReadOptionalStoreFile } from "./store-paths.js";
import type { LedgerPaths } from "./types.js";
import type {
  LedgerMigrationIssue,
  LedgerMigrationIssueCode,
  LedgerMigrationOptions,
  LedgerMigrationReason,
  LedgerMigrationResult
} from "./migration-types.js";

export type {
  LedgerMigrationIssue,
  LedgerMigrationIssueCode,
  LedgerMigrationOptions,
  LedgerMigrationReason,
  LedgerMigrationResult
} from "./migration-types.js";

export async function migrateLedgerEvents(
  root = process.cwd(),
  options: LedgerMigrationOptions = {}
): Promise<LedgerMigrationResult> {
  const paths = resolveLedgerPaths(root);
  const dryRun = options.dryRun === true;

  const existingHistory = await assessExistingHistory(paths.root, dryRun);

  if (existingHistory) {
    return existingHistory;
  }

  if (dryRun) {
    return assessEmptyHistoryMigration(paths, dryRun);
  }

  return withStoreLock(paths.directory, async () => {
      const lockedHistory = await assessExistingHistory(paths.root, dryRun);

      if (lockedHistory) {
        return lockedHistory;
      }

      const assessed = await assessEmptyHistoryMigration(paths, dryRun);

      if (!assessed.wouldChange) {
        return assessed;
      }

      const ledger = await readLegacyLedger(paths);

      if (ledger.issue) {
        return result(paths.root, dryRun, false, false, "ledger_malformed", {
          ledgerCount: 0,
          eventCount: 0,
          migratedCount: 0,
          issues: [ledger.issue]
        });
      }

      const duplicates = duplicateRecordIds(ledger.records);

      if (duplicates.length > 0) {
        return result(paths.root, dryRun, false, false, "ledger_malformed", {
          ledgerCount: ledger.records.length,
          eventCount: 0,
          migratedCount: 0,
          issues: [{
            code: "duplicate_record_id",
            message: "Legacy ledger contains duplicate record ids.",
            recordIds: limitMigrationIds(duplicates),
            omittedRecordIdCount: Math.max(0, duplicates.length - MAX_REPORTED_MIGRATION_IDS)
          }]
        });
      }

      const migrationEvent = {
        id: createEventId(),
        type: "ledger_migrated" as const,
        created_at: new Date().toISOString(),
        source: "legacy_ledger_jsonl" as const,
        record_count: ledger.records.length,
        records: ledger.records
      };

      try {
        replayEvents([migrationEvent]);
        await appendEvent(migrationEvent, paths.root);
      } catch {
        return result(paths.root, dryRun, false, true, "event_write_failed", {
          ledgerCount: ledger.records.length,
          eventCount: 0,
          migratedCount: 0,
          issues: [{
            code: "event_write_failed",
            message: "Migration event could not be written."
          }]
        });
      }

      return result(paths.root, dryRun, true, true, "migrated", {
        ledgerCount: ledger.records.length,
        eventCount: 1,
        migratedCount: ledger.records.length,
        issues: []
      });
  });
}

async function assessExistingHistory(
  root: string,
  dryRun: boolean
): Promise<LedgerMigrationResult | undefined> {
  const paths = resolveLedgerPaths(root);
  let eventContent: string;

  try {
    const eventFile = await safeReadOptionalStoreFile(root, "events.jsonl");
    eventContent = eventFile.exists ? eventFile.content : "";
  } catch {
    return result(paths.root, dryRun, false, false, "event_history_drift", {
      ledgerCount: 0,
      eventCount: null,
      migratedCount: 0,
      issues: [{
        code: "event_read_failed",
        message: "Event history could not be read."
      }]
    });
  }

  if (!eventContent.trim()) {
    return undefined;
  }

  let eventCount: number | null = null;

  try {
    eventCount = (await readEvents(root)).length;
  } catch {
    eventCount = null;
  }

  const consistency = await checkLedgerConsistency(root);

  if (consistency.ok) {
    return result(paths.root, dryRun, false, false, "event_history_matches_ledger", {
      ledgerCount: consistency.currentCount,
      eventCount,
      migratedCount: 0,
      issues: []
    });
  }

  return result(paths.root, dryRun, false, false, "event_history_drift", {
    ledgerCount: consistency.currentCount,
    eventCount,
    migratedCount: 0,
    issues: consistency.issues.map(fromConsistencyIssue)
  });
}

async function assessEmptyHistoryMigration(
  paths: LedgerPaths,
  dryRun: boolean
): Promise<LedgerMigrationResult> {
  const ledger = await readLegacyLedger(paths);

  if (ledger.issue) {
    return result(paths.root, dryRun, false, false, "ledger_malformed", {
      ledgerCount: 0,
      eventCount: 0,
      migratedCount: 0,
      issues: [ledger.issue]
    });
  }

  const duplicates = duplicateRecordIds(ledger.records);

  if (duplicates.length > 0) {
    return result(paths.root, dryRun, false, false, "ledger_malformed", {
      ledgerCount: ledger.records.length,
      eventCount: 0,
      migratedCount: 0,
      issues: [{
        code: "duplicate_record_id",
        message: "Legacy ledger contains duplicate record ids.",
        recordIds: limitMigrationIds(duplicates),
        omittedRecordIdCount: Math.max(0, duplicates.length - MAX_REPORTED_MIGRATION_IDS)
      }]
    });
  }

  if (ledger.records.length === 0) {
    return result(paths.root, dryRun, false, false, "empty_ledger", {
      ledgerCount: 0,
      eventCount: 0,
      migratedCount: 0,
      issues: []
    });
  }

  return result(paths.root, dryRun, false, true, dryRun ? "would_migrate" : "migrated", {
    ledgerCount: ledger.records.length,
    eventCount: 0,
    migratedCount: dryRun ? 0 : ledger.records.length,
    issues: []
  });
}

function fromConsistencyIssue(issue: LedgerConsistencyIssue): LedgerMigrationIssue {
  const recordIds = [
    ...(issue.missingFromReplayIds ?? []),
    ...(issue.missingFromLedgerIds ?? []),
    ...(issue.changedRecordIds ?? [])
  ];

  return {
    code: normalizeConsistencyIssueCode(issue.code),
    message: issue.message,
    line: issue.line,
    currentCount: issue.currentCount,
    replayedCount: issue.replayedCount,
    recordIds: recordIds.length > 0 ? limitMigrationIds(recordIds) : undefined,
    omittedRecordIdCount: issue.omittedRecordIdCount,
    orderMismatch: issue.orderMismatch
  };
}

function normalizeConsistencyIssueCode(code: LedgerConsistencyIssue["code"]): LedgerMigrationIssueCode {
  if (code === "event_file_missing") {
    return "event_history_drift";
  }

  return code;
}

function result(
  root: string,
  dryRun: boolean,
  changed: boolean,
  wouldChange: boolean,
  reason: LedgerMigrationReason,
  details: Omit<LedgerMigrationResult, "root" | "dryRun" | "changed" | "wouldChange" | "reason">
): LedgerMigrationResult {
  return {
    root,
    dryRun,
    changed,
    wouldChange,
    reason,
    ...details
  };
}
