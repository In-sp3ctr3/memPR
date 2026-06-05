import { appendEvent, createEventId, readEvents } from "./events.js";
import type { MemoryLiveSyncEventOutcome } from "./events.js";
import { normalizeDestinationForOperation } from "./destination-safety.js";
import {
  assembleReadContext,
  resolveLedgerPaths
} from "./ledger.js";
import { readRecords } from "./ledger-store.js";
import { selectLiveAdapter } from "./live-adapter-registry.js";
import {
  LiveAdapterError
} from "./live-adapter-types.js";
import {
  hasPersistentSecretLikeContent,
  redactTextForReport,
  sanitizeErrorMessage
} from "./safety.js";
import type {
  LiveAdapter,
  LiveAdapterContext,
  LiveAdapterCredentialStatus,
  LiveAdapterId,
  LiveAdapterOperation,
  LiveSyncInput,
  LiveSyncOutcome,
  LiveSyncReport
} from "./live-adapter-types.js";
import { withStoreLock } from "./storage.js";
import type { MemoryRecord } from "./types.js";

export async function syncLiveAdapter(
  input: LiveSyncInput = {},
  root = process.cwd()
): Promise<LiveSyncReport> {
  const adapter = input.adapter ?? selectLiveAdapter(input.adapterId ?? "fake");
  const dryRun = input.dryRun === true;
  const confirmed = input.confirm === true;
  const destination = normalizeDestinationForOperation(
    input.destination ?? "MEMORY.md",
    "live_sync"
  );
  const retries = normalizeRetryCount(input.maxRetries);
  const credentials = adapter.credentialStatus(input.env ?? process.env);

  if (!dryRun && !confirmed) {
    throw new Error("Live adapter sync requires confirm: true unless dryRun is true.");
  }

  const context = await assembleReadContext({ destination }, root);

  if (!context.ok) {
    return emptyLiveSyncReport({
      adapter,
      credentials,
      destination,
      dryRun,
      confirmed,
      blocked: true,
      issues: context.issues.map((issue) => issue.code)
    });
  }

  const fullRecords = (await readRecords(resolveLedgerPaths(root)))
    .filter((record) => {
      return record.status === "accepted"
        && record.destination === destination;
    });
  const previous = await readSuccessfulSyncs(root, adapter.id, destination);
  const operations = fullRecords.map((record) => {
    const idempotencyKey = createLiveIdempotencyKey(adapter.id, destination, record);
    const downstreamId = previous.get(`${record.id}\0${idempotencyKey}`) ?? null;

    return {
      action: downstreamId ? "skip" as const : "upsert" as const,
      recordId: record.id,
      idempotencyKey,
      downstreamId,
      record
    };
  });

  if (dryRun) {
    return liveSyncReport({
      adapter,
      credentials,
      destination,
      dryRun,
      confirmed: false,
      operations,
      outcomes: operations.map((operation) => ({
        recordId: operation.recordId,
        status: operation.action === "skip" ? "skipped" : "planned",
        idempotencyKey: operation.idempotencyKey,
        downstreamId: operation.downstreamId,
        attempts: 0
      })),
      issues: []
    });
  }

  const outcomes: LiveSyncOutcome[] = [];

  for (const operation of operations) {
    if (operation.action === "skip") {
      outcomes.push({
        recordId: operation.recordId,
        status: "skipped",
        idempotencyKey: operation.idempotencyKey,
        downstreamId: operation.downstreamId,
        attempts: 0
      });
      continue;
    }

    if (!credentials.ready) {
      outcomes.push({
        recordId: operation.recordId,
        status: "failed",
        idempotencyKey: operation.idempotencyKey,
        downstreamId: null,
        attempts: 0,
        errorCode: "credential_missing",
        errorMessage: `Missing credential env: ${credentials.missingEnv.join(", ")}.`
      });
      continue;
    }

    outcomes.push(await applyWithRetries(adapter, operation, {
      adapterId: adapter.id,
      destination,
      dryRun: false,
      env: input.env ?? process.env
    }, retries));
  }

  const report = liveSyncReport({
    adapter,
    credentials,
    destination,
    dryRun,
    confirmed,
    operations,
    outcomes,
    issues: []
  });

  await appendLiveSyncEvent(report, root);
  return report;
}

