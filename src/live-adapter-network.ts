import {
  LiveAdapterError
} from "./live-adapter-types.js";
import type {
  LiveAdapter,
  LiveAdapterApplyResult,
  LiveAdapterContext,
  LiveAdapterCredentialStatus,
  LiveAdapterId,
  LiveAdapterOperation
} from "./live-adapter-types.js";
import type { MemoryRecord } from "./types.js";

export function credentialGatedHttpAdapter(
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
