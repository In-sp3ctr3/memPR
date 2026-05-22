import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { proposeMemory } from "../dist/ledger.js";
import { withStoreLock } from "../dist/storage.js";

test("withStoreLock cleans up the advisory lock after success and failure", async () => {
  const root = await makeTempRoot();
  const directory = join(root, ".mempr");
  const lockPath = join(directory, "store.lock");

  try {
    const value = await withStoreLock(directory, async () => {
      assert.equal(await fileExists(lockPath), true);
      return "ok";
    });

    assert.equal(value, "ok");
    assert.equal(await fileExists(lockPath), false);

    await assert.rejects(
      withStoreLock(directory, async () => {
        assert.equal(await fileExists(lockPath), true);
        throw new Error("simulated write failure");
      }),
      /simulated write failure/
    );

    assert.equal(await fileExists(lockPath), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("existing advisory lock blocks ledger mutation until the lock is released", async () => {
  const root = await makeTempRoot();
  const directory = join(root, ".mempr");
  const lockPath = join(directory, "store.lock");
  let releaseLock;
  let markLockHeld;
  let proposedSettled = false;
  const lockHeld = new Promise((resolve) => {
    markLockHeld = resolve;
  });
  const releaseSignal = new Promise((resolve) => {
    releaseLock = resolve;
  });

  try {
    await mkdir(directory, { recursive: true });
    const holder = withStoreLock(directory, async () => {
      markLockHeld();
      await releaseSignal;
    });

    await lockHeld;
    assert.equal(await fileExists(lockPath), true);

    const proposed = proposeMemory(
      {
        memory: "This write should wait behind the advisory store lock.",
        risk: "medium"
      },
      root
    ).finally(() => {
      proposedSettled = true;
    });

    await delay(100);

    assert.equal(proposedSettled, false);
    assert.equal(await fileExists(join(directory, "ledger.jsonl")), false);
    assert.equal(await fileExists(join(directory, "events.jsonl")), false);

    releaseLock();

    const record = await proposed;
    await holder;

    assert.match(record.memory, /wait behind the advisory store lock/);
    assert.equal(await fileExists(lockPath), false);
    assert.equal(await fileExists(join(directory, "ledger.jsonl")), true);
    assert.equal(await fileExists(join(directory, "events.jsonl")), true);
  } finally {
    releaseLock?.();
    await rm(root, { force: true, recursive: true });
  }
});

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-locking-test-"));
}
