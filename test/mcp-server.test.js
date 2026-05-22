import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  MCP_PROTOCOL_VERSION,
  MEMPR_MCP_RESOURCES,
  MEMPR_MCP_RESOURCE_TEMPLATES,
  MEMPR_MCP_TOOLS
} from "../dist/mcp-contract.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MCP_STDIO_PATH = join(REPO_ROOT, "dist", "mcp-stdio.js");
const RESPONSE_TIMEOUT_MS = 1_500;
const KNOWN_LOG_LEVELS = [
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency"
];

test("MCP stdio initialize returns the reviewed protocol version and capabilities", async (t) => {
  const probe = await startProbe(t);
  const initialized = await initialize(probe);

  assert.equal(initialized.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.equal(typeof initialized.serverInfo?.name, "string");
  assert.equal(typeof initialized.serverInfo?.version, "string");
  assert.equal(typeof initialized.capabilities?.tools, "object");
  assert.equal(typeof initialized.capabilities?.resources, "object");
  assert.equal(typeof initialized.capabilities?.logging, "object");
});

test("MCP stdio initialized notification does not return a response", async (t) => {
  const probe = await startProbe(t);
  await initialize(probe);

  const before = probe.messages.length;
  probe.notify("notifications/initialized");
  await delay(150);

  const responses = probe.messages
    .slice(before)
    .filter((message) => Object.hasOwn(message, "id"));
  assert.deepEqual(responses, []);
});

test("MCP stdio tools/list returns contract tool names and schemas", async (t) => {
  const probe = await startInitializedProbe(t);
  const response = await probe.request("tools/list");

  assertJsonRpcSuccess(response);
  assert(Array.isArray(response.result.tools));

  const expectedTools = new Map(MEMPR_MCP_TOOLS.map((tool) => [tool.name, tool]));
  const actualNames = response.result.tools.map((tool) => tool.name).sort();

  assert.deepEqual(actualNames, [...expectedTools.keys()].sort());

  for (const actualTool of response.result.tools) {
    const expectedTool = expectedTools.get(actualTool.name);

    assert(expectedTool, `Unexpected MCP tool ${actualTool.name}`);
    assert.equal(actualTool.title, expectedTool.title);
    assert.equal(actualTool.description, expectedTool.description);
    assert.deepEqual(actualTool.inputSchema, expectedTool.inputSchema);
    assert.deepEqual(actualTool.outputSchema, expectedTool.outputSchema);
  }

  const previewTool = response.result.tools.find((tool) => tool.name === "mempr.export.preview");
  assert(previewTool);
  assert.equal(previewTool.annotations.readOnlyHint, true);
  assert.equal(previewTool.annotations.destructiveHint, false);
  assert.equal(previewTool._meta["mempr.dev/requiresHumanConfirmation"], "none");
  assert.equal(previewTool._meta["mempr.dev/domainEvent"], "none");

  const contextTool = response.result.tools.find((tool) => tool.name === "mempr.context");
  assert(contextTool);
  assert.equal(contextTool.annotations.readOnlyHint, true);
  assert.equal(contextTool.annotations.destructiveHint, false);
  assert.equal(contextTool.annotations.openWorldHint, false);
  assert.equal(contextTool._meta["mempr.dev/authorizationScope"], "mempr.records.read");
  assert.equal(contextTool._meta["mempr.dev/scopeUse"], "protocol_metadata_only");
  assert.equal(contextTool._meta["mempr.dev/runtimeScopeCheck"], "not_performed");
  assert.equal(contextTool._meta["mempr.dev/requiresHumanConfirmation"], "none");
  assert.equal(contextTool._meta["mempr.dev/domainEvent"], "none");
  assert.equal(Object.hasOwn(contextTool.inputSchema.properties ?? {}, "confirm"), false);

  const contextStatusTool = response.result.tools.find((tool) => {
    return tool.name === "mempr.context.status";
  });
  assert(contextStatusTool);
  assert.equal(contextStatusTool.annotations.readOnlyHint, true);
  assert.equal(contextStatusTool.annotations.destructiveHint, false);
  assert.equal(contextStatusTool.annotations.openWorldHint, false);
  assert.equal(contextStatusTool._meta["mempr.dev/authorizationScope"], "mempr.records.read");
  assert.equal(contextStatusTool._meta["mempr.dev/scopeUse"], "protocol_metadata_only");
  assert.equal(contextStatusTool._meta["mempr.dev/runtimeScopeCheck"], "not_performed");
  assert.equal(contextStatusTool._meta["mempr.dev/requiresHumanConfirmation"], "none");
  assert.equal(contextStatusTool._meta["mempr.dev/domainEvent"], "none");
  assert.equal(Object.hasOwn(contextStatusTool.inputSchema.properties ?? {}, "confirm"), false);
});

test("MCP stdio resources/list only exposes mempr:// resources", async (t) => {
  const probe = await startInitializedProbe(t);
  const response = await probe.request("resources/list");

  assertJsonRpcSuccess(response);
  assert(Array.isArray(response.result.resources));

  assert.deepEqual(
    response.result.resources.map((resource) => resource.uri).sort(),
    MEMPR_MCP_RESOURCES.map((resource) => resource.uri).sort()
  );

  for (const resource of response.result.resources) {
    assertMemprUri(resource.uri);
    assert.equal(resource.mimeType, "application/json");
  }

  const contextResource = response.result.resources.find((resource) => {
    return resource.uri === "mempr://context/MEMORY.md";
  });
  assert(contextResource, "Expected default read-context resource");
  assert.equal(contextResource.name, "context");
  assert.equal(contextResource.mimeType, "application/json");

  const contextsResource = response.result.resources.find((resource) => {
    return resource.uri === "mempr://contexts";
  });
  assert(contextsResource, "Expected context-status resource");
  assert.equal(contextsResource.name, "contexts");
  assert.equal(contextsResource.mimeType, "application/json");
});

test("MCP stdio resources/templates/list only exposes mempr:// templates", async (t) => {
  const probe = await startInitializedProbe(t);
  const response = await probe.request("resources/templates/list");

  assertJsonRpcSuccess(response);
  assert(Array.isArray(response.result.resourceTemplates));

  assert.deepEqual(
    response.result.resourceTemplates.map((template) => template.uriTemplate).sort(),
    MEMPR_MCP_RESOURCE_TEMPLATES.map((template) => template.uriTemplate).sort()
  );

  for (const template of response.result.resourceTemplates) {
    assertMemprUri(template.uriTemplate);
    assert.equal(template.mimeType, "application/json");
  }

  const contextTemplate = response.result.resourceTemplates.find((template) => {
    return template.uriTemplate === "mempr://context/{destination}";
  });
  assert(contextTemplate, "Expected read-context destination template");
  assert.equal(contextTemplate.name, "context-destination");
  assert.equal(contextTemplate.mimeType, "application/json");

  const contextsTemplate = response.result.resourceTemplates.find((template) => {
    return template.uriTemplate === "mempr://contexts/{destination}";
  });
  assert(contextsTemplate, "Expected context-status destination template");
  assert.equal(contextsTemplate.name, "contexts-destination");
  assert.equal(contextsTemplate.mimeType, "application/json");
});

test("MCP stdio logging/setLevel accepts known MCP log levels", async (t) => {
  const probe = await startInitializedProbe(t);

  for (const level of KNOWN_LOG_LEVELS) {
    const response = await probe.request("logging/setLevel", { level });

    assertJsonRpcSuccess(response);
    assert.equal(typeof response.result, "object");
  }
});

test("MCP stdio unknown methods return JSON-RPC method-not-found", async (t) => {
  const probe = await startInitializedProbe(t);
  const response = await probe.request("mempr/unknownMethod");

  assertJsonRpcError(response, -32601);
});

test("MCP stdio invalid JSON returns JSON-RPC parse error", async (t) => {
  const probe = await startProbe(t);

  probe.writeRaw("{ invalid json\n");

  const response = await probe.waitForMessage(
    (message) => message.error?.code === -32700,
    "JSON-RPC parse error"
  );

  assertJsonRpcError(response, -32700);
  assert.equal(response.id, null);
});

test("MCP stdio stdout contains only newline-delimited JSON-RPC messages", async (t) => {
  const probe = await startInitializedProbe(t);

  await probe.request("tools/list");
  await probe.request("resources/list");
  await probe.request("mempr/unknownMethod");

  assert(probe.stdoutLines.length > 0, "Expected at least one JSON-RPC stdout line");

  for (const [index, line] of probe.stdoutLines.entries()) {
    let message;

    assert.doesNotThrow(() => {
      message = JSON.parse(line);
    }, `stdout line ${index + 1} is not JSON: ${line}`);

    assert.equal(message.jsonrpc, "2.0", `stdout line ${index + 1} is not JSON-RPC 2.0`);
    assert(
      Object.hasOwn(message, "id") || typeof message.method === "string",
      `stdout line ${index + 1} is neither a JSON-RPC response nor notification`
    );
  }
});

async function startInitializedProbe(t) {
  const probe = await startProbe(t);

  await initialize(probe);
  probe.notify("notifications/initialized");

  return probe;
}

async function startProbe(t) {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-"));
  const probe = new StdioMcpProbe(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
  });

  return probe;
}

