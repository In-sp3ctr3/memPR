import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import {
  exportMarkdown,
  listRecords,
  proposeMemory
} from "../dist/ledger.js";

const exec = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = join(REPO_ROOT, "dist", "cli.js");

test("new records default to fact model metadata", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeMemory({
      memory: "This repo uses npm."
    }, root);

    assert.equal(record.kind, "fact");
    assert.deepEqual(record.tags, []);
    assert.equal(record.confidence, null);
    assert.equal(record.reviewer, null);
    assert.equal(record.approved_by, null);
    assert.equal(record.last_verified_at, null);
    assert.equal(record.last_used_at, null);
    assert.equal(record.retention_class, null);
    assert.equal(record.priority, null);
    assert.deepEqual(record.applies_to_paths, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("legacy records normalize richer model defaults", async () => {
  const root = await makeTempRoot();

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(join(root, ".mempr", "ledger.jsonl"), `${JSON.stringify(legacyRecord())}\n`);
    const [record] = await listRecords({}, root);

    assert.equal(record.kind, "fact");
    assert.deepEqual(record.tags, []);
    assert.equal(record.confidence, null);
    assert.equal(record.reviewer, null);
    assert.equal(record.approved_by, null);
    assert.equal(record.last_verified_at, null);
    assert.equal(record.last_used_at, null);
    assert.equal(record.retention_class, null);
    assert.equal(record.priority, null);
    assert.deepEqual(record.applies_to_paths, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("invalid memory kind rejects proposals", async () => {
  const root = await makeTempRoot();

  try {
    await assert.rejects(
      proposeMemory({
        memory: "Invalid kind should fail.",
        kind: "habit"
      }, root),
      /kind/i
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("tags normalize from CSV and dedupe", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeMemory({
      memory: "Tags are normalized.",
      tags: "Repo, testing,repo,,TESTING"
    }, root);

    assert.deepEqual(record.tags, ["repo", "testing"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("confidence rejects values outside 0..1", async () => {
  const root = await makeTempRoot();

  try {
    for (const confidence of [-0.1, 1.1]) {
      await assert.rejects(
        proposeMemory({
          memory: "Invalid confidence should fail.",
          confidence
        }, root),
        /confidence/i
      );
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("priority rejects invalid values", async () => {
  const root = await makeTempRoot();

  try {
    for (const priority of [0, 6, 1.5]) {
      await assert.rejects(
        proposeMemory({
          memory: "Invalid priority should fail.",
          priority
        }, root),
        /priority/i
      );
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("applies-to paths reject traversal and absolute paths", async () => {
  const root = await makeTempRoot();

  try {
    for (const appliesToPaths of [["../secret.txt"], ["/tmp/secret.txt"]]) {
      await assert.rejects(
        proposeMemory({
          memory: "Invalid applies-to path should fail.",
          appliesToPaths
        }, root),
        /applies-to path/i
      );
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("export renders richer model fields safely", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeMemory({
      memory: "Run npm test before release.",
      sourceTrust: "trusted",
      scope: "repo",
      risk: "low",
      kind: "instruction",
      tags: ["Repo", "testing"],
      confidence: 0.9,
      priority: 2,
      appliesToPaths: ["test/cli.test.js", "src/cli.ts"]
    }, root);
    const preview = await exportMarkdown("MEMORY.md", root, { dryRun: true });

    assert.equal(record.status, "accepted");
    assert.match(preview.safe_content_preview, /kind: "instruction"/);
    assert.match(preview.safe_content_preview, /tags: \["repo", "testing"\]/);
    assert.match(preview.safe_content_preview, /confidence: "0.9"/);
    assert.match(preview.safe_content_preview, /priority: "2"/);
    assert.match(preview.safe_content_preview, /applies_to_paths: \["src\/cli\.ts", "test\/cli\.test\.js"\]/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("instruction kind from unknown source goes to review", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeMemory({
      memory: "Always run npm test before release.",
      sourceTrust: "unknown",
      scope: "repo",
      risk: "low",
      kind: "instruction"
    }, root);

    assert.equal(record.status, "pending");
    assert.equal(record.risk, "medium");
    assert.match(record.decision_reason, /memory kind/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("review with --reviewer stores reviewer and approved_by", async () => {
  const root = await makeTempRoot();

  try {
    const proposed = await proposeMemory({
      memory: "Reviewer metadata should persist.",
      risk: "medium"
    }, root);
    const { stdout } = await exec(process.execPath, [
      CLI_PATH,
      "review",
      "--root",
      root,
      "--json",
      proposed.id,
      "--accept",
      "--reason",
      "Approved with reviewer metadata.",
      "--reviewer",
      "reviewer:jadan"
    ]);
    const accepted = JSON.parse(stdout);

    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.reviewer, "reviewer:jadan");
    assert.equal(accepted.approved_by, "reviewer:jadan");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function legacyRecord() {
  return {
    id: "mem_legacy_model",
    memory: "Legacy model record.",
    source: {
      type: "manual",
      uri: "manual"
    },
    source_trust: "unknown",
    scope: "user",
    risk: "medium",
    decision: "review",
    decision_reason: "Legacy record.",
    policy_version: "unknown",
    destination: "MEMORY.md",
    status: "pending",
    status_reason: null,
    ttl: null,
    expires_at: null,
    supersedes: [],
    conflicts_with: [],
    created_at: "2026-05-21T00:00:00.000Z",
    updated_at: "2026-05-21T00:00:00.000Z"
  };
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-memory-model-"));
}
