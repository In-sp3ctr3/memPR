import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import {
  acceptMemoryWithRelationships,
  analyzeRelationshipGraph,
  assembleReadContext,
  checkLedgerConsistency,
  exportMarkdown,
  getRecord,
  getRecordHistory,
  getReviewContext,
  listRecords,
  previewMarkdownExport,
  proposeMemory,
  summarizeReadContextStatus,
  updateRecordStatus
} from "./ledger.js";
import { syncLiveAdapter } from "./live-adapters.js";
import type { ReadContextOptions, ReadContextStatusOptions } from "./ledger.js";
import type { ReadContextPermissionConstraint } from "./read-permissions.js";
import type { ReadAccessOptions } from "./read-policy.js";
import {
  MEMPR_MANAGED_BLOCK_END,
  MEMPR_MANAGED_BLOCK_START
} from "./export-adapters.js";
import {
  MCP_PROTOCOL_VERSION,
  MEMPR_MCP_AUTHORIZATION,
  MEMPR_MCP_LOGGING,
  listMcpResourceContracts,
  listMcpResourceTemplateContracts,
  listMcpToolContracts
} from "./mcp-contract.js";
import { loadPolicyConfig } from "./policy-config.js";
import {
  MEMORY_RISKS,
  MEMORY_SOURCE_TRUST,
  MEMORY_SOURCE_TYPES,
  MEMORY_STATUSES
} from "./types.js";
import { normalizeExpiry } from "./ttl.js";
import type {
  ListFilters,
  MemoryRisk,
  MemorySourceTrust,
  MemorySourceType,
  MemoryStatus,
  ProposeMemoryInput
} from "./types.js";
import type {
  LiveAdapterId,
  LiveSyncInput
} from "./live-adapters.js";
import type {
  JsonSchema,
  MemprMcpResourceContract,
  MemprMcpResourceTemplateContract,
  MemprMcpToolContract
} from "./mcp-contract.js";

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export interface MemprMcpServerOptions {
  name?: string;
  title?: string;
  version?: string;
}

export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;

interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}

type MaybeAsyncResponse = JsonRpcResponse | Promise<JsonRpcResponse | undefined> | undefined;

type MemprResourceRoute =
  | { kind: "records"; uri: string }
  | { kind: "policy"; uri: string }
  | { kind: "status"; uri: string }
  | { kind: "contexts"; destination?: string; uri: string }
  | { kind: "context"; destination: string; uri: string }
  | { kind: "record"; id: string; uri: string }
  | { kind: "record-review"; id: string; uri: string }
  | { kind: "record-history"; id: string; uri: string };

type ArgResult<T> =
  | { ok: true; value?: T }
  | { ok: false; error: ToolResult };

const SERVER_NAME = "mempr";
const SERVER_TITLE = "MemPR";
const SERVER_VERSION = "1.0.0";
const DEFAULT_EXPORT_DESTINATION = "MEMORY.md";
const PROPOSE_ALLOWED_ARGS = [
  "memory",
  "source",
  "sourceType",
  "sourceTrust",
  "quote",
  "scope",
  "risk",
  "ttl",
  "destination",
  "supersedes",
  "conflictsWith",
  "confirm"
] as const;
const LOG_LEVELS = new Set([
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency"
]);

export class MemprMcpServer {
  private initialized = false;
  private logLevel: string = MEMPR_MCP_LOGGING.minimumDefaultLevel;
  private readonly name: string;
  private readonly title: string;
  private readonly version: string;
  private readonly root: string;

  constructor(options: MemprMcpServerOptions = {}) {
    this.name = options.name ?? SERVER_NAME;
    this.title = options.title ?? SERVER_TITLE;
    this.version = options.version ?? SERVER_VERSION;
    this.root = process.cwd();
  }

  handleLine(line: string): MaybeAsyncResponse {
    let message: unknown;

    try {
      message = JSON.parse(line);
    } catch {
      return jsonRpcError(null, JSON_RPC_PARSE_ERROR, "Parse error.");
    }

    return this.handleMessage(message);
  }

