import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { readEvents } from "../dist/events.js";
import {
  createFakeLiveAdapter,
  selectLiveAdapter,
  syncLiveAdapter
} from "../dist/live-adapters.js";
import { proposeMemory } from "../dist/ledger.js";

const exec = promisify(execFile);

test("fake live adapter dry-run plans sync without event or destination side effects", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeAccepted(root, "Dry-run fake sync memory.");
    const beforeEvents = await readEvents(root);
    const report = await syncLiveAdapter({
      adapterId: "fake",
      destination: "MEMORY.md",
      dryRun: true
    }, root);

    assert.equal(report.ok, true);
    assert.equal(report.dryRun, true);
    assert.equal(report.confirmed, false);
    assert.deepEqual(report.recordIds, [record.id]);
    assert.deepEqual(report.outcomes.map((outcome) => outcome.status), ["planned"]);
    assert.equal(await readOptional(join(root, "MEMORY.md")), null);
    assert.deepEqual(await readEvents(root), beforeEvents);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("confirmed fake sync records downstream ids and reconciles repeat idempotency keys", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeAccepted(root, "Confirmed fake sync memory.");
    const first = await syncLiveAdapter({
      adapterId: "fake",
      destination: "MEMORY.md",
      confirm: true
    }, root);
    const second = await syncLiveAdapter({
      adapterId: "fake",
      destination: "MEMORY.md",
      confirm: true
    }, root);

    assert.equal(first.ok, true);
    assert.deepEqual(first.outcomes.map((outcome) => outcome.status), ["succeeded"]);
    assert.match(first.outcomes[0].downstreamId, /^fake:mempr:live:v1:fake:/);
    assert.equal(second.ok, true);
    assert.deepEqual(second.outcomes.map((outcome) => outcome.status), ["skipped"]);
    assert.equal(second.outcomes[0].downstreamId, first.outcomes[0].downstreamId);

    const liveEvents = (await readEvents(root)).filter((event) => event.type === "memory_live_synced");

    assert.equal(liveEvents.length, 2);
    assert.deepEqual(liveEvents[0].record_ids, [record.id]);
    assert.equal(liveEvents[0].outcomes[0].downstream_id, first.outcomes[0].downstreamId);
    assert.equal(liveEvents[1].outcomes[0].status, "skipped");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("live sync retries transient failures and reports permanent partial failures", async () => {
  const root = await makeTempRoot();

  try {
    const transient = await proposeAccepted(root, "Transient fake live sync memory.");
    const permanent = await proposeAccepted(root, "Permanent fake live sync memory.");
    const adapter = createFakeLiveAdapter({
      transientFailures: {
        [transient.id]: 1
      },
      failRecordIds: [permanent.id]
    });
    const report = await syncLiveAdapter({
      adapter,
      destination: "MEMORY.md",
      confirm: true,
      maxRetries: 2
    }, root);
    const byId = new Map(report.outcomes.map((outcome) => [outcome.recordId, outcome]));

    assert.equal(report.ok, false);
    assert.equal(report.summary.partialFailure, true);
    assert.equal(byId.get(transient.id).status, "succeeded");
    assert.equal(byId.get(transient.id).attempts, 2);
    assert.equal(byId.get(permanent.id).status, "failed");
    assert.equal(byId.get(permanent.id).attempts, 1);
    assert.equal(byId.get(permanent.id).errorCode, "fake_failure");

    const [event] = (await readEvents(root)).filter((candidate) => {
      return candidate.type === "memory_live_synced";
    });

    assert.equal(event.status, "partial_failure");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("credential-gated adapters fail confirmed sync without required environment", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeAccepted(root, "Credential-gated adapter memory.");
    const report = await syncLiveAdapter({
      adapterId: "mem0",
      destination: "MEMORY.md",
      confirm: true,
      env: {}
    }, root);

    assert.equal(report.ok, false);
    assert.equal(report.adapter.network, true);
    assert.equal(report.adapter.credentialReady, false);
    assert.deepEqual(report.adapter.missingEnv, ["MEMPR_MEM0_ENDPOINT", "MEMPR_MEM0_API_KEY"]);
    assert.deepEqual(report.outcomes.map((outcome) => outcome.recordId), [record.id]);
    assert.deepEqual(report.outcomes.map((outcome) => outcome.errorCode), ["credential_missing"]);

    const [event] = (await readEvents(root)).filter((candidate) => {
      return candidate.type === "memory_live_synced";
    });

    assert.equal(event.status, "failed");
    assert.equal(event.outcomes[0].error_code, "credential_missing");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI sync-live dry-run exposes fake adapter plan", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeAccepted(root, "CLI fake live adapter memory.");
    const output = await runCli([
      "sync-live",
      "--root",
      root,
      "--json",
      "--adapter",
      "fake",
      "--destination",
      "MEMORY.md",
      "--dry-run"
    ]);
    const report = JSON.parse(output.stdout);

    assert.equal(report.dryRun, true);
    assert.equal(report.adapter.id, "fake");
    assert.deepEqual(report.recordIds, [record.id]);
    assert.deepEqual(report.outcomes.map((outcome) => outcome.status), ["planned"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("live adapter registry exposes credential-gated provider adapters", () => {
  for (const id of ["mem0", "langgraph", "llm-wiki", "custom"]) {
    const adapter = selectLiveAdapter(id);
    const credentials = adapter.credentialStatus({});

    assert.equal(adapter.network, true, id);
    assert.equal(credentials.ready, false, id);
    assert(credentials.requiredEnv.length > 0, id);
  }
});

async function proposeAccepted(root, memory) {
  const record = await proposeMemory({
    memory,
    source: "package.json",
    scope: "repo",
    destination: "MEMORY.md"
  }, root);

  assert.equal(record.status, "accepted");
  return record;
}

function runCli(args) {
  return exec("node", ["dist/cli.js", ...args]);
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-live-adapter-test-"));
}
