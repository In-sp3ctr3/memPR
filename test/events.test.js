import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  exportMarkdown,
  listRecords,
  proposeMemory,
  updateRecordStatus
} from "../dist/ledger.js";
import {
  readEvents,
  replayEvents
} from "../dist/events.js";

const exec = promisify(execFile);

test("propose writes a memory_proposed event and preserves the current ledger view", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeMemory(
      {
        memory: "This repo stores durable memory proposals in JSONL.",
        source: "src/ledger.ts",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );

    const events = await readEvents(root);
    const ledgerRecords = await readLedgerRecords(root);
    const currentRecords = await listRecords({}, root);

    assert.equal(events.length, 1);
    assert.equal(events[0].type, "memory_proposed");
    assert.equal(events[0].record_id, record.id);
    assert.deepEqual(events[0].record, record);
    assert.deepEqual(ledgerRecords, currentRecords);
    assert.deepEqual(ledgerRecords, [record]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("events include schema version, hashes, and hash-chain links", async () => {
  const root = await makeTempRoot();

  try {
    await proposeMemory(
      {
        memory: "First hash-chain memory.",
        source: "package.json",
        scope: "repo"
      },
      root
    );
    await proposeMemory(
      {
        memory: "Second hash-chain memory.",
        risk: "medium"
      },
      root
    );

    const events = await readEvents(root);

    assert.equal(events.length, 2);
    assert.equal(events[0].schema_version, "mempr-event-v2");
    assert.equal(events[0].previous_event_hash, null);
    assert.match(events[0].event_hash, /^sha256:[0-9a-f]{64}$/);
    assert.match(events[0].record_hash, /^sha256:[0-9a-f]{64}$/);
    assert.match(events[0].policy_config_hash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(events[1].schema_version, "mempr-event-v2");
    assert.equal(events[1].previous_event_hash, events[0].event_hash);
    assert.match(events[1].event_hash, /^sha256:[0-9a-f]{64}$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accept and reject write memory_status_changed events with previous and next status", async () => {
  const root = await makeTempRoot();

  try {
    const acceptedCandidate = await proposeMemory(
      {
        memory: "The maintainer wants review before storing UI preferences.",
        risk: "medium"
      },
      root
    );
    const rejectedCandidate = await proposeMemory(
      {
        memory: "The maintainer wants review before storing release preferences.",
        risk: "medium"
      },
      root
    );

    await updateRecordStatus(
      acceptedCandidate.id,
      "accepted",
      "Confirmed by maintainer.",
      root
    );
    await updateRecordStatus(
      rejectedCandidate.id,
      "rejected",
      "Rejected by maintainer.",
      root
    );

    const statusEvents = (await readEvents(root)).filter((event) => {
      return event.type === "memory_status_changed";
    });

    assert.deepEqual(
      statusEvents.map((event) => ({
        record_id: event.record_id,
        previous_status: event.previous_status,
        next_status: event.next_status,
        reason: event.reason
      })),
      [
        {
          record_id: acceptedCandidate.id,
          previous_status: "pending",
          next_status: "accepted",
          reason: "Confirmed by maintainer."
        },
        {
          record_id: rejectedCandidate.id,
          previous_status: "pending",
          next_status: "rejected",
          reason: "Rejected by maintainer."
        }
      ]
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("export writes a memory_exported event with exact destination and exported record ids only", async () => {
  const root = await makeTempRoot();

  try {
    const exported = await proposeMemory(
      {
        memory: "Exported memory for the default destination.",
        source: "package.json",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: "Pending memory must not be exported.",
        risk: "medium",
        destination: "MEMORY.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: "Accepted memory for a different destination.",
        source: "AGENTS.md",
        scope: "repo",
        destination: "AGENTS.md"
      },
      root
    );

    await exportMarkdown("MEMORY.md", root);

    const exportEvents = (await readEvents(root)).filter((event) => {
      return event.type === "memory_exported";
    });

    assert.equal(exportEvents.length, 1);
    assert.equal(exportEvents[0].destination, "MEMORY.md");
    assert.deepEqual(exportEvents[0].record_ids, [exported.id]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("replaying events rebuilds the same current records as listRecords for propose and status flows", async () => {
  const root = await makeTempRoot();

  try {
    const accepted = await proposeMemory(
      {
        memory: "Accepted replay memory.",
        risk: "medium"
      },
      root
    );
    const rejected = await proposeMemory(
      {
        memory: "Rejected replay memory.",
        risk: "medium"
      },
      root
    );

    await updateRecordStatus(accepted.id, "accepted", "Confirmed.", root);
    await updateRecordStatus(rejected.id, "rejected", "Rejected.", root);

    const events = await readEvents(root);
    const replayed = replayEvents(events);
    const current = await listRecords({}, root);

    assert.deepEqual(sortRecords(replayed), sortRecords(current));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("event replay rejects duplicate proposals and dangling references", async () => {
  const root = await makeTempRoot();

  try {
    await proposeMemory(
      {
        memory: "Replay integrity baseline memory.",
        source: "package.json",
        scope: "repo"
      },
      root
    );

    const [proposed] = await readEvents(root);

    assert.throws(
      () => replayEvents([proposed, proposed]),
      /duplicate proposal/i
    );
    assert.throws(
      () => replayEvents([
        {
          id: "evt_unknown_status",
          type: "memory_status_changed",
          created_at: new Date().toISOString(),
          record_id: "mem_missing",
          previous_status: "pending",
          next_status: "accepted",
          reason: "No matching proposal.",
          record: {
            ...proposed.record,
            id: "mem_missing",
            status: "accepted",
            status_reason: "No matching proposal."
          }
        }
      ]),
      /unknown record/i
    );
    assert.throws(
      () => replayEvents([
        proposed,
        {
          id: "evt_unknown_export",
          type: "memory_exported",
          created_at: new Date().toISOString(),
          destination: "MEMORY.md",
          output_path: "MEMORY.md",
          record_ids: ["mem_missing"]
        }
      ]),
      /unknown record/i
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("readEvents reports malformed event records without echoing record contents", async () => {
  const root = await makeTempRoot();

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(
      join(root, ".mempr", "events.jsonl"),
      "{\"type\":\"memory_proposed\",\"secret\":\"should-not-echo\"\n"
    );

    await assert.rejects(
      readEvents(root),
      (error) => {
        assert(error instanceof Error);
        assert.match(error.message, /malformed event record on line 1/i);
        assert.doesNotMatch(error.message, /should-not-echo/);
        return true;
      }
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI smoke writes events while preserving propose, accept, and export workflow", async () => {
  const root = await makeTempRoot();

  try {
    const proposed = await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "CLI event smoke memory.",
      "--risk",
      "medium",
      "--destination",
      "MEMORY.md"
    ]);
    const record = JSON.parse(proposed.stdout);

    await runCli([
      "accept",
      "--root",
      root,
      "--json",
      record.id,
      "--reason",
      "Confirmed by CLI smoke."
    ]);
    await runCli(["export", "--root", root, "--destination", "MEMORY.md"]);

    const events = await readEvents(root);
    const exported = await readFile(join(root, "MEMORY.md"), "utf8");

    assert.match(exported, /CLI event smoke memory/);
    assert.deepEqual(
      events.map((event) => event.type),
      ["memory_proposed", "memory_status_changed", "memory_exported"]
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function readLedgerRecords(root) {
  const ledgerPath = join(root, ".mempr", "ledger.jsonl");
  const content = await readFile(ledgerPath, "utf8");
  return parseJsonl(content, ledgerPath);
}

function parseJsonl(content, path) {
  return content
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        assert.fail(
          `Expected valid JSONL in ${path} on line ${index + 1}: ${error.message}`
        );
      }
    });
}

function sortRecords(records) {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

function runCli(args) {
  return exec("node", ["dist/cli.js", ...args]);
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-events-test-"));
}