  handleMessage(message: unknown): MaybeAsyncResponse {
    if (!isJsonRpcRequest(message)) {
      return jsonRpcError(getJsonRpcId(message), JSON_RPC_INVALID_REQUEST, "Invalid Request.");
    }

    const isNotification = message.id === undefined;

    if (message.method === "notifications/initialized") {
      this.initialized = true;
      const initializedId = message.id;
      return initializedId === undefined ? undefined : jsonRpcResult(initializedId, {});
    }

    if (isNotification) {
      return undefined;
    }

    const id = message.id;

    if (id === undefined) {
      return undefined;
    }

    switch (message.method) {
      case "initialize":
        this.initialized = false;
        return jsonRpcResult(id, this.initializeResult());
      case "tools/list":
        return jsonRpcResult(id, {
          tools: listMcpToolContracts().map(renderTool)
        });
      case "resources/list":
        return jsonRpcResult(id, {
          resources: listMcpResourceContracts().map(renderResource)
        });
      case "resources/templates/list":
        return jsonRpcResult(id, {
          resourceTemplates: listMcpResourceTemplateContracts().map(renderResourceTemplate)
        });
      case "logging/setLevel":
        return this.handleSetLogLevel(id, message.params);
      case "ping":
        return jsonRpcResult(id, {});
      case "tools/call":
        return this.handleToolCall(id, message.params);
      case "resources/read":
        return this.handleResourceRead(id, message.params);
      default:
        return jsonRpcError(
          id,
          JSON_RPC_METHOD_NOT_FOUND,
          `Method not found: ${message.method}.`
        );
    }
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get minimumLogLevel(): string {
    return this.logLevel;
  }

  private initializeResult(): unknown {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        logging: {},
        resources: {
          listChanged: false
        },
        tools: {
          listChanged: false
        }
      },
      serverInfo: {
        name: this.name,
        title: this.title,
        version: this.version
      },
      instructions: [
        "MemPR exposes local stdio MCP tools and constrained mempr:// resource projections for the server-bound workspace.",
        "Tool authorizationScope values are protocol metadata only for local stdio; the separate mempr-mcp-http entrypoint enforces Bearer token audience, origin, host, and scope checks.",
        "Log field policy applies to server logging only; tools and resources return the payload fields described by their schemas.",
        "Write tools are mutation-gated and require arguments.confirm === true before any ledger, event, or destination write.",
        "Prompts, sampling, elicitation, proxy mode, and arbitrary file or URL passthrough are not implemented."
      ].join(" ")
    };
  }

  private handleSetLogLevel(id: JsonRpcId, params: unknown): JsonRpcResponse {
    if (!isRecord(params) || typeof params.level !== "string" || !LOG_LEVELS.has(params.level)) {
      return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, "Invalid params.");
    }

    this.logLevel = params.level;
    return jsonRpcResult(id, {});
  }

  private async handleToolCall(id: JsonRpcId, params: unknown): Promise<JsonRpcResponse> {
    if (!isRecord(params) || typeof params.name !== "string") {
      return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, "Invalid params.");
    }

    const args = normalizeToolArguments(params.arguments);

    if (args === undefined) {
      return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, "Invalid params.");
    }

    try {
      switch (params.name) {
        case "mempr.list":
          return jsonRpcResult(id, await this.callList(args));
        case "mempr.inspect":
          return jsonRpcResult(id, await this.callInspect(args));
        case "mempr.history":
          return jsonRpcResult(id, await this.callHistory(args));
        case "mempr.check":
          return jsonRpcResult(id, await this.callCheck(args));
        case "mempr.context":
          return jsonRpcResult(id, await this.callContext(args));
        case "mempr.context.status":
          return jsonRpcResult(id, await this.callContextStatus(args));
        case "mempr.relationships":
          return jsonRpcResult(id, await this.callRelationships(args));
        case "mempr.export.preview":
          return jsonRpcResult(id, await this.callExportPreview(args));
        case "mempr.propose":
          return jsonRpcResult(id, await this.callPropose(args));
        case "mempr.review":
          return jsonRpcResult(id, await this.callReview(args));
        case "mempr.live.sync":
          return jsonRpcResult(id, await this.callLiveSync(args));
        case "mempr.export":
          return jsonRpcResult(id, await this.callExport(args));
        default:
          return jsonRpcResult(id, toolError("unknown_tool", "Unknown MemPR tool."));
      }
    } catch (error) {
      return jsonRpcResult(id, toolError("tool_failed", safeErrorMessage(error)));
    }
  }

  private async callList(args: Record<string, unknown>): Promise<ToolResult> {
    const unsupported = unsupportedKeys(args, [
      "status",
      "risk",
      "destination",
      "reviewOnly",
      "auth",
      "readAccess"
    ]);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const readAccess = optionalReadAccessArg(args);

    if (!readAccess.ok) {
      return readAccess.error;
    }

    const filters: ListFilters = {};

    if (args.status !== undefined && !isMemoryStatus(args.status)) {
      return toolError("invalid_arguments", "Invalid status argument.");
    }

    if (args.risk !== undefined && !isMemoryRisk(args.risk)) {
      return toolError("invalid_arguments", "Invalid risk argument.");
    }

    if (
      args.destination !== undefined
      && (typeof args.destination !== "string" || !args.destination.trim())
    ) {
      return toolError("invalid_arguments", "Invalid destination argument.");
    }

    if (isMemoryStatus(args.status)) {
      filters.status = args.status;
    }

    if (isMemoryRisk(args.risk)) {
      filters.risk = args.risk;
    }

    if (typeof args.destination === "string") {
      filters.destination = args.destination.trim();
    }

    if (args.reviewOnly === true) {
      filters.status = "pending";
    } else if (args.reviewOnly !== undefined && typeof args.reviewOnly !== "boolean") {
      return toolError("invalid_arguments", "Invalid reviewOnly argument.");
    }

    const records = await listRecords(filters, this.root, readAccess.value);
    return toolSuccess({
      records
    }, `Found ${records.length} MemPR record(s).`);
  }

  private async callInspect(args: Record<string, unknown>): Promise<ToolResult> {
    const unsupported = unsupportedKeys(args, ["id", "auth", "readAccess"]);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const readAccess = optionalReadAccessArg(args);

    if (!readAccess.ok) {
      return readAccess.error;
    }

    const id = requiredStringArg(args, "id");

    if (!id) {
      return toolError("invalid_arguments", "Memory id is required.");
    }

    if (!isSafeRecordId(id)) {
      return toolError("invalid_arguments", "Invalid memory id argument.");
    }

    const reviewContext = await getReviewContext(id, this.root, readAccess.value);
    return toolSuccess({
      record: reviewContext.candidate,
      reviewContext
    }, `Loaded review context for ${id}.`);
  }

  private async callHistory(args: Record<string, unknown>): Promise<ToolResult> {
    const unsupported = unsupportedKeys(args, ["id", "auth", "readAccess"]);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const readAccess = optionalReadAccessArg(args);

    if (!readAccess.ok) {
      return readAccess.error;
    }

    const id = requiredStringArg(args, "id");

    if (!id) {
      return toolError("invalid_arguments", "Memory id is required.");
    }

    if (!isSafeRecordId(id)) {
      return toolError("invalid_arguments", "Invalid memory id argument.");
    }

    const history = await getRecordHistory(id, this.root, readAccess.value);
    return toolSuccess(history as unknown as Record<string, unknown>, `Loaded history for ${id}.`);
  }

  private async callCheck(args: Record<string, unknown>): Promise<ToolResult> {
    const unsupported = unsupportedKeys(args, ["auth", "readAccess"]);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const readAccess = optionalReadAccessArg(args);

    if (!readAccess.ok) {
      return readAccess.error;
    }

    const status = await checkLedgerConsistency(this.root, readAccess.value);
    return toolSuccess({
      status
    }, `Ledger consistency: ${status.ok ? "ok" : "issues found"}.`);
  }

  private async callContext(args: Record<string, unknown>): Promise<ToolResult> {
    const unsupported = unsupportedKeys(args, [
      "destination",
      "scope",
      "scopes",
      "readPermission",
      "auth",
      "readAccess"
    ]);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const contextOptions = readContextOptionsArg(args);

    if (!contextOptions.ok) {
      return contextOptions.error;
    }

    const readAccess = optionalReadAccessArg(args);

    if (!readAccess.ok) {
      return readAccess.error;
    }

    contextOptions.value!.readAccess = readAccess.value;

    const context = await assembleReadContext(
      contextOptions.value!,
      this.root
    );
    return toolSuccess(
      context as unknown as Record<string, unknown>,
      context.ok
        ? `Assembled context ${context.destination}.`
        : `Read context assembly blocked for ${context.destination}.`
    );
  }

  private async callContextStatus(args: Record<string, unknown>): Promise<ToolResult> {
    const unsupported = unsupportedKeys(args, ["destination", "auth", "readAccess"]);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const statusOptions = readContextStatusOptionsArg(args);

    if (!statusOptions.ok) {
      return statusOptions.error;
    }

    const readAccess = optionalReadAccessArg(args);

    if (!readAccess.ok) {
      return readAccess.error;
    }

    statusOptions.value!.readAccess = readAccess.value;

    const status = await summarizeReadContextStatus(statusOptions.value!, this.root);
    return toolSuccess(
      status as unknown as Record<string, unknown>,
      status.blocked
        ? `Read context status found ${status.blockedCount} destination(s) with blockers.`
        : `Read context status found no blockers across ${status.destinationCount} destination(s).`
    );
  }

  private async callRelationships(args: Record<string, unknown>): Promise<ToolResult> {
    const unsupported = unsupportedKeys(args, ["id", "auth", "readAccess"]);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const readAccess = optionalReadAccessArg(args);

    if (!readAccess.ok) {
      return readAccess.error;
    }

    if (args.id !== undefined && (typeof args.id !== "string" || !isSafeRecordId(args.id))) {
      return toolError("invalid_arguments", "Invalid id argument.");
    }

    const graph = await analyzeRelationshipGraph(this.root);
    const recordId = typeof args.id === "string" ? args.id : undefined;
    const payload = recordId
      ? {
          recordId,
          incoming: graph.incoming[recordId] ?? { supersedes: [], conflicts_with: [] },
          outgoing: graph.outgoing[recordId] ?? { supersedes: [], conflicts_with: [] },
          cycles: graph.cycles.filter((cycle) => cycle.recordIds.includes(recordId)),
          missingReferences: graph.missingReferences.filter((reference) => {
            return reference.recordId === recordId || reference.missingRecordId === recordId;
          })
        }
      : graph;

    return toolSuccess({
      graph: payload
    }, "Analyzed MemPR relationship graph.");
  }

  private async callPropose(args: Record<string, unknown>): Promise<ToolResult> {
    const confirmationError = requireMutationConfirmation(args);

    if (confirmationError) {
      return confirmationError;
    }

    const unsupported = unsupportedKeys(args, PROPOSE_ALLOWED_ARGS);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const memory = normalizeRequiredTextArg(args.memory);

    if (!memory) {
      return toolError("invalid_arguments", "Memory text is required.");
    }

    const source = optionalTextArg(args, "source");
    const quote = optionalTextArg(args, "quote");
    const scope = optionalTextArg(args, "scope");
    const ttl = optionalTtlArg(args);
    const destination = optionalDestinationArg(args);
    const supersedes = optionalIdArrayArg(args, "supersedes");
    const conflictsWith = optionalIdArrayArg(args, "conflictsWith");

    if (!source.ok) {
      return source.error;
    }

    if (!quote.ok) {
      return quote.error;
    }

    if (!scope.ok) {
      return scope.error;
    }

    if (!ttl.ok) {
      return ttl.error;
    }

    if (!destination.ok) {
      return destination.error;
    }

    if (!supersedes.ok) {
      return supersedes.error;
    }

    if (!conflictsWith.ok) {
      return conflictsWith.error;
    }

    if (args.risk !== undefined && !isMemoryRisk(args.risk)) {
      return toolError("invalid_arguments", "Invalid risk argument.");
    }

    if (args.sourceType !== undefined && !isMemorySourceType(args.sourceType)) {
      return toolError("invalid_arguments", "Invalid sourceType argument.");
    }

    if (args.sourceTrust !== undefined && !isMemorySourceTrust(args.sourceTrust)) {
      return toolError("invalid_arguments", "Invalid sourceTrust argument.");
    }

    const input: ProposeMemoryInput = {
      memory
    };

    if (source.value !== undefined) {
      input.source = source.value;
    }

    if (typeof args.sourceType === "string") {
      input.sourceType = args.sourceType;
    }

    if (isMemorySourceTrust(args.sourceTrust)) {
      input.sourceTrust = args.sourceTrust;
    }

    if (quote.value !== undefined) {
      input.quote = quote.value;
    }

    if (scope.value !== undefined) {
      input.scope = scope.value;
    }

    if (isMemoryRisk(args.risk)) {
      input.risk = args.risk;
    }

    if (ttl.value !== undefined) {
      input.ttl = ttl.value;
    }

    if (destination.value !== undefined) {
      input.destination = destination.value;
    }

    if (supersedes.value !== undefined) {
      input.supersedes = supersedes.value;
    }

    if (conflictsWith.value !== undefined) {
      input.conflictsWith = conflictsWith.value;
    }

    const record = await proposeMemory(input, this.root);
    return toolSuccess({
      record
    }, `Proposed memory ${record.id}.`);
  }

  private async callReview(args: Record<string, unknown>): Promise<ToolResult> {
    const confirmationError = requireMutationConfirmation(args);

    if (confirmationError) {
      return confirmationError;
    }

    const unsupported = unsupportedKeys(args, [
      "id",
      "decision",
      "reason",
      "retireSuperseded",
      "overrideRelationships",
      "confirm"
    ]);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const id = normalizeRequiredTextArg(args.id);

    if (!id) {
      return toolError("invalid_arguments", "Memory id is required.");
    }

    if (!isSafeRecordId(id)) {
      return toolError("invalid_arguments", "Invalid memory id argument.");
    }

    if (args.decision !== "accept" && args.decision !== "reject" && args.decision !== "retire") {
      return toolError("invalid_arguments", "Decision must be accept, reject, or retire.");
    }

    const reason = normalizeRequiredTextArg(args.reason);

    if (!reason) {
      return toolError("invalid_arguments", "Review reason is required.");
    }

    const retireSuperseded = optionalBooleanArg(args, "retireSuperseded");
    const overrideRelationships = optionalBooleanArg(args, "overrideRelationships");

    if (!retireSuperseded.ok) {
      return retireSuperseded.error;
    }

    if (!overrideRelationships.ok) {
      return overrideRelationships.error;
    }

    if (args.decision === "accept" && (retireSuperseded.value || overrideRelationships.value)) {
      const result = await acceptMemoryWithRelationships(id, {
        reason,
        retireSuperseded: retireSuperseded.value === true,
        overrideRelationships: overrideRelationships.value === true
      }, this.root);

      return toolSuccess({
        record: result.record,
        relationshipResolution: result
      }, `Reviewed memory ${result.record.id}.`);
    }

    const status: MemoryStatus = args.decision === "accept"
      ? "accepted"
      : args.decision === "retire"
        ? "retired"
        : "rejected";
    const record = await updateRecordStatus(id, status, reason, this.root);
    return toolSuccess({
      record
    }, `Reviewed memory ${record.id}.`);
  }

  private async callLiveSync(args: Record<string, unknown>): Promise<ToolResult> {
    const unsupported = unsupportedKeys(args, [
      "adapter",
      "destination",
      "dryRun",
      "maxRetries",
      "confirm"
    ]);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const dryRun = optionalBooleanArg(args, "dryRun");

    if (!dryRun.ok) {
      return dryRun.error;
    }

    if (dryRun.value !== true) {
      const confirmationError = requireMutationConfirmation(args);

      if (confirmationError) {
        return confirmationError;
      }
    }

    const adapter = optionalLiveAdapterArg(args);
    const destination = optionalDestinationArg(args, DEFAULT_EXPORT_DESTINATION);
    const maxRetries = optionalNumberArg(args, "maxRetries");

    if (!adapter.ok) {
      return adapter.error;
    }

    if (!destination.ok) {
      return destination.error;
    }

    if (!maxRetries.ok) {
      return maxRetries.error;
    }

    const input: LiveSyncInput = {
      adapterId: adapter.value,
      destination: destination.value,
      dryRun: dryRun.value === true,
      confirm: args.confirm === true
    };

    if (maxRetries.value !== undefined) {
      input.maxRetries = maxRetries.value;
    }

    const report = await syncLiveAdapter(input, this.root);
    return toolSuccess({
      report
    }, `Live sync ${report.ok ? "completed" : "reported issues"}.`);
  }

  private async callExport(args: Record<string, unknown>): Promise<ToolResult> {
    const confirmationError = requireMutationConfirmation(args);

    if (confirmationError) {
      return confirmationError;
    }

    const unsupported = unsupportedKeys(args, ["destination", "confirm"]);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const destination = optionalDestinationArg(args, DEFAULT_EXPORT_DESTINATION);

    if (!destination.ok) {
      return destination.error;
    }

    const outputPath = await exportMarkdown(destination.value, this.root);
    return toolSuccess({
      destination: outputPath
    }, `Exported ${outputPath}.`);
  }

  private async callExportPreview(args: Record<string, unknown>): Promise<ToolResult> {
    const unsupported = unsupportedKeys(args, ["destination", "auth", "readAccess"]);

    if (unsupported.length > 0) {
      return toolError("invalid_arguments", "Unsupported argument(s).");
    }

    const destination = optionalDestinationArg(args, DEFAULT_EXPORT_DESTINATION);

    if (!destination.ok) {
      return destination.error;
    }

    const previewDestination = destination.value ?? DEFAULT_EXPORT_DESTINATION;
    const disclosureError = await validateMcpPreviewDestination(previewDestination, this.root);

    if (disclosureError) {
      return disclosureError;
    }

    const readAccess = optionalReadAccessArg(args);

    if (!readAccess.ok) {
      return readAccess.error;
    }

    const preview = await previewMarkdownExport(previewDestination, this.root, readAccess.value);
    return toolSuccess({
      dryRun: true,
      ...preview
    }, `Previewed export ${preview.destination}.`);
  }

  private async handleResourceRead(id: JsonRpcId, params: unknown): Promise<JsonRpcResponse> {
    if (!isRecord(params) || typeof params.uri !== "string") {
      return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, "Invalid params.");
    }

    try {
      const readAccess = optionalReadAccessArg(params);

      if (!readAccess.ok) {
        return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, "Invalid params.");
      }

      const projection = await readMemprResource(params.uri, this.root, readAccess.value);
      return jsonRpcResult(id, {
        contents: [{
          uri: projection.uri,
          mimeType: "application/json",
          text: JSON.stringify(projection.body, null, 2)
        }]
      });
    } catch (error) {
      return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, safeErrorMessage(error));
    }
  }
}

