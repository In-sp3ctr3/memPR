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
