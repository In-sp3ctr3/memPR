import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { link, lstat, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import {
  exportMarkdown,
  proposeMemory,
  updateRecordStatus
} from "../dist/ledger.js";
import { syncLiveAdapter } from "../dist/live-adapters.js";
import { MemprMcpServer } from "../dist/mcp-server.js";

const exec = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = join(REPO_ROOT, "dist", "cli.js");

test("CLI destination operations reject secret-like destinations without side effects", async () => {
  const secret = "token=memprFakeExportDestinationShouldNotPersist1234567890";
  const destination = `docs/${secret}.md`;
  const cases = [
    ["export", ["export", "--destination", destination, "--json"]],
    ["export dry-run", ["export", "--dry-run", "--destination", destination, "--json"]],
    ["diff-export", ["diff-export", "--destination", destination, "--json"]],
    ["guard", ["guard", "--destination", destination, "--json"]],
    ["sync-live confirm", ["sync-live", "--confirm", "--destination", destination, "--json"]],
    ["sync-live dry-run", ["sync-live", "--dry-run", "--destination", destination, "--json"]]
  ];

  for (const [label, args] of cases) {
    const root = await makeTempRoot(`mempr-cli-destination-${label.replace(/\s+/g, "-")}-`);

    try {
      const result = await runCliResult(withRoot(root, args));

      assert.notEqual(result.code, 0, label);
      assertNoEcho(`${result.stdout}\n${result.stderr}`, [secret, destination]);
      assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null, label);
      assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null, label);
      assert.equal(await readOptional(join(root, destination)), null, label);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("MCP destination operations reject secret-like destinations without side effects", async () => {
  const secret = "token=memprFakeMcpDestinationShouldNotPersist1234567890";
  const destination = `docs/${secret}.md`;
  const root = await makeTempRoot("mempr-mcp-destination-safety-");

  try {
    const server = new MemprMcpServer({ root });
    const toolCases = [
      ["mempr.export", { confirm: true, destination }],
      ["mempr.live.sync", { confirm: true, destination }],
      ["mempr.live.sync", { dryRun: true, destination }],
      ["mempr.export.preview", { destination }],
      ["mempr.context", { destination }],
      ["mempr.context.status", { destination }]
    ];

    for (const [name, args] of toolCases) {
      const response = await callTool(server, name, args);

      assertNoEcho(JSON.stringify(response), [secret, destination]);
      assertDestinationRejected(response, name);
    }

    for (const uri of [
      `mempr://context/docs/${secret}.md`,
      `mempr://contexts/docs/${secret}.md`
    ]) {
      const response = await readResource(server, uri);

      assert.equal(response.error?.message, "Unsupported MemPR resource URI shape.");
      assertNoEcho(JSON.stringify(response), [secret, destination, uri]);
    }

    assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
    assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null);
    assert.equal(await readOptional(join(root, destination)), null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("syncLiveAdapter rejects secret-like destinations before adapter credential or apply hooks", async () => {
  const secret = "token=memprFakeLiveAdapterHookShouldNotRun1234567890";
  const destination = `docs/${secret}.md`;
  const root = await makeTempRoot("mempr-live-destination-hook-");
  const calls = {
    credentials: 0,
    apply: 0
  };

  try {
    await assert.rejects(
      syncLiveAdapter({
        destination,
        confirm: true,
        adapter: {
          id: "custom",
          title: "Spy adapter",
          description: "Spy adapter for destination safety tests.",
          network: true,
          credentialStatus() {
            calls.credentials += 1;
            return {
              ready: true,
              requiredEnv: [],
              missingEnv: []
            };
          },
          async apply() {
            calls.apply += 1;
            return {
              downstreamId: "spy"
            };
          }
        }
      }, root),
      (error) => {
        assert.match(String(error), /secret-like/i);
        assertNoEcho(String(error), [secret, destination]);
        return true;
      }
    );

    assert.deepEqual(calls, { credentials: 0, apply: 0 });
    assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
    assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null);
    assert.equal(await readOptional(join(root, destination)), null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("export events do not persist absolute output paths or secret-like roots", async () => {
  const rootSecret = "token=memprFakeRootShouldNotPersist1234567890";
  const root = await makeTempRoot(`${rootSecret}-root-`);

  try {
    const accepted = await seedAcceptedMemory(root, "MEMORY.md");
    const outputPath = await exportMarkdown("MEMORY.md", root);
    const eventsText = await readOptional(join(root, ".mempr", "events.jsonl"));
    const events = parseJsonl(eventsText);
    const exportEvents = events.filter((event) => event.type === "memory_exported");

    assert.equal(outputPath, join(await realpath(root), "MEMORY.md"));
    assert.equal(exportEvents.length, 1);
    assert.equal(exportEvents[0].destination, "MEMORY.md");
    assert.equal(Object.hasOwn(exportEvents[0], "output_path"), false);
    assert.deepEqual(exportEvents[0].record_ids, [accepted.id]);
    assertNoEcho(eventsText, [rootSecret, root]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("destination grammar rejects control characters before writes or events", async () => {
  const cases = [
    "docs/foo\nbar.md",
    "docs/foo\rbar.md",
    "docs/foo\tbar.md",
    "docs/foo\u007Fbar.md"
  ];

  for (const destination of cases) {
    const root = await makeTempRoot("mempr-control-destination-");
    const result = await runCliResult(withRoot(root, [
      "export",
      "--destination",
      destination,
      "--json"
    ]));

    try {
      assert.notEqual(result.code, 0, destination);
      assert.match(`${result.stdout}\n${result.stderr}`, /control characters|destination/i);
      assertNoEcho(`${result.stdout}\n${result.stderr}`, [destination]);
      assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null);
      assert.equal(await readOptional(join(root, destination)), null);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("destination grammar rejects reserved Phase C paths before writes or events", async () => {
  const longSegment = `${"a".repeat(121)}.md`;
  const longPath = `docs/${`${"a".repeat(50)}/`.repeat(5)}MEMORY.md`;
  const cases = [
    ".mempr/diagnostics.jsonl",
    ".git/config",
    "node_modules/foo.md",
    "dist/foo.md",
    "build/foo.md",
    "coverage/foo.md",
    "package.json",
    "src/index.md",
    "test/foo.md",
    "foo/bar.md",
    "foo.txt",
    "docs/foo.txt",
    "docs/CON.md",
    "docs/foo?.md",
    "docs/foo:bar.md",
    `docs/${longSegment}`,
    longPath
  ];

  for (const destination of cases) {
    const root = await makeTempRoot("mempr-reserved-destination-");
    const result = await runCliResult(withRoot(root, [
      "export",
      "--destination",
      destination,
      "--json"
    ]));

    try {
      assert.notEqual(result.code, 0, destination);
      assert.match(`${result.stdout}\n${result.stderr}`, /destination/i);
      assertNoEcho(`${result.stdout}\n${result.stderr}`, [destination]);
      assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null);
      assert.equal(await readOptional(join(root, destination)), null);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("export path resolution rejects symlink escapes and does not preview symlink targets", async () => {
  const root = await makeTempRoot("mempr-export-symlink-root-");
  const outside = await makeTempRoot("mempr-export-symlink-outside-");

  try {
    await seedAcceptedMemory(root, "docs/MEMORY.md");
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(outside, "external.md"), "external target must not be read or modified\n");
    await symlink(join(outside, "external.md"), join(root, "docs", "MEMORY.md"));

    await assert.rejects(
      exportMarkdown("docs/MEMORY.md", root, { dryRun: true }),
      /symlink|regular file/i
    );

    await assert.rejects(
      exportMarkdown("docs/MEMORY.md", root),
      /symlink|regular file/i
    );
    const outsideContent = await readFile(join(outside, "external.md"), "utf8");
    assert.equal(outsideContent, "external target must not be read or modified\n");

    await rm(join(root, "docs"), { force: true, recursive: true });
    await symlink(outside, join(root, "docs"));

    await assert.rejects(
      exportMarkdown("docs/MEMORY.md", root),
      /escapes|root|destination/i
    );
    assert.equal(await readOptional(join(outside, "MEMORY.md")), null);
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("export rejects symlinked parent directories without outside side effects", async () => {
  const root = await makeTempRoot("mempr-export-parent-symlink-root-");
  const outside = await makeTempRoot("mempr-export-parent-symlink-outside-");
  const destination = "docs/sub/MEMORY.md";

  try {
    await seedAcceptedMemory(root, destination);
    await symlink(outside, join(root, "docs"));

    await assert.rejects(
      exportMarkdown(destination, root),
      /parent|real directories|destination|root/i
    );

    const result = await runCliResult(withRoot(root, [
      "export",
      "--destination",
      destination,
      "--json"
    ]));
    const events = parseJsonl(await readOptional(join(root, ".mempr", "events.jsonl")));

    assert.notEqual(result.code, 0);
    assert.equal(await pathExists(join(outside, "sub")), false);
    assert.equal(await readOptional(join(outside, "sub", "MEMORY.md")), null);
    assert.equal(events.some((event) => event.type === "memory_exported"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("MCP export rejects symlinked parent directories without outside side effects", async () => {
  const root = await makeTempRoot("mempr-mcp-export-parent-symlink-root-");
  const outside = await makeTempRoot("mempr-mcp-export-parent-symlink-outside-");
  const destination = "docs/sub/MEMORY.md";

  try {
    await seedAcceptedMemory(root, destination);
    await symlink(outside, join(root, "docs"));

    const server = new MemprMcpServer({ root });
    const response = await callTool(server, "mempr.export", {
      confirm: true,
      destination
    });
    const events = parseJsonl(await readOptional(join(root, ".mempr", "events.jsonl")));

    assert.equal(response.result?.isError, true);
    assert.match(JSON.stringify(response.result.structuredContent), /destination|parent|directory/i);
    assert.equal(await pathExists(join(outside, "sub")), false);
    assert.equal(await readOptional(join(outside, "sub", "MEMORY.md")), null);
    assert.equal(events.some((event) => event.type === "memory_exported"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("export operations reject hardlinked destinations without reading or copying outside content", async () => {
  const destination = "MEMORY.md";
  const outsideContent = "PRIVATE_OUTSIDE_CONTENT_NOT_SECRET\n";
  const cases = [
    ["export", ["export", "--destination", destination, "--json"]],
    ["export dry-run", ["export", "--dry-run", "--destination", destination, "--json"]],
    ["diff-export", ["diff-export", "--destination", destination, "--json"]],
    ["guard", ["guard", "--destination", destination, "--json"]]
  ];

  for (const [label, args] of cases) {
    const root = await makeTempRoot(`mempr-export-hardlink-root-${label.replace(/\s+/g, "-")}-`);
    const outside = await makeTempRoot("mempr-export-hardlink-outside-");
    const outsideFile = join(outside, "MEMORY.md");

    try {
      await seedAcceptedMemory(root, destination);
      const beforeEvents = await readOptional(join(root, ".mempr", "events.jsonl"));
      await writeFile(outsideFile, outsideContent);
      await link(outsideFile, join(root, destination));

      const result = await runCliResult(withRoot(root, args));
      const afterEvents = await readOptional(join(root, ".mempr", "events.jsonl"));

      assert.notEqual(result.code, 0, label);
      assert.match(`${result.stdout}\n${result.stderr}`, /single-link|destination|read safely/i);
      assertNoEcho(`${result.stdout}\n${result.stderr}`, [outsideContent.trim(), outside]);
      assert.equal(await readFile(outsideFile, "utf8"), outsideContent, label);
      assert.equal(afterEvents, beforeEvents, label);
      assert.equal(parseJsonl(afterEvents).some((event) => event.type === "memory_exported"), false);
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  }
});

test("MCP export operations reject hardlinked destinations without outside side effects", async () => {
  const destination = "MEMORY.md";
  const outsideContent = "PRIVATE_OUTSIDE_MCP_CONTENT_NOT_SECRET\n";
  const cases = [
    ["mempr.export", { confirm: true, destination }],
    ["mempr.export.preview", { destination }]
  ];

  for (const [toolName, args] of cases) {
    const root = await makeTempRoot(`mempr-mcp-export-hardlink-root-${toolName.replace(".", "-")}-`);
    const outside = await makeTempRoot("mempr-mcp-export-hardlink-outside-");
    const outsideFile = join(outside, "MEMORY.md");

    try {
      await seedAcceptedMemory(root, destination);
      const beforeEvents = await readOptional(join(root, ".mempr", "events.jsonl"));
      await writeFile(outsideFile, outsideContent);
      await link(outsideFile, join(root, destination));

      const server = new MemprMcpServer({ root });
      const response = await callTool(server, toolName, args);
      const afterEvents = await readOptional(join(root, ".mempr", "events.jsonl"));
      const serialized = JSON.stringify(response);

      assert.equal(response.result?.isError, true, toolName);
      assert.match(serialized, /single-link|destination|read safely/i);
      assertNoEcho(serialized, [outsideContent.trim(), outside]);
      assert.equal(await readFile(outsideFile, "utf8"), outsideContent, toolName);
      assert.equal(afterEvents, beforeEvents, toolName);
      assert.equal(parseJsonl(afterEvents).some((event) => event.type === "memory_exported"), false);
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  }
});

test("diagnostics redacts secret-like roots and corrupted record fields", async () => {
  const rootSecret = "token=memprFakeDiagnosticsRootShouldNotPersist1234567890";
  const destinationSecret = "token=memprFakeCorruptDestDiagnosticsShouldNotLeak1234567890";
  const scopeSecret = "token=memprFakeCorruptScopeDiagnosticsShouldNotLeak1234567890";
  const destination = `docs/${destinationSecret}.md`;
  const root = await makeTempRoot(`${rootSecret}-root-`);

  try {
    await seedAcceptedMemory(root, "MEMORY.md");
    await corruptFirstLedgerRecord(root, {
      destination,
      scope: `repo-${scopeSecret}`
    });

    const result = await runCliResult(withRoot(root, ["diagnostics", "--json"]));
    const diagnosticsText = await readOptional(join(root, ".mempr", "diagnostics.jsonl"));
    const combined = `${result.stdout}\n${result.stderr}\n${diagnosticsText ?? ""}`;

    assert.notEqual(result.code, 0);
    assertNoEcho(combined, [rootSecret, root, destinationSecret, destination, scopeSecret]);
    assert.match(combined, /\[redacted\]|\[MEMPR_REDACTED_SECRET\]/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context and status redact corrupted secret-like destinations", async () => {
  const secret = "token=memprFakeCorruptDestinationStatusShouldNotLeak1234567890";
  const destination = `docs/${secret}.md`;
  const root = await makeTempRoot("mempr-corrupt-context-cli-");

  try {
    await seedAcceptedMemory(root, "MEMORY.md");
    await corruptFirstLedgerRecord(root, { destination });

    const statusResult = await runCliResult(withRoot(root, ["context-status", "--json"]));
    const contextResult = await runCliResult(withRoot(root, [
      "context",
      "--destination",
      destination,
      "--json"
    ]));
    const eventsText = await readOptional(join(root, ".mempr", "events.jsonl"));

    assert.equal(statusResult.code, 0);
    assert.notEqual(contextResult.code, 0);
    assertNoEcho(`${statusResult.stdout}\n${statusResult.stderr}`, [secret, destination]);
    assertNoEcho(`${contextResult.stdout}\n${contextResult.stderr}`, [secret, destination]);
    assertNoEcho(eventsText, [secret, destination]);

    const status = JSON.parse(statusResult.stdout);
    const context = JSON.parse(contextResult.stdout);

    assert.equal(status.blocked, true);
    assert.match(status.destinations[0].destination, /\[MEMPR_REDACTED_SECRET\]/);
    assert.equal(context.ok, false);
    assert.match(context.destination, /\[MEMPR_REDACTED_SECRET\]/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("MCP context/status/resource surfaces redact corrupted secret-like destinations", async () => {
  const secret = "token=memprFakeMcpCorruptDestinationShouldNotLeak1234567890";
  const destination = `docs/${secret}.md`;
  const root = await makeTempRoot("mempr-corrupt-context-mcp-");

  try {
    await seedAcceptedMemory(root, "MEMORY.md");
    await corruptFirstLedgerRecord(root, { destination });

    const server = new MemprMcpServer({ root });
    const statusResponse = await callTool(server, "mempr.context.status", {});
    const contextResponse = await callTool(server, "mempr.context", { destination });
    const contextsResource = await readResource(server, "mempr://contexts");
    const contextResource = await readResource(server, `mempr://context/docs/${secret}.md`);
    const eventsText = await readOptional(join(root, ".mempr", "events.jsonl"));
    const combined = [
      JSON.stringify(statusResponse),
      JSON.stringify(contextResponse),
      JSON.stringify(contextsResource),
      JSON.stringify(contextResource),
      eventsText ?? ""
    ].join("\n");

    assertNoEcho(combined, [secret, destination]);
    assert.equal(statusResponse.result.structuredContent.blocked, true);
    assert.match(
      statusResponse.result.structuredContent.destinations[0].destination,
      /\[MEMPR_REDACTED_SECRET\]/
    );
    assert.equal(contextResponse.result.structuredContent.ok, false);
    assert.match(contextResponse.result.structuredContent.destination, /\[MEMPR_REDACTED_SECRET\]/);
    assert.equal(contextResource.error?.message, "Unsupported MemPR resource URI shape.");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function seedAcceptedMemory(root, destination) {
  const record = await proposeMemory({
    memory: "Accepted memory for safety regression tests.",
    source: "manual",
    sourceTrust: "trusted",
    scope: "repo",
    risk: "medium",
    destination
  }, root);

  return updateRecordStatus(record.id, "accepted", "Accepted for safety regression tests.", root);
}

async function corruptFirstLedgerRecord(root, patch) {
  const ledgerPath = join(root, ".mempr", "ledger.jsonl");
  const [firstLine, ...rest] = (await readFile(ledgerPath, "utf8")).trimEnd().split("\n");
  const record = {
    ...JSON.parse(firstLine),
    ...patch
  };

  await writeFile(ledgerPath, [JSON.stringify(record), ...rest].join("\n") + "\n");
}

async function runCliResult(args) {
  try {
    const result = await exec(process.execPath, [CLI_PATH, ...args], {
      env: {
        ...process.env,
        NO_COLOR: "1"
      }
    });

    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? ""
    };
  }
}

function withRoot(root, args) {
  return [args[0], "--root", root, ...args.slice(1)];
}

async function callTool(server, name, args = {}) {
  return server.handleMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name,
      arguments: args
    }
  });
}

async function readResource(server, uri) {
  return server.handleMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "resources/read",
    params: { uri }
  });
}

function assertDestinationRejected(response, label) {
  const structured = response.result?.structuredContent;

  if (structured?.error) {
    assert.match(structured.error.message, /secret-like|destination/i, label);
    return;
  }

  assert.equal(structured?.ok, false, label);
  assert.match(JSON.stringify(structured), /secret_like_content|secret-like/i, label);
}

async function makeTempRoot(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));

  await mkdir(root, { recursive: true });
  return root;
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return null;
    }

    throw error;
  }
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return false;
    }

    throw error;
  }
}

function parseJsonl(text) {
  return (text ?? "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertNoEcho(value, forbiddenValues) {
  const text = String(value ?? "");

  for (const forbidden of forbiddenValues) {
    assert.doesNotMatch(text, new RegExp(escapeRegExp(forbidden), "i"));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