export function createMemprMcpServer(options?: MemprMcpServerOptions): MemprMcpServer {
  return new MemprMcpServer(options);
}

export function runMcpStdio(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
  errorOutput: Writable = process.stderr
): void {
  const server = createMemprMcpServer();
  const lines = createInterface({
    input,
    crlfDelay: Infinity,
    terminal: false
  });

  lines.on("line", (line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    void (async () => {
      const response = await server.handleLine(trimmed);

      if (response) {
        output.write(`${JSON.stringify(response)}\n`);
      }
    })().catch((error) => {
      errorOutput.write(`mempr-mcp: ${safeErrorMessage(error)}\n`);
    });
  });

  lines.on("error", (error) => {
    errorOutput.write(`mempr-mcp: ${error.message}\n`);
  });

  lines.on("close", () => undefined);

  input.on("error", (error) => {
    errorOutput.write(`mempr-mcp: ${error.message}\n`);
  });
}

function renderTool(tool: MemprMcpToolContract): Record<string, unknown> {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: renderSchema(tool.inputSchema),
    outputSchema: renderSchema(tool.outputSchema),
    annotations: {
      readOnlyHint: tool.operation === "read",
      destructiveHint: tool.operation === "write",
      openWorldHint: false
    },
    _meta: {
      "mempr.dev/authorizationScope": tool.authorizationScope,
      "mempr.dev/scopeUse": MEMPR_MCP_AUTHORIZATION.scopeUse,
      "mempr.dev/runtimeScopeCheck": MEMPR_MCP_AUTHORIZATION.runtimeScopeCheck,
      "mempr.dev/requiresHumanConfirmation": tool.requiresHumanConfirmation,
      "mempr.dev/domainEvent": tool.domainEvent
    }
  };
}

