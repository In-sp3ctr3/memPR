import { appendEvent, createEventId, readEvents } from "./events.js";
import type { MemoryLiveSyncEventOutcome } from "./events.js";
import { normalizeLocalFileDestination } from "./export-adapters.js";
import {
  assembleReadContext,
  resolveLedgerPaths
} from "./ledger.js";
import { withStoreLock } from "./storage.js";
import type { MemoryRecord } from "./types.js";

export type LiveAdapterId = "fake" | "mem0" | "langgraph" | "llm-wiki" | "custom";
export type LiveAdapterOperationAction = "upsert" | "skip";
export type LiveAdapterOutcomeStatus = "planned" | "skipped" | "succeeded" | "failed";

export interface LiveAdapterCredentialStatus {
  ready: boolean;
  requiredEnv: string[];
  missingEnv: string[];
}

export interface LiveAdapterContext {
  adapterId: string;
  destination: string;
  dryRun: boolean;
  env: NodeJS.ProcessEnv;
}

export interface LiveAdapterOperation {
  action: LiveAdapterOperationAction;
  recordId: string;
  idempotencyKey: string;
  downstreamId: string | null;
  record: MemoryRecord;
}

export interface LiveAdapterApplyResult {
  downstreamId: string;
}

export interface LiveAdapter {
  id: LiveAdapterId;
  title: string;
  description: string;
  network: boolean;
  credentialStatus(env?: NodeJS.ProcessEnv): LiveAdapterCredentialStatus;
  apply(operation: LiveAdapterOperation, context: LiveAdapterContext): Promise<LiveAdapterApplyResult>;
}

export interface LiveSyncInput {
  adapterId?: LiveAdapterId;
  adapter?: LiveAdapter;
  destination?: string | null;
  dryRun?: boolean;
  confirm?: boolean;
  maxRetries?: number;
  env?: NodeJS.ProcessEnv;
}

export interface LiveSyncOutcome {
  recordId: string;
  status: LiveAdapterOutcomeStatus;
  idempotencyKey: string;
  downstreamId: string | null;
  attempts: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface LiveSyncReport {
  ok: boolean;
  dryRun: boolean;
  confirmed: boolean;
  adapter: {
    id: LiveAdapterId;
    title: string;
    network: boolean;
    credentialReady: boolean;
    requiredEnv: string[];
    missingEnv: string[];
  };
  destination: string;
  recordIds: string[];
  operations: LiveAdapterOperation[];
  outcomes: LiveSyncOutcome[];
  blocked: boolean;
  issues: string[];
  summary: {
    planned: number;
    skipped: number;
    succeeded: number;
    failed: number;
    partialFailure: boolean;
    retries: number;
  };
}

export class LiveAdapterError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "LiveAdapterError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface FakeLiveAdapterOptions {
  failRecordIds?: readonly string[];
  transientFailures?: Record<string, number>;
}

