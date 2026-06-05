import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  listRecords,
  proposeMemory
} from "../dist/ledger.js";
import { loadPolicyConfig } from "../dist/policy-config.js";

test("missing policy config uses secure source-trust defaults", async () => {
  const root = await makeTempRoot();

  try {
    const repo = await proposeMemory(
      {
        memory: "This repo uses npm for package management.",
        source: "manual",
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
    assert.equal(repo.decision, "review");
    assert.equal(repo.status, "pending");
    assert.match(repo.decision_reason, /unknown source trust/i);
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
    assert.equal(record.decision, "reject_audited");
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
      ttlRisk: "high",
      autoAcceptRequiresTrustedSource: false,
      reviewUnknownSourceTrust: false
    });

    const scoped = await proposeMemory(
      {
        memory: "The release team prefers changelog entries grouped by user impact.",
        source: "manual",
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

test("configured trust switches can allow legacy unknown low-risk auto-accept", async () => {
  const root = await makeTempRoot();

  try {
    await writePolicyConfig(root, {
      autoAcceptRequiresTrustedSource: false,
      reviewUnknownSourceTrust: false
    });

    const unknown = await proposeMemory(
      {
        memory: "This repo keeps release notes in CHANGELOG.md.",
        source: "manual",
        scope: "repo"
      },
      root
    );
    const untrusted = await proposeMemory(
      {
        memory: "This repo keeps release notes in CHANGELOG.md.",
        source: "manual",
        sourceTrust: "untrusted",
        scope: "repo"
      },
      root
    );

    assert.equal(unknown.risk, "low");
    assert.equal(unknown.decision, "auto_accept");
    assert.equal(unknown.status, "accepted");
    assert.equal(untrusted.risk, "medium");
    assert.equal(untrusted.decision, "review");
    assert.equal(untrusted.status, "pending");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("invalid boolean policy config fields fail with helpful messages", async () => {
  const root = await makeTempRoot();

  try {
    await writePolicyConfig(root, {
      autoAcceptRequiresTrustedSource: "yes"
    });

    await assert.rejects(
      proposeMemory(
        {
          memory: "This ordinary memory should not be recorded with invalid boolean config.",
          source: "manual"
        },
        root
      ),
      /Invalid policy config at autoAcceptRequiresTrustedSource: expected a boolean\./
    );

    assert.deepEqual(await listRecords({}, root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("policy config cannot disable built-in secret no-persistence blocking", async () => {
  const root = await makeTempRoot();
  const secret = "token=memprFakepolicyConfigCannotWeakenSecretBlocking1234567890";

  try {
    await writePolicyConfig(root, {
      blockSecretsWithoutPersistence: false
    });

    await assert.rejects(
      proposeMemory(
        {
          memory: `api_key=${secret}`,
          source: "manual",
          scope: "repo",
          destination: "MEMORY.md"
        },
        root
      ),
      (error) => {
        assert.match(String(error), /blockSecretsWithoutPersistence/i);
        assert.match(String(error), /cannot be disabled/i);
        assert.doesNotMatch(String(error), new RegExp(escapeRegExp(secret)));
        return true;
      }
    );

    const ledger = await readOptional(join(root, ".mempr", "ledger.jsonl"));
    const events = await readOptional(join(root, ".mempr", "events.jsonl"));

    assert.deepEqual(await listRecords({}, root), []);
    assert.equal(ledger, null);
    assert.equal(events, null);
    assertNoEcho(events ?? "", [secret]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("legacy true secret-blocking config is accepted but not exposed publicly", async () => {
  const root = await makeTempRoot();

  try {
    await writePolicyConfig(root, {
      blockSecretsWithoutPersistence: true
    });

    const config = await loadPolicyConfig(root);

    assert.equal(Object.hasOwn(config, "blockSecretsWithoutPersistence"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("malformed policy config fails safely without echoing secret values", async () => {
  const root = await makeTempRoot();
  const secret = "token=memprFakepolicyConfigShouldNotEcho1234567890";

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
  const secret = "token=memprFakepolicyFieldShouldNotEcho1234567890";

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

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function assertNoEcho(value, forbiddenValues) {
  for (const forbidden of forbiddenValues) {
    assert.doesNotMatch(value, new RegExp(escapeRegExp(forbidden), "i"));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
