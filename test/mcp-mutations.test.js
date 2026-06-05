import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import { MCP_PROTOCOL_VERSION } from "../dist/mcp-contract.js";
import { closeChildProcess } from "./helpers/process-cleanup.js";

const exec = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = join(REPO_ROOT, "dist", "cli.js");
const MCP_STDIO_PATH = join(REPO_ROOT, "dist", "mcp-stdio.js");
const RESPONSE_TIMEOUT_MS = 2_500;

test("MCP propose requires boolean confirmation and does not mutate when blocked", async (t) => {
  const { probe, root } = await startInitializedProbe(t);
  const before = await readWriteSnapshot(root);
  const baseArgs = {
    memory: "Blocked MCP proposal must not be written.",
    source: "mcp-mutations-test",
    risk: "medium",
    destination: "MEMORY.md"
  };

  for (const args of [
    baseArgs,
    { ...baseArgs, confirm: false },
    { ...baseArgs, confirm: "true" },
    { ...baseArgs, confirm: 1 }
  ]) {
    const result = assertToolResult(await callTool(probe, "mempr.propose", args), {
      isError: true
    });

    assertMutationErrorText(result);
    assert.deepEqual(await readWriteSnapshot(root), before);
  }

  assertJsonRpcOnlyStdout(probe);
});

test("MCP propose with confirm true writes one record and memory_proposed event", async (t) => {
  const { probe, root } = await startInitializedProbe(t);

  const result = assertToolResult(await callTool(probe, "mempr.propose", {
    confirm: true,
    memory: "Confirmed MCP proposal is recorded for review.",
    source: "mcp-mutations-test",
    sourceType: "manual",
    scope: "user",
    risk: "medium",
    destination: "MEMORY.md"
  }));

  const record = result.structuredContent.record;
  assertMemoryRecord(record);
  assert.match(record.id, /^mem_/);
  assert.equal(record.status, "pending");
  assert.equal(record.memory, "Confirmed MCP proposal is recorded for review.");
  assert.equal(record.destination, "MEMORY.md");
  assert.equal(await readOptional(join(root, "MEMORY.md")), null);

  const ledgerRecords = parseJsonl(await readOptional(join(root, ".mempr", "ledger.jsonl")));
  const events = parseJsonl(await readOptional(join(root, ".mempr", "events.jsonl")));

  assert.deepEqual(ledgerRecords, [record]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "memory_proposed");
  assert.equal(events[0].record_id, record.id);
  assert.deepEqual(events[0].record, record);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP propose blocks secret-like memory with safe audit output", async (t) => {
  const { probe, root } = await startInitializedProbe(t);
  const secret = "token=memprFakemcpMutationShouldNotEcho1234567890";

  const result = assertToolResult(await callTool(probe, "mempr.propose", {
    confirm: true,
    memory: `api_key=${secret}`,
    quote: `quoted ${secret}`,
    source: `https://example.test/?token=${secret}`,
    sourceTrust: "trusted",
    destination: "MEMORY.md"
  }), {
    isError: true
  });
  const serialized = JSON.stringify(result.structuredContent);
  const events = parseJsonl(await readOptional(join(root, ".mempr", "events.jsonl")));

  assert.equal(result.structuredContent.error.code, "MEMPR_PROPOSAL_BLOCKED");
  assert.match(result.structuredContent.error.message, /blocked without persistence/i);
  assert.equal(result.structuredContent.audit.decision, "block_no_persist");
  assert.match(result.structuredContent.audit.memory_hash, /^[0-9a-f]{64}$/);
  assert.match(result.structuredContent.audit.memory_preview, /\[MEMPR_REDACTED_SECRET\]/);
  assertNoEcho(serialized, [secret]);
  assertNoEcho(toolText(result), [secret]);
  assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
  assert.deepEqual(events, []);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP propose blocks secret-like persistent metadata with safe audit output", async (t) => {
  const cases = [
    {
      field: "destination",
      args: (secret) => ({ destination: `docs/${secret}.md` })
    },
    {
      field: "tags",
      args: (secret) => ({ tags: ["mcp", secret] })
    }
  ];

  for (const testCase of cases) {
    const root = await makeTempRoot(`mempr-mcp-secret-${testCase.field}-`);
    const probe = await startInitializedProbeForRoot(root);
    const secret = `token=memprFakemcp${testCase.field}ShouldNotEcho1234567890`;

    t.after(async () => {
      await probe.close();
      await rm(root, { force: true, recursive: true });
    });

    const result = assertToolResult(await callTool(probe, "mempr.propose", {
      confirm: true,
      memory: "MCP metadata proposal must be blocked safely.",
      source: "manual",
      sourceType: "manual",
      sourceTrust: "trusted",
      scope: "repo",
      destination: "MEMORY.md",
      ...testCase.args(secret)
    }), {
      isError: true
    });
    const serialized = JSON.stringify(result.structuredContent);
    const events = parseJsonl(await readOptional(join(root, ".mempr", "events.jsonl")));

    assert.equal(result.structuredContent.error.code, "MEMPR_PROPOSAL_BLOCKED");
    assert.equal(result.structuredContent.audit.decision, "block_no_persist");
    assertNoEcho(serialized, [secret]);
    assertNoEcho(toolText(result), [secret]);
    assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
    assert.deepEqual(events, []);
    assertJsonRpcOnlyStdout(probe);
  }
});

