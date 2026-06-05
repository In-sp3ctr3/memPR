import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { readEvents } from "../dist/events.js";
import {
  acceptMemoryWithRelationships,
  analyzeRelationshipGraph,
  exportMarkdown,
  getRecordHistory,
  listRecords,
  proposeMemory,
  updateRecordStatus
} from "../dist/ledger.js";
import { analyzeRelationships } from "../dist/relationships.js";

const exec = promisify(execFile);

test("relationship graph analysis reports incoming links and supersession cycles", () => {
  const records = [
    fixedRecord({ id: "mem_a", supersedes: ["mem_b"], conflicts_with: ["mem_c"] }),
    fixedRecord({ id: "mem_b", supersedes: ["mem_a"] }),
    fixedRecord({ id: "mem_c" }),
    fixedRecord({ id: "mem_missing_source", supersedes: ["mem_missing_target"] })
  ];

  const graph = analyzeRelationships(records);

  assert.deepEqual(graph.incoming.mem_a.supersedes, ["mem_b"]);
  assert.deepEqual(graph.incoming.mem_b.supersedes, ["mem_a"]);
  assert.deepEqual(graph.incoming.mem_c.conflicts_with, ["mem_a"]);
  assert.deepEqual(graph.cycles.map((cycle) => cycle.recordIds), [["mem_a", "mem_b"]]);
  assert.deepEqual(graph.missingReferences, [{
    recordId: "mem_missing_source",
    relationship: "supersedes",
    missingRecordId: "mem_missing_target"
  }]);
});

test("acceptMemoryWithRelationships accepts replacement and retires superseded accepted records", async () => {
  const root = await makeTempRoot();

  try {
    const old = await proposeMemory({
      memory: "Old accepted memory should be retired.",
      source: "manual",
      sourceTrust: "trusted",
      scope: "repo",
      destination: "MEMORY.md"
    }, root);
    const replacement = await proposeMemory({
      memory: "Replacement accepted memory should export.",
      source: "manual",
      sourceTrust: "trusted",
      scope: "repo",
      destination: "MEMORY.md",
      supersedes: [old.id]
    }, root);

    assert.equal(old.status, "accepted");
    assert.equal(replacement.status, "pending");

    const result = await acceptMemoryWithRelationships(replacement.id, {
      reason: "Replacement reviewed and old memory retired.",
      retireSuperseded: true
    }, root);
    const records = await listRecords({}, root);
    const byId = new Map(records.map((record) => [record.id, record]));

    assert.equal(result.record.status, "accepted");
    assert.deepEqual(result.evidence.retiredRecordIds, [old.id]);
    assert.equal(byId.get(old.id).status, "retired");
    assert.equal(byId.get(replacement.id).status, "accepted");

    const outputPath = await exportMarkdown("MEMORY.md", root);
    const exported = await readFile(outputPath, "utf8");

    assert.match(exported, /Replacement accepted memory should export/);
    assert.doesNotMatch(exported, /Old accepted memory should be retired/);

    const events = await readEvents(root);
    const relationshipEvent = events.find((event) => event.type === "memory_relationship_resolved");

    assert(relationshipEvent);
    assert.equal(relationshipEvent.action, "accept_and_retire");
    assert.deepEqual(relationshipEvent.retired_record_ids, [old.id]);

    const oldHistory = await getRecordHistory(old.id, root);
    assert(
      oldHistory.events.some((event) => event.type === "memory_relationship_resolved"),
      "retired record history should show relationship evidence"
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("relationship acceptance requires override evidence for accepted conflicts", async () => {
  const root = await makeTempRoot();

  try {
    const conflicting = await proposeMemory({
      memory: "Accepted conflicting memory.",
      source: "manual",
      sourceTrust: "trusted",
      scope: "repo",
      destination: "MEMORY.md"
    }, root);
    const candidate = await proposeMemory({
      memory: "Candidate with accepted conflict.",
      source: "manual",
      sourceTrust: "trusted",
      scope: "repo",
      destination: "MEMORY.md",
      conflictsWith: [conflicting.id]
    }, root);

    await assert.rejects(
      acceptMemoryWithRelationships(candidate.id, {
        reason: "Missing override should fail."
      }, root),
      /override/i
    );

    assert.equal((await listRecords({ status: "accepted" }, root)).length, 1);

    const result = await acceptMemoryWithRelationships(candidate.id, {
      reason: "Explicit conflict override for review evidence.",
      overrideRelationships: true
    }, root);

    assert.equal(result.record.status, "accepted");
    assert.deepEqual(result.evidence.overrideRecordIds, [conflicting.id]);

    await assert.rejects(
      exportMarkdown("MEMORY.md", root),
      /conflict|relationship|record ids/i
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI accept can retire superseded records with explicit evidence", async () => {
  const root = await makeTempRoot();

  try {
    const old = await proposeMemory({
      memory: "Old CLI memory should be retired.",
      source: "manual",
      sourceTrust: "trusted",
      scope: "repo"
    }, root);
    const replacement = await proposeMemory({
      memory: "New CLI memory should be accepted.",
      source: "manual",
      sourceTrust: "trusted",
      scope: "repo",
      supersedes: [old.id]
    }, root);

    const reviewed = JSON.parse((await runCli([
      "accept",
      "--root",
      root,
      "--json",
      replacement.id,
      "--reason",
      "CLI accept-and-retire evidence.",
      "--retire-superseded"
    ])).stdout);
    const graph = JSON.parse((await runCli([
      "relationships",
      "--root",
      root,
      "--json",
      old.id
    ])).stdout);

    assert.equal(reviewed.record.id, replacement.id);
    assert.deepEqual(reviewed.evidence.retiredRecordIds, [old.id]);
    assert.deepEqual(graph.incoming.supersedes, [replacement.id]);

    const retired = await listRecords({ status: "retired" }, root);
    assert.deepEqual(retired.map((record) => record.id), [old.id]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("relationship graph API exposes incoming links for accepted records", async () => {
  const root = await makeTempRoot();

  try {
    const old = await proposeMemory({
      memory: "Graph API old memory.",
      risk: "medium"
    }, root);
    const replacement = await proposeMemory({
      memory: "Graph API replacement memory.",
      risk: "medium",
      supersedes: [old.id]
    }, root);
    const graph = await analyzeRelationshipGraph(root);

    assert.deepEqual(graph.incoming[old.id].supersedes, [replacement.id]);
    assert.deepEqual(graph.outgoing[replacement.id].supersedes, [old.id]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function runCli(args) {
  return exec("node", ["dist/cli.js", ...args]);
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-relationship-lifecycle-test-"));
}

function fixedRecord(overrides = {}) {
  return {
    id: "mem_fixed",
    memory: "Fixed memory.",
    source: {
      type: "manual",
      uri: "manual"
    },
    source_trust: "unknown",
    scope: "repo",
    risk: "medium",
    decision: "review",
    decision_reason: "Fixed test record.",
    policy_version: "test",
    destination: "MEMORY.md",
    status: "accepted",
    status_reason: "accepted",
    ttl: null,
    expires_at: null,
    supersedes: [],
    conflicts_with: [],
    created_at: "2026-05-22T00:00:00.000Z",
    updated_at: "2026-05-22T00:00:00.000Z",
    ...overrides
  };
}