function renderResource(resource: MemprMcpResourceContract): Record<string, unknown> {
  return {
    uri: resource.uri,
    name: resource.name,
    title: resource.title,
    description: resource.description,
    mimeType: resource.mimeType
  };
}

function renderResourceTemplate(
  resourceTemplate: MemprMcpResourceTemplateContract
): Record<string, unknown> {
  return {
    uriTemplate: resourceTemplate.uriTemplate,
    name: resourceTemplate.name,
    title: resourceTemplate.title,
    description: resourceTemplate.description,
    mimeType: resourceTemplate.mimeType
  };
}

function renderSchema(schema: JsonSchema): JsonSchema {
  return schema;
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!isRecord(value)) {
    return false;
  }

  if (value.jsonrpc !== "2.0") {
    return false;
  }

  if (typeof value.method !== "string") {
    return false;
  }

  if ("id" in value && !isJsonRpcId(value.id)) {
    return false;
  }

  return true;
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || typeof value === "number" || value === null;
}

function getJsonRpcId(value: unknown): JsonRpcId {
  if (!isRecord(value) || !("id" in value) || !isJsonRpcId(value.id)) {
    return null;
  }

  return value.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcFailure {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data }
  };
}

function normalizeToolArguments(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return {};
  }

  return isRecord(value) ? value : undefined;
}

function unsupportedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): string[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function requiredStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const unsupported = unsupportedKeys(args, [key]);

  if (unsupported.length > 0) {
    return undefined;
  }

  const value = args[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeRequiredTextArg(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function optionalTextArg(args: Record<string, unknown>, key: string): ArgResult<string> {
  const value = args[key];

  if (value === undefined) {
    return { ok: true };
  }

  const normalized = normalizeRequiredTextArg(value);

  if (!normalized) {
    return {
      ok: false,
      error: toolError("invalid_arguments", `Invalid ${key} argument.`)
    };
  }

  return {
    ok: true,
    value: normalized
  };
}

function optionalTtlArg(args: Record<string, unknown>): ArgResult<string | null> {
  const value = args.ttl;

  if (value === undefined) {
    return { ok: true };
  }

  if (value === null) {
    return {
      ok: true,
      value: null
    };
  }

  const normalized = normalizeRequiredTextArg(value);

  if (!normalized) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid ttl argument.")
    };
  }

  try {
    return {
      ok: true,
      value: normalizeExpiry(normalized).ttl
    };
  } catch (error) {
    return {
      ok: false,
      error: toolError("invalid_arguments", safeErrorMessage(error))
    };
  }
}

function optionalDestinationArg(
  args: Record<string, unknown>,
  defaultDestination?: string
): ArgResult<string> {
  const value = args.destination;

  if (value === undefined) {
    return defaultDestination === undefined
      ? { ok: true }
      : { ok: true, value: defaultDestination };
  }

  const destination = normalizeRequiredTextArg(value);

  if (!destination || !isSafeMcpDestination(destination)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid destination argument.")
    };
  }

  return {
    ok: true,
    value: destination
  };
}