test("MCP review requires confirmation and reason before mutating", async (t) => {
  const root = await makeTempRoot("mempr-mcp-review-gates-");
  const pending = await proposePending(root, "Pending review gate memory.");
  const probe = await startInitializedProbeForRoot(root);
  const before = await readWriteSnapshot(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
  });

  for (const args of [
    {
      id: pending.id,
      decision: "accept",
      reason: "Missing confirmation must not review."
    },
    {
      id: pending.id,
      decision: "accept",
      reason: "False confirmation must not review.",
      confirm: false
    },
    {
      id: pending.id,
      decision: "accept",
      reason: "Non-boolean confirmation must not review.",
      confirm: "true"
    },
    {
      id: pending.id,
      decision: "accept",
      confirm: true
    },
    {
      id: pending.id,
      decision: "accept",
      reason: "   ",
      confirm: true
    }
  ]) {
    const result = assertToolResult(await callTool(probe, "mempr.review", args), {
      isError: true
    });

    assertMutationErrorText(result);
    assert.deepEqual(await readWriteSnapshot(root), before);
  }

  assertJsonRpcOnlyStdout(probe);
});

test("MCP review rejects secret-like review metadata without writes", async (t) => {
  const cases = [
    {
      field: "reason",
      args: (pending, secret) => ({
        confirm: true,
        id: pending.id,
        decision: "accept",
        reason: `accepted with token ${secret}`
      })
    },
    {
      field: "reviewer",
      args: (pending, secret) => ({
        confirm: true,
        id: pending.id,
        decision: "accept",
        reason: "accepted after review",
        reviewer: `reviewer-${secret}`
      })
    }
  ];

  for (const testCase of cases) {
    const root = await makeTempRoot(`mempr-mcp-review-secret-${testCase.field}-`);
    const pending = await proposePending(root, `MCP review ${testCase.field} secret candidate.`);
    const probe = await startInitializedProbeForRoot(root);
    const before = await readWriteSnapshot(root);
    const secret = `token=memprFakemcpReview${testCase.field}ShouldNotEcho1234567890`;

    t.after(async () => {
      await probe.close();
      await rm(root, { force: true, recursive: true });
    });

    const result = assertToolResult(
      await callTool(probe, "mempr.review", testCase.args(pending, secret)),
      { isError: true }
    );

    assert.match(toolText(result), /secret-like|review metadata/i);
    assertNoEcho(toolText(result), [secret]);
    assert.deepEqual(await readWriteSnapshot(root), before);
    assertJsonRpcOnlyStdout(probe);
  }
});

