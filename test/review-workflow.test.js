import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import { fakeOpenAiKey } from "./helpers/fake-secrets.js";

const exec = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = join(REPO_ROOT, "dist", "cli.js");

test("diff-export exits 0 when existing destination matches preview", async () => {
  const root = await makeTempRoot();

  try {
    await proposeAccepted(root, "Diff export matching memory.");
    await runCli(["export", "--root", root, "--destination", "AGENTS.md"]);

    const result = await runCliResult([
      "diff-export",
      "--root",
      root,
      "--destination",
      "AGENTS.md"
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /diff-export clean/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("diff-export exits 1 when destination differs", async () => {
  const root = await makeTempRoot();

  try {
    await proposeAccepted(root, "Diff export stale memory.");
    await runCli(["export", "--root", root, "--destination", "AGENTS.md"]);
    await writeFile(join(root, "AGENTS.md"), "manual drift\n");

    const result = await runCliResult([
      "diff-export",
      "--root",
      root,
      "--destination",
      "AGENTS.md"
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /^--- AGENTS\.md/m);
    assert.match(result.stdout, /manual drift/);
    assert.match(result.stdout, /\[MEMPR_REDACTED_MANAGED_BLOCK_MARKER\]/);
    assert.doesNotMatch(result.stdout, /<!-- mempr:start -->/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("guard passes when destination matches preview", async () => {
  const root = await makeTempRoot();

  try {
    await proposeAccepted(root, "Guard matching memory.");
    await runCli(["export", "--root", root, "--destination", "AGENTS.md"]);

    const result = await runCliResult([
      "guard",
      "--root",
      root,
      "--destination",
      "AGENTS.md"
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /guard passed/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("guard fails when destination differs", async () => {
  const root = await makeTempRoot();

  try {
    await proposeAccepted(root, "Guard stale memory.");
    await runCli(["export", "--root", root, "--destination", "AGENTS.md"]);
    await writeFile(join(root, "AGENTS.md"), "manual drift\n");

    const result = await runCliResult([
      "guard",
      "--root",
      root,
      "--destination",
      "AGENTS.md"
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /guard failed/i);
    assert.match(result.stdout, /out of date/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("diff-export and guard reject unsafe existing destination reads without hanging", async () => {
  const root = await makeTempRoot();
  const outside = await makeTempRoot();

  try {
    await proposeAccepted(root, "Unsafe destination read should be blocked.");

    await exec("mkfifo", [join(root, "AGENTS.md")], {
      timeout: 5_000,
      killSignal: "SIGKILL"
    });
    let result = await runCliResult([
      "diff-export",
      "--root",
      root,
      "--destination",
      "AGENTS.md"
    ]);
    assert.equal(result.code, 2);
    assert.match(result.stdout, /blocked|read|destination/i);

    await rm(join(root, "AGENTS.md"), { force: true });
    await writeFile(join(outside, "AGENTS.md"), "outside target must not be read\n");
    await symlink(join(outside, "AGENTS.md"), join(root, "AGENTS.md"));
    result = await runCliResult([
      "guard",
      "--root",
      root,
      "--destination",
      "AGENTS.md"
    ]);
    assert.equal(result.code, 2);
    assert.match(result.stdout, /blocked|read|destination/i);
    assert.doesNotMatch(result.stdout, /outside target/);

    await rm(join(root, "AGENTS.md"), { force: true });
    await mkdir(join(root, "AGENTS.md"));
    result = await runCliResult([
      "guard",
      "--root",
      root,
      "--destination",
      "AGENTS.md"
    ]);
    assert.equal(result.code, 2);
    assert.match(result.stdout, /blocked|read|destination/i);

    await rm(join(root, "AGENTS.md"), { force: true, recursive: true });
    await writeFile(join(root, "AGENTS.md"), "x".repeat(5 * 1024 * 1024 + 1));
    result = await runCliResult([
      "diff-export",
      "--root",
      root,
      "--destination",
      "AGENTS.md"
    ]);
    assert.equal(result.code, 2);
    assert.match(result.stdout, /blocked|read|destination/i);
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("guard exits 2 when export preview is blocked by accepted secret-like content", async () => {
  const root = await makeTempRoot();
  const secret = "token=memprFakereviewWorkflowShouldNotEcho1234567890";

  try {
    const record = await proposeAccepted(root, "Guard blocked memory.");
    const ledgerPath = join(root, ".mempr", "ledger.jsonl");
    const ledgerRecords = parseJsonl(await readFile(ledgerPath, "utf8"));
    ledgerRecords[0].memory = `api_key=${secret}`;
    ledgerRecords[0].id = record.id;
    await writeFile(ledgerPath, `${ledgerRecords.map((item) => JSON.stringify(item)).join("\n")}\n`);

    const result = await runCliResult([
      "guard",
      "--root",
      root,
      "--destination",
      "AGENTS.md"
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stdout, /guard blocked/i);
    assert.doesNotMatch(result.stdout, new RegExp(secret));
    assert.doesNotMatch(result.stderr, new RegExp(secret));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("diff-export and guard JSON omit absolute output paths", async () => {
  const root = await mkdtemp(join(tmpdir(), `mempr-${fakeOpenAiKey("reviewWorkflowPath1234567890")}-`));
  const secretPart = fakeOpenAiKey("reviewWorkflowPath1234567890");

  try {
    await proposeAccepted(root, "Review workflow path output should be safe.");

    for (const command of ["diff-export", "guard"]) {
      const result = await runCliResult([
        command,
        "--root",
        root,
        "--destination",
        "AGENTS.md",
        "--json"
      ]);
      const payload = JSON.parse(result.stdout);
      const serialized = JSON.stringify(payload);

      assert.notEqual(result.code, 2);
      assert.equal(Object.hasOwn(payload, "outputPath"), false);
      assert.equal(payload.preview && Object.hasOwn(payload.preview, "outputPath"), false);
      assert.doesNotMatch(serialized, new RegExp(escapeRegExp(root)));
      assert.doesNotMatch(serialized, new RegExp(escapeRegExp(secretPart)));
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("blame renders source, policy, status changes, and reviewer fields", async () => {
  const root = await makeTempRoot();

  try {
    const proposed = JSON.parse(await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "Blame should show accountability metadata.",
      "--source",
      "source.md",
      "--risk",
      "medium",
      "--destination",
      "MEMORY.md"
    ]));
    await runCli([
      "review",
      "--root",
      root,
      proposed.id,
      "--accept",
      "--reason",
      "Accepted for blame test.",
      "--reviewer",
      "reviewer-1",
      "--json"
    ]);

    const json = JSON.parse(await runCli([
      "blame",
      "--root",
      root,
      proposed.id,
      "--json"
    ]));
    const text = await runCli([
      "blame",
      "--root",
      root,
      proposed.id
    ]);

    assert.equal(json.id, proposed.id);
    assert.equal(json.source.uri, "source.md");
    assert.equal(json.reviewer, "reviewer-1");
    assert.equal(json.approved_by, "reviewer-1");
    assert.equal(json.status_changes.length, 1);
    assert.equal(json.status_changes[0].previous_status, "pending");
    assert.equal(json.status_changes[0].next_status, "accepted");
    assert.match(text, /source: source\.md/);
    assert.match(text, /policy_version: mempr-policy-v1/);
    assert.match(text, /decision_reason:/);
    assert.match(text, /reviewer: reviewer-1/);
    assert.match(text, /pending -> accepted/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("blame --json sanitizes corrupted secret-like source URIs", async () => {
  const root = await makeTempRoot();
  const secret = fakeOpenAiKey("reviewWorkflowBlameSourceShouldNotEcho1234567890");

  try {
    const proposed = JSON.parse(await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "Blame source URI corruption should be redacted.",
      "--source",
      "source.md",
      "--risk",
      "medium",
      "--destination",
      "MEMORY.md"
    ]));
    const ledgerPath = join(root, ".mempr", "ledger.jsonl");
    const records = parseJsonl(await readFile(ledgerPath, "utf8"));
    records[0].source.uri = `manual://${secret}`;
    await writeFile(ledgerPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);

    const json = await runCli([
      "blame",
      "--root",
      root,
      proposed.id,
      "--json"
    ]);
    const payload = JSON.parse(json);

    assert.doesNotMatch(json, new RegExp(escapeRegExp(secret)));
    assert.match(payload.source.uri, /\[MEMPR_REDACTED_SECRET\]/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function proposeAccepted(root, memory) {
  return JSON.parse(await runCli([
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
    "AGENTS.md"
  ]));
}

async function runCli(args) {
  const { stdout } = await exec(process.execPath, [CLI_PATH, ...args], {
    maxBuffer: 1024 * 1024,
    timeout: 5_000,
    killSignal: "SIGKILL"
  });
  return stdout;
}

async function runCliResult(args) {
  try {
    const stdout = await runCli(args);
    return {
      code: 0,
      stdout,
      stderr: ""
    };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr
    };
  }
}

function parseJsonl(content) {
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-review-workflow-test-"));
}
