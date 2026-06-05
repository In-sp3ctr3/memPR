import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import {
  access,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { closeChildProcess } from "./helpers/process-cleanup.js";
import { loadPrincipals } from "../dist/identity.js";
import { loadPolicyConfig } from "../dist/policy-config.js";
import { loadReadPolicy } from "../dist/read-policy.js";
import { fakeOpenAiKey } from "./helpers/fake-secrets.js";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const CLI = join(REPO_ROOT, "dist", "cli.js");
const SECRET_TOKEN = fakeOpenAiKey("MemprStoreSafetyShouldNotLeak1234567890");
const STORE_FILES = [
  "ledger.jsonl",
  "events.jsonl",
  "policy.json",
  "read-policy.json",
  "principals.json",
  "diagnostics.jsonl",
  "store.lock"
];

test(".mempr symlink escape fails safely without writing outside state", async () => {
  const root = await makeTempRoot();
  const outside = await makeOutsideRoot();

  try {
    await symlink(outside, join(root, ".mempr"));

    for (const command of [
      proposeCommand(root),
      ["export", "--root", root, "--json"],
      ["diagnostics", "--root", root, "--json"]
    ]) {
      const result = await runCli(command);

      assertFailedJsonQuickly(result, command[0]);
      assertNoLeak(result, [root, outside, SECRET_TOKEN]);
      await assertStoreFilesMissing(outside);
    }
  } finally {
    await cleanup(root, outside);
  }
});

test("ledger FIFO makes list --json fail quickly without hanging", async () => {
  const root = await makeTempRoot();

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await mkfifo(join(root, ".mempr", "ledger.jsonl"));

    const result = await runCli(["list", "--root", root, "--json"]);

    assertFailedJsonQuickly(result, "ledger FIFO list");
    assertNoLeak(result, [root, SECRET_TOKEN]);
  } finally {
    await cleanup(root);
  }
});

test("events FIFO makes propose --json fail quickly without ledger or event corruption", async () => {
  const root = await makeTempRoot();

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    const eventPath = join(root, ".mempr", "events.jsonl");
    await mkfifo(eventPath);

    const result = await runCli(proposeCommand(root));

    assertFailedJsonQuickly(result, "events FIFO propose");
    assertNoLeak(result, [root, SECRET_TOKEN]);
    await assertPathMissing(join(root, ".mempr", "ledger.jsonl"));
    assert.equal((await lstat(eventPath)).isFIFO(), true);
    await assertPathMissing(join(root, ".mempr", "store.lock"));
  } finally {
    await cleanup(root);
  }
});

test("policy FIFO makes propose --json fail quickly without hanging", async () => {
  const root = await makeTempRoot();

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await mkfifo(join(root, ".mempr", "policy.json"));

    const result = await runCli(proposeCommand(root));

    assertFailedJsonQuickly(result, "policy FIFO propose");
    assertNoLeak(result, [root, SECRET_TOKEN]);
    await assertPathMissing(join(root, ".mempr", "ledger.jsonl"));
    await assertPathMissing(join(root, ".mempr", "events.jsonl"));
  } finally {
    await cleanup(root);
  }
});

test("diagnostics FIFO makes diagnostics --json fail quickly without hanging", async () => {
  const root = await makeTempRoot();

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await mkfifo(join(root, ".mempr", "diagnostics.jsonl"));

    const result = await runCli(["diagnostics", "--root", root, "--json"]);

    assertFailedJsonQuickly(result, "diagnostics FIFO");
    assertNoLeak(result, [root, SECRET_TOKEN]);
  } finally {
    await cleanup(root);
  }
});