function optionalIdArrayArg(
  args: Record<string, unknown>,
  key: "supersedes" | "conflictsWith"
): ArgResult<string[]> {
  const value = args[key];

  if (value === undefined || value === null) {
    return { ok: true };
  }

  const rawIds = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];

  if (rawIds.length === 0 && !Array.isArray(value) && typeof value !== "string") {
    return {
      ok: false,
      error: toolError("invalid_arguments", `Invalid ${key} argument.`)
    };
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const rawId of rawIds) {
    const id = normalizeRequiredTextArg(rawId);

    if (!id || !isSafeRecordId(id)) {
      return {
        ok: false,
        error: toolError("invalid_arguments", `Invalid ${key} argument.`)
      };
    }

    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return {
    ok: true,
    value: ids
  };
}

function readContextOptionsArg(args: Record<string, unknown>): ArgResult<ReadContextOptions> {
  const destination = args.destination;
  const scope = optionalRawScopeArg(args, "scope");
  const scopes = optionalRawScopeArg(args, "scopes");
  const readPermission = optionalReadPermissionArg(args.readPermission);
  const readAccess = optionalReadAccessArg(args);

  if (destination !== undefined && destination !== null && typeof destination !== "string") {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid destination argument.")
    };
  }

  if (!scope.ok) {
    return scope;
  }

  if (!scopes.ok) {
    return scopes;
  }

  if (!readPermission.ok) {
    return readPermission;
  }

  if (!readAccess.ok) {
    return readAccess;
  }

  const options: ReadContextOptions = {};

  if (destination !== undefined) {
    options.destination = destination;
  }

  if (scope.value !== undefined) {
    options.scope = scope.value;
  }

  if (scopes.value !== undefined) {
    options.scopes = scopes.value;
  }

  if (readPermission.value !== undefined) {
    options.readPermission = readPermission.value;
  }

  options.readAccess = readAccess.value;

  return {
    ok: true,
    value: options
  };
}

