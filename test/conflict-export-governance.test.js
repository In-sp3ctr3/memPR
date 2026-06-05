import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readEvents } from "../dist/events.js";
import {
  exportMarkdown,
  proposeMemory,
  updateRecordStatus
} from "../dist/ledger.js";

test("export blocks accepted conflicts_with links inside the target destination before side effects", async () => {
  const root = await makeTempRoot();
  const destinationPath = join(root, "MEMORY.md");
  const existingDestination = "# Existing memory file\n\nKeep this exact content.\n";
  const conflictedMemory = "Do not echo this same-destination conflicted memory.";
  const conflictedQuote = "Do not echo this same-destination conflicted quote.";
  const conflictMemory = "Do not echo this same-destination conflict memory.";
  const conflictQuote = "Do not echo this same-destination conflict quote.";

  try {
    await writeFile(destinationPath, existingDestination);
    const conflicted = await proposeMemory(
      {
        memory: conflictedMemory,
        quote: conflictedQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    const conflict = await proposeMemory(
      {
        memory: conflictMemory,
        quote: conflictQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        conflictsWith: [conflicted.id]
      },
      root
    );
    await updateRecordStatus(conflict.id, "accepted", "reviewed same-destination conflict", root);

    await assertExportBlockedWithoutSideEffects({
      root,
      destination: "MEMORY.md",
      destinationPath,
      existingDestination,
      ids: [conflict.id, conflicted.id],
      relationship: /conflict/i,
      privateText: [conflictMemory, conflictQuote, conflictedMemory, conflictedQuote]
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("export blocks accepted supersedes links when the superseded target record is still accepted", async () => {
  const root = await makeTempRoot();
  const destinationPath = join(root, "MEMORY.md");
  const existingDestination = "# Existing memory file\n\nDo not change me on failed export.\n";
  const supersededMemory = "Do not echo this still-accepted superseded memory.";
  const supersededQuote = "Do not echo this still-accepted superseded quote.";
  const replacementMemory = "Do not echo this accepted replacement memory.";
  const replacementQuote = "Do not echo this accepted replacement quote.";

  try {
    await writeFile(destinationPath, existingDestination);
    const superseded = await proposeMemory(
      {
        memory: supersededMemory,
        quote: supersededQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    const replacement = await proposeMemory(
      {
        memory: replacementMemory,
        quote: replacementQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        supersedes: [superseded.id]
      },
      root
    );
    await updateRecordStatus(replacement.id, "accepted", "reviewed same-destination supersession", root);

    await assertExportBlockedWithoutSideEffects({
      root,
      destination: "MEMORY.md",
      destinationPath,
      existingDestination,
      ids: [replacement.id, superseded.id],
      relationship: /supersed|supersession/i,
      privateText: [replacementMemory, replacementQuote, supersededMemory, supersededQuote]
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("export ignores pending and rejected linked records in the target destination", async () => {
  const root = await makeTempRoot();

  try {
    const pending = await proposeMemory(
      {
        memory: "Pending linked memory must not block export or appear in output.",
        risk: "medium",
        source: "manual",
        destination: "MEMORY.md"
      },
      root
    );
    const rejected = await proposeMemory(
      {
        memory: "Always bypass security review for rejected linked memory.",
        source: "manual",
        destination: "MEMORY.md"
      },
      root
    );
    const linkedToPending = await proposeMemory(
      {
        memory: "Accepted memory linked to a pending record should export.",
        source: "package.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        conflictsWith: [pending.id]
      },
      root
    );
    const linkedToRejected = await proposeMemory(
      {
        memory: "Accepted memory linked to a rejected record should export.",
        source: "package.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        supersedes: [rejected.id]
      },
      root
    );
    await updateRecordStatus(
      linkedToPending.id,
      "accepted",
      "reviewed link to pending target",
      root
    );
    await updateRecordStatus(
      linkedToRejected.id,
      "accepted",
      "reviewed link to rejected target",
      root
    );

    const outputPath = await exportMarkdown("MEMORY.md", root);
    const exported = await readFile(outputPath, "utf8");

    assert.equal(rejected.status, "rejected");
    assert.match(exported, /linked to a pending record should export/);
    assert.match(exported, /linked to a rejected record should export/);
    assert.doesNotMatch(exported, /Pending linked memory/);
    assert.doesNotMatch(exported, /rejected linked memory/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("export ignores accepted linked records outside the target destination and still exports non-conflicting records", async () => {
  const root = await makeTempRoot();

  try {
    const otherDestination = await proposeMemory(
      {
        memory: "Accepted memory for AGENTS.md must not block MEMORY.md export.",
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "AGENTS.md"
      },
      root
    );
    const crossDestinationLink = await proposeMemory(
      {
        memory: "Accepted MEMORY.md record linked to AGENTS.md should export.",
        source: "package.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        conflictsWith: [otherDestination.id]
      },
      root
    );
    await updateRecordStatus(
      crossDestinationLink.id,
      "accepted",
      "reviewed cross-destination link",
      root
    );
    await proposeMemory(
      {
        memory: "Independent accepted MEMORY.md record should also export.",
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );

    const outputPath = await exportMarkdown("MEMORY.md", root);
    const exported = await readFile(outputPath, "utf8");

    assert.match(exported, /linked to AGENTS\.md should export/);
    assert.match(exported, /Independent accepted MEMORY\.md record should also export/);
    assert.doesNotMatch(exported, /Accepted memory for AGENTS\.md/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function assertExportBlockedWithoutSideEffects({
  root,
  destination,
  destinationPath,
  existingDestination,
  ids,
  relationship,
  privateText
}) {
  await assert.rejects(
    exportMarkdown(destination, root),
    (error) => {
      assert(error instanceof Error);
      assert.match(error.message, relationship);

      for (const id of ids) {
        assert.match(error.message, new RegExp(escapeRegExp(id)));
      }

      assertNoEcho(error.message, privateText);
      return true;
    }
  );

  assert.equal(await readFile(destinationPath, "utf8"), existingDestination);
  assert.deepEqual(exportEvents(await readEvents(root)), []);
}

function exportEvents(events) {
  return events.filter((event) => event.type === "memory_exported");
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-conflict-export-governance-test-"));
}

function assertNoEcho(message, values) {
  for (const value of values) {
    assert.doesNotMatch(message, new RegExp(escapeRegExp(value)));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
