import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { readEvents, replayEvents } from "../dist/events.js";
import { withStoreLock } from "../dist/storage.js";

test("migration backfills missing or empty events from a non-empty ledger idempotently", async (t) => {
  for (const mode of ["missing", "empty"]) {
    await t.test(`${mode} events file`, async () => {
      const root = await makeTempRoot();
      const migrate = await loadMigration();

      try {
        const records = [
          makeRecord("mem_pending", "pending"),
          makeRecord("mem_accepted", "accepted", "Confirmed before event migration.")
        ];
        await writeLedger(root, records);

        if (mode === "empty") {
          await writeFile(join(root, ".mempr", "events.jsonl"), "");
        }

        await migrate(root);

        const firstEventsContent = await readFile(join(root, ".mempr", "events.jsonl"), "utf8");
        const replayed = replayEvents(await readEvents(root));

        assert.deepEqual(sortRecords(replayed), sortRecords(records));

        await migrate(root);

        assert.equal(
          await readFile(join(root, ".mempr", "events.jsonl"), "utf8"),
          firstEventsContent,
          "backfill should be idempotent once replay matches the ledger"
        );
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    });
  }
});

test("migration refuses divergent existing event history without overwriting it", async () => {
  const root = await makeTempRoot();
  const migrate = await loadMigration();

  try {
    const ledgerRecord = makeRecord("mem_ledger_only", "pending");
    const eventRecord = makeRecord("mem_event_only", "pending");
    await writeLedger(root, [ledgerRecord]);
    await writeEvents(root, [{
      id: "evt_existing_divergent",
      type: "memory_proposed",
      created_at: eventRecord.created_at,
      record_id: eventRecord.id,
      record: eventRecord
    }]);

    const before = await readFile(join(root, ".mempr", "events.jsonl"), "utf8");
    const result = await captureMigrationResult(migrate, root);
    const after = await readFile(join(root, ".mempr", "events.jsonl"), "utf8");

    assert.equal(after, before, "divergent event history must not be overwritten");
    assertReportsConflict(result);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("migration stores canonical records when legacy optional fields are omitted", async () => {
  const root = await makeTempRoot();
  const migrate = await loadMigration();

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(
      join(root, ".mempr", "ledger.jsonl"),
      `${JSON.stringify({
        id: "mem_missing_optionals",
        memory: " Legacy memory with omitted optional fields. ",
        source: {
          type: "manual",
          uri: " manual "
        },
        scope: " user ",
        risk: "medium",
        decision: "review",
        decision_reason: " Medium risk memory needs review. ",
        destination: " MEMORY.md ",
        status: "pending",
        created_at: "2026-05-21T00:00:00.000Z",
        updated_at: "2026-05-21T00:00:00.000Z"
      })}\n`
    );

    await migrate(root);

    const [event] = await readEvents(root);
    const [record] = replayEvents([event]);

    assert.equal(record.memory, "Legacy memory with omitted optional fields.");
    assert.equal(record.source.uri, "manual");
    assert.equal(record.source_trust, "unknown");
    assert.equal(record.scope, "user");
    assert.equal(record.destination, "MEMORY.md");
    assert.equal(record.policy_version, "unknown");
    assert.equal(record.status_reason, null);
    assert.equal(record.ttl, null);
    assert.equal(record.expires_at, null);
    assert.deepEqual(record.supersedes, []);
    assert.deepEqual(record.conflicts_with, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("migration waits behind the store lock before writing backfilled events", async () => {
  const root = await makeTempRoot();
  const migrate = await loadMigration();
  const directory = join(root, ".mempr");
  let releaseLock;
  let markLockHeld;
  let migrationSettled = false;
  const lockHeld = new Promise((resolve) => {
    markLockHeld = resolve;
  });
  const releaseSignal = new Promise((resolve) => {
    releaseLock = resolve;
  });

  try {
    await writeLedger(root, [makeRecord("mem_locked_migration", "pending")]);

    const holder = withStoreLock(directory, async () => {
      markLockHeld();
      await releaseSignal;
    });

    await lockHeld;

    const migrating = migrate(root).finally(() => {
      migrationSettled = true;
    });

    await delay(100);

    assert.equal(migrationSettled, false);
    assert.equal(await fileExists(join(directory, "events.jsonl")), false);

    releaseLock();

    const result = await migrating;
    await holder;

    assert.equal(result.changed, true);
    assert.equal(await fileExists(join(directory, "events.jsonl")), true);
  } finally {
    releaseLock?.();
    await rm(root, { force: true, recursive: true });
  }
});

async function loadMigration() {
  const candidates = [
    "../dist/migration.js",
    "../dist/events.js",
    "../dist/ledger.js"
  ];
  const names = [
    "backfillEvents",
    "backfillEventLedger",
    "migrateLedgerEvents",
    "migrateCurrentLedgerToEvents",
    "migrateLedgerToEvents",
    "ensureEventBackfill"
  ];

  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);

      for (const name of names) {
        if (typeof mod[name] === "function") {
          return mod[name];
        }
      }
    } catch (error) {
      if (!isModuleNotFound(error)) {
        throw error;
      }
    }
  }

  assert.fail(
    `Expected Phase 2C to export one migration/backfill API: ${names.join(", ")}.`
  );
}

async function captureMigrationResult(migrate, root) {
  try {
    const value = await migrate(root);
    return { threw: false, value };
  } catch (error) {
    return { threw: true, error };
  }
}

function assertReportsConflict(result) {
  if (result.threw) {
    const message = result.error instanceof Error ? result.error.message : String(result.error);
    assert.match(message, /conflict|diverg|drift|mismatch|refus/i);
    return;
  }

  const flattened = JSON.stringify(result.value);
  assert.match(flattened, /conflict|diverg|drift|mismatch|refus|false/i);
  assert.notEqual(result.value?.ok, true, "divergent migration must not report ok=true");
}

async function writeLedger(root, records) {
  await mkdir(join(root, ".mempr"), { recursive: true });
  await writeFile(
    join(root, ".mempr", "ledger.jsonl"),
    records.map((record) => JSON.stringify(record)).join("\n") + "\n"
  );
}

async function writeEvents(root, events) {
  await mkdir(join(root, ".mempr"), { recursive: true });
  await writeFile(
    join(root, ".mempr", "events.jsonl"),
    events.map((event) => JSON.stringify(event)).join("\n") + "\n"
  );
}

function makeRecord(id, status, statusReason = null) {
  const now = "2026-05-21T00:00:00.000Z";

  return {
    id,
    memory: `Migration test memory for ${id}.`,
    source: {
      type: "manual",
      uri: "manual"
    },
    source_trust: "unknown",
    scope: "user",
    risk: "medium",
    decision: "review",
    decision_reason: "Medium risk memory needs review.",
    policy_version: "unknown",
    destination: "MEMORY.md",
    status,
    status_reason: statusReason,
    ttl: null,
    expires_at: null,
    supersedes: [],
    conflicts_with: [],
    created_at: now,
    updated_at: now
  };
}

function sortRecords(records) {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

function isModuleNotFound(error) {
  return error instanceof Error
    && "code" in error
    && error.code === "ERR_MODULE_NOT_FOUND";
}

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
  return mkdtemp(join(tmpdir(), "mempr-migration-test-"));
}