test("events symlink outside fails safely and leaves outside file unchanged", async () => {
  const root = await makeTempRoot();
  const outside = await makeOutsideRoot();
  const outsideFile = join(outside, "events-outside.jsonl");

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(outsideFile, "outside events must remain unchanged\n");
    await symlink(outsideFile, join(root, ".mempr", "events.jsonl"));

    const result = await runCli(proposeCommand(root));

    assertFailedJsonQuickly(result, "events symlink");
    assertNoLeak(result, [root, outside, SECRET_TOKEN]);
    assert.equal(await readFile(outsideFile, "utf8"), "outside events must remain unchanged\n");
    await assertPathMissing(join(root, ".mempr", "ledger.jsonl"));
  } finally {
    await cleanup(root, outside);
  }
});

test("events hardlink outside fails safely and leaves outside file unchanged", async () => {
  const root = await makeTempRoot();
  const outside = await makeOutsideRoot();
  const outsideFile = join(outside, "events-outside.jsonl");

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(outsideFile, "outside events must remain unchanged\n");
    await link(outsideFile, join(root, ".mempr", "events.jsonl"));

    const result = await runCli(proposeCommand(root));

    assertFailedJsonQuickly(result, "events hardlink");
    assertNoLeak(result, [root, outside, SECRET_TOKEN]);
    assert.equal(await readFile(outsideFile, "utf8"), "outside events must remain unchanged\n");
    await assertPathMissing(join(root, ".mempr", "ledger.jsonl"));
    await assertPathMissing(join(root, ".mempr", "store.lock"));
  } finally {
    await cleanup(root, outside);
  }
});

test("diagnostics symlink outside fails safely and leaves outside file unchanged", async () => {
  const root = await makeTempRoot();
  const outside = await makeOutsideRoot();
  const outsideFile = join(outside, "diagnostics-outside.jsonl");

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(outsideFile, "outside diagnostics must remain unchanged\n");
    await symlink(outsideFile, join(root, ".mempr", "diagnostics.jsonl"));

    const result = await runCli(["diagnostics", "--root", root, "--json"]);

    assertFailedJsonQuickly(result, "diagnostics symlink");
    assertNoLeak(result, [root, outside, SECRET_TOKEN]);
    assert.equal(await readFile(outsideFile, "utf8"), "outside diagnostics must remain unchanged\n");
  } finally {
    await cleanup(root, outside);
  }
});

test("diagnostics hardlink outside fails safely and leaves outside file unchanged", async () => {
  const root = await makeTempRoot();
  const outside = await makeOutsideRoot();
  const outsideFile = join(outside, "diagnostics-outside.jsonl");

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(outsideFile, "outside diagnostics must remain unchanged\n");
    await link(outsideFile, join(root, ".mempr", "diagnostics.jsonl"));

    const result = await runCli(["diagnostics", "--root", root, "--json"]);

    assertFailedJsonQuickly(result, "diagnostics hardlink");
    assertNoLeak(result, [root, outside, SECRET_TOKEN]);
    assert.equal(await readFile(outsideFile, "utf8"), "outside diagnostics must remain unchanged\n");
  } finally {
    await cleanup(root, outside);
  }
});

test("ledger hardlink outside fails safely without trusting or changing outside state", async () => {
  for (const command of [
    (root) => ["list", "--root", root, "--json"],
    proposeCommand,
    (root) => ["check", "--root", root, "--json"]
  ]) {
    const root = await makeTempRoot();
    const outside = await makeOutsideRoot();
    const outsideFile = join(outside, "ledger-outside.jsonl");
    const outsideMemory = "Outside hardlinked ledger memory must not be trusted or echoed.";
    const outsideLedger = `${JSON.stringify({
      id: "mem_outside_hardlink",
      memory: outsideMemory,
      source: "manual",
      scope: "repo",
      destination: "MEMORY.md",
      status: "accepted",
      risk: "low",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z"
    })}\n`;

    try {
      await mkdir(join(root, ".mempr"), { recursive: true });
      await writeFile(outsideFile, outsideLedger);
      await link(outsideFile, join(root, ".mempr", "ledger.jsonl"));

      const result = await runCli(command(root));

      assertFailedJsonOrIssueQuickly(result, `ledger hardlink ${command(root)[0]}`);
      assertNoLeak(result, [root, outside, SECRET_TOKEN, outsideMemory]);
      assert.equal(await readFile(outsideFile, "utf8"), outsideLedger);
    } finally {
      await cleanup(root, outside);
    }
  }
});

