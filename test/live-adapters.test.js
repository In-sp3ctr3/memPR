import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import {
  assembleReadContext,
  proposeMemory
} from "../dist/ledger.js";
import { fakeOpenAiKey } from "./helpers/fake-secrets.js";

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

test("legacy non-generated record ids remain internal for live sync while context reports safe ids", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeAccepted(root, "Legacy id live sync memory.");
    await replaceLedgerRecordId(root, record.id, "legacy-id");
    const context = await assembleReadContext({ destination: "MEMORY.md" }, root);
    const report = await syncLiveAdapter({
      adapterId: "fake",
      destination: "MEMORY.md",
      dryRun: true
    }, root);

    assert.equal(context.ok, true);
    assert.deepEqual(context.recordIds, ["[MEMPR_RECORD_ID_HASH:f04fb56ceb292d8a]"]);
    assert.deepEqual(context.records.map((candidate) => candidate.id), context.recordIds);
    assert.deepEqual(report.recordIds, ["legacy-id"]);
    assert.deepEqual(report.operations.map((operation) => operation.recordId), ["legacy-id"]);
    assert.deepEqual(report.outcomes.map((outcome) => outcome.status), ["planned"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("unsafe legacy record ids do not leak raw values through live sync reports", async () => {
  const root = await makeTempRoot();
  const unsafeId = "legacy\nid";

  try {
    const record = await proposeAccepted(root, "Unsafe legacy id live sync memory.");
    await replaceLedgerRecordId(root, record.id, unsafeId);
    const report = await syncLiveAdapter({
      adapterId: "fake",
      destination: "MEMORY.md",
      dryRun: true
    }, root);
    const serialized = JSON.stringify(report);

    assert.equal(report.ok, false);
    assert.equal(report.blocked, true);
    assert.doesNotMatch(serialized, /legacy\\nid|legacy\nid/);
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

test("custom adapter secret downstream ids fail without raw report or event persistence", async () => {
  const root = await makeTempRoot();
  const secret = fakeOpenAiKey("LiveAdapterDownstreamShouldNotPersist1234567890");

  try {
    const record = await proposeAccepted(root, "Custom adapter secret downstream fixture.");
    const report = await syncLiveAdapter({
      confirm: true,
      destination: "MEMORY.md",
      adapter: {
        id: "custom",
        title: "Custom adapter",
        description: "Returns unsafe downstream ids.",
        network: false,
        credentialStatus() {
          return {
            ready: true,
            requiredEnv: [],
            missingEnv: []
          };
        },
        async apply() {
          return {
            downstreamId: secret
          };
        }
      }
    }, root);
    const serializedReport = JSON.stringify(report);
    const liveEvents = (await readEvents(root)).filter((event) => event.type === "memory_live_synced");
    const serializedEvents = JSON.stringify(liveEvents);

    assert.equal(report.ok, false);
    assert.deepEqual(report.recordIds, [record.id]);
    assert.equal(report.outcomes[0].status, "failed");
    assert.equal(report.outcomes[0].downstreamId, null);
    assert.equal(report.outcomes[0].errorCode, "downstream_id_secret_like");
    assertNoEcho(serializedReport, [secret]);
    assert.equal(liveEvents.length, 1);
    assert.equal(liveEvents[0].status, "failed");
    assert.equal(liveEvents[0].outcomes[0].downstream_id, null);
    assert.equal(liveEvents[0].outcomes[0].error_code, "downstream_id_secret_like");
    assertNoEcho(serializedEvents, [secret]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("adapter error messages are sanitized in live sync reports", async () => {
  const root = await makeTempRoot();
  const secret = fakeOpenAiKey("LiveAdapterErrorShouldNotEcho1234567890");

  try {
    await proposeAccepted(root, "Custom adapter secret error fixture.");
    const report = await syncLiveAdapter({
      confirm: true,
      destination: "MEMORY.md",
      maxRetries: 0,
      adapter: {
        id: "custom",
        title: `Custom ${secret}`,
        description: "Throws unsafe errors.",
        network: false,
        credentialStatus() {
          return {
            ready: true,
            requiredEnv: [],
            missingEnv: []
          };
        },
        async apply() {
          throw new Error(`Remote adapter failed with ${secret}`);
        }
      }
    }, root);
    const serializedReport = JSON.stringify(report);
    const serializedEvents = JSON.stringify(await readEvents(root));

    assert.equal(report.ok, false);
    assert.equal(report.outcomes[0].status, "failed");
    assert.match(report.outcomes[0].errorMessage, /\[MEMPR_REDACTED_SECRET\]/);
    assertNoEcho(serializedReport, [secret]);
    assertNoEcho(serializedEvents, [secret]);
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
    source: "manual",
    sourceTrust: "trusted",
    scope: "repo",
    destination: "MEMORY.md"
  }, root);

  assert.equal(record.status, "accepted");
  return record;
}

async function replaceLedgerRecordId(root, oldId, newId) {
  const ledgerPath = join(root, ".mempr", "ledger.jsonl");
  const records = (await readFile(ledgerPath, "utf8"))
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  for (const record of records) {
    if (record.id === oldId) {
      record.id = newId;
    }
  }

  await writeFile(ledgerPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

function runCli(args) {
  return exec(process.execPath, ["dist/cli.js", ...args], {
    timeout: 5_000,
    killSignal: "SIGKILL"
  });
}

function assertNoEcho(value, forbiddenValues) {
  for (const forbidden of forbiddenValues) {
    assert.doesNotMatch(value, new RegExp(escapeRegExp(forbidden)));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
