import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { readEvents } from "../dist/events.js";
import {
  listRecords,
  proposeMemory
} from "../dist/ledger.js";
import {
  classifyMemory,
  CURRENT_POLICY_VERSION
} from "../dist/policy.js";

const exec = promisify(execFile);

test("policy blocks secret-like proposals without persistence", () => {
  const secret = "token=memprFakepolicyBlockWithoutPersistence1234567890";

  for (const input of [
    {
      memory: `api_key=${secret}`
    },
    {
      memory: "Normal memory text.",
      quote: `api_key=${secret}`
    },
    {
      memory: "Normal memory text.",
      source: `https://example.com?token=${secret}`
    }
  ]) {
    const result = classifyMemory(input);

    assert.equal(result.risk, "high");
    assert.equal(result.decision, "block_no_persist");
    assert.match(result.reason, /blocked without persistence/i);
    assert.doesNotMatch(result.reason, new RegExp(escapeRegExp(secret)));
  }

  const nonWeakenable = classifyMemory(
    {
      memory: `api_key=${secret}`
    },
    {
      blockSecretsWithoutPersistence: false
    }
  );

  assert.equal(nonWeakenable.risk, "high");
  assert.equal(nonWeakenable.decision, "block_no_persist");
  assert.match(nonWeakenable.reason, /blocked without persistence/i);
  assert.doesNotMatch(nonWeakenable.reason, new RegExp(escapeRegExp(secret)));
});

