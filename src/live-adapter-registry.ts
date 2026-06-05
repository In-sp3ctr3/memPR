import { credentialGatedHttpAdapter } from "./live-adapter-network.js";
import {
  LiveAdapterError
} from "./live-adapter-types.js";
import type {
  FakeLiveAdapterOptions,
  LiveAdapter,
  LiveAdapterId
} from "./live-adapter-types.js";

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
