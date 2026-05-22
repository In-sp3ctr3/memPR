import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("mempr inbox --json returns only pending records", async () => {
  const root = await makeTempRoot();

  try {
    const accepted = await proposePending(root, "Accepted memory should stay out of inbox.");
    const rejected = await proposePending(root, "Rejected memory should stay out of inbox.");
    const pending = await proposePending(root, "Pending memory should appear in inbox.");

    await runCli([
      "accept",
      "--root",
      root,
      accepted.id,
      "--reason",
      "Confirmed by maintainer."
    ]);
    await runCli([
      "reject",
      "--root",
      root,
      rejected.id,
      "--reason",
      "Rejected by maintainer."
    ]);

    const inbox = JSON.parse((await runCli(["inbox", "--root", root, "--json"])).stdout);

    assert.deepEqual(inbox.map((record) => record.id), [pending.id]);
    assert.deepEqual(new Set(inbox.map((record) => record.status)), new Set(["pending"]));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mempr inbox reports clearly when no pending records exist", async () => {
  const root = await makeTempRoot();

  try {
    const accepted = await proposePending(root, "Reviewed memory should leave inbox empty.");
    await runCli([
      "accept",
      "--root",
      root,
      accepted.id,
      "--reason",
      "Confirmed by maintainer."
    ]);

    const inbox = await runCli(["inbox", "--root", root]);

    assert.match(inbox.stdout, /no pending (memory )?records/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mempr inbox supports risk and destination filters", async () => {
  const root = await makeTempRoot();

  try {
    await proposePending(root, "High-risk memory for default destination.", {
      risk: "high",
      destination: "MEMORY.md"
    });
    await proposePending(root, "Medium-risk memory for agent destination.", {
      risk: "medium",
      destination: "AGENTS.md"
    });
    const target = await proposePending(root, "High-risk memory for agent destination.", {
      risk: "high",
      destination: "AGENTS.md"
    });

    const inbox = JSON.parse((await runCli([
      "inbox",
      "--root",
      root,
      "--json",
      "--risk",
      "high",
      "--destination",
      "AGENTS.md"
    ])).stdout);

    assert.deepEqual(inbox.map((record) => record.id), [target.id]);
    assert.equal(inbox[0].risk, "high");
    assert.equal(inbox[0].destination, "AGENTS.md");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mempr diff shows target record and relationship context", async () => {
  const root = await makeTempRoot();

  try {
    const superseded = await proposePending(root, "Superseded memory for diff context.", {
      destination: "MEMORY.md"
    });
    const conflicted = await proposePending(root, "Conflicting memory for diff context.", {
      destination: "TEAM.md"
    });

    await runCli([
      "accept",
      "--root",
      root,
      superseded.id,
      "--reason",
      "Confirmed old memory."
    ]);
    await runCli([
      "reject",
      "--root",
      root,
      conflicted.id,
      "--reason",
      "Rejected conflicting memory."
    ]);

    const target = await proposePending(root, "Replacement memory with relationship context.", {
      destination: "NOTES.md",
      supersedes: superseded.id,
      conflictsWith: conflicted.id
    });

    const diff = await runCli(["diff", "--root", root, target.id]);

    assertIncludesAll(diff.stdout, [
      target.id,
      "Replacement memory with relationship context.",
      "NOTES.md",
      superseded.id,
      "accepted",
      "MEMORY.md",
      conflicted.id,
      "rejected",
      "TEAM.md"
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mempr diff fails clearly for missing record ids", async () => {
  const root = await makeTempRoot();

  try {
    const error = await rejectedRunCli(["diff", "--root", root, "mem_missing_review_target"]);

    assert.notEqual(error.code, 0);
    assert.match(error.stderr, /not found|no memory record|missing/i);
    assert.match(error.stderr, /mem_missing_review_target/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mempr review accepts a pending record with a reason", async () => {
  const root = await makeTempRoot();

  try {
    const pending = await proposePending(root, "Pending memory accepted through review.");

    const reviewed = JSON.parse((await runCli([
      "review",
      "--root",
      root,
      "--json",
      pending.id,
      "--accept",
      "--reason",
      "Confirmed during review."
    ])).stdout);

    assert.equal(reviewed.id, pending.id);
    assert.equal(reviewed.status, "accepted");
    assert.equal(reviewed.status_reason, "Confirmed during review.");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mempr review rejects a pending record with a reason", async () => {
  const root = await makeTempRoot();

  try {
    const pending = await proposePending(root, "Pending memory rejected through review.");

    const reviewed = JSON.parse((await runCli([
      "review",
      "--root",
      root,
      "--json",
      pending.id,
      "--reject",
      "--reason",
      "Rejected during review."
    ])).stdout);

    assert.equal(reviewed.id, pending.id);
    assert.equal(reviewed.status, "rejected");
    assert.equal(reviewed.status_reason, "Rejected during review.");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("mempr review rejects missing or conflicting modes without mutation", async () => {
  const root = await makeTempRoot();

  try {
    const pending = await proposePending(root, "Invalid review modes must not mutate memory.");

    const missingMode = await rejectedRunCli([
      "review",
      "--root",
      root,
      pending.id,
      "--reason",
      "A reason without a mode is invalid."
    ]);
    assert.match(missingMode.stderr, /accept|reject|mode|required/i);
    await assertRecordStatus(root, pending.id, "pending", null);

    const bothModes = await rejectedRunCli([
      "review",
      "--root",
      root,
      pending.id,
      "--accept",
      "--reject",
      "--reason",
      "Both modes are invalid."
    ]);
    assert.match(bothModes.stderr, /only one|both|accept|reject|mode/i);
    await assertRecordStatus(root, pending.id, "pending", null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("existing accept and reject commands remain valid", async () => {
  const root = await makeTempRoot();

  try {
    const accepted = await proposePending(root, "Existing accept command should still work.");
    const rejected = await proposePending(root, "Existing reject command should still work.");

    const acceptedResult = JSON.parse((await runCli([
      "accept",
      "--root",
      root,
      "--json",
      accepted.id,
      "--reason",
      "Accepted through legacy command."
    ])).stdout);
    const rejectedResult = JSON.parse((await runCli([
      "reject",
      "--root",
      root,
      "--json",
      rejected.id,
      "--reason",
      "Rejected through legacy command."
    ])).stdout);

    assert.equal(acceptedResult.status, "accepted");
    assert.equal(rejectedResult.status, "rejected");
    await assertRecordStatus(root, accepted.id, "accepted", "Accepted through legacy command.");
    await assertRecordStatus(root, rejected.id, "rejected", "Rejected through legacy command.");
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

  if (options.supersedes) {
    args.push("--supersedes", options.supersedes);
  }

  if (options.conflictsWith) {
    args.push("--conflicts-with", options.conflictsWith);
  }

  const proposed = JSON.parse((await runCli(args)).stdout);
  assert.equal(proposed.status, "pending");
  return proposed;
}

async function listAllRecords(root) {
  return JSON.parse((await runCli(["list", "--root", root, "--json"])).stdout);
}

async function assertRecordStatus(root, id, status, statusReason) {
  const records = await listAllRecords(root);
  const record = records.find((candidate) => candidate.id === id);

  assert(record, `Expected record ${id} to exist.`);
  assert.equal(record.status, status);
  assert.equal(record.status_reason, statusReason);
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
  return mkdtemp(join(tmpdir(), "mempr-review-ux-test-"));
}