function readContextStatusOptionsArg(
  args: Record<string, unknown>
): ArgResult<ReadContextStatusOptions> {
  const destination = args.destination;

  if (destination !== undefined && destination !== null && typeof destination !== "string") {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid destination argument.")
    };
  }

  const options: ReadContextStatusOptions = {};
  const readAccess = optionalReadAccessArg(args);

  if (!readAccess.ok) {
    return readAccess;
  }

  if (destination !== undefined) {
    options.destination = destination;
  }

  options.readAccess = readAccess.value;

  return {
    ok: true,
    value: options
  };
}

function optionalRawScopeArg(
  args: Record<string, unknown>,
  key: "scope" | "scopes"
): ArgResult<string | readonly string[] | null> {
  const value = args[key];

  if (value === undefined) {
    return { ok: true };
  }

  if (value === null || typeof value === "string") {
    return {
      ok: true,
      value
    };
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return {
      ok: true,
      value
    };
  }

  return {
    ok: false,
    error: toolError("invalid_arguments", `Invalid ${key} argument.`)
  };
}

function optionalReadPermissionArg(
  value: unknown
): ArgResult<ReadContextPermissionConstraint | null> {
  if (value === undefined) {
    return { ok: true };
  }

  if (value === null) {
    return {
      ok: true,
      value: null
    };
  }

  if (!isRecord(value)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid readPermission argument.")
    };
  }

  const unsupported = unsupportedKeys(value, [
    "actor",
    "allowedScopes",
    "validUntil",
    "excludeConflicts",
    "excludeSupersedes"
  ]);

  if (unsupported.length > 0) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Unsupported readPermission argument(s).")
    };
  }

  const constraint: ReadContextPermissionConstraint = {};

  if (value.actor !== undefined) {
    if (value.actor !== null && typeof value.actor !== "string") {
      return {
        ok: false,
        error: toolError("invalid_arguments", "Invalid readPermission.actor argument.")
      };
    }

    constraint.actor = value.actor;
  }

  if (value.allowedScopes !== undefined) {
    if (value.allowedScopes === null) {
      constraint.allowedScopes = null;
    } else if (typeof value.allowedScopes === "string") {
      constraint.allowedScopes = value.allowedScopes;
    } else if (
      Array.isArray(value.allowedScopes)
      && value.allowedScopes.every((item) => typeof item === "string")
    ) {
      constraint.allowedScopes = value.allowedScopes;
    } else {
      return {
        ok: false,
        error: toolError("invalid_arguments", "Invalid readPermission.allowedScopes argument.")
      };
    }
  }

  if (value.validUntil !== undefined) {
    if (value.validUntil !== null && typeof value.validUntil !== "string") {
      return {
        ok: false,
        error: toolError("invalid_arguments", "Invalid readPermission.validUntil argument.")
      };
    }

    constraint.validUntil = value.validUntil;
  }

  if (Object.hasOwn(value, "excludeConflicts")) {
    (constraint as Record<string, unknown>).excludeConflicts = value.excludeConflicts;
  }

  if (Object.hasOwn(value, "excludeSupersedes")) {
    (constraint as Record<string, unknown>).excludeSupersedes = value.excludeSupersedes;
  }

  return {
    ok: true,
    value: constraint
  };
}

function optionalReadAccessArg(args: Record<string, unknown>): ArgResult<ReadAccessOptions> {
  const value = args.readAccess ?? args.auth;

  if (value === undefined || value === null) {
    return {
      ok: true,
      value: {}
    };
  }

  if (!isRecord(value)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Invalid read access argument.")
    };
  }

  const unsupported = unsupportedKeys(value, [
    "principalId",
    "signature",
    "signedAt",
    "nonce"
  ]);

  if (unsupported.length > 0) {
    return {
      ok: false,
      error: toolError("invalid_arguments", "Unsupported read access argument(s).")
    };
  }

  const auth: NonNullable<ReadAccessOptions["auth"]> = {};

  for (const key of ["principalId", "signature", "signedAt", "nonce"] as const) {
    if (value[key] !== undefined && value[key] !== null) {
      if (typeof value[key] !== "string") {
        return {
          ok: false,
          error: toolError("invalid_arguments", `Invalid read access ${key} argument.`)
        };
      }

      auth[key] = value[key];
    }
  }

  return {
    ok: true,
    value: {
      auth
    }
  };
}