test("internal config symlinks fail closed and never read outside root", async () => {
  const root = await makeTempRoot();
  const outside = await makeOutsideRoot();

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });

    const policyOutside = join(outside, "policy.json");
    await writeFile(policyOutside, JSON.stringify({ autoAcceptScopes: ["repo"] }));
    await symlink(policyOutside, join(root, ".mempr", "policy.json"));
    await assert.rejects(
      loadPolicyConfig(root),
      /MemPR store file/
    );

    const readPolicyOutside = join(outside, "read-policy.json");
    await writeFile(readPolicyOutside, JSON.stringify({
      version: 1,
      rules: [{ effect: "allow", principals: ["agent"], actions: ["read"], resources: ["*"] }]
    }));
    await symlink(readPolicyOutside, join(root, ".mempr", "read-policy.json"));
    assert.deepEqual(await loadReadPolicy(root), { exists: true, ok: false });

    const principalsOutside = join(outside, "principals.json");
    await writeFile(principalsOutside, JSON.stringify({
      version: 1,
      principals: []
    }));
    await symlink(principalsOutside, join(root, ".mempr", "principals.json"));
    assert.deepEqual(await loadPrincipals(root), { exists: true, ok: false });
  } finally {
    await cleanup(root, outside);
  }
});

test("internal config hardlinks fail closed and never read outside root", async () => {
  const root = await makeTempRoot();
  const outside = await makeOutsideRoot();

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });

    const policyOutside = join(outside, "policy.json");
    await writeFile(policyOutside, JSON.stringify({ autoAcceptScopes: ["repo"] }));
    await link(policyOutside, join(root, ".mempr", "policy.json"));
    await assert.rejects(
      loadPolicyConfig(root),
      /single-link|MemPR store file/
    );
    assert.equal(await readFile(policyOutside, "utf8"), JSON.stringify({ autoAcceptScopes: ["repo"] }));

    const readPolicyOutside = join(outside, "read-policy.json");
    await writeFile(readPolicyOutside, JSON.stringify({
      version: 1,
      rules: [{ effect: "allow", principals: ["agent"], actions: ["read"], resources: ["*"] }]
    }));
    await link(readPolicyOutside, join(root, ".mempr", "read-policy.json"));
    assert.deepEqual(await loadReadPolicy(root), { exists: true, ok: false });

    const principalsOutside = join(outside, "principals.json");
    await writeFile(principalsOutside, JSON.stringify({
      version: 1,
      principals: []
    }));
    await link(principalsOutside, join(root, ".mempr", "principals.json"));
    assert.deepEqual(await loadPrincipals(root), { exists: true, ok: false });
  } finally {
    await cleanup(root, outside);
  }
});

test("store.lock FIFO or symlink makes propose/export/review fail quickly", async () => {
  for (const unsafeLock of ["fifo", "symlink", "hardlink"]) {
    for (const commandFactory of [
      proposeCommand,
      (root) => ["export", "--root", root, "--json"],
      (root) => ["review", "mem_missing", "--accept", "--reason", "store lock safety", "--root", root, "--json"]
    ]) {
      const root = await makeTempRoot();
      const outside = await makeOutsideRoot();
      const outsideLock = join(outside, "store.lock");

      try {
        await mkdir(join(root, ".mempr"), { recursive: true });

        if (unsafeLock === "fifo") {
          await mkfifo(join(root, ".mempr", "store.lock"));
        } else if (unsafeLock === "symlink") {
          await writeFile(outsideLock, "outside lock must remain unchanged\n");
          await symlink(outsideLock, join(root, ".mempr", "store.lock"));
        } else {
          await writeFile(outsideLock, "outside lock must remain unchanged\n");
          await link(outsideLock, join(root, ".mempr", "store.lock"));
        }

        const result = await runCli(commandFactory(root));

        assertFailedJsonQuickly(result, `${unsafeLock} store.lock ${commandFactory(root)[0]}`);
        assertNoLeak(result, [root, outside, SECRET_TOKEN]);
        await assertPathMissing(join(root, ".mempr", "ledger.jsonl"));
        await assertPathMissing(join(root, ".mempr", "events.jsonl"));

        if (unsafeLock === "symlink" || unsafeLock === "hardlink") {
          assert.equal(await readFile(outsideLock, "utf8"), "outside lock must remain unchanged\n");
        }
      } finally {
        await cleanup(root, outside);
      }
    }
  }
});

