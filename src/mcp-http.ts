#!/usr/bin/env node
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createMemprMcpServer } from "./mcp-server.js";
import {
  MEMPR_MCP_AUTHORIZATION,
  listMcpToolContracts
} from "./mcp-contract.js";
import type { McpAuthorizationScope } from "./mcp-contract.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3927;
const DEFAULT_PATH = "/mcp";
const REQUIRED_SCOPES = new Set(MEMPR_MCP_AUTHORIZATION.http.scopes);

interface HttpToken {
  token: string;
  subject: string;
  audience: string;
  scopes: string[];
  issuer?: string;
  expiresAt?: string;
}

interface HttpConfig {
  host: string;
  port: number;
  endpointPath: string;
  resource: string;
  authorizationServers: string[];
  allowedOrigins: string[];
  allowedHosts: string[];
  rateLimitPerMinute: number;
  tokens: HttpToken[];
}

const config = loadConfig();
const mcp = createMemprMcpServer();
const toolScopes = new Map(listMcpToolContracts().map((tool) => [tool.name, tool.authorizationScope]));
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const server = createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    writeJson(response, 500, {
      error: "internal_server_error"
    });
  });
});

server.listen(config.port, config.host, () => {
  process.stderr.write(`mempr-mcp-http listening on http://${config.host}:${config.port}${config.endpointPath}\n`);
});

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", config.resource);

  if (!hostAllowed(request)) {
    writeJson(response, 403, {
      error: "invalid_host"
    });
    return;
  }

  if (!originAllowed(request)) {
    writeJson(response, 403, {
      error: "invalid_origin"
    });
    return;
  }

  if (url.pathname === "/.well-known/oauth-protected-resource") {
    writeJson(response, 200, protectedResourceMetadata());
    return;
  }

  if (url.pathname !== config.endpointPath) {
    writeJson(response, 404, {
      error: "not_found"
    });
    return;
  }

  const auth = authenticate(request);

  if (!auth.ok) {
    response.setHeader(
      "WWW-Authenticate",
      bearerChallenge(auth.error, [...REQUIRED_SCOPES])
    );
    writeJson(response, 401, {
      error: auth.error
    });
    return;
  }

  const rate = rateAllowed(auth.token);

  if (!rate.ok) {
    response.setHeader("Retry-After", String(rate.retryAfterSeconds));
    writeJson(response, 429, {
      error: "rate_limited"
    });
    return;
  }

  if (request.method === "GET") {
    response.statusCode = 405;
    response.setHeader("Allow", "POST");
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("Allow", "POST");
    response.end();
    return;
  }

  const accepts = request.headers.accept ?? "";

  if (!String(accepts).includes("application/json") || !String(accepts).includes("text/event-stream")) {
    writeJson(response, 406, {
      error: "not_acceptable"
    });
    return;
  }

  const body = await readBody(request);
  let message: unknown;

  try {
    message = JSON.parse(body) as unknown;
  } catch {
    writeJson(response, 400, {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: "Parse error."
      }
    });
    return;
  }

  const requiredScopes = requiredScopesForMessage(message);
  const scopeCheck = authorizeScopes(auth.token, requiredScopes);

  if (!scopeCheck.ok) {
    response.setHeader(
      "WWW-Authenticate",
      bearerChallenge("insufficient_scope", [...requiredScopes])
    );
    writeJson(response, 403, {
      error: "insufficient_scope"
    });
    return;
  }

  const result = await mcp.handleMessage(message);

  if (!result) {
    response.statusCode = 202;
    response.end();
    return;
  }

  writeJson(response, 200, result);
}

function authenticate(request: IncomingMessage):
  | { ok: true; token: HttpToken }
  | { ok: false; error: "invalid_token" } {
  const authorization = request.headers.authorization;
  const rawToken = typeof authorization === "string" && authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const token = config.tokens.find((candidate) => candidate.token === rawToken);

  if (!token || token.audience !== config.resource || tokenExpired(token)) {
    return {
      ok: false,
      error: "invalid_token"
    };
  }

  return {
    ok: true,
    token
  };
}

function authorizeScopes(token: HttpToken, requiredScopes: Set<McpAuthorizationScope>):
  | { ok: true }
  | { ok: false } {
  const scopes = new Set(token.scopes);
  const missingScope = [...requiredScopes].some((scope) => !scopes.has(scope));

  if (missingScope) {
    return {
      ok: false
    };
  }

  return {
    ok: true
  };
}

