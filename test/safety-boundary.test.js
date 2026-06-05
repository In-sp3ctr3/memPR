import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  listRecords,
  proposeMemory,
  updateRecordStatus
} from "../dist/ledger.js";
import { MemoryProposalBlockedError } from "../dist/errors.js";
import {
  redactTextForReport,
  reportableRecordId,
  scanPersistentFields
} from "../dist/safety.js";
import { fakeOpenAiKey } from "./helpers/fake-secrets.js";

test("central safety scanner covers secrets, managed markers, and control characters", () => {
  const secret = fakeOpenAiKey("SafetyBoundaryShouldNeverPersist1234567890");
  const marker = "<!-- mempr:end -->";
  const control = "docs/foo\nbar.md";
  const findings = scanPersistentFields([
    { field: "memory", text: `api_key=${secret}` },
    { field: "source.uri", text: `docs/${marker}.md` },
    { field: "destination", text: control }
  ]);
  const serialized = JSON.stringify(findings);

  assert.deepEqual(
    findings.map((finding) => [finding.field, finding.code]),
    [
      ["memory", "secret_like_content"],
      ["source.uri", "managed_block_marker"],
      ["destination", "control_character"]
    ]
  );
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(secret)));
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(marker)));
  assert.doesNotMatch(serialized, /\n/);
  assert.match(redactTextForReport(`api_key=${secret} ${marker}\n`), /\[MEMPR_REDACTED_SECRET\]/);
  assert.match(reportableRecordId(`mem_${secret}`), /^\[MEMPR_RECORD_ID_HASH:/);
});

test("blocked proposal inputs do not create ledger, event, lock, diagnostics, or destination files", async () => {
  const cases = [
    {
      name: "secret memory",
      input: (secret) => ({ memory: `api_key=${secret}` }),
      blockedError: true
    },
    {
      name: "secret quote",
      input: (secret) => ({ memory: "Safe memory.", quote: `api_key=${secret}` }),
      blockedError: true
    },
    {
      name: "secret source uri",
      input: (secret) => ({ memory: "Safe memory.", source: `docs/${secret}.md` }),
      blockedError: true
    },
    {
      name: "secret destination",
      input: (secret) => ({ memory: "Safe memory.", destination: `docs/${secret}.md` }),
      blockedError: true
    },
    {
      name: "secret scope",
      input: (secret) => ({ memory: "Safe memory.", scope: `repo-${secret}` }),
      blockedError: true
    },
    {
      name: "managed marker memory",
      input: () => ({ memory: "Line one\n<!-- mempr:end -->\ninjected" }),
      blockedError: true,
      unsafe: "<!-- mempr:end -->"
    },
    {
      name: "managed marker source uri",
      input: () => ({ memory: "Safe memory.", source: "docs/<!-- mempr:start -->.md" }),
      blockedError: true,
      unsafe: "<!-- mempr:start -->"
    },
    {
      name: "control destination",
      input: () => ({ memory: "Safe memory.", destination: "docs/foo\nbar.md" }),
      unsafe: "docs/foo\nbar.md"
    },
    {
      name: "secret ttl",
      input: (secret) => ({ memory: "Safe memory.", ttl: `api_key=${secret}` })
    }
  ];

  for (const testCase of cases) {
    const root = await makeTempRoot();
    const secret = `token=memprSafety${slug(testCase.name)}ShouldNotPersist1234567890`;
    const unsafe = testCase.unsafe ?? secret;

    try {
      await assert.rejects(
        proposeMemory({
          source: "manual",
          sourceTrust: "trusted",
          scope: "repo",
          destination: "MEMORY.md",
          ...testCase.input(secret)
        }, root),
        (error) => {
          if (testCase.blockedError) {
            assert(error instanceof MemoryProposalBlockedError, testCase.name);
            assert.equal(error.audit.decision, "block_no_persist", testCase.name);
          }

          assertNoEcho(String(error), [unsafe, secret]);
          assertNoEcho(JSON.stringify(error), [unsafe, secret]);
          return true;
        },
        testCase.name
      );

      assert.deepEqual(await listRecords({}, root), [], testCase.name);
      await assertNoDurableMutation(root, testCase.name);
      assert.equal(await readOptional(join(root, "MEMORY.md")), null, testCase.name);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("review metadata safety scan runs before status writes or events", async () => {
  const root = await makeTempRoot();
  const secret = "token=memprSafetyReviewReasonShouldNotPersist1234567890";

  try {
    const pending = await proposeMemory({
      memory: "Pending review safety boundary memory.",
      source: "manual",
      risk: "medium",
      destination: "MEMORY.md"
    }, root);
    const beforeLedger = await readOptional(join(root, ".mempr", "ledger.jsonl"));
    const beforeEvents = await readOptional(join(root, ".mempr", "events.jsonl"));

    await assert.rejects(
      updateRecordStatus(
        pending.id,
        "accepted",
        `approved api_key=${secret}`,
        root,
        { reviewer: `reviewer-${secret}` }
      ),
      (error) => {
        assertNoEcho(String(error), [secret]);
        return true;
      }
    );

    assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), beforeLedger);
    assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), beforeEvents);
    assertNoEcho(beforeLedger ?? "", [secret]);
    assertNoEcho(beforeEvents ?? "", [secret]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function assertNoDurableMutation(root, label) {
  assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null, label);
  assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null, label);
  assert.equal(await readOptional(join(root, ".mempr", "diagnostics.jsonl")), null, label);
  assert.equal(await readOptional(join(root, ".mempr", "store.lock")), null, label);
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-safety-boundary-"));
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return null;
    }

    throw error;
  }
}

function assertNoEcho(value, needles) {
  for (const needle of needles) {
    assert.doesNotMatch(value, new RegExp(escapeRegExp(needle)));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slug(value) {
  return value.replace(/[^a-z0-9]/gi, "");
}
