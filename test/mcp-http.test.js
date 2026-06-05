import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, request } from "node:http";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { MEMPR_MCP_AUTHORIZATION } from "../dist/mcp-contract.js";
import { closeChildProcess } from "./helpers/process-cleanup.js";

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

test("MCP HTTP rejects wrong token, origin, host, and Accept headers", async (t) => {
  const server = await startHttpServer(t, {
    tokens: [{
      token: "valid-all",
      subject: "agent-a",
      audience: "RESOURCE",
      scopes: ALL_SCOPES
    }]
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
      },
      {
        token: "read-only-policy",
        subject: "agent-policy",
        audience: "RESOURCE",
        scopes: ["mempr.records.read"]
      },
      {
        token: "review-read",
        subject: "agent-c",
        audience: "RESOURCE",
        scopes: ["mempr.review.read"]
      },
      {
        token: "admin-read",
        subject: "agent-d",
        audience: "RESOURCE",
        scopes: ["mempr.records.admin"]
      },
      {
        token: "rate-read",
        subject: "agent-rate",
        audience: "RESOURCE",
        scopes: ["mempr.records.read"]
      }
    ]
  });

  const liveSync = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "read-only-policy",
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

  const inspect = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "read-only",
    body: {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "mempr.inspect",
        arguments: {
          id: "mem_missing"
        }
      }
    }
  });
  assert.equal(inspect.status, 403);
  assert.equal(inspect.body.error, "insufficient_scope");
  assert.match(inspect.headers["www-authenticate"], /mempr\.review\.read/);

  const reviewInspect = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "review-read",
    body: {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "mempr.inspect",
        arguments: {
          id: "mem_missing"
        }
      }
    }
  });
  assert.equal(reviewInspect.status, 200);
  assert.equal(reviewInspect.body.jsonrpc, "2.0");
  assert.equal(reviewInspect.body.error, undefined);

  const policyDenied = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "read-only",
    body: {
      jsonrpc: "2.0",
      id: 6,
      method: "resources/read",
      params: {
        uri: "mempr://policy"
      }
    }
  });
  assert.equal(policyDenied.status, 403);
  assert.equal(policyDenied.body.error, "insufficient_scope");
  assert.match(policyDenied.headers["www-authenticate"], /mempr\.records\.admin/);

  const policyAllowed = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "admin-read",
    body: {
      jsonrpc: "2.0",
      id: 7,
      method: "resources/read",
      params: {
        uri: "mempr://policy"
      }
    }
  });
  assert.equal(policyAllowed.status, 200);
  assert.equal(policyAllowed.body.jsonrpc, "2.0");

  const first = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "rate-read",
    body: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    }
  });
  const second = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "rate-read",
    body: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list"
    }
  });
  const third = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "rate-read",
    body: {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/list"
    }
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  assert.equal(third.body.error, "rate_limited");
});

test("MCP HTTP rejects oversized bodies before JSON parsing", async (t) => {
  const server = await startHttpServer(t, {
    maxBodyBytes: 8,
    tokens: [{
      token: "valid-all",
      subject: "agent-a",
      audience: "RESOURCE",
      scopes: ALL_SCOPES
    }]
  });

  const response = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "valid-all",
    rawBody: "this is not json but it is too large"
  });

  assert.equal(response.status, 413);
  assert.equal(response.body.error, "payload_too_large");
});

test("MCP HTTP accepts a body exactly at the configured size limit", async (t) => {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  });
  const server = await startHttpServer(t, {
    maxBodyBytes: Buffer.byteLength(body),
    tokens: [{
      token: "valid-all",
      subject: "agent-a",
      audience: "RESOURCE",
      scopes: ALL_SCOPES
    }]
  });

  const response = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "valid-all",
    rawBody: body
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.jsonrpc, "2.0");
  assert(Array.isArray(response.body.result.tools));
});

