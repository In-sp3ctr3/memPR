import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  exportMarkdown,
  listRecords,
  proposeMemory,
  updateRecordStatus
} from "../dist/ledger.js";

test("auto-accepts low-risk repo memory", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeMemory(
      {
        memory: "This repo uses npm for package management.",
        source: "package.json",
        scope: "repo"
      },
      root
    );

    const records = await listRecords({}, root);

    assert.equal(record.status, "accepted");
    assert.equal(record.risk, "low");
    assert.equal(records.length, 1);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects secret-like memory", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeMemory(
      {
        memory: "The API key is sk-thisShouldNeverBecomeDurableMemory123.",
        source: "conversation",
        scope: "user"
      },
      root
    );

    assert.equal(record.status, "rejected");
    assert.equal(record.risk, "high");
    assert.match(record.decision_reason, /secret|credential/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("exports accepted memories and leaves pending memories out", async () => {
  const root = await makeTempRoot();

  try {
    await proposeMemory(
      {
        memory: "This repo uses npm for package management.",
        source: "package.json",
        scope: "repo"
      },
      root
    );
    const pending = await proposeMemory(
      {
        memory: "The maintainer prefers short issue titles.",
        risk: "medium",
        source: "manual"
      },
      root
    );

    const outputPath = await exportMarkdown("MEMORY.md", root);
    const exported = await readFile(outputPath, "utf8");

    assert.match(exported, /This repo uses npm/);
    assert.doesNotMatch(exported, /short issue titles/);

    await updateRecordStatus(pending.id, "accepted", "confirmed by maintainer", root);
    const updatedPath = await exportMarkdown("MEMORY.md", root);
    const updated = await readFile(updatedPath, "utf8");

    assert.match(updated, /short issue titles/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-test-"));
}

