import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import { MemprMcpServer } from "../dist/mcp-server.js";
import {
  proposeSuggestionCandidates,
  suggestFromExistingMemoryFile,
  suggestFromGitDiff,
  suggestFromObservation,
  suggestFromTranscript
} from "../dist/suggest.js";
import { fakeOpenAiKey } from "./helpers/fake-secrets.js";

const exec = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = join(REPO_ROOT, "dist", "cli.js");

test("transcript memory cue produces one candidate", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "transcript.txt"), "User: remember that this repo uses npm\n");

    const candidates = await suggestFromTranscript("transcript.txt", { root });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].memory, "This repo uses npm.");
    assert.equal(candidates[0].source, "transcript.txt");
    assert.equal(candidates[0].sourceType, "file");
    assert.equal(candidates[0].sourceTrust, "unknown");
    assert.equal(candidates[0].scope, "repo");
    assert.equal(candidates[0].destination, "MEMORY.md");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI transcript suggestions do not write ledger unless confirmed proposal is requested", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "transcript.txt"), "remember that this repo uses npm\n");

    const stdout = await runCli([
      "suggest",
      "--root",
      root,
      "--from-transcript",
      "transcript.txt",
      "--json"
    ]);
    const result = JSON.parse(stdout);

    assert.equal(result.suggestionCount, 1);
    assert.equal(result.proposed, false);
    assert.equal(result.suggestions[0].memory_preview, "This repo uses npm.");
    assert.equal(Object.hasOwn(result.suggestions[0], "memory"), false);
    await assertNoMemprArtifacts(root);

    const proposed = JSON.parse(await runCli([
      "suggest",
      "--root",
      root,
      "--from-transcript",
      "transcript.txt",
      "--propose",
      "--confirm",
      "--json"
    ]));

    assert.equal(proposed.proposed, true);
    assert.equal(proposed.proposalReport.records.length, 1);
    assert.match(proposed.proposalReport.records[0].record.id, /^mem_/);
    assert.notEqual(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI suggest --propose without --confirm fails without writes", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "transcript.txt"), "remember that this repo uses npm\n");

    const failure = await runCliFailure([
      "suggest",
      "--root",
      root,
      "--from-transcript",
      "transcript.txt",
      "--propose",
      "--json"
    ]);

    assert.notEqual(failure.code, 0);
    assert.equal(failure.stderr, "");
    const payload = JSON.parse(failure.stdout);
    assert.equal(payload.ok, false);
    assert.match(payload.error.message, /--propose requires --confirm/);
    assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
    assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("git diff detects package-lock package manager fact", async () => {
  const root = await makeTempRoot();

  try {
    await exec("git", ["init"], { cwd: root });
    await writeFile(join(root, "package-lock.json"), "{}\n");

    const candidates = await suggestFromGitDiff(undefined, { root });

    assert.deepEqual(candidates.map((candidate) => candidate.memory), [
      "This repo uses npm for package management."
    ]);
    assert.equal(candidates[0].sourceTrust, "unknown");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("git diff suggestions ignore hardlinked changed files", async () => {
  const root = await makeTempRoot();
  const outside = await mkdtemp(join(tmpdir(), "mempr-suggest-git-hardlink-outside-"));
  const outsideTexts = [
    "outside package-lock content must not drive suggestions",
    "outside package script content must not drive suggestions",
    "outside python version content must not drive suggestions",
    "outside go module content must not drive suggestions"
  ];

  try {
    await exec("git", ["init"], { cwd: root });
    await writeFile(join(outside, "package-lock.json"), `${outsideTexts[0]}\n`);
    await writeFile(join(outside, "package.json"), JSON.stringify({
      scripts: {
        test: `echo ${outsideTexts[1]}`
      }
    }));
    await writeFile(join(outside, ".python-version"), `${outsideTexts[2]}\n`);
    await writeFile(join(outside, "go.mod"), `module example.test/${outsideTexts[3]}\n`);

    for (const filename of [
      "package-lock.json",
      "package.json",
      ".python-version",
      "go.mod"
    ]) {
      await link(join(outside, filename), join(root, filename));
    }

    const candidates = await suggestFromGitDiff(undefined, { root });
    const cli = await runCliResult([
      "suggest",
      "--root",
      root,
      "--from-git-diff",
      "--json"
    ]);
    const result = JSON.parse(cli.stdout);
    const server = new MemprMcpServer({ root });
    const mcp = await callTool(server, "mempr.suggest", {
      fromGitDiff: true
    });

    assert.deepEqual(candidates, []);
    assert.equal(result.suggestionCount, 0);
    assert.deepEqual(result.suggestions, []);
    assert.deepEqual(mcp.structuredContent.suggestions, []);
    assertNoEcho(`${cli.stdout}\n${cli.stderr}\n${JSON.stringify(mcp)}`, outsideTexts);
    await assertNoMemprArtifacts(root);
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("existing memory file parser ignores MemPR managed block content", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "AGENTS.md"), [
      "- Use pnpm for package management.",
      "<!-- mempr:start -->",
      "- Managed block memory should not re-import.",
      "<!-- mempr:end -->",
      "- Always run npm test before release."
    ].join("\n"));

    const candidates = await suggestFromExistingMemoryFile("AGENTS.md", { root });

    assert.deepEqual(candidates.map((candidate) => candidate.memory), [
      "Use pnpm for package management.",
      "Always run npm test before release."
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("suggestion file sources reject traversal, reserved paths, and symlink escapes without writes", async () => {
  const root = await makeTempRoot();
  const outside = await mkdtemp(join(tmpdir(), "mempr-suggest-outside-"));

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(join(root, ".mempr", "ledger.jsonl"), "{}\n");
    await writeFile(join(outside, "transcript.txt"), "remember that this repo uses npm\n");
    await symlink(join(outside, "transcript.txt"), join(root, "linked-transcript.txt"));

    for (const sourcePath of [
      "../outside.txt",
      ".mempr/ledger.jsonl",
      "node_modules/pkg/transcript.txt",
      "dist/transcript.txt",
      "coverage/transcript.txt",
      "linked-transcript.txt"
    ]) {
      await assert.rejects(
        suggestFromTranscript(sourcePath, { root }),
        /path|repository|MemPR|dependency|build|coverage/i
      );
    }

    assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null);
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("CLI suggest rejects symlinked parent file sources without reading outside content", async () => {
  const root = await makeTempRoot();
  const outside = await mkdtemp(join(tmpdir(), "mempr-suggest-parent-outside-"));
  const transcriptSecret = fakeOpenAiKey("memprSuggestParentTranscriptShouldNotEcho1234567890");
  const memorySecret = fakeOpenAiKey("memprSuggestParentMemoryShouldNotEcho1234567890");

  try {
    await mkdir(join(outside, "sub"), { recursive: true });
    await writeFile(
      join(outside, "sub", "transcript.txt"),
      `remember that api_key=${transcriptSecret}\n`
    );
    await writeFile(
      join(outside, "sub", "MEMORY.md"),
      `- remember that api_key=${memorySecret}\n`
    );
    await symlink(outside, join(root, "docs"));

    await assert.rejects(
      suggestFromTranscript("docs/sub/transcript.txt", { root }),
      /regular file|parent|read/i
    );
    await assert.rejects(
      suggestFromExistingMemoryFile("docs/sub/MEMORY.md", { root }),
      /regular file|parent|read/i
    );

    for (const args of [
      ["--from-transcript", "docs/sub/transcript.txt"],
      ["--from-memory-file", "docs/sub/MEMORY.md"]
    ]) {
      const failure = await runCliFailure([
        "suggest",
        "--root",
        root,
        ...args,
        "--json"
      ]);
      const payload = JSON.parse(failure.stdout);

      assert.notEqual(failure.code, 0);
      assert.equal(failure.stderr, "");
      assert.equal(payload.ok, false);
      assertNoEcho(`${failure.stdout}\n${failure.stderr}`, [
        transcriptSecret,
        memorySecret
      ]);
    }

    await assertNoMemprArtifacts(root);
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("CLI suggest rejects hardlinked file sources without deriving outside suggestions", async () => {
  const root = await makeTempRoot();
  const outside = await mkdtemp(join(tmpdir(), "mempr-suggest-hardlink-outside-"));
  const transcriptText = "remember that hardlinked outside transcript should not be used";
  const memoryFileText = "- remember that hardlinked outside memory should not be used\n";

  try {
    await writeFile(join(outside, "transcript.txt"), `${transcriptText}\n`);
    await writeFile(join(outside, "MEMORY.md"), memoryFileText);
    await link(join(outside, "transcript.txt"), join(root, "transcript.txt"));
    await link(join(outside, "MEMORY.md"), join(root, "MEMORY.md"));

    await assert.rejects(
      suggestFromTranscript("transcript.txt", { root }),
      /single-link|regular file|read/i
    );
    await assert.rejects(
      suggestFromExistingMemoryFile("MEMORY.md", { root }),
      /single-link|regular file|read/i
    );

    for (const args of [
      ["--from-transcript", "transcript.txt"],
      ["--from-memory-file", "MEMORY.md"]
    ]) {
      const failure = await runCliFailure([
        "suggest",
        "--root",
        root,
        ...args,
        "--json"
      ]);
      const payload = JSON.parse(failure.stdout);

      assert.notEqual(failure.code, 0);
      assert.equal(failure.stderr, "");
      assert.equal(payload.ok, false);
      assertNoEcho(`${failure.stdout}\n${failure.stderr}`, [
        transcriptText,
        memoryFileText.trim()
      ]);
    }

    await assertNoMemprArtifacts(root);
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("suggestion file sources reject FIFO, directory, and oversized files without hanging", async () => {
  const root = await makeTempRoot();

  try {
    await exec("mkfifo", [join(root, "transcript.txt")], {
      timeout: 5_000,
      killSignal: "SIGKILL"
    });
    await mkdir(join(root, "memory-dir"));
    await writeFile(join(root, "oversized.md"), "x".repeat(1024 * 1024 + 1));

    await assert.rejects(
      suggestFromTranscript("transcript.txt", { root }),
      /regular file|read|size/i
    );
    await assert.rejects(
      suggestFromExistingMemoryFile("memory-dir", { root }),
      /regular file|read|size/i
    );
    await assert.rejects(
      suggestFromExistingMemoryFile("oversized.md", { root }),
      /maximum allowed size/i
    );
    assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("observation suggestion works", async () => {
  const candidates = await suggestFromObservation("note that tests are run with npm test");

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].memory, "Tests are run with npm test.");
  assert.equal(candidates[0].kind, "procedure");
  assert.equal(candidates[0].source, "observation");
});

test("suggestion proposing a secret is blocked without raw persistence or output", async () => {
  const root = await makeTempRoot();
  const secret = "token=memprFakesuggestShouldNotEcho1234567890";

  try {
    const stdout = await runCli([
      "suggest",
      "--root",
      root,
      "--observation",
      `remember that api_key=${secret}`,
      "--propose",
      "--confirm",
      "--json"
    ]);
    const result = JSON.parse(stdout);
    const serialized = JSON.stringify(result);
    const events = await readOptional(join(root, ".mempr", "events.jsonl"));

    assert.equal(result.proposalReport.records.length, 0);
    assert.equal(result.proposalReport.blocked.length, 1);
    assert.doesNotMatch(serialized, new RegExp(secret));
    assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
    assert.equal(events, null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI suggest observation output previews secrets safely without writes", async () => {
  const root = await makeTempRoot();
  const secret = fakeOpenAiKey("memprFakeSuggestObservationSecret1234567890");
  const destinationSecret = "token=memprFakeSuggestObservationDestination1234567890";

  try {
    const json = await runCliResult([
      "suggest",
      "--root",
      root,
      "--observation",
      `remember that api_key=${secret}`,
      "--destination",
      `docs/${destinationSecret}.md`,
      "--json"
    ]);
    const text = await runCliResult([
      "suggest",
      "--root",
      root,
      "--observation",
      `remember that api_key=${secret}`,
      "--destination",
      `docs/${destinationSecret}.md`
    ]);
    const result = JSON.parse(json.stdout);

    assert.equal(result.proposed, false);
    assert.equal(result.suggestionCount, 1);
    assert.equal(Object.hasOwn(result.suggestions[0], "memory"), false);
    assert.match(json.stdout, /\[MEMPR_REDACTED_SECRET\]/);
    assert.match(text.stdout, /\[MEMPR_REDACTED_SECRET\]/);
    assertNoEcho(json.stdout + json.stderr + text.stdout + text.stderr, [
      secret,
      destinationSecret
    ]);
    await assertNoMemprArtifacts(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI suggest transcript and memory-file sources preview secrets safely without writes", async () => {
  const root = await makeTempRoot();
  const transcriptSecret = fakeOpenAiKey("memprFakeSuggestTranscriptSecret1234567890");
  const memoryFileSecret = fakeOpenAiKey("memprFakeSuggestMemoryFileSecret1234567890");

  try {
    await writeFile(join(root, "transcript.json"), JSON.stringify({
      messages: [`remember that api_key=${transcriptSecret}`]
    }));
    await writeFile(join(root, "MEMORY.old.md"), `- remember that api_key=${memoryFileSecret}\n`);

    const transcript = await runCliResult([
      "suggest",
      "--root",
      root,
      "--from-transcript",
      "transcript.json",
      "--json"
    ]);
    const memoryFile = await runCliResult([
      "suggest",
      "--root",
      root,
      "--from-memory-file",
      "MEMORY.old.md",
      "--json"
    ]);

    for (const output of [transcript, memoryFile]) {
      const result = JSON.parse(output.stdout);
      assert.equal(result.proposed, false);
      assert.equal(result.suggestionCount, 1);
      assert.equal(Object.hasOwn(result.suggestions[0], "memory"), false);
      assert.match(output.stdout, /\[MEMPR_REDACTED_SECRET\]/);
    }

    assertNoEcho(transcript.stdout + transcript.stderr + memoryFile.stdout + memoryFile.stderr, [
      transcriptSecret,
      memoryFileSecret
    ]);
    await assertNoMemprArtifacts(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("suggest --propose blocks secret-like destination without raw persistence or output", async () => {
  const root = await makeTempRoot();
  const secret = "token=memprFakesuggestDestinationShouldNotEcho1234567890";

  try {
    const stdout = await runCli([
      "suggest",
      "--root",
      root,
      "--observation",
      "remember that tests are run with npm test",
      "--destination",
      `docs/${secret}.md`,
      "--propose",
      "--confirm",
      "--json"
    ]);
    const result = JSON.parse(stdout);
    const serialized = JSON.stringify(result);
    const events = await readOptional(join(root, ".mempr", "events.jsonl"));

    assert.equal(result.proposalReport.records.length, 0);
    assert.equal(result.proposalReport.blocked.length, 1);
    assert.doesNotMatch(serialized, new RegExp(secret));
    assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
    assert.equal(events, null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("suggest --propose blocks secret-like tags without raw persistence or output", async () => {
  const root = await makeTempRoot();
  const secret = "token=memprFakesuggestTagsShouldNotEcho1234567890";

  try {
    const report = await proposeSuggestionCandidates([{
      memory: "Tests are run with npm test.",
      kind: "procedure",
      source: "observation",
      sourceType: "conversation",
      sourceTrust: "unknown",
      scope: "repo",
      destination: "MEMORY.md",
      tags: ["suggested", secret],
      confidence: 0.7,
      reason: "test fixture"
    }], root);
    const serialized = JSON.stringify(report);
    const events = await readOptional(join(root, ".mempr", "events.jsonl"));

    assert.equal(report.records.length, 0);
    assert.equal(report.blocked.length, 1);
    assert.doesNotMatch(serialized, new RegExp(secret));
    assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
    assert.equal(events, null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("MCP mempr.suggest returns candidates without writes", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "transcript.txt"), "remember that this repo uses npm\n");
    const server = new MemprMcpServer({ root });
    const result = await callTool(server, "mempr.suggest", {
      fromTranscript: "transcript.txt"
    });

    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.suggestions.length, 1);
    assert.equal(result.structuredContent.suggestions[0].memory_preview, "This repo uses npm.");
    assert.equal(Object.hasOwn(result.structuredContent.suggestions[0], "memory"), false);
    await assertNoMemprArtifacts(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("MCP mempr.propose_from_observation requires confirm true", async () => {
  const root = await makeTempRoot();

  try {
    const server = new MemprMcpServer({ root });
    const result = await callTool(server, "mempr.propose_from_observation", {
      observation: "remember that this repo uses npm"
    });

    assert.equal(result.isError, true);
    assert.match(result.structuredContent.error.message, /confirm/i);
    assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
    assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("MCP mempr.preview_memory_diff does not write ledger or events", async () => {
  const root = await makeTempRoot();

  try {
    const server = new MemprMcpServer({ root });
    const result = await callTool(server, "mempr.preview_memory_diff", {
      memory: "This repo uses npm for package management.",
      sourceTrust: "unknown",
      destination: "MEMORY.md"
    });

    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.preview.wouldWrite, false);
    assert.equal(result.structuredContent.preview.policy.decision, "review");
    assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
    assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function callTool(server, name, args = {}) {
  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name,
      arguments: args
    }
  });

  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.id, 1);
  assert.equal(response.error, undefined);
  return response.result;
}

async function runCli(args) {
  const { stdout } = await exec(process.execPath, [CLI_PATH, ...args], {
    maxBuffer: 1024 * 1024
  });
  return stdout;
}

async function runCliResult(args) {
  return exec(process.execPath, [CLI_PATH, ...args], {
    maxBuffer: 1024 * 1024
  });
}

async function runCliFailure(args) {
  try {
    await runCli(args);
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr
    };
  }

  assert.fail("Expected CLI command to fail.");
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function assertNoMemprArtifacts(root) {
  for (const artifact of [
    ".mempr",
    join(".mempr", "ledger.jsonl"),
    join(".mempr", "events.jsonl"),
    join(".mempr", "diagnostics.jsonl"),
    join(".mempr", "store.lock")
  ]) {
    assert.equal(await readOptional(join(root, artifact)), null, `${artifact} should not exist`);
  }
}

function assertNoEcho(output, values) {
  for (const value of values) {
    assert.doesNotMatch(output, new RegExp(escapeRegExp(value)));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function makeTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "mempr-suggest-test-"));
  await mkdir(root, { recursive: true });
  return root;
}