test("new proposals default source trust and record current policy version", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeMemory(
      {
        memory: "This repo uses npm for package management.",
        source: "package.json",
        scope: "repo"
      },
      root
    );
    const records = await listRecords({}, root);
    const events = await readEvents(root);

    assert.equal(record.source_trust, "unknown");
    assert.equal(record.policy_version, CURRENT_POLICY_VERSION);
    assert.equal(records[0].source_trust, "unknown");
    assert.equal(records[0].policy_version, CURRENT_POLICY_VERSION);
    assert.equal(events[0].type, "memory_proposed");
    assert.equal(events[0].record.source_trust, "unknown");
    assert.equal(events[0].record.policy_version, CURRENT_POLICY_VERSION);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API source trust gates unknown and untrusted auto-accept without elevating trusted sources", async () => {
  const root = await makeTempRoot();

  try {
    const baseline = await proposeMemory(
      {
        memory: "This project stores TypeScript sources under src.",
        source: "manual",
        scope: "project"
      },
      root
    );
    const trusted = await proposeMemory(
      {
        memory: "This project stores TypeScript sources under src.",
        source: "manual",
        scope: "project",
        sourceTrust: "trusted"
      },
      root
    );
    const untrusted = await proposeMemory(
      {
        memory: "This project stores TypeScript sources under src.",
        source: "manual",
        scope: "project",
        sourceTrust: "untrusted"
      },
      root
    );
    const unknown = await proposeMemory(
      {
        memory: "This project stores TypeScript sources under src.",
        source: "manual",
        scope: "project",
        sourceTrust: "unknown"
      },
      root
    );

    assert.equal(trusted.source_trust, "trusted");
    assert.equal(untrusted.source_trust, "untrusted");
    assert.equal(unknown.source_trust, "unknown");

    assert.equal(baseline.risk, "low");
    assert.equal(baseline.decision, "review");
    assert.equal(baseline.status, "pending");
    assert.match(baseline.decision_reason, /unknown source trust/i);
    assert.equal(trusted.risk, "low");
    assert.equal(trusted.decision, "auto_accept");
    assert.equal(trusted.status, "accepted");
    assert.equal(unknown.risk, "low");
    assert.equal(unknown.decision, "review");
    assert.equal(unknown.status, "pending");
    assert.match(unknown.decision_reason, /unknown source trust/i);
    assert.equal(untrusted.risk, "medium");
    assert.equal(untrusted.decision, "review");
    assert.equal(untrusted.status, "pending");
    assert.match(untrusted.decision_reason, /untrusted source/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI source trust gates unknown and untrusted auto-accept without elevating trusted sources", async () => {
  const root = await makeTempRoot();

  try {
    const baseline = await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "This repo stores package metadata in package.json.",
      "--source",
      "manual",
      "--scope",
      "repo"
    ]);
    const trusted = await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "This repo stores package metadata in package.json.",
      "--source",
      "manual",
      "--scope",
      "repo",
      "--source-trust",
      "trusted"
    ]);
    const untrusted = await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "This repo stores package metadata in package.json.",
      "--source",
      "manual",
      "--scope",
      "repo",
      "--source-trust",
      "untrusted"
    ]);

    const baselineRecord = JSON.parse(baseline.stdout);
    const trustedRecord = JSON.parse(trusted.stdout);
    const untrustedRecord = JSON.parse(untrusted.stdout);

    assert.equal(trustedRecord.source_trust, "trusted");
    assert.equal(untrustedRecord.source_trust, "untrusted");
    assert.equal(baselineRecord.risk, "low");
    assert.equal(baselineRecord.decision, "review");
    assert.equal(baselineRecord.status, "pending");
    assert.match(baselineRecord.decision_reason, /unknown source trust/i);
    assert.equal(trustedRecord.risk, "low");
    assert.equal(trustedRecord.decision, "auto_accept");
    assert.equal(trustedRecord.status, "accepted");
    assert.equal(untrustedRecord.risk, "medium");
    assert.equal(untrustedRecord.decision, "review");
    assert.equal(untrustedRecord.status, "pending");
    assert.match(untrustedRecord.decision_reason, /untrusted source/i);
    assert.equal(trustedRecord.policy_version, CURRENT_POLICY_VERSION);
    assert.equal(untrustedRecord.policy_version, CURRENT_POLICY_VERSION);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("legacy records missing source trust and policy version read as unknown", async () => {
  const root = await makeTempRoot();

  try {
    await writeLegacyRecord(root, {
      id: "mem_legacy_1",
      memory: "Legacy memory without Phase 3B metadata.",
      source: {
        type: "manual",
        uri: "manual"
      },
      scope: "user",
      risk: "medium",
      decision: "review",
      decision_reason: "Needs review before becoming durable memory.",
      destination: "MEMORY.md",
      status: "pending",
      status_reason: null,
      ttl: null,
      created_at: "2026-05-21T00:00:00.000Z",
      updated_at: "2026-05-21T00:00:00.000Z"
    });

    const [record] = await listRecords({}, root);

    assert.equal(record.source_trust, "unknown");
    assert.equal(record.policy_version, "unknown");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("malformed source trust fails safely without echoing memory or quote", async () => {
  const root = await makeTempRoot();
  const memory = "Do not echo this malformed source trust memory.";
  const quote = "Do not echo this malformed source trust quote.";

  try {
    await assert.rejects(
      proposeMemory(
        {
          memory,
          quote,
          source: "local-thread://phase-3b",
          sourceTrust: "trusted-but-not-really"
        },
        root
      ),
      (error) => {
        assert(error instanceof Error);
        assert.match(error.message, /source trust/i);
        assert.doesNotMatch(error.message, new RegExp(escapeRegExp(memory)));
        assert.doesNotMatch(error.message, new RegExp(escapeRegExp(quote)));
        return true;
      }
    );

    assert.deepEqual(await listRecords({}, root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("empty source trust fails safely instead of defaulting", async () => {
  const root = await makeTempRoot();

  try {
    await assert.rejects(
      proposeMemory(
        {
          memory: "Empty source trust should not be accepted as metadata.",
          source: "manual",
          sourceTrust: ""
        },
        root
      ),
      /source trust/i
    );

    const error = await rejectedRunCli([
      "propose",
      "--root",
      root,
      "--memory",
      "Empty CLI source trust should not be accepted.",
      "--source-trust="
    ]);

    assert.match(error.stderr, /source-trust/i);
    assert.deepEqual(await listRecords({}, root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("malformed legacy source trust fails safely without echoing memory or quote", async () => {
  const root = await makeTempRoot();
  const memory = "Do not echo this malformed legacy memory.";
  const quote = "Do not echo this malformed legacy quote.";

  try {
    await writeLegacyRecord(root, {
      id: "mem_bad_legacy",
      memory,
      source: {
        type: "conversation",
        uri: "local-thread://phase-3b",
        quote
      },
      scope: "user",
      risk: "medium",
      decision: "review",
      decision_reason: "Needs review before becoming durable memory.",
      destination: "MEMORY.md",
      status: "pending",
      status_reason: null,
      ttl: null,
      source_trust: "trustedish",
      policy_version: "mempr-policy-v1",
      created_at: "2026-05-21T00:00:00.000Z",
      updated_at: "2026-05-21T00:00:00.000Z"
    });

    await assert.rejects(
      listRecords({}, root),
      (error) => {
        assert(error instanceof Error);
        assert.match(error.message, /malformed ledger record/i);
        assert.match(error.message, /source trust/i);
        assert.doesNotMatch(error.message, new RegExp(escapeRegExp(memory)));
        assert.doesNotMatch(error.message, new RegExp(escapeRegExp(quote)));
        return true;
      }
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("malformed legacy policy version fails safely without echoing memory or quote", async () => {
  const root = await makeTempRoot();
  const memory = "Do not echo this malformed policy version memory.";
  const quote = "Do not echo this malformed policy version quote.";

  try {
    await writeLegacyRecord(root, {
      id: "mem_bad_policy_version",
      memory,
      source: {
        type: "conversation",
        uri: "local-thread://phase-3b",
        quote
      },
      scope: "user",
      risk: "medium",
      decision: "review",
      decision_reason: "Needs review before becoming durable memory.",
      destination: "MEMORY.md",
      status: "pending",
      status_reason: null,
      ttl: null,
      source_trust: "unknown",
      policy_version: "",
      created_at: "2026-05-21T00:00:00.000Z",
      updated_at: "2026-05-21T00:00:00.000Z"
    });

    await assert.rejects(
      listRecords({}, root),
      (error) => {
        assert(error instanceof Error);
        assert.match(error.message, /malformed ledger record/i);
        assert.match(error.message, /policy version/i);
        assert.doesNotMatch(error.message, new RegExp(escapeRegExp(memory)));
        assert.doesNotMatch(error.message, new RegExp(escapeRegExp(quote)));
        return true;
      }
    );
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

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-source-trust-test-"));
}

async function writeLegacyRecord(root, record) {
  await mkdir(join(root, ".mempr"), { recursive: true });
  await writeFile(join(root, ".mempr", "ledger.jsonl"), `${JSON.stringify(record)}\n`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
