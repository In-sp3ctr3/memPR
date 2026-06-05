import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
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

test("atomicWriteFile preserves supplied mode and removes failed temp files", async () => {
  const root = await mkdtemp(join(tmpdir(), "mempr-storage-test-"));

  try {
    const target = join(root, "nested", "ledger.jsonl");
    const directoryTarget = join(root, "directory-target");

    await atomicWriteFile(target, "first\n", { mode: 0o640 });
    assert.equal((await stat(target)).mode & 0o777, 0o640);

    await mkdir(directoryTarget);

    await assert.rejects(
      atomicWriteFile(directoryTarget, "cannot replace directory\n"),
      /EISDIR|ENOTDIR|ENOTEMPTY|operation not permitted|permission/i
    );
    assert.deepEqual(
      (await readdir(root)).filter((name) => name.endsWith(".tmp")),
      []
    );
  } finally {
    await chmod(join(root, "nested", "ledger.jsonl"), 0o600).catch(() => undefined);
    await rm(root, { force: true, recursive: true });
  }
});
