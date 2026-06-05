import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  exportMarkdown,
  listRecords,
  proposeMemory,
  repairLedgerFromEvents,
  updateRecordStatus
} from "../dist/ledger.js";

test("consistency check passes for normal propose, accept, and export workflow", async () => {
  const root = await makeTempRoot();
  const checkConsistency = await loadCheckConsistency();

  try {
    const record = await proposeMemory(
      {
        memory: "The maintainer prefers durable memories after explicit review.",
        risk: "medium",
        destination: "MEMORY.md"
      },
      root
    );

    await updateRecordStatus(
      record.id,
      "accepted",
      "Confirmed by maintainer.",
      root
    );
    await exportMarkdown("MEMORY.md", root);

    const report = await checkConsistency(root);

    assertConsistent(report);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("consistency check reports a missing events file with a non-empty ledger as drift", async () => {
  const root = await makeTempRoot();
  const checkConsistency = await loadCheckConsistency();

  try {
    await proposeMemory(
      {
        memory: "A non-empty current ledger requires an event history.",
        risk: "medium"
      },
      root
    );
    await rm(join(root, ".mempr", "events.jsonl"), { force: true });

    const report = await checkConsistency(root);
    const issue = findIssue(report, /missing.*event|event.*missing/i);

    assert.equal(report.ok, false);
    assert(issue, `Expected missing-events drift in ${JSON.stringify(report)}`);
    assertIssueHasCode(issue);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("consistency check reports malformed events without echoing sensitive event contents", async () => {
  const root = await makeTempRoot();
  const checkConsistency = await loadCheckConsistency();

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(
      join(root, ".mempr", "ledger.jsonl"),
      `${JSON.stringify(makeRecord("mem_sensitive"))}\n`
    );
    await writeFile(
      join(root, ".mempr", "events.jsonl"),
      "{\"type\":\"memory_proposed\",\"secret\":\"should-not-echo\"\n"
    );

    const report = await checkConsistency(root);
    const issue = findIssue(report, /malformed.*event|event.*malformed/i);
    const flattened = flattenReport(report);

    assert.equal(report.ok, false);
    assert(issue, `Expected malformed-event drift in ${JSON.stringify(report)}`);
    assertIssueHasCode(issue);
    assert.doesNotMatch(flattened, /should-not-echo/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("consistency check reports replay/current mismatch by record id, count, and code", async () => {
  const root = await makeTempRoot();
  const checkConsistency = await loadCheckConsistency();

  try {
    const kept = await proposeMemory(
      {
        memory: "Replay should keep this current record.",
        risk: "medium"
      },
      root
    );
    const missingFromCurrent = await proposeMemory(
      {
        memory: "Replay should detect this missing current record.",
        risk: "medium"
      },
      root
    );
    await writeFile(
      join(root, ".mempr", "ledger.jsonl"),
      `${JSON.stringify(kept)}\n`
    );

    const report = await checkConsistency(root);
    const issue = findIssue(report, /mismatch|missing.*current|current.*missing/i);

    assert.equal(report.ok, false);
    assert(issue, `Expected replay/current mismatch in ${JSON.stringify(report)}`);
    assertIssueHasCode(issue);
    assert.match(flattenReport(report), new RegExp(missingFromCurrent.id));
    assertHasCountEvidence(report);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("consistency check reports invalid stored destinations by record id only", async () => {
  const root = await makeTempRoot();
  const checkConsistency = await loadCheckConsistency();
  const invalidDestination = "../evil.md";

  try {
    const record = await proposeMemory(
      {
        memory: "Legacy invalid destination should be repairable.",
        risk: "medium",
        destination: "MEMORY.md"
      },
      root
    );
    await writeFile(
      join(root, ".mempr", "ledger.jsonl"),
      `${JSON.stringify({
        ...record,
        destination: invalidDestination
      })}\n`
    );

    const records = await listRecords({}, root);
    const report = await checkConsistency(root);
    const issue = report.issues.find((candidate) => {
      return candidate.code === "invalid_record_destination";
    });
    const flattened = flattenReport(report);

    assert.equal(records[0].destination, invalidDestination);
    assert.equal(report.ok, false);
    assert(issue, `Expected invalid_record_destination in ${JSON.stringify(report)}`);
    assert.deepEqual(issue.recordIds, [record.id]);
    assert.doesNotMatch(flattened, new RegExp(escapeRegExp(invalidDestination)));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("consistency check reports event hash tampering without echoing event contents", async () => {
  const root = await makeTempRoot();
  const checkConsistency = await loadCheckConsistency();

  try {
    await proposeMemory(
      {
        memory: "Do not echo this hash-tampered memory.",
        risk: "medium"
      },
      root
    );
    const eventsPath = join(root, ".mempr", "events.jsonl");
    const events = await readFile(eventsPath, "utf8");
    await writeFile(
      eventsPath,
      events.replace("Do not echo this hash-tampered memory.", "Do not echo this changed event memory.")
    );

    const report = await checkConsistency(root);
    const issue = getIssues(report).find((candidate) => {
      return candidate.code === "event_hash_mismatch";
    });
    const flattened = flattenReport(report);

    assert.equal(report.ok, false);
    assert(issue, `Expected event_hash_mismatch in ${JSON.stringify(report)}`);
    assert.doesNotMatch(flattened, /Do not echo this hash-tampered memory/);
    assert.doesNotMatch(flattened, /Do not echo this changed event memory/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("repairLedgerFromEvents rebuilds current ledger only after confirmation", async () => {
  const root = await makeTempRoot();

  try {
    const kept = await proposeMemory(
      {
        memory: "Repair should keep this record.",
        risk: "medium"
      },
      root
    );
    const restored = await proposeMemory(
      {
        memory: "Repair should restore this record from events.",
        risk: "medium"
      },
      root
    );
    await writeFile(
      join(root, ".mempr", "ledger.jsonl"),
      `${JSON.stringify(kept)}\n`
    );

    const preview = await repairLedgerFromEvents(root, {
      fromEvents: true
    });

    assert.equal(preview.changed, false);
    assert.equal(preview.wouldChange, true);
    assert.equal(preview.repairedCount, 2);
    assert.deepEqual((await listRecords({}, root)).map((record) => record.id), [kept.id]);

    const repaired = await repairLedgerFromEvents(root, {
      fromEvents: true,
      confirm: true
    });
    const records = await listRecords({}, root);

    assert.equal(repaired.changed, true);
    assert.deepEqual(records.map((record) => record.id).sort(), [kept.id, restored.id].sort());
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function loadCheckConsistency() {
  const candidates = [
    "../dist/consistency.js",
    "../dist/events.js",
    "../dist/ledger.js"
  ];

  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);

      if (typeof mod.checkConsistency === "function") {
        return mod.checkConsistency;
      }

      if (typeof mod.checkLedgerConsistency === "function") {
        return mod.checkLedgerConsistency;
      }
    } catch (error) {
      if (!isModuleNotFound(error)) {
        throw error;
      }
    }
  }

  assert.fail(
    "Expected Phase 2B to export checkConsistency(root) or checkLedgerConsistency(root)."
  );
}

function assertConsistent(report) {
  assert.equal(report.ok, true);
  assert.deepEqual(getIssues(report), []);
}

function getIssues(report) {
  if (Array.isArray(report.issues)) {
    return report.issues;
  }

  if (Array.isArray(report.drifts)) {
    return report.drifts;
  }

  if (Array.isArray(report.drift)) {
    return report.drift;
  }

  return [];
}

function findIssue(report, pattern) {
  return getIssues(report).find((issue) => pattern.test(flattenReport(issue)));
}

function assertIssueHasCode(issue) {
  assert.equal(typeof issue.code, "string", `Expected issue code in ${JSON.stringify(issue)}`);
  assert.notEqual(issue.code.trim(), "");
}

function assertHasCountEvidence(value) {
  const counts = [];

  collectCounts(value, counts);
  assert(
    counts.length >= 2,
    `Expected at least two count fields in ${JSON.stringify(value)}`
  );
}

function collectCounts(value, counts) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCounts(item, counts);
    }
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number" && /count$/i.test(key)) {
      counts.push(entry);
    }

    collectCounts(entry, counts);
  }
}

function flattenReport(value) {
  return JSON.stringify(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isModuleNotFound(error) {
  return error instanceof Error
    && "code" in error
    && error.code === "ERR_MODULE_NOT_FOUND";
}

function makeRecord(id) {
  const now = new Date().toISOString();

  return {
    id,
    memory: "A redacted ledger placeholder for consistency testing.",
    source: {
      type: "manual",
      uri: "manual"
    },
    scope: "user",
    risk: "medium",
    decision: "review",
    decision_reason: "Medium risk memory needs review.",
    destination: "MEMORY.md",
    status: "pending",
    status_reason: null,
    ttl: null,
    created_at: now,
    updated_at: now
  };
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-consistency-test-"));
}