export async function syncLiveAdapter(
  input: LiveSyncInput = {},
  root = process.cwd()
): Promise<LiveSyncReport> {
  const adapter = input.adapter ?? selectLiveAdapter(input.adapterId ?? "fake");
  const dryRun = input.dryRun === true;
  const confirmed = input.confirm === true;
  const destination = normalizeLocalFileDestination(input.destination ?? "MEMORY.md");
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

  const previous = await readSuccessfulSyncs(root, adapter.id, destination);
  const operations = context.records.map((record) => {
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

export function selectLiveAdapter(adapterId: LiveAdapterId): LiveAdapter {
  const adapter = LIVE_ADAPTERS.find((candidate) => candidate.id === adapterId);

  if (!adapter) {
    throw new Error(`Unknown live adapter: ${adapterId}.`);
  }

  return adapter;
}

export function listLiveAdapters(): LiveAdapter[] {
  return [...LIVE_ADAPTERS];
}

export function createFakeLiveAdapter(options: FakeLiveAdapterOptions = {}): LiveAdapter {
  const permanentFailures = new Set(options.failRecordIds ?? []);
  const transientFailures = new Map(Object.entries(options.transientFailures ?? {}));
  const attempts = new Map<string, number>();

  return {
    id: "fake",
    title: "Fake no-network adapter",
    description: "Deterministic no-network adapter for tests and local dry-runs.",
    network: false,
    credentialStatus: () => ({
      ready: true,
      requiredEnv: [],
      missingEnv: []
    }),
    async apply(operation) {
      const attempt = (attempts.get(operation.recordId) ?? 0) + 1;
      attempts.set(operation.recordId, attempt);

      if (permanentFailures.has(operation.recordId)) {
        throw new LiveAdapterError("fake_failure", "Fake adapter failure.", false);
      }

      const remainingTransientFailures = transientFailures.get(operation.recordId) ?? 0;

      if (remainingTransientFailures > 0) {
        transientFailures.set(operation.recordId, remainingTransientFailures - 1);
        throw new LiveAdapterError("fake_transient_failure", "Fake transient failure.", true);
      }

      return {
        downstreamId: `fake:${operation.idempotencyKey}`
      };
    }
  };
}

export const fakeLiveAdapter = createFakeLiveAdapter();

const LIVE_ADAPTERS: readonly LiveAdapter[] = [
  fakeLiveAdapter,
  credentialGatedHttpAdapter(
    "mem0",
    "Mem0",
    "Credential-gated Mem0 live memory adapter.",
    ["MEMPR_MEM0_ENDPOINT", "MEMPR_MEM0_API_KEY"],
    "MEMPR_MEM0_ENDPOINT",
    "MEMPR_MEM0_API_KEY"
  ),
  credentialGatedHttpAdapter(
    "langgraph",
    "LangGraph Store",
    "Credential-gated LangGraph long-term store adapter.",
    ["MEMPR_LANGGRAPH_ENDPOINT", "MEMPR_LANGGRAPH_API_KEY"],
    "MEMPR_LANGGRAPH_ENDPOINT",
    "MEMPR_LANGGRAPH_API_KEY"
  ),
  credentialGatedHttpAdapter(
    "llm-wiki",
    "LLM Wiki",
    "Credential-gated LLM-wiki page update adapter.",
    ["MEMPR_LLM_WIKI_ENDPOINT", "MEMPR_LLM_WIKI_TOKEN"],
    "MEMPR_LLM_WIKI_ENDPOINT",
    "MEMPR_LLM_WIKI_TOKEN"
  ),
  credentialGatedHttpAdapter(
    "custom",
    "Custom HTTP Adapter",
    "Credential-gated custom HTTP adapter.",
    ["MEMPR_CUSTOM_ADAPTER_ENDPOINT", "MEMPR_CUSTOM_ADAPTER_TOKEN"],
    "MEMPR_CUSTOM_ADAPTER_ENDPOINT",
    "MEMPR_CUSTOM_ADAPTER_TOKEN"
  )
];

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

      return {
        recordId: operation.recordId,
        status: "succeeded",
        idempotencyKey: operation.idempotencyKey,
        downstreamId: result.downstreamId,
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
    adapter: {
      id: input.adapter.id,
      title: input.adapter.title,
      network: input.adapter.network,
      credentialReady: input.credentials.ready,
      requiredEnv: [...input.credentials.requiredEnv],
      missingEnv: [...input.credentials.missingEnv]
    },
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
    adapter: {
      id: input.adapter.id,
      title: input.adapter.title,
      network: input.adapter.network,
      credentialReady: input.credentials.ready,
      requiredEnv: [...input.credentials.requiredEnv],
      missingEnv: [...input.credentials.missingEnv]
    },
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

function credentialGatedHttpAdapter(
  id: Exclude<LiveAdapterId, "fake">,
  title: string,
  description: string,
  requiredEnv: string[],
  endpointEnv: string,
  tokenEnv: string
): LiveAdapter {
  return {
    id,
    title,
    description,
    network: true,
    credentialStatus: (env = process.env) => credentialStatus(requiredEnv, env),
    async apply(operation, context) {
      const endpoint = context.env[endpointEnv];
      const token = context.env[tokenEnv];

      if (!endpoint || !token) {
        throw new LiveAdapterError("credential_missing", "Live adapter credentials are missing.");
      }

      return postLiveAdapterPayload(endpoint, token, operation, context);
    }
  };
}

async function postLiveAdapterPayload(
  endpoint: string,
  token: string,
  operation: LiveAdapterOperation,
  context: LiveAdapterContext
): Promise<LiveAdapterApplyResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": operation.idempotencyKey
    },
    body: JSON.stringify({
      adapter: context.adapterId,
      destination: context.destination,
      idempotencyKey: operation.idempotencyKey,
      record: liveRecordPayload(operation.record)
    }),
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new LiveAdapterError(
      `http_${response.status}`,
      `Live adapter request failed with HTTP ${response.status}.`,
      response.status >= 500
    );
  }

  const body = await parseJsonObject(response);
  const downstreamId = downstreamIdFromResponse(body) ?? `${context.adapterId}:${operation.idempotencyKey}`;

  return { downstreamId };
}

function liveRecordPayload(record: MemoryRecord): Record<string, unknown> {
  return {
    id: record.id,
    memory: record.memory,
    source: record.source,
    sourceTrust: record.source_trust,
    scope: record.scope,
    destination: record.destination,
    status: record.status,
    ttl: record.ttl,
    expiresAt: record.expires_at,
    supersedes: record.supersedes,
    conflictsWith: record.conflicts_with,
    updatedAt: record.updated_at
  };
}

async function parseJsonObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {} as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function downstreamIdFromResponse(value: Record<string, unknown>): string | undefined {
  for (const key of ["downstreamId", "downstream_id", "id"]) {
    const candidate = value[key];

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
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

function credentialStatus(
  requiredEnv: readonly string[],
  env: NodeJS.ProcessEnv
): LiveAdapterCredentialStatus {
  const missingEnv = requiredEnv.filter((key) => !env[key]);

  return {
    ready: missingEnv.length === 0,
    requiredEnv: [...requiredEnv],
    missingEnv
  };
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
  return error instanceof LiveAdapterError ? error.code : "adapter_error";
}

function liveAdapterErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Live adapter operation failed.";
}