test("MCP HTTP validates body-size and token-scope config at startup", async () => {
  const invalidBodyLimit = await startHttpServerExpectFailure({
    env: {
      MEMPR_MCP_HTTP_MAX_BODY_BYTES: "0"
    }
  });
  assert.match(invalidBodyLimit.stderr, /MEMPR_MCP_HTTP_MAX_BODY_BYTES/);

  const unknownScope = await startHttpServerExpectFailure({
    tokens: [{
      token: "valid-token",
      subject: "agent-a",
      audience: "RESOURCE",
      scopes: ["mempr.records.read", "mempr.unknown"]
    }]
  });
  assert.match(unknownScope.stderr, /unknown scopes/i);

  const wrongAudience = await startHttpServerExpectFailure({
    tokens: [{
      token: "wrong-audience",
      subject: "agent-b",
      audience: "http://wrong.example/mcp",
      scopes: ALL_SCOPES
    }]
  });
  assert.match(wrongAudience.stderr, /audience/i);

  const missingScopes = await startHttpServerExpectFailure({
    tokens: [{
      token: "missing-scopes",
      subject: "agent-c",
      audience: "RESOURCE"
    }]
  });
  assert.match(missingScopes.stderr, /scopes array/i);
});

test("MCP HTTP rejects invalid endpoint path config at startup", async () => {
  const missingSlash = await startHttpServerExpectFailure({
    env: {
      MEMPR_MCP_HTTP_PATH: "mcp"
    }
  });
  assert.match(missingSlash.stderr, /MEMPR_MCP_HTTP_PATH/);

  const queryPath = await startHttpServerExpectFailure({
    env: {
      MEMPR_MCP_HTTP_PATH: "/mcp?debug=true"
    }
  });
  assert.match(queryPath.stderr, /MEMPR_MCP_HTTP_PATH/);

  const doubleSlashPath = await startHttpServerExpectFailure({
    env: {
      MEMPR_MCP_HTTP_PATH: "/mcp//debug"
    }
  });
  assert.match(doubleSlashPath.stderr, /MEMPR_MCP_HTTP_PATH/);

  const traversalPath = await startHttpServerExpectFailure({
    env: {
      MEMPR_MCP_HTTP_PATH: "/mcp/../debug"
    }
  });
  assert.match(traversalPath.stderr, /MEMPR_MCP_HTTP_PATH/);
});

test("MCP HTTP rejects non-http resource URL config at startup", async () => {
  const invalidResource = await startHttpServerExpectFailure({
    env: {
      MEMPR_MCP_HTTP_RESOURCE: "file:///tmp/mcp"
    }
  });

  assert.match(invalidResource.stderr, /MEMPR_MCP_HTTP_RESOURCE/);
});

test("MCP HTTP uses MEMPR_ROOT instead of the process cwd for ledger writes", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "mempr-mcp-http-root-test-"));
  const cwd = join(parent, "server-cwd");
  const memprRoot = join(parent, "workspace-root");

  await mkdir(cwd, { recursive: true });
  await mkdir(memprRoot, { recursive: true });

  t.after(async () => {
    await rm(parent, { force: true, recursive: true });
  });

  const server = await startHttpServer(t, {
    cwd,
    memprRoot,
    tokens: [{
      token: "valid-all",
      subject: "agent-a",
      audience: "RESOURCE",
      scopes: ALL_SCOPES
    }]
  });
  const response = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "valid-all",
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "mempr.propose",
        arguments: {
          confirm: true,
          memory: "HTTP MEMPR_ROOT writes durable memory to the configured root.",
          source: "manual",
          risk: "medium",
          destination: "MEMORY.md"
        }
      }
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.result.structuredContent.record.status, "pending");
  assert.match(
    await readFile(join(memprRoot, ".mempr", "ledger.jsonl"), "utf8"),
    /HTTP MEMPR_ROOT writes durable memory/
  );
  await assertPathMissing(join(cwd, ".mempr", "ledger.jsonl"));
});

