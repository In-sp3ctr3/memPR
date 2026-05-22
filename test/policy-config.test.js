import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  listRecords,
  proposeMemory
} from "../dist/ledger.js";

test("missing policy config preserves built-in default policy behavior", async () => {
  const root = await makeTempRoot();

  try {
    const repo = await proposeMemory(
      {
        memory: "This repo uses npm for package management.",
        source: "package.json",
        scope: "repo"
      },
      root
    );
    const user = await proposeMemory(
      {
        memory: "The maintainer prefers short implementation notes."
      },
      root
    );

    assert.equal(repo.risk, "low");
    assert.equal(repo.decision, "auto_accept");
    assert.equal(repo.status, "accepted");
    assert.equal(user.risk, "medium");
    assert.equal(user.decision, "review");
    assert.equal(user.status, "pending");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("configured deny terms reject without echoing matched content in the reason", async () => {
  const root = await makeTempRoot();
  const denyTerm = "acquisition codename cobalt-lantern";
  const memory = "Remember the acquisition codename cobalt-lantern for launch notes.";
  const quote = "The board channel said acquisition codename cobalt-lantern is embargoed.";

  try {
    await writePolicyConfig(root, {
      denyTerms: [denyTerm]
    });

    const record = await proposeMemory(
      {
        memory,
        quote,
        source: "local-thread://policy-deny",
        scope: "repo"
      },
      root
    );

    assert.equal(record.risk, "high");
    assert.equal(record.decision, "reject");
    assert.equal(record.status, "rejected");
    assertNoEcho(record.decision_reason, [denyTerm, memory, quote, "cobalt-lantern"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("configured sensitive terms produce high-risk review without echoing matched content", async () => {
  const root = await makeTempRoot();
  const sensitiveTerm = "private settlement amount";
  const memory = "The user has a litigation preference that should be reviewed.";
  const quote = "Private settlement amount is documented in the case notes.";

  try {
    await writePolicyConfig(root, {
      sensitiveTerms: [sensitiveTerm]
    });

    const record = await proposeMemory(
      {
        memory,
        quote,
        source: "local-thread://policy-sensitive",
        scope: "repo"
      },
      root
    );

    assert.equal(record.risk, "high");
    assert.equal(record.decision, "review");
    assert.equal(record.status, "pending");
    assertNoEcho(record.decision_reason, [sensitiveTerm, memory, quote, "settlement"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("configured risk knobs affect inferred risk only", async () => {
  const root = await makeTempRoot();

  try {
    await writePolicyConfig(root, {
      autoAcceptScopes: ["team"],
      defaultRisk: "high",
      ttlRisk: "high"
    });

    const scoped = await proposeMemory(
      {
        memory: "The release team prefers changelog entries grouped by user impact.",
        source: "docs/release.md",
        scope: "team"
      },
      root
    );
    const defaulted = await proposeMemory(
      {
        memory: "The maintainer prefers short issue titles.",
        source: "manual"
      },
      root
    );
    const ttl = await proposeMemory(
      {
        memory: "This deployment note expires after the migration window.",
        source: "manual",
        ttl: "2026-06-01"
      },
      root
    );
    const explicit = await proposeMemory(
      {
        memory: "The maintainer explicitly marked this repo convention low risk.",
        source: "manual",
        scope: "user",
        risk: "low",
        ttl: "2026-06-01"
      },
      root
    );

    assert.equal(scoped.risk, "low");
    assert.equal(scoped.status, "accepted");
    assert.equal(defaulted.risk, "high");
    assert.equal(defaulted.status, "pending");
    assert.equal(ttl.risk, "high");
    assert.equal(ttl.status, "pending");
    assert.equal(explicit.risk, "low");
    assert.equal(explicit.status, "accepted");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("malformed policy config fails safely without echoing secret values", async () => {
  const root = await makeTempRoot();
  const secret = "sk-policyConfigShouldNotEcho1234567890";

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(
      join(root, ".mempr", "policy.json"),
      `{"denyTerms":["${secret}"],`
    );

    await assert.rejects(
      proposeMemory(
        {
          memory: "This ordinary memory should not be recorded with malformed config.",
          source: "manual"
        },
        root
      ),
      (error) => {
        assert(error instanceof Error);
        assert.match(error.message, /policy config|invalid json|malformed/i);
        assert.doesNotMatch(error.message, new RegExp(escapeRegExp(secret)));
        return true;
      }
    );

    const records = await listRecords({}, root);
    assert.deepEqual(records, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("policy config validation does not echo invalid field names or values", async () => {
  const root = await makeTempRoot();
  const secret = "sk-policyFieldShouldNotEcho1234567890";

  try {
    await writePolicyConfig(root, {
      [secret]: "unexpected",
      defaultRisk: secret
    });

    await assert.rejects(
      proposeMemory(
        {
          memory: "This ordinary memory should not be recorded with invalid config.",
          source: "manual"
        },
        root
      ),
      (error) => {
        assert(error instanceof Error);
        assert.match(error.message, /policy config/i);
        assert.doesNotMatch(error.message, new RegExp(escapeRegExp(secret)));
        return true;
      }
    );

    const records = await listRecords({}, root);
    assert.deepEqual(records, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-policy-config-test-"));
}

async function writePolicyConfig(root, config) {
  await mkdir(join(root, ".mempr"), { recursive: true });
  await writeFile(
    join(root, ".mempr", "policy.json"),
    `${JSON.stringify(config, null, 2)}\n`
  );
}

function assertNoEcho(value, forbiddenValues) {
  for (const forbidden of forbiddenValues) {
    assert.doesNotMatch(value, new RegExp(escapeRegExp(forbidden), "i"));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
