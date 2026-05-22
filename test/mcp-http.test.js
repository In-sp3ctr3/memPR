import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, request } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { MEMPR_MCP_AUTHORIZATION } from "../dist/mcp-contract.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MCP_HTTP_PATH = join(REPO_ROOT, "dist", "mcp-http.js");
const ALL_SCOPES = [...MEMPR_MCP_AUTHORIZATION.http.scopes];
const ACCEPT_HEADER = "application/json, text/event-stream";

test("MCP HTTP exposes protected-resource metadata and serves authenticated tools/list", async (t) => {
  const server = await startHttpServer(t, {
    tokens: [{
      token: "valid-read",
      subject: "agent-a",
      audience: "RESOURCE",
      scopes: ["mempr.records.read"]
    }]
  });

  const metadata = await server.requestJson({
    method: "GET",
    path: "/.well-known/oauth-protected-resource"
  });

  assert.equal(metadata.status, 200);
  assert.equal(metadata.body.resource, server.resource);
  assert.deepEqual(metadata.body.scopes_supported.sort(), ALL_SCOPES.sort());

  const tools = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "valid-read",
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    }
  });

  assert.equal(tools.status, 200);
  assert.equal(tools.body.jsonrpc, "2.0");
  assert(Array.isArray(tools.body.result.tools));
});

test("MCP HTTP rejects wrong token, audience, origin, host, and Accept headers", async (t) => {
  const server = await startHttpServer(t, {
    tokens: [
      {
        token: "valid-all",
        subject: "agent-a",
        audience: "RESOURCE",
        scopes: ALL_SCOPES
      },
      {
        token: "wrong-audience",
        subject: "agent-b",
        audience: "http://wrong.example/mcp",
        scopes: ALL_SCOPES
      }
    ]
  });
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  };

  const invalidToken = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "missing",
    body
  });
  assert.equal(invalidToken.status, 401);
  assert.equal(invalidToken.body.error, "invalid_token");

  const wrongAudience = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "wrong-audience",
    body
  });
  assert.equal(wrongAudience.status, 401);
  assert.equal(wrongAudience.body.error, "invalid_token");

  const wrongOrigin = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "valid-all",
    origin: "http://evil.example",
    body
  });
  assert.equal(wrongOrigin.status, 403);
  assert.equal(wrongOrigin.body.error, "invalid_origin");

  const wrongHost = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "valid-all",
    host: "evil.example",
    body
  });
  assert.equal(wrongHost.status, 403);
  assert.equal(wrongHost.body.error, "invalid_host");

  const wrongAccept = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "valid-all",
    accept: "application/json",
    body
  });
  assert.equal(wrongAccept.status, 406);
  assert.equal(wrongAccept.body.error, "not_acceptable");
});

test("MCP HTTP enforces per-tool scopes and rate limits", async (t) => {
  const server = await startHttpServer(t, {
    rateLimitPerMinute: 2,
    tokens: [
      {
        token: "read-only",
        subject: "agent-a",
        audience: "RESOURCE",
        scopes: ["mempr.records.read"]
      },
      {
        token: "write-live",
        subject: "agent-b",
        audience: "RESOURCE",
        scopes: ["mempr.live.write"]
      }
    ]
  });

  const liveSync = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "read-only",
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "mempr.live.sync",
        arguments: {
          adapter: "fake",
          dryRun: true
        }
      }
    }
  });

  assert.equal(liveSync.status, 403);
  assert.equal(liveSync.body.error, "insufficient_scope");
  assert.match(liveSync.headers["www-authenticate"], /mempr\.live\.write/);

  const first = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "read-only",
    body: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    }
  });
  const second = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "read-only",
    body: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list"
    }
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(second.body.error, "rate_limited");
});

async function startHttpServer(t, options = {}) {
  const port = await getOpenPort();
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-http-test-"));
  const resource = `http://127.0.0.1:${port}/mcp`;
  const tokens = (options.tokens ?? []).map((token) => ({
    ...token,
    audience: token.audience === "RESOURCE" ? resource : token.audience
  }));
  const child = spawn(process.execPath, [MCP_HTTP_PATH], {
    cwd: root,
    env: {
      ...process.env,
      MEMPR_MCP_HTTP_HOST: "127.0.0.1",
      MEMPR_MCP_HTTP_PORT: String(port),
      MEMPR_MCP_HTTP_RESOURCE: resource,
      MEMPR_MCP_HTTP_ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
      MEMPR_MCP_HTTP_ALLOWED_HOSTS: `127.0.0.1:${port}`,
      MEMPR_MCP_HTTP_RATE_LIMIT: String(options.rateLimitPerMinute ?? 120),
      MEMPR_MCP_HTTP_TOKENS: JSON.stringify(tokens)
    },
    stdio: ["ignore", "ignore", "pipe"]
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  t.after(async () => {
    child.kill();
    await rm(root, { force: true, recursive: true });
  });

  await waitFor(() => stderr.includes("mempr-mcp-http listening"), () => {
    return `HTTP MCP server did not start. stderr: ${stderr}`;
  });

  return {
    resource,
    requestJson(input) {
      return requestJson({
        ...input,
        port
      });
    }
  };
}

async function getOpenPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

function requestJson({
  method,
  path,
  port,
  token,
  origin,
  host,
  accept = ACCEPT_HEADER,
  body
}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const headers = {
    Accept: accept,
    Host: host ?? `127.0.0.1:${port}`
  };

  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(payload);
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (origin) {
    headers.Origin = origin;
  }

  return new Promise((resolvePromise, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;

        if (text.length > 0) {
          parsed = JSON.parse(text);
        }

        resolvePromise({
          status: response.statusCode,
          headers: response.headers,
          body: parsed
        });
      });
    });
    req.on("error", reject);

    if (payload !== undefined) {
      req.write(payload);
    }

    req.end();
  });
}

async function waitFor(predicate, errorMessage) {
  const started = Date.now();

  while (Date.now() - started < 2_000) {
    if (predicate()) {
      return;
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 25);
    });
  }

  throw new Error(errorMessage());
}
