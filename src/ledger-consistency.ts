import {
  readEvents,
  replayEvents,
  verifyEventIntegrity
} from "./events.js";
import { normalizeLocalFileDestination } from "./export-adapters.js";
import { createCorrelationId } from "./diagnostics.js";
import { normalizeRecord } from "./ledger-records.js";
import { reportableRecordId } from "./safety.js";
import {
  readRecords,
  resolveLedgerPaths,
  writeRecords
} from "./ledger-store.js";
import {
  assertReadAccess,
  ReadDeniedError
} from "./read-policy.js";
import type { ReadAccessOptions } from "./read-policy.js";
import { withStoreLock } from "./storage.js";
import { safeReadOptionalStoreFile } from "./store-paths.js";
import type { MemoryRecord } from "./types.js";

const MAX_ISSUE_IDS = 20;

export type LedgerConsistencyIssueCode =
  | "ledger_read_failed"
  | "event_file_missing"
  | "invalid_record_destination"
  | "event_malformed"
  | "event_hash_mismatch"
  | "event_read_failed"
  | "event_replay_failed"
  | "ledger_replay_mismatch";

export interface LedgerConsistencyIssue {
  code: LedgerConsistencyIssueCode;
  message: string;
  currentCount?: number;
  replayedCount?: number;
  line?: number;
  missingFromReplayIds?: string[];
  missingFromLedgerIds?: string[];
  changedRecordIds?: string[];
  omittedRecordIdCount?: number;
  orderMismatch?: boolean;
  recordIds?: string[];
}

export interface LedgerConsistencyStatus {
  ok: boolean;
  root: string;
  currentCount: number;
  replayedCount: number | null;
  issues: LedgerConsistencyIssue[];
}

export interface LedgerRepairOptions {
  fromEvents?: boolean;
  confirm?: boolean;
}

export interface LedgerRepairResult {
  root: string;
  changed: boolean;
  wouldChange: boolean;
  repairedCount: number;
  issues: LedgerConsistencyIssue[];
}

export async function checkLedgerConsistency(
  root = process.cwd(),
  readAccess: ReadAccessOptions = {}
): Promise<LedgerConsistencyStatus> {
  const paths = resolveLedgerPaths(root);
  const issues: LedgerConsistencyIssue[] = [];
  let currentRecords: MemoryRecord[];

  try {
    await assertReadAccess(root, {
      action: "read",
      surface: "consistency_status",
      resource: "consistency"
    }, readAccess);
  } catch (error) {
    if (error instanceof ReadDeniedError) {
      return {
        ok: false,
        root: paths.root,
        currentCount: 0,
        replayedCount: null,
        issues: [{
          code: "event_read_failed",
          message: `${error.message} Correlation ID: ${createCorrelationId()}.`
        }]
      };
    }

    throw error;
  }

  try {
    currentRecords = await readRecords(paths);
  } catch {
    return {
      ok: false,
      root: paths.root,
      currentCount: 0,
      replayedCount: null,
      issues: [{
        code: "ledger_read_failed",
        message: "Ledger records could not be read."
      }]
    };
  }

  let hasEventFile: boolean;

  try {
    hasEventFile = (await safeReadOptionalStoreFile(paths.root, "events.jsonl")).exists;
  } catch {
    return {
      ok: false,
      root: paths.root,
      currentCount: currentRecords.length,
      replayedCount: null,
      issues: [{
        code: "event_read_failed",
        message: "Event file could not be read."
      }]
    };
  }

  if (!hasEventFile && currentRecords.length > 0) {
    issues.push({
      code: "event_file_missing",
      message: "Event file is missing while ledger has records.",
      currentCount: currentRecords.length,
      replayedCount: 0
    });
  }

  const invalidDestinationIds = invalidRecordDestinationIds(currentRecords);

  if (invalidDestinationIds.length > 0) {
    issues.push({
      code: "invalid_record_destination",
      message: "Ledger contains record(s) with invalid destination paths.",
      recordIds: limitIds(invalidDestinationIds),
      omittedRecordIdCount: Math.max(0, invalidDestinationIds.length - MAX_ISSUE_IDS)
    });
  }

  let replayedRecords: MemoryRecord[];

  try {
    const events = await readEvents(paths.root);
    verifyEventIntegrity(events);
    replayedRecords = replayEvents(events).map(normalizeRecord);
  } catch (error) {
    issues.push(consistencyReadOrReplayIssue(error));

    return {
      ok: false,
      root: paths.root,
      currentCount: currentRecords.length,
      replayedCount: null,
      issues
    };
  }

  const mismatch = compareCurrentToReplay(currentRecords, replayedRecords);

  if (mismatch) {
    issues.push(mismatch);
  }

  return {
    ok: issues.length === 0,
    root: paths.root,
    currentCount: currentRecords.length,
    replayedCount: replayedRecords.length,
    issues
  };
}

