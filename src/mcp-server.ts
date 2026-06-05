import { createInterface } from "node:readline";
import { resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import {
  normalizeToolArguments,
  optionalReadAccessArg,
  safeErrorMessage,
  toolError
} from "./mcp-tool-args.js";
import {
  callExportTool,
  callLiveSyncTool,
  callProposeTool,
  callReviewTool
} from "./mcp-mutation-tools.js";
import {
  callCheckTool,
  callContextStatusTool,
  callContextTool,
  callExportPreviewTool,
  callHistoryTool,
  callInspectTool,
  callListTool,
  callRelationshipsTool
} from "./mcp-read-tools.js";
import {
  callPreviewMemoryDiffTool,
  callProposeFromObservationTool,
  callRequestHumanReviewTool,
  callSuggestTool
} from "./mcp-suggest-handlers.js";
import {
  MCP_PROTOCOL_VERSION,
  MEMPR_MCP_LOGGING,
  listMcpResourceContracts,
  listMcpResourceTemplateContracts,
  listMcpToolContracts
} from "./mcp-contract.js";
import {
  renderResource,
  renderResourceTemplate,
  renderTool
} from "./mcp-contract-rendering.js";
import {
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_PARSE_ERROR,
  getJsonRpcId,
  isJsonRpcRequest,
  isRecord,
  jsonRpcError,
  jsonRpcResult
} from "./mcp-json-rpc.js";
import { readMemprResource } from "./mcp-resources.js";
import { sanitizeJsonForBoundary } from "./safety.js";
import type {
  JsonRpcId,
  JsonRpcResponse
} from "./mcp-json-rpc.js";

export {
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_PARSE_ERROR
} from "./mcp-json-rpc.js";
export type {
  JsonRpcErrorObject,
  JsonRpcFailure,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccess
} from "./mcp-json-rpc.js";

export interface MemprMcpServerOptions {
  name?: string;
  title?: string;
  version?: string;
  root?: string;
}

type MaybeAsyncResponse = JsonRpcResponse | Promise<JsonRpcResponse | undefined> | undefined;

const SERVER_NAME = "mempr";
const SERVER_TITLE = "MemPR";
const SERVER_VERSION = "1.0.0";
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
    this.root = resolve(options.root ?? process.env.MEMPR_ROOT ?? process.cwd());
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
          return jsonRpcResult(id, await callListTool(args, this.root));
        case "mempr.inspect":
          return jsonRpcResult(id, await callInspectTool(args, this.root));
        case "mempr.history":
          return jsonRpcResult(id, await callHistoryTool(args, this.root));
        case "mempr.check":
          return jsonRpcResult(id, await callCheckTool(args, this.root));
        case "mempr.context":
          return jsonRpcResult(id, await callContextTool(args, this.root));
        case "mempr.context.status":
          return jsonRpcResult(id, await callContextStatusTool(args, this.root));
        case "mempr.relationships":
          return jsonRpcResult(id, await callRelationshipsTool(args, this.root));
        case "mempr.export.preview":
          return jsonRpcResult(id, await callExportPreviewTool(args, this.root));
        case "mempr.suggest":
          return jsonRpcResult(id, await callSuggestTool(args, this.root));
        case "mempr.propose_from_observation":
          return jsonRpcResult(id, await callProposeFromObservationTool(args, this.root));
        case "mempr.preview_memory_diff":
          return jsonRpcResult(id, await callPreviewMemoryDiffTool(args, this.root));
        case "mempr.request_human_review":
          return jsonRpcResult(id, await callRequestHumanReviewTool(args, this.root));
        case "mempr.propose":
          return jsonRpcResult(id, await callProposeTool(args, this.root));
        case "mempr.review":
          return jsonRpcResult(id, await callReviewTool(args, this.root));
        case "mempr.live.sync":
          return jsonRpcResult(id, await callLiveSyncTool(args, this.root));
        case "mempr.export":
          return jsonRpcResult(id, await callExportTool(args, this.root));
        default:
          return jsonRpcResult(id, toolError("unknown_tool", "Unknown MemPR tool."));
      }
    } catch (error) {
      return jsonRpcResult(id, toolError("tool_failed", safeErrorMessage(error)));
    }
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
          text: JSON.stringify(sanitizeJsonForBoundary(projection.body), null, 2)
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

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href);
}

if (isDirectExecution()) {
  runMcpStdio();
}
