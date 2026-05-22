import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { atomicWriteFile } from "../dist/storage.js";

test("atomicWriteFile creates parent directories and replaces target content", async () => {
  const root = await mkdtemp(join(tmpdir(), "mempr-storage-test-"));

  try {
    const target = join(root, "nested", "ledger.jsonl");

    await atomicWriteFile(target, "first\n");
    await atomicWriteFile(target, "second\n");

    assert.equal(await readFile(target, "utf8"), "second\n");
    assert.deepEqual(
      (await readdir(join(root, "nested"))).filter((name) => name.endsWith(".tmp")),
      []
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