async function applyWithRetries(
  adapter: LiveAdapter,
  operation: LiveAdapterOperation,
  context: LiveAdapterContext,
  retries: number
): Promise<LiveSyncOutcome> {
  let attempts = 0;
  let lastError: unknown;

  while (attempts <= retries) {
    attempts += 1;

    try {
      const result = await adapter.apply(operation, context);
      const downstreamId = normalizeAdapterDownstreamId(result.downstreamId);

      if (!downstreamId.ok) {
        return {
          recordId: operation.recordId,
          status: "failed",
          idempotencyKey: operation.idempotencyKey,
          downstreamId: null,
          attempts,
          errorCode: downstreamId.code,
          errorMessage: downstreamId.message
        };
      }

      return {
        recordId: operation.recordId,
        status: "succeeded",
        idempotencyKey: operation.idempotencyKey,
        downstreamId: downstreamId.value,
        attempts
      };
    } catch (error) {
      lastError = error;

      if (!isRetryableLiveAdapterError(error) || attempts > retries) {
        break;
      }
    }
  }

  return {
    recordId: operation.recordId,
    status: "failed",
    idempotencyKey: operation.idempotencyKey,
    downstreamId: null,
    attempts,
    errorCode: liveAdapterErrorCode(lastError),
    errorMessage: liveAdapterErrorMessage(lastError)
  };
}

async function appendLiveSyncEvent(report: LiveSyncReport, root: string): Promise<void> {
  const paths = resolveLedgerPaths(root);

  await withStoreLock(paths.directory, async () => {
    await appendEvent({
      id: createEventId(),
      type: "memory_live_synced",
      created_at: new Date().toISOString(),
      adapter_id: report.adapter.id,
      adapter_title: report.adapter.title,
      destination: report.destination,
      dry_run: false,
      status: eventStatus(report),
      record_ids: report.recordIds,
      outcomes: report.outcomes
        .filter((outcome) => outcome.status !== "planned")
        .map((outcome): MemoryLiveSyncEventOutcome => ({
          record_id: outcome.recordId,
          status: outcome.status === "planned" ? "failed" : outcome.status,
          idempotency_key: outcome.idempotencyKey,
          downstream_id: outcome.downstreamId,
          attempts: outcome.attempts,
          ...(outcome.errorCode ? { error_code: outcome.errorCode } : {})
        }))
    }, paths.root);
  });
}

async function readSuccessfulSyncs(
  root: string,
  adapterId: LiveAdapterId,
  destination: string
): Promise<Map<string, string>> {
  const downstreamIds = new Map<string, string>();

  for (const event of await readEvents(root)) {
    if (
      event.type !== "memory_live_synced"
      || event.adapter_id !== adapterId
      || event.destination !== destination
    ) {
      continue;
    }

    for (const outcome of event.outcomes) {
      if (
        (outcome.status === "succeeded" || outcome.status === "skipped")
        && outcome.downstream_id
        && !hasPersistentSecretLikeContent(outcome.downstream_id)
      ) {
        downstreamIds.set(
          `${outcome.record_id}\0${outcome.idempotency_key}`,
          outcome.downstream_id
        );
      }
    }
  }

  return downstreamIds;
}