function requiredScopesForMessage(message: unknown): Set<McpAuthorizationScope> {
  if (!isRecord(message) || typeof message.method !== "string") {
    return new Set(["mempr.records.read"]);
  }

  if (message.method === "initialize" || message.method === "ping" || message.method === "logging/setLevel") {
    return new Set();
  }

  if (message.method === "tools/list" || message.method === "resources/list" || message.method === "resources/templates/list") {
    return new Set(["mempr.records.read"]);
  }

  if (message.method === "resources/read") {
    return new Set(["mempr.records.read"]);
  }

  if (message.method === "tools/call" && isRecord(message.params) && typeof message.params.name === "string") {
    const scope = toolScopes.get(message.params.name);
    return scope ? new Set([scope]) : new Set(["mempr.records.read"]);
  }

  return new Set(["mempr.records.read"]);
}

function protectedResourceMetadata(): Record<string, unknown> {
  return {
    resource: config.resource,
    authorization_servers: config.authorizationServers,
    scopes_supported: [...REQUIRED_SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/In-sp3ctr3/memPR"
  };
}

function bearerChallenge(error: string, scopes: string[]): string {
  const params = [
    `resource_metadata="${config.resource.replace(/\/mcp$/, "")}/.well-known/oauth-protected-resource"`,
    `scope="${scopes.join(" ")}"`,
    `error="${error}"`
  ];

  return `Bearer ${params.join(", ")}`;
}

function originAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;

  if (origin === undefined) {
    return true;
  }

  return typeof origin === "string" && config.allowedOrigins.includes(origin);
}

function hostAllowed(request: IncomingMessage): boolean {
  const host = request.headers.host;

  if (typeof host !== "string" || host.length === 0) {
    return false;
  }

  return config.allowedHosts.includes(host);
}

function rateAllowed(token: HttpToken): { ok: true } | { ok: false; retryAfterSeconds: number } {
  if (config.rateLimitPerMinute <= 0) {
    return { ok: true };
  }

  const key = `${token.issuer ?? "local"}:${token.subject}`;
  const now = Date.now();
  const current = rateBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, {
      count: 1,
      resetAt: now + 60_000
    });
    return { ok: true };
  }

  if (current.count >= config.rateLimitPerMinute) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  }

  current.count += 1;
  return { ok: true };
}

function tokenExpired(token: HttpToken): boolean {
  if (!token.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(token.expiresAt);
  return Number.isNaN(expiresAt) || expiresAt <= Date.now();
}

function loadConfig(): HttpConfig {
  const host = process.env.MEMPR_MCP_HTTP_HOST ?? DEFAULT_HOST;
  const port = Number(process.env.MEMPR_MCP_HTTP_PORT ?? DEFAULT_PORT);
  const endpointPath = process.env.MEMPR_MCP_HTTP_PATH ?? DEFAULT_PATH;
  const resource = process.env.MEMPR_MCP_HTTP_RESOURCE
    ?? `http://${host}:${Number.isFinite(port) ? port : DEFAULT_PORT}${endpointPath}`;

  return {
    host,
    port: Number.isFinite(port) ? port : DEFAULT_PORT,
    endpointPath,
    resource,
    authorizationServers: csv(process.env.MEMPR_MCP_HTTP_AUTH_SERVERS),
    allowedOrigins: csv(process.env.MEMPR_MCP_HTTP_ALLOWED_ORIGINS, [
      `http://${host}:${Number.isFinite(port) ? port : DEFAULT_PORT}`,
      resource
    ]),
    allowedHosts: csv(process.env.MEMPR_MCP_HTTP_ALLOWED_HOSTS, [
      `${host}:${Number.isFinite(port) ? port : DEFAULT_PORT}`,
      new URL(resource).host
    ]),
    rateLimitPerMinute: Number(process.env.MEMPR_MCP_HTTP_RATE_LIMIT ?? "120"),
    tokens: parseTokens(process.env.MEMPR_MCP_HTTP_TOKENS)
  };
}

function parseTokens(value: string | undefined): HttpToken[] {
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("MEMPR_MCP_HTTP_TOKENS must be a JSON array.");
  }

  return parsed.map((entry) => {
    if (!isRecord(entry) || typeof entry.token !== "string" || typeof entry.subject !== "string") {
      throw new Error("MEMPR_MCP_HTTP_TOKENS entries require token and subject.");
    }

    return {
      token: entry.token,
      subject: entry.subject,
      audience: typeof entry.audience === "string" ? entry.audience : "",
      issuer: typeof entry.issuer === "string" ? entry.issuer : undefined,
      scopes: Array.isArray(entry.scopes)
        ? entry.scopes.filter((scope): scope is string => typeof scope === "string")
        : [],
      expiresAt: typeof entry.expiresAt === "string" ? entry.expiresAt : undefined
    };
  });
}

function csv(value: string | undefined, fallback: string[] = []): string[] {
  if (!value) {
    return fallback;
  }

  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