async function initialize(probe) {
  const response = await probe.request("initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: "mempr-mcp-stdio-tests",
      version: "0.0.0"
    }
  });

  assertJsonRpcSuccess(response);
  return response.result;
}

function assertJsonRpcSuccess(response) {
  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  assert.equal(typeof response.result, "object");
}

function assertJsonRpcError(response, code) {
  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.result, undefined);
  assert.equal(response.error?.code, code, JSON.stringify(response.error));
  assert.equal(typeof response.error?.message, "string");
}

function assertMemprUri(uri) {
  assert.equal(typeof uri, "string");
  assert(uri.startsWith("mempr://"), uri);
  assert.doesNotMatch(uri, /file:\/\/|https?:\/\/|\.\./);
}

class StdioMcpProbe {
  constructor(root) {
    this.root = root;
    this.nextId = 1;
    this.messages = [];
    this.stdoutLines = [];
    this.stdoutText = "";
    this.stderrText = "";
    this.stdoutBuffer = "";
    this.responses = new Map();
    this.responseWaiters = new Map();
    this.messageWaiters = [];
    this.exit = undefined;
    this.child = spawn(process.execPath, [MCP_STDIO_PATH], {
      cwd: root,
      env: {
        ...process.env,
        MEMPR_ROOT: root,
        MEMPR_WORKSPACE_ROOT: root,
        NO_COLOR: "1"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderrText += chunk;
    });
    this.child.stdin.on("error", () => {
      // The pending response assertion reports process stdout/stderr context.
    });
    this.child.on("exit", (code, signal) => {
      this.exit = { code, signal };
      this.rejectPending(new Error(this.describeFailure("MCP server exited before responding")));
    });
    this.child.on("error", (error) => {
      this.rejectPending(error);
    });
  }

  request(method, params = {}) {
    const id = this.nextId++;
    const pending = this.waitForResponse(id, `${method} response`);

    this.writeJson({ jsonrpc: "2.0", id, method, params });

    return pending;
  }

  notify(method, params = {}) {
    this.writeJson({ jsonrpc: "2.0", method, params });
  }

  writeJson(message) {
    this.writeRaw(`${JSON.stringify(message)}\n`);
  }

  writeRaw(payload) {
    if (this.child.stdin.destroyed) {
      return;
    }

    this.child.stdin.write(payload);
  }

  waitForResponse(id, label) {
    const existing = this.responses.get(id);

    if (existing) {
      this.responses.delete(id);
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.responseWaiters.delete(id);
        reject(new Error(this.describeFailure(`Timed out waiting for ${label}`)));
      }, RESPONSE_TIMEOUT_MS);

      this.responseWaiters.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
    });
  }

  waitForMessage(predicate, label) {
    const existing = this.messages.find(predicate);

    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.messageWaiters = this.messageWaiters.filter((waiter) => waiter !== waiterRecord);
        reject(new Error(this.describeFailure(`Timed out waiting for ${label}`)));
      }, RESPONSE_TIMEOUT_MS);
      const waiterRecord = {
        predicate,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      };

      this.messageWaiters.push(waiterRecord);
    });
  }

  handleStdout(chunk) {
    this.stdoutText += chunk;
    this.stdoutBuffer += chunk;

    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        this.handleStdoutLine(line);
      }

      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  handleStdoutLine(line) {
    this.stdoutLines.push(line);

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    this.messages.push(message);

    if (Object.hasOwn(message, "id")) {
      const waiter = this.responseWaiters.get(message.id);

      if (waiter) {
        this.responseWaiters.delete(message.id);
        waiter.resolve(message);
      } else {
        this.responses.set(message.id, message);
      }
    }

    for (const waiter of [...this.messageWaiters]) {
      if (waiter.predicate(message)) {
        this.messageWaiters = this.messageWaiters.filter((current) => current !== waiter);
        waiter.resolve(message);
      }
    }
  }

  rejectPending(error) {
    for (const waiter of this.responseWaiters.values()) {
      waiter.reject(error);
    }
    this.responseWaiters.clear();

    for (const waiter of this.messageWaiters) {
      waiter.reject(error);
    }
    this.messageWaiters = [];
  }

  describeFailure(message) {
    const exit = this.exit
      ? `exit code ${this.exit.code}, signal ${this.exit.signal}`
      : "still running";

    return [
      message,
      `server: ${MCP_STDIO_PATH}`,
      `process: ${exit}`,
      `stdout: ${JSON.stringify(this.stdoutText)}`,
      `stderr: ${JSON.stringify(this.stderrText)}`
    ].join("\n");
  }

  async close() {
    if (this.child.exitCode !== null || this.child.killed) {
      return;
    }

    this.child.stdin.end();
    await Promise.race([once(this.child, "exit"), delay(250)]);

    if (this.child.exitCode === null && !this.child.killed) {
      this.child.kill("SIGTERM");
      await Promise.race([once(this.child, "exit"), delay(250)]);
    }

    if (this.child.exitCode === null && !this.child.killed) {
      this.child.kill("SIGKILL");
    }
  }
}