function liveSyncReport(input: {
  adapter: LiveAdapter;
  credentials: LiveAdapterCredentialStatus;
  destination: string;
  dryRun: boolean;
  confirmed: boolean;
  operations: LiveAdapterOperation[];
  outcomes: LiveSyncOutcome[];
  issues: string[];
}): LiveSyncReport {
  const failed = input.outcomes.filter((outcome) => outcome.status === "failed").length;
  const planned = input.outcomes.filter((outcome) => outcome.status === "planned").length;
  const skipped = input.outcomes.filter((outcome) => outcome.status === "skipped").length;
  const succeeded = input.outcomes.filter((outcome) => outcome.status === "succeeded").length;

  return {
    ok: failed === 0 && input.issues.length === 0,
    dryRun: input.dryRun,
    confirmed: input.confirmed,
    adapter: reportAdapter(input.adapter, input.credentials),
    destination: input.destination,
    recordIds: input.operations.map((operation) => operation.recordId),
    operations: input.operations,
    outcomes: input.outcomes,
    blocked: false,
    issues: input.issues,
    summary: {
      planned,
      skipped,
      succeeded,
      failed,
      partialFailure: failed > 0 && (succeeded > 0 || skipped > 0),
      retries: input.outcomes.reduce((total, outcome) => {
        return total + Math.max(0, outcome.attempts - 1);
      }, 0)
    }
  };
}

function emptyLiveSyncReport(input: {
  adapter: LiveAdapter;
  credentials: LiveAdapterCredentialStatus;
  destination: string;
  dryRun: boolean;
  confirmed: boolean;
  blocked: boolean;
  issues: string[];
}): LiveSyncReport {
  return {
    ok: false,
    dryRun: input.dryRun,
    confirmed: input.confirmed,
    adapter: reportAdapter(input.adapter, input.credentials),
    destination: input.destination,
    recordIds: [],
    operations: [],
    outcomes: [],
    blocked: input.blocked,
    issues: input.issues,
    summary: {
      planned: 0,
      skipped: 0,
      succeeded: 0,
      failed: 0,
      partialFailure: false,
      retries: 0
    }
  };
}

function reportAdapter(
  adapter: LiveAdapter,
  credentials: LiveAdapterCredentialStatus
): LiveSyncReport["adapter"] {
  return {
    id: adapter.id,
    title: redactTextForReport(adapter.title),
    network: adapter.network,
    credentialReady: credentials.ready,
    requiredEnv: [...credentials.requiredEnv],
    missingEnv: [...credentials.missingEnv]
  };
}

function createLiveIdempotencyKey(
  adapterId: LiveAdapterId,
  destination: string,
  record: MemoryRecord
): string {
  return [
    "mempr",
    "live",
    "v1",
    adapterId,
    destination,
    record.id,
    record.updated_at
  ].join(":");
}

function eventStatus(report: LiveSyncReport): "succeeded" | "partial_failure" | "failed" {
  if (report.summary.failed === 0) {
    return "succeeded";
  }

  return report.summary.partialFailure ? "partial_failure" : "failed";
}

function normalizeRetryCount(value: number | undefined): number {
  if (value === undefined) {
    return 2;
  }

  if (!Number.isInteger(value) || value < 0 || value > 10) {
    throw new Error("maxRetries must be an integer between 0 and 10.");
  }

  return value;
}

function isRetryableLiveAdapterError(error: unknown): boolean {
  return error instanceof LiveAdapterError && error.retryable;
}

function liveAdapterErrorCode(error: unknown): string {
  const code = error instanceof LiveAdapterError ? error.code : "adapter_error";

  if (hasPersistentSecretLikeContent(code)) {
    return "adapter_error";
  }

  const normalized = code.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80);
  return normalized || "adapter_error";
}

function liveAdapterErrorMessage(error: unknown): string {
  return sanitizeErrorMessage(error instanceof Error ? error : "Live adapter operation failed.");
}

function normalizeAdapterDownstreamId(value: string): {
  ok: true;
  value: string;
} | {
  ok: false;
  code: "downstream_id_secret_like" | "downstream_id_invalid";
  message: string;
} {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    return {
      ok: false,
      code: "downstream_id_invalid",
      message: "Live adapter returned invalid downstream metadata."
    };
  }

  if (hasPersistentSecretLikeContent(normalized)) {
    return {
      ok: false,
      code: "downstream_id_secret_like",
      message: "Live adapter returned blocked downstream metadata."
    };
  }

  return {
    ok: true,
    value: normalized
  };
}