test("MCP relationship review rejects secret-like metadata without writes", async (t) => {
  const cases = [
    {
      field: "reason",
      args: (pending, secret) => ({
        confirm: true,
        id: pending.id,
        decision: "accept",
        reason: `relationship accepted with token ${secret}`,
        retireSuperseded: true
      })
    },
    {
      field: "reviewer",
      args: (pending, secret) => ({
        confirm: true,
        id: pending.id,
        decision: "accept",
        reason: "relationship accepted after review",
        reviewer: `reviewer-${secret}`,
        retireSuperseded: true
      })
    }
  ];

  for (const testCase of cases) {
    const root = await makeTempRoot(`mempr-mcp-relationship-secret-${testCase.field}-`);
    const pending = await proposePending(root, `MCP relationship ${testCase.field} secret candidate.`);
    const probe = await startInitializedProbeForRoot(root);
    const before = await readWriteSnapshot(root);
    const secret = `token=memprFakemcpRelationship${testCase.field}ShouldNotEcho1234567890`;

    t.after(async () => {
      await probe.close();
      await rm(root, { force: true, recursive: true });
    });

    const result = assertToolResult(
      await callTool(probe, "mempr.review", testCase.args(pending, secret)),
      { isError: true }
    );

    assert.match(toolText(result), /secret-like|relationship review metadata/i);
    assertNoEcho(toolText(result), [secret]);
    assert.deepEqual(await readWriteSnapshot(root), before);
    assertJsonRpcOnlyStdout(probe);
  }
});

test("MCP review with confirm true accepts and rejects through event ledger", async (t) => {
  const root = await makeTempRoot("mempr-mcp-review-write-");
  const acceptCandidate = await proposePending(root, "MCP review accept candidate.");
  const rejectCandidate = await proposePending(root, "MCP review reject candidate.");
  const probe = await startInitializedProbeForRoot(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
  });

  const acceptedResult = assertToolResult(await callTool(probe, "mempr.review", {
    confirm: true,
    id: acceptCandidate.id,
    decision: "accept",
    reason: "Accepted through MCP mutation test."
  }));
  const rejectedResult = assertToolResult(await callTool(probe, "mempr.review", {
    confirm: true,
    id: rejectCandidate.id,
    decision: "reject",
    reason: "Rejected through MCP mutation test."
  }));

  assert.equal(acceptedResult.structuredContent.record.id, acceptCandidate.id);
  assert.equal(acceptedResult.structuredContent.record.status, "accepted");
  assert.equal(
    acceptedResult.structuredContent.record.status_reason,
    "Accepted through MCP mutation test."
  );
  assert.equal(rejectedResult.structuredContent.record.id, rejectCandidate.id);
  assert.equal(rejectedResult.structuredContent.record.status, "rejected");
  assert.equal(
    rejectedResult.structuredContent.record.status_reason,
    "Rejected through MCP mutation test."
  );

  const recordsById = new Map(
    parseJsonl(await readOptional(join(root, ".mempr", "ledger.jsonl")))
      .map((record) => [record.id, record])
  );
  assert.equal(recordsById.get(acceptCandidate.id).status, "accepted");
  assert.equal(recordsById.get(rejectCandidate.id).status, "rejected");

  const events = parseJsonl(await readOptional(join(root, ".mempr", "events.jsonl")));
  const statusEvents = events.filter((event) => event.type === "memory_status_changed");

  assert.deepEqual(
    statusEvents.map((event) => ({
      record_id: event.record_id,
      previous_status: event.previous_status,
      next_status: event.next_status,
      reason: event.reason
    })),
    [
      {
        record_id: acceptCandidate.id,
        previous_status: "pending",
        next_status: "accepted",
        reason: "Accepted through MCP mutation test."
      },
      {
        record_id: rejectCandidate.id,
        previous_status: "pending",
        next_status: "rejected",
        reason: "Rejected through MCP mutation test."
      }
    ]
  );
  assertJsonRpcOnlyStdout(probe);
});

