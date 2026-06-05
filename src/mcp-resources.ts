import {
  assembleReadContext,
  checkLedgerConsistency,
  getRecord,
  getRecordHistory,
  getReviewContext,
  listRecords,
  summarizeReadContextStatus
} from "./ledger.js";
import { normalizeDestinationForOperation } from "./destination-safety.js";
import { loadPolicyConfig } from "./policy-config.js";
import {
  safeMcpRecordHistory,
  safeMcpRecordSummaries,
  safeMcpRecordSummary,
  safeMcpReviewContext
} from "./mcp-safe-projections.js";
import type { McpAuthorizationScope } from "./mcp-contract.js";
import { sanitizeJsonForBoundary } from "./safety.js";
import type { ReadAccessOptions } from "./read-policy.js";

type MemprResourceRoute =
  | { kind: "records"; uri: string }
  | { kind: "policy"; uri: string }
  | { kind: "status"; uri: string }
  | { kind: "contexts"; destination?: string; uri: string }
  | { kind: "context"; destination: string; uri: string }
  | { kind: "record"; id: string; uri: string }
  | { kind: "record-review"; id: string; uri: string }
  | { kind: "record-history"; id: string; uri: string };

export async function readMemprResource(
  uri: string,
  root: string,
  readAccess: ReadAccessOptions = {}
): Promise<{
  uri: string;
  body: Record<string, unknown>;
}> {
  const route = parseMemprUri(uri);

  if (route.kind === "records") {
    const records = await listRecords({}, root, readAccess);
    return {
      uri: route.uri,
      body: {
        records: safeMcpRecordSummaries(records)
      }
    };
  }

  if (route.kind === "status") {
    return {
      uri: route.uri,
      body: {
        status: await checkLedgerConsistency(root, readAccess)
      }
    };
  }

  if (route.kind === "contexts") {
    return {
      uri: route.uri,
      body: {
        contextStatus: await summarizeReadContextStatus(
          route.destination === undefined
            ? { readAccess }
            : { destination: route.destination, readAccess },
          root
        )
      }
    };
  }

  if (route.kind === "policy") {
    return {
      uri: route.uri,
      body: {
        policy: sanitizeJsonForBoundary(await loadPolicyConfig(root))
      }
    };
  }

  if (route.kind === "context") {
    return {
      uri: route.uri,
      body: {
        context: await assembleReadContext({ destination: route.destination, readAccess }, root)
      }
    };
  }

  if (route.kind === "record") {
    const record = await getRecord(route.id, root, readAccess);
    return {
      uri: route.uri,
      body: {
        record: safeMcpRecordSummary(record)
      }
    };
  }

  if (route.kind === "record-review") {
    const reviewContext = await getReviewContext(route.id, root, readAccess);
    return {
      uri: route.uri,
      body: {
        record: safeMcpRecordSummary(reviewContext.candidate),
        reviewContext: safeMcpReviewContext(reviewContext)
      }
    };
  }

  if (route.kind === "record-history") {
    const history = await getRecordHistory(route.id, root, readAccess);
    return {
      uri: route.uri,
      body: safeMcpRecordHistory(history)
    };
  }

  throw new Error("Unknown MemPR resource.");
}

export function authorizationScopeForMemprResourceUri(uri: string): McpAuthorizationScope {
  const route = parseMemprUri(uri);

  if (route.kind === "policy") {
    return "mempr.records.admin";
  }

  if (route.kind === "record-review" || route.kind === "record-history") {
    return "mempr.review.read";
  }

  if (route.kind === "status") {
    return "mempr.consistency.read";
  }

  return "mempr.records.read";
}

function parseMemprUri(uri: string): MemprResourceRoute {
  if (
    uri.trim() !== uri
    || !uri
    || uri.includes("..")
    || uri.includes("\\")
    || /%2e/i.test(uri)
  ) {
    throw new Error("Unsupported MemPR resource URI shape.");
  }

  let parsed: URL;

  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("Invalid MemPR resource URI.");
  }

  if (parsed.protocol !== "mempr:") {
    throw new Error("Unsupported resource URI scheme.");
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Unsupported MemPR resource URI shape.");
  }

  const host = parsed.hostname;

  if (!isSafeResourceSegment(host)) {
    throw new Error("Unsupported MemPR resource URI shape.");
  }

  if (host === "records" && parsed.pathname === "") {
    return { kind: "records", uri };
  }

  if (host === "status" && parsed.pathname === "") {
    return { kind: "status", uri };
  }

  if (host === "contexts") {
    return parseContextStatusResourceUri(parsed, uri);
  }

  if (host === "policy" && parsed.pathname === "") {
    return { kind: "policy", uri };
  }

  if (host === "context") {
    return parseContextResourceUri(parsed, uri);
  }

  if (host !== "records" || !parsed.pathname.startsWith("/") || parsed.pathname.endsWith("/")) {
    throw new Error("Unknown MemPR resource.");
  }

  const segments = parsed.pathname.slice(1).split("/").map((segment) => {
    return decodeResourceSegment(segment);
  });

  if (segments.some((segment) => !isSafeResourceSegment(segment))) {
    throw new Error("Unsupported MemPR resource URI shape.");
  }

  if (segments.length === 1) {
    return { kind: "record", id: segments[0], uri };
  }

  if (segments.length === 2 && segments[1] === "review") {
    return { kind: "record-review", id: segments[0], uri };
  }

  if (segments.length === 2 && segments[1] === "history") {
    return { kind: "record-history", id: segments[0], uri };
  }

  throw new Error("Unknown MemPR resource.");
}

function parseContextResourceUri(parsed: URL, uri: string): MemprResourceRoute {
  if (!parsed.pathname.startsWith("/") || parsed.pathname.endsWith("/")) {
    throw new Error("Unknown MemPR resource.");
  }

  const segments = parsed.pathname.slice(1).split("/").map((segment) => {
    return decodeResourceSegment(segment);
  });

  if (segments.length === 0 || segments.some((segment) => !isSafeResourceSegment(segment))) {
    throw new Error("Unsupported MemPR resource URI shape.");
  }

  let destination: string;

  try {
    destination = normalizeDestinationForOperation(segments.join("/"), "mcp_resource");
  } catch {
    throw new Error("Unsupported MemPR resource URI shape.");
  }

  return {
    kind: "context",
    destination,
    uri
  };
}

function parseContextStatusResourceUri(parsed: URL, uri: string): MemprResourceRoute {
  if (parsed.pathname === "") {
    return {
      kind: "contexts",
      uri
    };
  }

  if (!parsed.pathname.startsWith("/") || parsed.pathname.endsWith("/")) {
    throw new Error("Unknown MemPR resource.");
  }

  const segments = parsed.pathname.slice(1).split("/").map((segment) => {
    return decodeResourceSegment(segment);
  });

  if (segments.length === 0 || segments.some((segment) => !isSafeResourceSegment(segment))) {
    throw new Error("Unsupported MemPR resource URI shape.");
  }

  let destination: string;

  try {
    destination = normalizeDestinationForOperation(segments.join("/"), "mcp_resource");
  } catch {
    throw new Error("Unsupported MemPR resource URI shape.");
  }

  return {
    kind: "contexts",
    destination,
    uri
  };
}

function decodeResourceSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new Error("Invalid MemPR resource URI.");
  }
}

function isSafeResourceSegment(segment: string): boolean {
  return segment.length > 0
    && segment !== "."
    && segment !== ".."
    && !segment.includes("%")
    && !segment.includes("/")
    && !segment.includes("\\")
    && !segment.includes(":");
}
