export interface LedgerMigrationOptions {
  dryRun?: boolean;
}

export type LedgerMigrationReason =
  | "empty_ledger"
  | "event_history_matches_ledger"
  | "event_history_drift"
  | "event_write_failed"
  | "ledger_malformed"
  | "migrated"
  | "would_migrate";

export type LedgerMigrationIssueCode =
  | "duplicate_record_id"
  | "event_history_drift"
  | "event_hash_mismatch"
  | "event_malformed"
  | "event_read_failed"
  | "event_replay_failed"
  | "event_write_failed"
  | "invalid_record_destination"
  | "ledger_malformed"
  | "ledger_read_failed"
  | "ledger_replay_mismatch";

export interface LedgerMigrationIssue {
  code: LedgerMigrationIssueCode;
  message: string;
  line?: number;
  currentCount?: number;
  replayedCount?: number | null;
  recordIds?: string[];
  omittedRecordIdCount?: number;
  orderMismatch?: boolean;
}

export interface LedgerMigrationResult {
  root: string;
  dryRun: boolean;
  changed: boolean;
  wouldChange: boolean;
  reason: LedgerMigrationReason;
  ledgerCount: number;
  eventCount: number | null;
  migratedCount: number;
  issues: LedgerMigrationIssue[];
}