test("MCP export requires confirmation and writes managed block plus export event when confirmed", async (t) => {
  const root = await makeTempRoot("mempr-mcp-export-");
  const accepted = await proposeAccepted(root, "Accepted memory exported through MCP.");
  const probe = await startInitializedProbeForRoot(root);
  const before = await readWriteSnapshot(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
  });

  const blocked = assertToolResult(await callTool(probe, "mempr.export", {
    destination: "MEMORY.md"
  }), {
    isError: true
  });
  assertMutationErrorText(blocked);
  assert.deepEqual(await readWriteSnapshot(root), before);

  const exported = assertToolResult(await callTool(probe, "mempr.export", {
    confirm: true,
    destination: "MEMORY.md"
  }));

  assert.equal(exported.structuredContent.destination, "MEMORY.md");
  assert.equal("outputPath" in exported.structuredContent, false);

  const memoryFile = await readFile(join(root, "MEMORY.md"), "utf8");
  assert.match(memoryFile, /<!-- mempr:start -->/);
  assert.match(memoryFile, /## Accepted Memories/);
  assert.match(memoryFile, /Accepted memory exported through MCP\./);
  assert.match(memoryFile, new RegExp(accepted.id));
  assert.match(memoryFile, /<!-- mempr:end -->/);

  const events = parseJsonl(await readOptional(join(root, ".mempr", "events.jsonl")));
  const exportEvents = events.filter((event) => event.type === "memory_exported");

  assert.equal(exportEvents.length, 1);
  assert.equal(exportEvents[0].destination, "MEMORY.md");
  assert.equal(Object.hasOwn(exportEvents[0], "output_path"), false);
  assert.deepEqual(exportEvents[0].record_ids, [accepted.id]);
  assertJsonRpcOnlyStdout(probe);
});

test("invalid MCP mutation arguments fail closed without filesystem side effects", async (t) => {
  const parent = await makeTempRoot("mempr-mcp-invalid-parent-");
  const root = join(parent, "workspace");
  const alternateRoot = join(parent, "alternate-root");

  await mkdir(root, { recursive: true });
  await mkdir(alternateRoot, { recursive: true });

  const pending = await proposePending(root, "Invalid MCP argument review target.");
  await proposeAccepted(root, "Invalid MCP argument export target.");

  const probe = await startInitializedProbeForRoot(root);
  const beforeTree = await readFileTree(parent);
  const absoluteDestination = join(parent, "absolute-memory.md");
  const invalidAttempts = [
    {
      name: "mempr.propose",
      args: {
        confirm: true,
        root: alternateRoot,
        memory: "Unsupported root argument must not redirect writes.",
        source: "mcp-mutations-test"
      }
    },
    {
      name: "mempr.propose",
      args: {
        confirm: true,
        memory: "Invalid destination proposal must not be written.",
        source: "mcp-mutations-test",
        destination: "../outside-memory.md"
      }
    },
    {
      name: "mempr.review",
      args: {
        confirm: true,
        id: `../${pending.id}`,
        decision: "accept",
        reason: "Invalid id shape must not review."
      }
    },
    {
      name: "mempr.review",
      args: {
        confirm: true,
        id: pending.id,
        decision: "approve",
        reason: "Invalid decision must not review."
      }
    },
    {
      name: "mempr.review",
      args: {
        confirm: true,
        id: pending.id,
        decision: "accept"
      }
    },
    {
      name: "mempr.review",
      args: {
        confirm: true,
        id: pending.id,
        decision: "accept",
        reason: ""
      }
    },
    {
      name: "mempr.export",
      args: {
        confirm: true,
        destination: absoluteDestination
      }
    },
    {
      name: "mempr.export",
      args: {
        confirm: true,
        destination: "../outside-memory.md"
      }
    },
    {
      name: "mempr.export",
      args: {
        confirm: true,
        destination: "notes\\MEMORY.md"
      }
    },
    {
      name: "mempr.export",
      args: {
        confirm: true,
        destination: "https://example.com/MEMORY.md"
      }
    },
    {
      name: "mempr.export",
      args: {
        confirm: true,
        destination: "file:///tmp/MEMORY.md"
      }
    }
  ];

  t.after(async () => {
    await probe.close();
    await rm(parent, { force: true, recursive: true });
  });

  for (const attempt of invalidAttempts) {
    const result = assertToolResult(await callTool(probe, attempt.name, attempt.args), {
      isError: true
    });

    assertMutationErrorText(result);
    assert.deepEqual(
      await readFileTree(parent),
      beforeTree,
      `${attempt.name} mutated the workspace for args ${JSON.stringify(attempt.args)}`
    );
  }

  assertJsonRpcOnlyStdout(probe);
});