function optionalBooleanArg(
  args: Record<string, unknown>,
  key: string
): ArgResult<boolean> {
  const value = args[key];

  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "boolean") {
    return {
      ok: false,
      error: toolError("invalid_arguments", `Invalid ${key} argument.`)
    };
  }

  return {
    ok: true,
    value
  };
}

function optionalNumberArg(
  args: Record<string, unknown>,
  key: string
): ArgResult<number> {
  const value = args[key];

  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return {
      ok: false,
      error: toolError("invalid_arguments", `Invalid ${key} argument.`)
    };
  }

  return {
    ok: true,
    value
  };
}

function optionalLiveAdapterArg(args: Record<string, unknown>): ArgResult<LiveAdapterId> {
  const value = args.adapter;

  if (value === undefined) {
    return {
      ok: true,
      value: "fake"
    };
  }

  if (
    value === "fake"
    || value === "mem0"
    || value === "langgraph"
    || value === "llm-wiki"
    || value === "custom"
  ) {
    return {
      ok: true,
      value
    };
  }

  return {
    ok: false,
    error: toolError("invalid_arguments", "Invalid adapter argument.")
  };
}

function requireMutationConfirmation(args: Record<string, unknown>): ToolResult | undefined {
  if (args.confirm === true) {
    return undefined;
  }

  return toolError(
    "confirmation_required",
    "Mutation requires explicit arguments.confirm === true."
  );
}

async function validateMcpPreviewDestination(
  destination: string,
  root: string
): Promise<ToolResult | undefined> {
  const outputPath = join(root, destination);
  let existing: string;

  try {
    existing = await readFile(outputPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    return toolError("invalid_arguments", "Preview destination could not be read safely.");
  }

  if (hasCompleteMemprManagedBlock(existing)) {
    return undefined;
  }

  return toolError(
    "invalid_arguments",
    "Preview destination must be missing or already contain a complete MemPR managed block."
  );
}

function hasCompleteMemprManagedBlock(content: string): boolean {
  const startIndex = content.indexOf(MEMPR_MANAGED_BLOCK_START);
  const endIndex = content.indexOf(MEMPR_MANAGED_BLOCK_END);
  return startIndex >= 0 && endIndex > startIndex;
}

function toolSuccess(structuredContent: Record<string, unknown>, _summary: string): ToolResult {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(structuredContent, null, 2)
    }],
    structuredContent
  };
}

function toolError(code: string, message: string): ToolResult {
  const structuredContent = {
    error: {
      code,
      message
    }
  };

  return {
    content: [{
      type: "text",
      text: JSON.stringify(structuredContent, null, 2)
    }],
    structuredContent,
    isError: true
  };
}

async function readMemprResource(
  uri: string,
  root: string,
  readAccess: ReadAccessOptions = {}
): Promise<{
  uri: string;
  body: Record<string, unknown>;
}> {
  const route = parseMemprUri(uri);

  if (route.kind === "records") {
    return {
      uri: route.uri,
      body: {
        records: await listRecords({}, root, readAccess)
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
        policy: await loadPolicyConfig(root)
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
    return {
      uri: route.uri,
      body: {
        record: await getRecord(route.id, root, readAccess)
      }
    };
  }

  if (route.kind === "record-review") {
    const reviewContext = await getReviewContext(route.id, root, readAccess);
    return {
      uri: route.uri,
      body: {
        record: reviewContext.candidate,
        reviewContext
      }
    };
  }

  if (route.kind === "record-history") {
    const history = await getRecordHistory(route.id, root, readAccess);
    return {
      uri: route.uri,
      body: history as unknown as Record<string, unknown>
    };
  }

  throw new Error("Unknown MemPR resource.");
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

  const destination = segments.join("/");

  if (!isSafeMcpDestination(destination)) {
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

  const destination = segments.join("/");

  if (!isSafeMcpDestination(destination)) {
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

function isSafeRecordId(id: string): boolean {
  return isSafeResourceSegment(id) && !id.includes("..");
}

function isSafeMcpDestination(destination: string): boolean {
  if (
    destination.length === 0
    || destination.startsWith("/")
    || destination.includes("\\")
    || destination.includes("\0")
    || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination)
  ) {
    return false;
  }

  const segments = destination.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "MemPR MCP operation failed.";
}

function isMemoryStatus(value: unknown): value is MemoryStatus {
  return typeof value === "string" && MEMORY_STATUSES.includes(value as MemoryStatus);
}

function isMemoryRisk(value: unknown): value is MemoryRisk {
  return typeof value === "string" && MEMORY_RISKS.includes(value as MemoryRisk);
}

function isMemorySourceType(value: unknown): value is MemorySourceType {
  return typeof value === "string" && MEMORY_SOURCE_TYPES.includes(value as MemorySourceType);
}

function isMemorySourceTrust(value: unknown): value is MemorySourceTrust {
  return typeof value === "string" && MEMORY_SOURCE_TRUST.includes(value as MemorySourceTrust);
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href);
}

if (isDirectExecution()) {
  runMcpStdio();
}