export async function repairLedgerFromEvents(
  root = process.cwd(),
  options: LedgerRepairOptions = {}
): Promise<LedgerRepairResult> {
  const paths = resolveLedgerPaths(root);

  if (options.fromEvents !== true) {
    throw new Error("Ledger repair requires --from-events.");
  }

  const events = await readEvents(paths.root);
  verifyEventIntegrity(events);
  const replayedRecords = replayEvents(events).map(normalizeRecord);
  const currentRecords = await readRecords(paths);
  const mismatch = compareCurrentToReplay(currentRecords, replayedRecords);
  const issues = mismatch ? [mismatch] : [];

  if (issues.length === 0) {
    return {
      root: paths.root,
      changed: false,
      wouldChange: false,
      repairedCount: replayedRecords.length,
      issues: []
    };
  }

  if (options.confirm !== true) {
    return {
      root: paths.root,
      changed: false,
      wouldChange: true,
      repairedCount: replayedRecords.length,
      issues
    };
  }

  return withStoreLock(paths.directory, async () => {
    await writeRecords(paths, replayedRecords);
    return {
      root: paths.root,
      changed: true,
      wouldChange: true,
      repairedCount: replayedRecords.length,
      issues
    };
  });
}

function consistencyReadOrReplayIssue(error: unknown): LedgerConsistencyIssue {
  const message = error instanceof Error ? error.message : String(error);
  const malformedMatch = /^Malformed event record on line (\d+):/.exec(message);

  if (malformedMatch) {
    return {
      code: "event_malformed",
      message: "Event file contains malformed JSON.",
      line: Number(malformedMatch[1])
    };
  }

  if (
    message.startsWith("Record ")
    || message.startsWith("Invalid memory ")
    || message.startsWith("Invalid policy ")
  ) {
    return {
      code: "event_malformed",
      message: "Event file contains malformed event data."
    };
  }

  if (message.startsWith("Cannot replay") || message.startsWith("Unknown memory event type")) {
    return {
      code: "event_replay_failed",
      message: "Events could not be replayed into ledger records."
    };
  }

  if (message.startsWith("Cannot verify event hash") || message.startsWith("Cannot verify record")) {
    return {
      code: "event_hash_mismatch",
      message: "Event hash-chain verification failed."
    };
  }

  return {
    code: "event_read_failed",
    message: "Event file could not be read."
  };
}

function compareCurrentToReplay(
  currentRecords: readonly MemoryRecord[],
  replayedRecords: readonly MemoryRecord[]
): LedgerConsistencyIssue | undefined {
  const currentById = recordsById(currentRecords);
  const replayedById = recordsById(replayedRecords);
  const missingFromReplayIds = currentRecords
    .map((record) => record.id)
    .filter((id) => !replayedById.has(id));
  const missingFromLedgerIds = replayedRecords
    .map((record) => record.id)
    .filter((id) => !currentById.has(id));
  const changedRecordIds = currentRecords
    .map((record) => record.id)
    .filter((id) => {
      const replayed = replayedById.get(id);
      return replayed ? stableRecordJson(currentById.get(id)!) !== stableRecordJson(replayed) : false;
    });
  const shownMissingFromReplayIds = limitIds(missingFromReplayIds);
  const shownMissingFromLedgerIds = limitIds(missingFromLedgerIds);
  const shownChangedRecordIds = limitIds(changedRecordIds);
  const rawRecordIdCount = missingFromReplayIds.length
    + missingFromLedgerIds.length
    + changedRecordIds.length;
  const shownRecordIdCount = shownMissingFromReplayIds.length
    + shownMissingFromLedgerIds.length
    + shownChangedRecordIds.length;
  const orderMismatch = currentRecords.length === replayedRecords.length
    && currentRecords.some((record, index) => record.id !== replayedRecords[index]?.id);

  if (
    currentRecords.length === replayedRecords.length
    && missingFromReplayIds.length === 0
    && missingFromLedgerIds.length === 0
    && changedRecordIds.length === 0
    && !orderMismatch
  ) {
    return undefined;
  }

  return {
    code: "ledger_replay_mismatch",
    message: "Current ledger records do not match event replay.",
    currentCount: currentRecords.length,
    replayedCount: replayedRecords.length,
    missingFromReplayIds: shownMissingFromReplayIds,
    missingFromLedgerIds: shownMissingFromLedgerIds,
    changedRecordIds: shownChangedRecordIds,
    omittedRecordIdCount: Math.max(0, rawRecordIdCount - shownRecordIdCount),
    orderMismatch
  };
}

function recordsById(records: readonly MemoryRecord[]): Map<string, MemoryRecord> {
  return new Map(records.map((record) => [record.id, record]));
}

function stableRecordJson(record: MemoryRecord): string {
  return JSON.stringify(normalizeRecord(record));
}

function limitIds(ids: readonly string[]): string[] {
  return ids.slice(0, MAX_ISSUE_IDS).map(reportableRecordId);
}

function invalidRecordDestinationIds(records: readonly MemoryRecord[]): string[] {
  return records
    .filter((record) => {
      try {
        normalizeLocalFileDestination(record.destination);
        return false;
      } catch {
        return true;
      }
    })
    .map((record) => record.id);
}