async function startInitializedProbe(t) {
  const root = await makeTempRoot("mempr-mcp-mutations-");
  const probe = await startInitializedProbeForRoot(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
  });

  return { probe, root };
}

async function startInitializedProbeForRoot(root) {
  const probe = new StdioMcpProbe(root);

  await initialize(probe);
  probe.notify("notifications/initialized");

  return probe;
}

async function makeTempRoot(prefix) {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}

async function proposePending(root, memory) {
  const proposed = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    memory,
    "--source",
    "mcp-mutations-test",
    "--risk",
    "medium",
    "--destination",
    "MEMORY.md"
  ])).stdout);

  assert.equal(proposed.status, "pending");
  return proposed;
}

async function proposeAccepted(root, memory) {
  const proposed = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    memory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ])).stdout);

  assert.equal(proposed.status, "accepted");
  return proposed;
}

function runCli(args) {
  return exec("node", [CLI_PATH, ...args], {
    env: {
      ...process.env,
      NO_COLOR: "1"
    }
  });
}

function callTool(probe, name, args = {}) {
  return probe.request("tools/call", {
    name,
    arguments: args
  });
}

async function initialize(probe) {
  const response = await probe.request("initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: "mempr-mcp-mutations-tests",
      version: "0.0.0"
    }
  });

  assertJsonRpcSuccess(response);
  return response.result;
}

function assertToolResult(response, options = {}) {
  assertJsonRpcSuccess(response);
  assert(isRecord(response.result));
  assert(isRecord(response.result.structuredContent));
  assert(Array.isArray(response.result.content));

  const textItems = response.result.content.filter((item) => {
    return isRecord(item) && item.type === "text" && typeof item.text === "string";
  });
  assert(textItems.length > 0, "Expected at least one text content item.");
  assert(textItems.some((item) => item.text.trim().length > 0), "Expected non-empty text.");

  if (options.isError === true) {
    assert.equal(response.result.isError, true);
  } else {
    assert.notEqual(response.result.isError, true);
  }

  return response.result;
}

function assertMutationErrorText(result) {
  assert.match(
    toolText(result),
    /confirm|confirmation|invalid|required|unsupported|unsafe|blocked|read.?only|not supported|decision|destination|reason|id|root|mutation|write/i
  );
}

function toolText(result) {
  return result.content
    .filter((item) => isRecord(item) && item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function assertNoEcho(value, privateText) {
  for (const text of privateText) {
    assert.doesNotMatch(value, new RegExp(escapeRegExp(text)));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertMemoryRecord(value) {
  assert(isRecord(value), "Expected structuredContent.record.");
  assert.equal(typeof value.id, "string");
  assert.equal(typeof value.memory, "string");
  assert.equal(typeof value.destination, "string");
  assert.equal(typeof value.status, "string");
}

function assertJsonRpcSuccess(response) {
  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  assert.equal(typeof response.result, "object");
}

async function readWriteSnapshot(root) {
  return {
    events: await readOptional(join(root, ".mempr", "events.jsonl")),
    ledger: await readOptional(join(root, ".mempr", "ledger.jsonl")),
    destination: await readOptional(join(root, "MEMORY.md"))
  };
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseJsonl(content) {
  if (!content?.trim()) {
    return [];
  }

  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readFileTree(root) {
  const files = {};

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      const key = relative(root, path);

      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }

      if (entry.isFile()) {
        files[key] = await readFile(path, "utf8");
      }
    }
  }

  await walk(root);
  return files;
}

function assertJsonRpcOnlyStdout(probe) {
  assert(probe.stdoutLines.length > 0, "Expected at least one JSON-RPC stdout line.");

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
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      // Pending response assertions include stdout/stderr context.
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
  }

  rejectPending(error) {
    for (const waiter of this.responseWaiters.values()) {
      waiter.reject(error);
    }
    this.responseWaiters.clear();
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
    await closeChildProcess(this.child);
  }
}