test("MCP HTTP starts with default allowed origins", async (t) => {
  const server = await startHttpServer(t, {
    omitAllowedOrigins: true,
    tokens: [{
      token: "valid-all",
      subject: "agent-a",
      audience: "RESOURCE",
      scopes: ALL_SCOPES
    }]
  });

  const response = await server.requestJson({
    method: "POST",
    path: "/mcp",
    token: "valid-all",
    origin: server.origin,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.jsonrpc, "2.0");
});

test("MCP HTTP docs wording does not claim full OAuth server behavior", async () => {
  const readme = await readFile(join(REPO_ROOT, "README.md"), "utf8");

  assert.doesNotMatch(readme, /OAuth-style bearer-token validation/i);
  assert.match(readme, /not a full OAuth authorization server/i);
  assert.match(readme, /static bearer-token checks/i);
});

async function startHttpServer(t, options = {}) {
  const port = await getOpenPort();
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-http-test-"));
  const cwd = options.cwd ?? root;
  const resource = `http://127.0.0.1:${port}/mcp`;
  const tokens = (options.tokens ?? []).map((token) => ({
    ...token,
    audience: token.audience === "RESOURCE" ? resource : token.audience
  }));
  const child = spawn(process.execPath, [MCP_HTTP_PATH], {
    cwd,
    env: httpEnv({ ...options, port, resource, tokens }),
    stdio: ["ignore", "ignore", "pipe"]
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  t.after(async () => {
    await closeChildProcess(child, { closeStdin: false });
    await rm(root, { force: true, recursive: true });
  });

  await waitFor(() => stderr.includes("mempr-mcp-http listening"), () => {
    return `HTTP MCP server did not start. stderr: ${stderr}`;
  });

  return {
    root,
    resource,
    origin: `http://127.0.0.1:${port}`,
    requestJson(input) {
      return requestJson({
        ...input,
        port
      });
    }
  };
}

async function startHttpServerExpectFailure(options = {}) {
  const port = await getOpenPort();
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-http-fail-test-"));
  const resource = `http://127.0.0.1:${port}/mcp`;
  const tokens = (options.tokens ?? [{
    token: "valid-token",
    subject: "agent-a",
    audience: "RESOURCE",
    scopes: ALL_SCOPES
  }]).map((token) => ({
    ...token,
    audience: token.audience === "RESOURCE" ? resource : token.audience
  }));
  const child = spawn(process.execPath, [MCP_HTTP_PATH], {
    cwd: root,
    env: {
      ...httpEnv({ port, resource, tokens }),
      ...(options.env ?? {})
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    const [code] = await Promise.race([
      once(child, "exit"),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Expected HTTP MCP server startup to fail.")), 2_000);
      })
    ]);

    assert.notEqual(code, 0);
    return { stderr };
  } finally {
    await closeChildProcess(child, { closeStdin: false });
    await rm(root, { force: true, recursive: true });
  }
}

function httpEnv({
  port,
  resource,
  tokens,
  rateLimitPerMinute,
  maxBodyBytes,
  memprRoot,
  omitAllowedOrigins
}) {
  const originEnv = omitAllowedOrigins
    ? {}
    : { MEMPR_MCP_HTTP_ALLOWED_ORIGINS: `http://127.0.0.1:${port}` };

  return {
    ...process.env,
    ...(memprRoot ? { MEMPR_ROOT: memprRoot } : {}),
    MEMPR_MCP_HTTP_HOST: "127.0.0.1",
    MEMPR_MCP_HTTP_PORT: String(port),
    MEMPR_MCP_HTTP_RESOURCE: resource,
    ...originEnv,
    MEMPR_MCP_HTTP_ALLOWED_HOSTS: `127.0.0.1:${port}`,
    MEMPR_MCP_HTTP_RATE_LIMIT: String(rateLimitPerMinute ?? 120),
    ...(maxBodyBytes === undefined
      ? {}
      : { MEMPR_MCP_HTTP_MAX_BODY_BYTES: String(maxBodyBytes) }),
    MEMPR_MCP_HTTP_TOKENS: JSON.stringify(tokens)
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
  body,
  rawBody
}) {
  const payload = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
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
    req.setTimeout(2_000, () => {
      req.destroy(new Error("Timed out waiting for MCP HTTP response."));
    });

    if (payload !== undefined) {
      req.write(payload);
    }

    req.end();
  });
}

async function assertPathMissing(path) {
  await assert.rejects(access(path), (error) => {
    assert(error instanceof Error);
    assert.equal(error.code, "ENOENT");
    return true;
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
