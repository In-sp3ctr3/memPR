import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { readEvents } from "../dist/events.js";

const exec = promisify(execFile);
const READ_PERMISSION_DENIAL_METADATA_KEYS = [
  "action",
  "surface",
  "resource",
  "destination",
  "scopes",
  "contractVersion",
  "contentReturned",
  "sideEffects"
];

test("CLI keeps boolean flags from consuming positional ids", async () => {
  const root = await makeTempRoot();

  try {
    const proposed = await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "The maintainer prefers terse issue titles.",
      "--risk",
      "medium",
      "--destination",
      "MEMORY.md"
    ]);
    const record = JSON.parse(proposed.stdout);

    assert.equal(record.status, "pending");

    await assert.rejects(
      runCli(["accept", "--root", root, "--json", record.id]),
      /reason is required/i
    );

    const accepted = await runCli([
      "accept",
      "--root",
      root,
      "--json",
      record.id,
      "--reason",
      "Confirmed by maintainer."
    ]);

    assert.equal(JSON.parse(accepted.stdout).status, "accepted");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI list filters by status, risk, and destination", async () => {
  const root = await makeTempRoot();

  try {
    await runCli([
      "propose",
      "--root",
      root,
      "--memory",
      "Accepted default destination memory.",
      "--source",
      "package.json",
      "--scope",
      "repo",
      "--destination",
      "MEMORY.md"
    ]);
    await runCli([
      "propose",
      "--root",
      root,
      "--memory",
      "Pending agent destination memory.",
      "--risk",
      "high",
      "--destination",
      "AGENTS.md"
    ]);

    const listed = await runCli([
      "list",
      "--root",
      root,
      "--json",
      "--status",
      "pending",
      "--risk",
      "high",
      "--destination",
      "AGENTS.md"
    ]);
    const records = JSON.parse(listed.stdout);

    assert.equal(records.length, 1);
    assert.match(records[0].memory, /agent destination/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI exports accepted memory after reviewed acceptance", async () => {
  const root = await makeTempRoot();

  try {
    const proposed = await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "The maintainer prefers concise changelog entries.",
      "--risk",
      "medium"
    ]);
    const record = JSON.parse(proposed.stdout);

    await runCli([
      "accept",
      "--root",
      root,
      record.id,
      "--reason",
      "Confirmed by maintainer."
    ]);
    await runCli(["export", "--root", root, "--destination", "MEMORY.md"]);

    const exported = await readFile(join(root, "MEMORY.md"), "utf8");
    assert.match(exported, /concise changelog entries/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI check --json returns ok for consistent state", async () => {
  const root = await makeTempRoot();

  try {
    const proposed = await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "The maintainer wants reviewed durable CLI memories.",
      "--risk",
      "medium"
    ]);
    const record = JSON.parse(proposed.stdout);

    await runCli([
      "accept",
      "--root",
      root,
      record.id,
      "--reason",
      "Confirmed by maintainer."
    ]);
    await runCli(["export", "--root", root, "--destination", "MEMORY.md"]);

    const checked = await runCli(["check", "--root", root, "--json"]);
    const report = JSON.parse(checked.stdout);

    assert.equal(report.ok, true);
    assert.deepEqual(getIssues(report), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI check --json exits non-zero and reports drift", async () => {
  const root = await makeTempRoot();

  try {
    await runCli([
      "propose",
      "--root",
      root,
      "--memory",
      "The current ledger requires an event history.",
      "--risk",
      "medium"
    ]);
    await rm(join(root, ".mempr", "events.jsonl"), { force: true });

    const error = await rejectedRunCli(["check", "--root", root, "--json"]);
    const report = JSON.parse(error.stdout);

    assert.notEqual(error.code, 0);
    assert.equal(report.ok, false);
    assert(getIssues(report).length > 0);
    assert.equal(typeof getIssues(report)[0].code, "string");
    assert.match(JSON.stringify(getIssues(report)[0]), /missing|event|mismatch/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context-status --json summarizes destinations without leaking memory text", async () => {
  const root = await makeTempRoot();
  const acceptedMemory = "CLI status must not echo accepted target memory.";
  const pendingMemory = "CLI status must not echo pending target memory.";
  const rejectedMemory = "CLI status must not echo rejected target memory.";
  const otherDestinationMemory = "CLI status must not echo accepted AGENTS memory.";

  try {
    const acceptedCandidate = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      acceptedMemory,
      "--risk",
      "medium",
      "--destination",
      "MEMORY.md",
      "--ttl",
      expiryDaysFromNow(3)
    ])).stdout);
    const accepted = JSON.parse((await runCli([
      "accept",
      "--root",
      root,
      "--json",
      acceptedCandidate.id,
      "--reason",
      "Accepted before CLI context status."
    ])).stdout);
    await runCli([
      "propose",
      "--root",
      root,
      "--memory",
      pendingMemory,
      "--risk",
      "medium",
      "--destination",
      "MEMORY.md",
      "--ttl",
      expiryDaysFromNow(3)
    ]);
    const rejectedCandidate = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      rejectedMemory,
      "--risk",
      "high",
      "--destination",
      "MEMORY.md",
      "--ttl",
      expiryDaysFromNow(3)
    ])).stdout);
    await runCli([
      "reject",
      "--root",
      root,
      rejectedCandidate.id,
      "--reason",
      "Rejected before CLI context status."
    ]);
    const agentsCandidate = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      otherDestinationMemory,
      "--risk",
      "medium",
      "--destination",
      "AGENTS.md"
    ])).stdout);
    const agents = JSON.parse((await runCli([
      "accept",
      "--root",
      root,
      "--json",
      agentsCandidate.id,
      "--reason",
      "Accepted before CLI context status."
    ])).stdout);
    const before = await readReadOnlySnapshot(root, "MEMORY.md");

    const output = await runCli(["context-status", "--root", root, "--json"]);
    const status = contextStatusFromPayload(JSON.parse(output.stdout));

    assert.equal(status.ok, true);
    assert.equal(status.blocked, false);
    assert.equal(status.destination, null);
    assert.equal(status.destinationCount, 2);
    assert.equal(status.blockedCount, 0);
    assert.equal(status.warningCount, 1);
    const defaultStatus = assertDestinationStatus(status, "MEMORY.md");
    assert.equal(defaultStatus.ok, true);
    assertStatusCounts(defaultStatus, { total: 3, accepted: 1, pending: 1, rejected: 1 });
    assert.deepEqual(defaultStatus.acceptedRecordIds, [accepted.id]);
    assert.deepEqual(defaultStatus.issues, []);
    assert.deepEqual(defaultStatus.warnings.map((warning) => warning.code), ["expiring_record"]);
    assert.deepEqual(defaultStatus.warnings[0].recordIds, [accepted.id]);
    assert.equal(defaultStatus.warnings[0].expiresAt, accepted.expires_at);

    const agentsStatus = assertDestinationStatus(status, "AGENTS.md");
    assert.equal(agentsStatus.ok, true);
    assertStatusCounts(agentsStatus, { total: 1, accepted: 1, pending: 0, rejected: 0 });
    assert.deepEqual(agentsStatus.acceptedRecordIds, [agents.id]);
    assert.deepEqual(agentsStatus.warnings, []);
    assertNoEcho(output.stdout, [
      acceptedMemory,
      pendingMemory,
      rejectedMemory,
      otherDestinationMemory
    ]);
    await assertStatusReadOnly(root, "MEMORY.md", before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context-status exact destination filter reports blockers without writes", async () => {
  const root = await makeTempRoot();
  const expiredMemory = "CLI status must not echo expired target memory.";
  const expiredQuote = "CLI status must not echo expired target quote.";
  const freshMemory = "CLI status must not echo fresh accepted target memory.";
  const pendingMemory = "CLI status must not echo pending target blocker memory.";
  const rejectedMemory = "CLI status must not echo rejected target blocker memory.";
  const otherDestinationMemory = "CLI status must not echo other destination memory.";

  try {
    const expired = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      expiredMemory,
      "--quote",
      expiredQuote,
      "--source",
      "package.json",
      "--scope",
      "repo",
      "--destination",
      "MEMORY.md",
      "--ttl",
      "2000-01-01"
    ])).stdout);
    const fresh = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      freshMemory,
      "--source",
      "tsconfig.json",
      "--scope",
      "repo",
      "--destination",
      "MEMORY.md"
    ])).stdout);
    await runCli([
      "propose",
      "--root",
      root,
      "--memory",
      pendingMemory,
      "--risk",
      "medium",
      "--destination",
      "MEMORY.md"
    ]);
    const rejectedCandidate = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      rejectedMemory,
      "--risk",
      "high",
      "--destination",
      "MEMORY.md"
    ])).stdout);
    await runCli([
      "reject",
      "--root",
      root,
      rejectedCandidate.id,
      "--reason",
      "Rejected before CLI context status."
    ]);
    await runCli([
      "propose",
      "--root",
      root,
      "--memory",
      otherDestinationMemory,
      "--source",
      "AGENTS.md",
      "--scope",
      "repo",
      "--destination",
      "AGENTS.md"
    ]);
    const before = await readReadOnlySnapshot(root, "MEMORY.md");

    const output = await runCliAllowFailure([
      "context-status",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--json"
    ]);
    const status = contextStatusFromPayload(JSON.parse(output.stdout));

    assert.equal(status.ok, false);
    assert.equal(status.blocked, true);
    assert.equal(status.destination, "MEMORY.md");
    assert.equal(status.destinationCount, 1);
    assert.equal(status.blockedCount, 1);
    assert.equal(status.warningCount, 0);
    assert.deepEqual(statusDestinations(status).map((candidate) => candidate.destination), [
      "MEMORY.md"
    ]);
    const destinationStatus = assertDestinationStatus(status, "MEMORY.md");
    assert.equal(destinationStatus.ok, false);
    assertStatusCounts(destinationStatus, { total: 4, accepted: 2, pending: 1, rejected: 1 });
    assert.deepEqual(destinationStatus.acceptedRecordIds, [expired.id, fresh.id]);
    assert.deepEqual(destinationStatus.warnings, []);
    const issue = assertContextStatusIssue(destinationStatus, "expired_record");
    assert.deepEqual(issue.recordIds, [expired.id]);
    assertNoEcho(`${output.stdout}\n${output.stderr}`, [
      expiredMemory,
      expiredQuote,
      freshMemory,
      pendingMemory,
      rejectedMemory,
      otherDestinationMemory
    ]);
    await assertStatusReadOnly(root, "MEMORY.md", before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context-status --json ignores read-context permission expiry and relationship flags", async () => {
  const root = await makeTempRoot();
  const expiringMemory = "CLI status must not echo permission-expiring memory.";
  const projectMemory = "CLI status must not apply read permission scope filters.";
  const conflictMemory = "CLI status must not apply read permission relationship filters.";
  const anchorMemory = "CLI status relationship anchor must stay out of target status.";
  const validUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  try {
    const anchor = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      anchorMemory,
      "--source",
      "AGENTS.md",
      "--scope",
      "repo",
      "--destination",
      "AGENTS.md"
    ])).stdout);
    const expiringRecord = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      expiringMemory,
      "--source",
      "package.json",
      "--scope",
      "repo",
      "--ttl",
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      "--destination",
      "MEMORY.md"
    ])).stdout);
    const projectRecord = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      projectMemory,
      "--source",
      "tsconfig.json",
      "--scope",
      "project",
      "--destination",
      "MEMORY.md"
    ])).stdout);
    const conflictRecord = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      conflictMemory,
      "--source",
      "package-lock.json",
      "--scope",
      "repo",
      "--destination",
      "MEMORY.md",
      "--conflicts-with",
      anchor.id
    ])).stdout);
    await runCli([
      "accept",
      "--root",
      root,
      conflictRecord.id,
      "--reason",
      "Accepted cross-destination CLI status conflict before relationship flag check."
    ]);
    const before = await readReadOnlySnapshot(root, "MEMORY.md");

    const output = await runCli([
      "context-status",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--read-actor",
      "local-agent:phase-7i",
      "--allowed-scopes",
      "repo",
      "--read-valid-until",
      validUntil,
      "--read-exclude-conflicts",
      "--read-exclude-supersedes",
      "--json"
    ]);
    const status = contextStatusFromPayload(JSON.parse(output.stdout));
    const destinationStatus = assertDestinationStatus(status, "MEMORY.md");

    assert.equal(status.ok, true);
    assert.equal(destinationStatus.ok, true);
    assertStatusCounts(destinationStatus, { total: 3, accepted: 3, pending: 0, rejected: 0 });
    assert.deepEqual(destinationStatus.acceptedRecordIds, [
      expiringRecord.id,
      projectRecord.id,
      conflictRecord.id
    ]);
    assert.deepEqual(destinationStatus.warnings.map((warning) => warning.recordIds), [
      [expiringRecord.id]
    ]);
    assertNoEcho(output.stdout, [
      expiringMemory,
      projectMemory,
      conflictMemory,
      anchorMemory
    ]);
    await assertStatusReadOnly(root, "MEMORY.md", before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context permission denials expose JSON metadata while text stays non-leaky", async () => {
  const root = await makeTempRoot();
  const privateMemory = "CLI Phase 7L denial must not echo accepted memory.";
  const privateQuote = "CLI Phase 7L denial must not echo source quote.";

  try {
    const proposed = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      privateMemory,
      "--quote",
      privateQuote,
      "--source",
      "package.json",
      "--scope",
      "project",
      "--destination",
      "MEMORY.md"
    ])).stdout);
    await runCli([
      "accept",
      "--root",
      root,
      proposed.id,
      "--reason",
      "Accepted before CLI Phase 7L denial test."
    ]);

    const jsonError = await rejectedRunCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--read-actor",
      "local-agent:phase-7l",
      "--allowed-scopes",
      "repo",
      "--scope",
      "project",
      "--json"
    ]);
    const context = JSON.parse(jsonError.stdout);
    const issue = context.issues[0];

    assert.equal(context.ok, false);
    assert.equal(issue.code, "invalid_scope");
    assert.deepEqual(issue.recordIds, []);
    assertPermissionDeniedMetadata(issue.metadata, {
      destination: "MEMORY.md",
      scopes: ["project"]
    });
    assertNoEcho(`${jsonError.stdout}\n${jsonError.stderr}`, [
      privateMemory,
      privateQuote,
      proposed.id,
      "local-agent:phase-7l"
    ]);

    const textError = await rejectedRunCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--read-actor",
      "local-agent:phase-7l",
      "--allowed-scopes",
      "repo",
      "--scope",
      "project"
    ]);
    const text = `${textError.stdout}\n${textError.stderr}`;

    assert.match(text, /read context|scope|blocked|invalid/i);
    assertNoEcho(text, [
      privateMemory,
      privateQuote,
      proposed.id,
      "local-agent:phase-7l",
      "contractVersion",
      "contentReturned",
      "sideEffects"
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context does not infer read actor identity from environment hints", async () => {
  const root = await makeTempRoot();
  const privateMemory = "CLI Phase 7L env identity must not unlock context memory.";
  const privateQuote = "CLI Phase 7L env identity must not leak source quote.";
  const envHints = {
    MEMPR_ACTOR: "phase-7l-cli-env-actor",
    MEMPR_READ_ACTOR: "phase-7l-cli-read-actor",
    MEMPR_SESSION_ID: "phase-7l-cli-session",
    OAUTH_ACCESS_TOKEN: "phase-7l-cli-oauth-token",
    OAUTH_SUBJECT: "phase-7l-cli-oauth-subject"
  };
  const callerActor = "phase-7l-cli-caller-asserted";

  try {
    const proposed = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      privateMemory,
      "--quote",
      privateQuote,
      "--source",
      "package.json",
      "--scope",
      "repo",
      "--destination",
      "MEMORY.md"
    ])).stdout);

    const before = await readReadOnlySnapshot(root, "MEMORY.md");
    const defaultOutput = await runCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--json"
    ], { env: envHints });
    const defaultContext = JSON.parse(defaultOutput.stdout);
    const statusOutput = await runCli([
      "context-status",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--json"
    ], { env: envHints });
    const status = contextStatusFromPayload(JSON.parse(statusOutput.stdout));
    const denied = await rejectedRunCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--allowed-scopes",
      "repo",
      "--scope",
      "repo",
      "--json"
    ], { env: envHints });
    const allowed = await runCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--read-actor",
      callerActor,
      "--allowed-scopes",
      "repo",
      "--json"
    ], { env: envHints });
    const allowedContext = JSON.parse(allowed.stdout);

    assert.equal(defaultContext.ok, true);
    assert.deepEqual(defaultContext.recordIds, [proposed.id]);
    assert.equal(status.ok, true);
    assert.deepEqual(assertDestinationStatus(status, "MEMORY.md").acceptedRecordIds, [
      proposed.id
    ]);

    const deniedContext = JSON.parse(denied.stdout);
    assert.equal(deniedContext.ok, false);
    assert.equal(deniedContext.issues[0].code, "read_permission_missing_actor");
    assert.deepEqual(deniedContext.recordIds, []);
    assertPermissionDeniedMetadata(deniedContext.issues[0].metadata, {
      destination: "MEMORY.md",
      scopes: ["repo"]
    });

    assert.equal(allowedContext.ok, true);
    assert.deepEqual(allowedContext.recordIds, [proposed.id]);
    assertNoEcho(`${defaultOutput.stdout}\n${statusOutput.stdout}\n${allowed.stdout}`, [
      callerActor,
      ...Object.values(envHints)
    ]);
    assertNoEcho(`${denied.stdout}\n${denied.stderr}`, [
      privateMemory,
      privateQuote,
      proposed.id,
      callerActor,
      ...Object.values(envHints)
    ]);
    await assertStatusReadOnly(root, "MEMORY.md", before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI migrate --json backfills missing events and restores check parity", async () => {
  const root = await makeTempRoot();

  try {
    await runCli([
      "propose",
      "--root",
      root,
      "--memory",
      "Legacy current ledger should be migrated into event history.",
      "--risk",
      "medium"
    ]);
    await rm(join(root, ".mempr", "events.jsonl"), { force: true });

    const migrated = await runCli(["migrate", "--root", root, "--json"]);
    const report = JSON.parse(migrated.stdout);

    assert.equal(report.changed, true);
    assert.equal(report.reason, "migrated");
    assert.equal(report.migratedCount, 1);

    const checked = await runCli(["check", "--root", root, "--json"]);
    assert.equal(JSON.parse(checked.stdout).ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI migrate --dry-run previews backfill without writing events", async () => {
  const root = await makeTempRoot();

  try {
    await runCli([
      "propose",
      "--root",
      root,
      "--memory",
      "Dry-run migration should leave missing events missing.",
      "--risk",
      "medium"
    ]);
    await rm(join(root, ".mempr", "events.jsonl"), { force: true });

    const preview = await runCli(["migrate", "--root", root, "--dry-run", "--json"]);
    const report = JSON.parse(preview.stdout);

    assert.equal(report.changed, false);
    assert.equal(report.wouldChange, true);
    assert.equal(report.reason, "would_migrate");

    const error = await rejectedRunCli(["check", "--root", root, "--json"]);
    assert.equal(JSON.parse(error.stdout).ok, false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI repair --from-events rebuilds current ledger only with confirmation", async () => {
  const root = await makeTempRoot();

  try {
    const kept = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "CLI repair keeps this current record.",
      "--risk",
      "medium"
    ])).stdout);
    const restored = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "CLI repair restores this event-backed record.",
      "--risk",
      "medium"
    ])).stdout);
    await writeFile(
      join(root, ".mempr", "ledger.jsonl"),
      `${JSON.stringify(kept)}\n`
    );

    const preview = JSON.parse((await rejectedRunCli([
      "repair",
      "--root",
      root,
      "--from-events",
      "--json"
    ])).stdout);

    assert.equal(preview.changed, false);
    assert.equal(preview.wouldChange, true);
    assert.equal(preview.repairedCount, 2);

    const repaired = JSON.parse((await runCli([
      "repair",
      "--root",
      root,
      "--from-events",
      "--confirm",
      "--json"
    ])).stdout);
    const listed = JSON.parse((await runCli([
      "list",
      "--root",
      root,
      "--json"
    ])).stdout);

    assert.equal(repaired.changed, true);
    assert.deepEqual(listed.map((record) => record.id).sort(), [kept.id, restored.id].sort());
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI export --dry-run --json returns deterministic metadata and exact preview content", async () => {
  const root = await makeTempRoot();
  const destinationPath = join(root, "AGENTS.md");
  const existingDestination = [
    "# Agent instructions",
    "",
    "Keep this project-owned preface.",
    "",
    "<!-- mempr:start -->",
    "stale generated content",
    "<!-- mempr:end -->",
    "",
    "Keep this project-owned footer.",
    ""
  ].join("\n");

  try {
    await writeFile(destinationPath, existingDestination);
    const proposed = await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "CLI dry-run JSON should preview AGENTS output.",
      "--source",
      "AGENTS.md",
      "--scope",
      "repo",
      "--destination",
      "AGENTS.md"
    ]);
    const record = JSON.parse(proposed.stdout);
    await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "CLI dry-run JSON must not include MEMORY.md records.",
      "--source",
      "MEMORY.md",
      "--scope",
      "repo",
      "--destination",
      "MEMORY.md"
    ]);

    const expectedPreview = [
      "# Agent instructions",
      "",
      "Keep this project-owned preface.",
      "",
      "<!-- mempr:start -->",
      "## MemPR Coding Agent Memories",
      "",
      "Accepted memories for coding agents. Use them as repository context and keep the provenance attached to each item.",
      "",
      "### repo",
      "",
      "- CLI dry-run JSON should preview AGENTS output.",
      "  - scope: repo",
      "  - source: AGENTS.md",
      "  - source_trust: unknown",
      `  - id: ${record.id}`,
      "",
      "<!-- mempr:end -->",
      "",
      "Keep this project-owned footer.",
      ""
    ].join("\n");

    const dryRun = await runCli([
      "export",
      "--root",
      root,
      "--destination",
      "AGENTS.md",
      "--dry-run",
      "--json"
    ]);
    const preview = JSON.parse(dryRun.stdout);

    assert.deepEqual(Object.keys(preview).sort(), [
      "adapter",
      "content",
      "destination",
      "destinationExists",
      "dryRun",
      "outputPath",
      "recordCount",
      "recordIds",
      "warnings"
    ]);
    assert.deepEqual(preview, {
      dryRun: true,
      destination: "AGENTS.md",
      outputPath: destinationPath,
      adapter: {
        id: "local-file-agents-markdown",
        title: "AGENTS.md"
      },
      recordIds: [record.id],
      recordCount: 1,
      destinationExists: true,
      warnings: [],
      content: expectedPreview
    });
    assert.equal(await readFile(destinationPath, "utf8"), existingDestination);
    assert.equal(await countExportEvents(root), 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI export --dry-run text clearly previews without creating destination files", async () => {
  const root = await makeTempRoot();
  const destinationPath = join(root, "MEMORY.md");

  try {
    await runCli([
      "propose",
      "--root",
      root,
      "--memory",
      "CLI text dry-run should show the preview body.",
      "--source",
      "package.json",
      "--scope",
      "repo",
      "--destination",
      "MEMORY.md"
    ]);

    const dryRun = await runCli([
      "export",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--dry-run"
    ]);

    assert.match(dryRun.stdout, /dry[- ]run/i);
    assert.match(dryRun.stdout, /would write/i);
    assert.match(dryRun.stdout, new RegExp(escapeRegExp(destinationPath)));
    assert.match(dryRun.stdout, /CLI text dry-run should show the preview body\./);
    assert.match(dryRun.stdout, /<!-- mempr:start -->/);
    assert.doesNotMatch(dryRun.stdout, /^Exported /m);
    await assertPathMissing(destinationPath);
    assert.equal(await countExportEvents(root), 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function runCli(args, options = {}) {
  return exec("node", ["dist/cli.js", ...args], {
    env: {
      ...process.env,
      ...(options.env ?? {})
    }
  });
}

async function rejectedRunCli(args, options = {}) {
  try {
    await runCli(args, options);
  } catch (error) {
    return error;
  }

  assert.fail(`Expected command to fail: mempr ${args.join(" ")}`);
}

async function runCliAllowFailure(args) {
  try {
    return await runCli(args);
  } catch (error) {
    return error;
  }
}

function getIssues(report) {
  if (Array.isArray(report.issues)) {
    return report.issues;
  }

  if (Array.isArray(report.drifts)) {
    return report.drifts;
  }

  if (Array.isArray(report.drift)) {
    return report.drift;
  }

  return [];
}

function contextStatusFromPayload(payload) {
  return payload.contextStatus ?? payload.status ?? payload;
}

function assertDestinationStatus(status, destination) {
  const destinationStatus = statusDestinations(status).find((candidate) => {
    return isRecord(candidate) && candidate.destination === destination;
  });

  assert(destinationStatus, `Expected context status for ${destination}`);
  assert.equal(typeof destinationStatus.ok, "boolean");
  assert.equal(typeof destinationStatus.blocked, "boolean");
  assert(isRecord(destinationStatus.counts), "status must include counts");
  assert(Array.isArray(destinationStatus.acceptedRecordIds), "status must include acceptedRecordIds");
  assert(Array.isArray(destinationStatus.issues), "status issues must be an array");
  assert(Array.isArray(destinationStatus.warnings), "status warnings must be an array");
  assert.equal(Object.hasOwn(destinationStatus, "records"), false, "status must not include records");
  assert.equal(Object.hasOwn(destinationStatus, "content"), false, "status must not include content");
  return destinationStatus;
}

function statusDestinations(status) {
  assert.equal(typeof status.ok, "boolean", "context status must include an aggregate ok boolean");
  assert.equal(typeof status.destinationCount, "number", "context status must include destinationCount");
  assert.equal(typeof status.blockedCount, "number", "context status must include blockedCount");
  assert.equal(typeof status.warningCount, "number", "context status must include warningCount");
  assert(Array.isArray(status.destinations), "context status must include destinations");
  assert.equal(status.destinationCount, status.destinations.length);
  return status.destinations;
}

function assertStatusCounts(destinationStatus, expected) {
  for (const [key, value] of Object.entries(expected)) {
    const count = destinationStatus.counts[key];

    assert.equal(count, value, `Expected ${key} count for ${destinationStatus.destination}`);
  }
}

function assertContextStatusIssue(destinationStatus, code) {
  const issue = destinationStatus.issues.find((candidate) => {
    return isRecord(candidate) && candidate.code === code;
  });

  assert(issue, `Expected context status issue ${code}`);
  assert(Array.isArray(issue.recordIds), "status issue must include recordIds");
  return issue;
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-cli-test-"));
}

async function assertStatusReadOnly(root, destination, before) {
  assert.deepEqual(await readReadOnlySnapshot(root, destination), before);
  assert.equal(await countExportEvents(root), 0);
}

async function readReadOnlySnapshot(root, destination) {
  return {
    ledger: await readOptional(join(root, ".mempr", "ledger.jsonl")),
    events: await readOptional(join(root, ".mempr", "events.jsonl")),
    destination: await readOptional(join(root, destination))
  };
}

async function countExportEvents(root) {
  const events = await readEvents(root);
  return events.filter((event) => event.type === "memory_exported").length;
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

function expiryDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function assertPathMissing(path) {
  await assert.rejects(access(path), (error) => {
    assert(error instanceof Error);
    assert.equal(error.code, "ENOENT");
    return true;
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertNoEcho(value, privateText) {
  for (const text of privateText) {
    assert.doesNotMatch(value, new RegExp(escapeRegExp(text)));
  }
}

function assertPermissionDeniedMetadata(metadata, expected) {
  assert(isRecord(metadata), "permission denial issue must include metadata");
  assert.deepEqual(
    Object.keys(metadata).sort(),
    [...READ_PERMISSION_DENIAL_METADATA_KEYS].sort()
  );
  assert.equal(metadata.action, "read");
  assert.equal(metadata.surface, "read_context");
  assert.equal(metadata.resource, "context");
  assert.equal(metadata.destination, expected.destination);
  assert.deepEqual(metadata.scopes, expected.scopes);
    assert.equal(metadata.contractVersion, "r5-read-policy");
  assert.equal(metadata.contentReturned, false);
  assert(
    metadata.sideEffects === "none"
      || (
        isRecord(metadata.sideEffects)
        && metadata.sideEffects.ledger === "none"
        && metadata.sideEffects.events === "none"
        && metadata.sideEffects.files === "none"
      ),
    "permission denial metadata must record no side effects"
  );

  for (const forbiddenKey of [
    "actor",
    "allowedScopes",
    "grants",
    "memory",
    "quote",
    "records",
    "recordIds"
  ]) {
    assert.equal(Object.hasOwn(metadata, forbiddenKey), false);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