function proposeCommand(root) {
  return [
    "propose",
    "--root",
    root,
    "--memory",
    "Internal store filesystem safety should reject unsafe state files.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "AGENTS.md",
    "--json"
  ];
}

async function runCli(args, timeoutMs = 5_000) {
  const child = spawn(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  const startedAt = Date.now();

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const closePromise = once(child, "close");
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(async () => {
      timedOut = true;
      await closeChildProcess(child, {
        gracefulTimeoutMs: 0,
        terminateTimeoutMs: 250,
        killTimeoutMs: 250
      });
      resolve(null);
    }, timeoutMs);
  });

  const closeResult = await Promise.race([closePromise, timeoutPromise]);
  clearTimeout(timeoutId);
  const [code, signal] = closeResult ?? await closePromise;

  return {
    args,
    code,
    signal,
    stdout,
    stderr,
    timedOut,
    durationMs: Date.now() - startedAt
  };
}

function assertFailedJsonQuickly(result, label) {
  assert.equal(result.timedOut, false, `${label} timed out`);
  assert(result.durationMs < 5_000, `${label} took ${result.durationMs}ms`);
  assert.notEqual(result.code, 0, `${label} should fail`);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false, `${label} must return JSON error`);
  assert.equal(typeof payload.error.code, "string");
  assert.equal(typeof payload.error.message, "string");
  assert.equal(payload.error.message.length > 0, true);
}

function assertFailedJsonOrIssueQuickly(result, label) {
  assert.equal(result.timedOut, false, `${label} timed out`);
  assert(result.durationMs < 5_000, `${label} took ${result.durationMs}ms`);
  assert.notEqual(result.code, 0, `${label} should fail`);

  const payload = JSON.parse(result.stdout);

  if (payload.error) {
    assert.equal(payload.ok, false, `${label} must return JSON error`);
    assert.equal(typeof payload.error.code, "string");
    assert.equal(typeof payload.error.message, "string");
    assert.equal(payload.error.message.length > 0, true);
    return;
  }

  assert.equal(payload.ok, false, `${label} must return JSON failure`);
  assert(Array.isArray(payload.issues), `${label} must include issues when no error object is present`);
  assert(payload.issues.length > 0, `${label} must include at least one issue`);
}

function assertNoLeak(result, values) {
  const output = `${result.stdout}\n${result.stderr}`;

  for (const value of values) {
    assert.doesNotMatch(output, new RegExp(escapeRegExp(value)));
  }
}

async function mkfifo(path) {
  await new Promise((resolve, reject) => {
    execFile("mkfifo", [path], (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function assertStoreFilesMissing(directory) {
  for (const filename of STORE_FILES) {
    await assertPathMissing(join(directory, filename));
  }
}

async function assertPathMissing(path) {
  await assert.rejects(access(path), (error) => {
    assert(error instanceof Error);
    assert.equal(error.code, "ENOENT");
    return true;
  });
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), `mempr-store-${SECRET_TOKEN}-`));
}

async function makeOutsideRoot() {
  const root = await mkdtemp(join(tmpdir(), `mempr-outside-${SECRET_TOKEN}-`));
  await mkdir(dirname(root), { recursive: true });
  return root;
}

async function cleanup(...paths) {
  for (const path of paths) {
    await rm(path, { force: true, recursive: true });
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
