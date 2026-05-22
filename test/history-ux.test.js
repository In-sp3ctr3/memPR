import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("mempr history --json returns current record and chronological summarized events", async () => {
  const root = await makeTempRoot();

  try {
    const target = await proposePending(root, "History target memory for JSON output.", {
      destination: "MEMORY.md"
    });
    const unrelated = await proposePending(root, "Unrelated memory must not define target history.", {
      destination: "MEMORY.md"
    });

    await runCli([
      "accept",
      "--root",
      root,
      target.id,
      "--reason",
      "Confirmed target for history JSON."
    ]);
    await runCli([
      "accept",
      "--root",
      root,
      unrelated.id,
      "--reason",
      "Confirmed unrelated record."
    ]);
    await runCli(["export", "--root", root, "--destination", "MEMORY.md"]);

    const history = JSON.parse((await runCli([
      "history",
      "--root",
      root,
      target.id,
      "--json"
    ])).stdout);

    assert.equal(history.record.id, target.id);
    assert.equal(history.record.memory, "History target memory for JSON output.");
    assert.equal(history.record.status, "accepted");
    assert.equal(history.record.status_reason, "Confirmed target for history JSON.");
    assert.deepEqual(history.issues, []);

    assert.deepEqual(
      history.events.map((event) => event.type),
      ["memory_proposed", "memory_status_changed", "memory_exported"]
    );

    for (const event of history.events) {
      assert.equal(event.record_id, target.id);
      assert.equal(typeof event.created_at, "string");
      assert.equal(Object.hasOwn(event, "record"), false);
    }

    const statusEvent = history.events[1];
    assert.equal(statusEvent.previous_status, "pending");
    assert.equal(statusEvent.next_status, "accepted");
    assert.equal(statusEvent.reason, "Confirmed target for history JSON.");

    const exportEvent = history.events[2];
    assert.equal(exportEvent.record_id, target.id);
    assert.equal(exportEvent.destination, "MEMORY.md");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mempr history text includes audit details without unrelated memory text", async () => {
  const root = await makeTempRoot();

  try {
    const target = await proposePending(root, "History target memory for text output.", {
      destination: "TEAM.md"
    });
    const unrelated = await proposePending(
      root,
      "Highly recognizable unrelated memory that must stay out of target history text.",
      { destination: "TEAM.md" }
    );

    await runCli([
      "accept",
      "--root",
      root,
      target.id,
      "--reason",
      "Maintainer accepted target text history."
    ]);
    await runCli([
      "accept",
      "--root",
      root,
      unrelated.id,
      "--reason",
      "Maintainer accepted unrelated record."
    ]);
    await runCli(["export", "--root", root, "--destination", "TEAM.md"]);

    const history = await runCli(["history", "--root", root, target.id]);

    assertIncludesAll(history.stdout, [
      target.id,
      "accepted",
      "Maintainer accepted target text history.",
      "TEAM.md"
    ]);
    assert.doesNotMatch(
      history.stdout,
      /Highly recognizable unrelated memory that must stay out of target history text/
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mempr history fails clearly for missing record ids", async () => {
  const root = await makeTempRoot();

  try {
    const error = await rejectedRunCli([
      "history",
      "--root",
      root,
      "mem_missing_history_target"
    ]);

    assert.notEqual(error.code, 0);
    assert.match(error.stderr, /not found|no memory record|missing/i);
    assert.match(error.stderr, /mem_missing_history_target/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mempr history returns current record and no events when event history is missing or empty", async () => {
  for (const scenario of ["missing", "empty"]) {
    const root = await makeTempRoot();

    try {
      const target = await proposePending(root, `History ${scenario} event file target.`);
      await runCli([
        "accept",
        "--root",
        root,
        target.id,
        "--reason",
        `Confirmed before ${scenario} event file scenario.`
      ]);

      const eventFile = join(root, ".mempr", "events.jsonl");
      if (scenario === "missing") {
        await rm(eventFile, { force: true });
      } else {
        await writeFile(eventFile, "", "utf8");
      }

      const history = JSON.parse((await runCli([
        "history",
        "--root",
        root,
        target.id,
        "--json"
      ])).stdout);

      assert.equal(history.record.id, target.id);
      assert.equal(history.record.status, "accepted");
      assert.deepEqual(history.events, []);
      assert.deepEqual(history.issues, []);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("mempr history reports malformed events without echoing event contents", async () => {
  const root = await makeTempRoot();

  try {
    const target = await proposePending(root, "History malformed event file target.");
    await runCli([
      "accept",
      "--root",
      root,
      target.id,
      "--reason",
      "Confirmed before malformed event file scenario."
    ]);

    await writeFile(
      join(root, ".mempr", "events.jsonl"),
      "{\"type\":\"memory_proposed\",\"secret\":\"should-not-echo\"\n",
      "utf8"
    );

    const history = JSON.parse((await runCli([
      "history",
      "--root",
      root,
      target.id,
      "--json"
    ])).stdout);
    const flattened = JSON.stringify(history);

    assert.equal(history.record.id, target.id);
    assert.equal(history.record.status, "accepted");
    assert.deepEqual(history.events, []);
    assert.equal(history.issues[0].code, "event_malformed");
    assert.equal(history.issues[0].line, 1);
    assert.doesNotMatch(flattened, /should-not-echo/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Phase 4 inbox, diff, and review commands remain valid with history UX coverage", async () => {
  const root = await makeTempRoot();

  try {
    const pending = await proposePending(root, "Phase 4 sanity memory should flow through review.");

    const inbox = JSON.parse((await runCli(["inbox", "--root", root, "--json"])).stdout);
    assert.deepEqual(inbox.map((record) => record.id), [pending.id]);

    const diff = await runCli(["diff", "--root", root, pending.id]);
    assertIncludesAll(diff.stdout, [pending.id, "Phase 4 sanity memory should flow through review."]);

    const reviewed = JSON.parse((await runCli([
      "review",
      "--root",
      root,
      "--json",
      pending.id,
      "--accept",
      "--reason",
      "Phase 4 sanity acceptance."
    ])).stdout);

    assert.equal(reviewed.id, pending.id);
    assert.equal(reviewed.status, "accepted");
    assert.equal(reviewed.status_reason, "Phase 4 sanity acceptance.");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function runCli(args) {
  return exec("node", ["dist/cli.js", ...args]);
}

async function rejectedRunCli(args) {
  try {
    await runCli(args);
  } catch (error) {
    return error;
  }

  assert.fail(`Expected command to fail: mempr ${args.join(" ")}`);
}

async function proposePending(root, memory, options = {}) {
  const args = [
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    memory,
    "--risk",
    options.risk ?? "medium"
  ];

  if (options.destination) {
    args.push("--destination", options.destination);
  }

  const proposed = JSON.parse((await runCli(args)).stdout);
  assert.equal(proposed.status, "pending");
  return proposed;
}

function assertIncludesAll(value, expectedParts) {
  for (const part of expectedParts) {
    assert(
      value.includes(part),
      `Expected output to include ${JSON.stringify(part)} in:\n${value}`
    );
  }
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-history-ux-test-"));
}
