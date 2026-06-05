import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import { markdownJsonScalar } from "../dist/export-adapters.js";
import { MCP_PROTOCOL_VERSION } from "../dist/mcp-contract.js";
import { closeChildProcess } from "./helpers/process-cleanup.js";
import { fakeOpenAiKey } from "./helpers/fake-secrets.js";

const exec = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = join(REPO_ROOT, "dist", "cli.js");
const MCP_STDIO_PATH = join(REPO_ROOT, "dist", "mcp-stdio.js");
const RESPONSE_TIMEOUT_MS = 2_500;
const READ_CONTEXT_KEYS = [
  "destination",
  "issues",
  "ok",
  "recordCount",
  "recordIds",
  "records",
  "scope",
  "scopes",
  "warnings"
];
const READ_CONTEXT_STATUS_KEYS = [
  "blocked",
  "blockedCount",
  "destination",
  "destinationCount",
  "destinations",
  "issues",
  "ok",
  "warningCount"
];
const READ_CONTEXT_DESTINATION_STATUS_KEYS = [
  "acceptedRecordIds",
  "blocked",
  "counts",
  "destination",
  "issues",
  "ok",
  "warnings"
];
const READ_CONTEXT_STATUS_COUNT_KEYS = ["accepted", "pending", "rejected", "total"];
const READ_CONTEXT_ISSUE_BASE_KEYS = ["code", "message", "recordIds"];
const READ_CONTEXT_WARNING_KEYS = [
  "code",
  "daysUntilExpiry",
  "destination",
  "expiresAt",
  "message",
  "recordIds",
  "warningWindowDays"
];
const READ_PERMISSION_DENIAL_ISSUE_CODES = new Set([
  "read_permission_missing_actor",
  "read_permission_missing_allowed_scopes",
  "read_permission_invalid_expiry_constraint",
  "read_permission_invalid_relationship_constraint",
  "invalid_scope"
]);
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
const READ_PERMISSION_DENIAL_FORBIDDEN_METADATA_KEYS = [
  "actor",
  "allowedScopes",
  "grants",
  "memory",
  "quote",
  "records",
  "recordIds"
];
const READ_GOVERNANCE_FIELD_PATTERNS = [
  /\bactor\b/i,
  /\bprincipal\b/i,
  /\bidentity\b/i,
  /\bpermission(?:s|ed)?\b/i,
  /\bauthorization\b/i,
  /\baccess control\b/i,
  /\bpolicy\b.*\benforc\w*\b/i,
  /\benforc\w*\b.*\bpolicy\b/i,
  /\bread governance\b/i,
  /\bredact(?:ed|ion|ing)?\b/i,
  /\bscan(?:ned|ning|ner)?\b/i,
  /\bsafety\b/i,
  /\bsecurity\b/i,
  /\bproof\b/i,
  /\battestation\b/i
];
const READ_GOVERNANCE_MESSAGE_PATTERNS = [
  /\bactor\b/i,
  /\bprincipal\b/i,
  /\bidentity\b/i,
  /\bpermission(?:s|ed)?\b/i,
  /\baccess control\b/i,
  /\bpolicy\b.*\benforc\w*\b/i,
  /\benforc\w*\b.*\bpolicy\b/i,
  /\bread governance\b/i,
  /\bredact(?:ed|ion|ing)?\b/i,
  /\bscan(?:ned|ning|ner)?\b/i,
  /\b(?:safety|security)\b.*\b(?:proof|attestation|guarantee|verification|verified)\b/i,
  /\bproof\b.*\b(?:authorization|permission|policy|safety|security)\b/i,
  /\bauthorization\b.*\b(?:decision|enforc\w*|proof|attestation|verification|verified)\b/i
];

test("MCP tools/call returns structured read-only tool results", async (t) => {
  const { probe, root, seed } = await startSeededProbe(t);

  const listResult = assertToolResult(await callTool(probe, "mempr.list", {
    status: "pending",
    destination: "MEMORY.md"
  }));
  assert.deepEqual(
    listResult.structuredContent.records.map((record) => record.id),
    [seed.target.id]
  );
  assert.equal(Object.hasOwn(listResult.structuredContent.records[0], "memory"), false);
  assert.equal(typeof listResult.structuredContent.records[0].memory_preview, "string");

  const inspectResult = assertToolResult(await callTool(probe, "mempr.inspect", {
    id: seed.target.id
  }));
  assert.equal(inspectResult.structuredContent.record.id, seed.target.id);
  assert.equal(Object.hasOwn(inspectResult.structuredContent.record, "memory"), false);
  assert.equal(inspectResult.structuredContent.reviewContext.candidate.id, seed.target.id);
  assert.deepEqual(
    inspectResult.structuredContent.reviewContext.supersedes.map((record) => record.id),
    [seed.accepted.id]
  );
  assert.deepEqual(
    inspectResult.structuredContent.reviewContext.conflicts_with.map((record) => record.id),
    [seed.rejected.id]
  );

  const historyResult = assertToolResult(await callTool(probe, "mempr.history", {
    id: seed.target.id
  }));
  assert.equal(historyResult.structuredContent.record.id, seed.target.id);
  assert.deepEqual(historyResult.structuredContent.issues, []);
  assert(
    historyResult.structuredContent.events.some((event) => event.type === "memory_proposed")
  );

  const checkResult = assertToolResult(await callTool(probe, "mempr.check"));
  assert.equal(checkResult.structuredContent.status.ok, true);
  assert.equal(checkResult.structuredContent.status.currentCount, 3);
  assert.equal(checkResult.structuredContent.status.replayedCount, 3);
  assert.deepEqual(checkResult.structuredContent.status.issues, []);

  const beforePreview = await readWriteSnapshot(root);
  const previewResult = assertToolResult(await callTool(probe, "mempr.export.preview", {
    destination: "MEMORY.md"
  }));
  assert.equal(previewResult.structuredContent.dryRun, true);
  assert.equal(previewResult.structuredContent.destination, "MEMORY.md");
  assert.equal(Object.hasOwn(previewResult.structuredContent, "outputPath"), false);
  assert.deepEqual(previewResult.structuredContent.adapter, {
    id: "local-file-generic-markdown",
    title: "Generic Markdown"
  });
  assert.deepEqual(previewResult.structuredContent.recordIds, [seed.accepted.id]);
  assert.equal(previewResult.structuredContent.recordCount, 1);
  assert.equal(previewResult.structuredContent.destinationExists, false);
  assert.deepEqual(previewResult.structuredContent.warnings, []);
  assert.match(previewResult.structuredContent.safe_content_preview, /Accepted memory for MCP review context\./);
  assert.match(previewResult.structuredContent.safe_content_preview, /\[MEMPR_REDACTED_MANAGED_BLOCK_MARKER\]/);
  assert.doesNotMatch(previewResult.structuredContent.safe_content_preview, /<!-- mempr:start -->/);
  assert.doesNotMatch(
    previewResult.structuredContent.safe_content_preview,
    /Pending memory for MCP read-only tests\./
  );
  assert.deepEqual(await readWriteSnapshot(root), beforePreview);

  assertJsonRpcOnlyStdout(probe);
});

test("MCP context assembles exact-destination scoped records without write side effects", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-context-"));
  const repoMemory = "MCP context should include scoped repo memory.";
  const projectMemory = "MCP context should omit project memory after scope filtering.";
  const pendingMemory = "MCP context must omit pending target memory.";
  const rejectedMemory = "MCP context must omit rejected target memory.";
  const otherDestinationMemory = "MCP context must omit AGENTS destination memory.";

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const repoRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    repoMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ])).stdout);
  await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    projectMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "project",
    "--destination",
    "MEMORY.md"
  ]);
  await proposePending(root, pendingMemory, {
    destination: "MEMORY.md",
    risk: "medium",
    ttl: expiryDaysFromNow(3)
  });
  const rejectedCandidate = await proposePending(root, rejectedMemory, {
    destination: "MEMORY.md",
    risk: "high",
    ttl: expiryDaysFromNow(3)
  });
  await runCli([
    "reject",
    "--root",
    root,
    "--json",
    rejectedCandidate.id,
    "--reason",
    "Rejected before MCP context test."
  ]);
  await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    otherDestinationMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "AGENTS.md"
  ]);

  const before = await readWriteSnapshot(root);
  const probe = await startInitializedProbeForRoot(t, root);
  const result = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    scope: "repo"
  }));
  const context = result.structuredContent;

  assert.equal(context.ok, true);
  assert.equal(context.destination, "MEMORY.md");
  assert.equal(context.scope, "repo");
  assert.deepEqual(context.scopes, ["repo"]);
  assert.deepEqual(context.recordIds, [repoRecord.id]);
  assert.equal(context.recordCount, 1);
  assert.deepEqual(context.issues, []);
  assert.deepEqual(context.records.map((record) => record.id), [repoRecord.id]);
  assert.equal(context.records[0].memory, repoMemory);
  assertNoEcho(JSON.stringify(context.records), [
    projectMemory,
    pendingMemory,
    rejectedMemory,
    otherDestinationMemory
  ]);
  assertReadContextBoundary(context);
  assert.deepEqual(await readWriteSnapshot(root), before);
  assert.equal(await countMemoryExportEvents(root), 0);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP context accepts opt-in permission scope constraints without write side effects", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-context-permission-"));
  const repoMemory = "MCP permissioned context repo preference.";
  const repoQuote = "MCP permissioned context should not leak repo quote on denial.";
  const projectMemory = "MCP permissioned context project preference.";
  const projectQuote = "MCP permissioned context should not leak project quote on denial.";
  const userMemory = "MCP permissioned context user preference.";
  const userQuote = "MCP permissioned context must not leak user quote on denial.";

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const repoRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    repoMemory,
    "--quote",
    repoQuote,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
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
    "--quote",
    projectQuote,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "project",
    "--destination",
    "MEMORY.md"
  ])).stdout);
  const userRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    userMemory,
    "--quote",
    userQuote,
    "--source",
    "manual",
    "--scope",
    "user",
    "--destination",
    "MEMORY.md"
  ])).stdout);
  await runCli([
    "accept",
    "--root",
    root,
    userRecord.id,
    "--reason",
    "Accepted unallowed scope for MCP permission filtering."
  ]);

  const before = await readWriteSnapshot(root);
  const probe = await startInitializedProbeForRoot(t, root);
  const defaultResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md"
  }));
  const defaultContext = defaultResult.structuredContent;
  const allowedResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: "mcp-client:phase-7h",
      allowedScopes: ["repo", "project"]
    }
  }));
  const allowedContext = allowedResult.structuredContent;
  const requestedResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: "mcp-client:phase-7h",
      allowedScopes: ["repo", "project"]
    },
    scopes: ["project"]
  }));
  const requestedContext = requestedResult.structuredContent;
  const deniedResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: "mcp-client:phase-7h",
      allowedScopes: ["repo"]
    },
    scopes: ["repo", "project"]
  }));
  const missingActorResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      allowedScopes: ["repo"]
    },
    scopes: ["repo"]
  }));
  const flatAliasResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    actor: "mcp-client:phase-7h",
    allowedScopes: ["repo"]
  }), { isError: true });

  assert.equal(defaultContext.ok, true);
  assert.deepEqual(defaultContext.recordIds, [repoRecord.id, projectRecord.id, userRecord.id]);
  assertReadContextBoundary(defaultContext);

  assert.equal(allowedContext.ok, true);
  assert.deepEqual(allowedContext.recordIds, [repoRecord.id, projectRecord.id]);
  assert.deepEqual(allowedContext.records.map((record) => record.scope), ["repo", "project"]);
  assertNoEcho(toolText(allowedResult), [userMemory, userQuote]);
  assertReadContextBoundary(allowedContext);

  assert.equal(requestedContext.ok, true);
  assert.deepEqual(requestedContext.scopes, ["project"]);
  assert.deepEqual(requestedContext.recordIds, [projectRecord.id]);
  assert.deepEqual(requestedContext.records.map((record) => record.scope), ["project"]);
  assertNoEcho(toolText(requestedResult), [repoMemory, repoQuote, userMemory, userQuote]);
  assertReadContextBoundary(requestedContext);

  for (const [result, code] of [
    [deniedResult, "invalid_scope"],
    [missingActorResult, "read_permission_missing_actor"]
  ]) {
    assertPermissionDeniedContext(result.structuredContent, [
      repoMemory,
      repoQuote,
      projectMemory,
      projectQuote,
      userMemory,
      userQuote
    ], { code });
    assertNoEcho(toolText(result), [
      repoMemory,
      repoQuote,
      projectMemory,
      projectQuote,
      userMemory,
      userQuote
    ]);
  }

  assert.match(toolText(flatAliasResult), /unsupported|argument/i);
  assertNoPermissionDeniedMetadataInToolResult(flatAliasResult);
  assertNoEcho(toolText(flatAliasResult), [
    repoMemory,
    repoQuote,
    projectMemory,
    projectQuote,
    userMemory,
    userQuote
  ]);
  assert.deepEqual(await readWriteSnapshot(root), before);
  assert.equal(await countMemoryExportEvents(root), 0);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP context does not infer read actor identity from env or client hints", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-context-actor-boundary-"));
  const privateMemory = "MCP Phase 7L env identity must not unlock context memory.";
  const privateQuote = "MCP Phase 7L env identity must not leak source quote.";
  const callerActor = "phase-7l-mcp-caller-asserted";
  const envHints = {
    MCP_CLIENT_ID: "phase-7l-mcp-client-id",
    MEMPR_ACTOR: "phase-7l-mcp-env-actor",
    MEMPR_READ_ACTOR: "phase-7l-mcp-read-actor",
    MEMPR_SESSION_ID: "phase-7l-mcp-session",
    OAUTH_ACCESS_TOKEN: "phase-7l-mcp-oauth-token",
    OAUTH_SUBJECT: "phase-7l-mcp-oauth-subject"
  };

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const record = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    privateMemory,
    "--quote",
    privateQuote,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ])).stdout);

  const before = await readWriteSnapshot(root);
  const probe = await startInitializedProbeForRoot(t, root, { env: envHints });
  const defaultResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md"
  }));
  const statusResult = assertToolResult(await callTool(probe, "mempr.context.status", {
    destination: "MEMORY.md"
  }));
  const deniedResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      allowedScopes: ["repo"]
    },
    scopes: ["repo"]
  }));
  const allowedResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: callerActor,
      allowedScopes: ["repo"]
    }
  }));

  assert.equal(defaultResult.structuredContent.ok, true);
  assert.deepEqual(defaultResult.structuredContent.recordIds, [record.id]);
  assert.equal(statusResult.structuredContent.ok, true);
  assert.deepEqual(
    assertDestinationStatus(statusResult.structuredContent, "MEMORY.md").acceptedRecordIds,
    [record.id]
  );

  assertPermissionDeniedContext(deniedResult.structuredContent, [
    privateMemory,
    privateQuote,
    callerActor,
    "mempr-mcp-readonly-tests",
    ...Object.values(envHints)
  ], { code: "read_permission_missing_actor" });
  assert.equal(allowedResult.structuredContent.ok, true);
  assert.deepEqual(allowedResult.structuredContent.recordIds, [record.id]);
  assertNoEcho(
    [
      toolText(defaultResult),
      toolText(statusResult),
      toolText(allowedResult),
      JSON.stringify(allowedResult.structuredContent)
    ].join("\n"),
    [
      callerActor,
      "mempr-mcp-readonly-tests",
      ...Object.values(envHints)
    ]
  );
  assertNoEcho(toolText(deniedResult), [
    privateMemory,
    privateQuote,
    record.id,
    callerActor,
    "mempr-mcp-readonly-tests",
    ...Object.values(envHints)
  ]);
  assertReadContextBoundary(defaultResult.structuredContent);
  assertReadContextStatusBoundary(statusResult.structuredContent);
  assertReadContextBoundary(allowedResult.structuredContent);
  assert.deepEqual(await readWriteSnapshot(root), before);
  assert.equal(await countMemoryExportEvents(root), 0);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP context accepts opt-in permission expiry constraints without write side effects", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-context-expiry-permission-"));
  const soonMemory = "MCP permission expiry should filter soon-expiring memory.";
  const soonQuote = "MCP permission expiry should filter soon-expiring quote.";
  const exactMemory = "MCP permission expiry should filter exact-threshold memory.";
  const scopeFilteredMemory = "MCP permission expiry should not warn on scope-filtered memory.";
  const longMemory = "MCP permission expiry should keep long-lived memory.";
  const noExpiryMemory = "MCP permission expiry should keep no-expiry memory.";
  const soonExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const validUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const soonRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    soonMemory,
    "--quote",
    soonQuote,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--ttl",
    soonExpiry,
    "--destination",
    "MEMORY.md"
  ])).stdout);
  const longRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    longMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--ttl",
    "2099-06-01T00:00:00Z",
    "--destination",
    "MEMORY.md"
  ])).stdout);
  const noExpiryRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    noExpiryMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ])).stdout);
  const exactRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    exactMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--ttl",
    validUntil,
    "--destination",
    "MEMORY.md"
  ])).stdout);
  const scopeFilteredRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    scopeFilteredMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "project",
    "--ttl",
    soonExpiry,
    "--destination",
    "MEMORY.md"
  ])).stdout);

  const before = await readWriteSnapshot(root);
  const probe = await startInitializedProbeForRoot(t, root);
  const defaultResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md"
  }));
  const defaultContext = defaultResult.structuredContent;
  const constrainedResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: "mcp-client:phase-7i",
      allowedScopes: ["repo"],
      validUntil
    }
  }));
  const invalidResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: "mcp-client:phase-7i",
      allowedScopes: ["repo"],
      validUntil: "not an expiry"
    }
  }));
  const missingActorResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      allowedScopes: ["repo"],
      validUntil
    }
  }));
  const missingAllowedScopesResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: "mcp-client:phase-7i",
      validUntil
    }
  }));
  const flatAliasResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: "mcp-client:phase-7i",
      allowedScopes: ["repo"]
    },
    validUntil
  }), { isError: true });
  const flatCliAliasResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readValidUntil: validUntil
  }), { isError: true });
  const constrainedContext = constrainedResult.structuredContent;

  assert.equal(defaultContext.ok, true);
  assert.deepEqual(defaultContext.recordIds, [
    soonRecord.id,
    longRecord.id,
    noExpiryRecord.id,
    exactRecord.id,
    scopeFilteredRecord.id
  ]);
  for (const record of [soonRecord, exactRecord, scopeFilteredRecord]) {
    assert(
      defaultContext.warnings.some((warning) => warning.recordIds.includes(record.id)),
      `default MCP reads should still warn for ${record.id}`
    );
  }
  assertReadContextBoundary(defaultContext);

  assert.equal(constrainedContext.ok, true);
  assert.deepEqual(constrainedContext.recordIds, [longRecord.id, noExpiryRecord.id]);
  assert.deepEqual(constrainedContext.warnings, []);
  assertNoEcho(toolText(constrainedResult), [
    soonMemory,
    soonQuote,
    exactMemory,
    scopeFilteredMemory
  ]);
  assertReadContextBoundary(constrainedContext);

  for (const [result, code] of [
    [invalidResult, "read_permission_invalid_expiry_constraint"],
    [missingActorResult, "read_permission_missing_actor"],
    [missingAllowedScopesResult, "read_permission_missing_allowed_scopes"]
  ]) {
    assertPermissionDeniedContext(result.structuredContent, [
      soonMemory,
      soonQuote,
      exactMemory,
      scopeFilteredMemory,
      longMemory,
      noExpiryMemory
    ], { code });
  }
  assert.equal(
    invalidResult.structuredContent.issues[0].code,
    "read_permission_invalid_expiry_constraint"
  );
  assertNoEcho(toolText(invalidResult), [
    soonMemory,
    soonQuote,
    exactMemory,
    scopeFilteredMemory,
    longMemory,
    noExpiryMemory
  ]);
  assert.match(toolText(flatAliasResult), /unsupported|argument/i);
  assertNoPermissionDeniedMetadataInToolResult(flatAliasResult);
  assertNoEcho(toolText(flatAliasResult), [
    soonMemory,
    soonQuote,
    exactMemory,
    scopeFilteredMemory,
    longMemory,
    noExpiryMemory
  ]);
  assert.match(toolText(flatCliAliasResult), /unsupported|argument/i);
  assertNoPermissionDeniedMetadataInToolResult(flatCliAliasResult);
  assertNoEcho(toolText(flatCliAliasResult), [
    soonMemory,
    soonQuote,
    exactMemory,
    scopeFilteredMemory,
    longMemory,
    noExpiryMemory
  ]);
  assert.notDeepEqual(constrainedContext.recordIds, [
    soonRecord.id,
    longRecord.id,
    noExpiryRecord.id,
    exactRecord.id,
    scopeFilteredRecord.id
  ]);
  assert.deepEqual(await readWriteSnapshot(root), before);
  assert.equal(await countMemoryExportEvents(root), 0);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP context accepts opt-in permission relationship constraints without write side effects", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-context-relationship-permission-"));
  const cleanMemory = "MCP relationship permission should keep unrelated memory.";
  const conflictMemory = "MCP relationship permission should filter own conflict memory.";
  const supersedingMemory = "MCP relationship permission should filter own supersession memory.";
  const scopeFilteredMemory = "MCP relationship permission should not leak scoped conflict memory.";
  const expiringMemory = "MCP relationship permission should not warn on expiring conflict memory.";
  const anchorMemory = "MCP relationship permission anchor must stay out of target context.";
  const soonExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const validUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const anchor = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    anchorMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "AGENTS.md"
  ])).stdout);
  const cleanRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    cleanMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
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
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md",
    "--conflicts-with",
    anchor.id
  ])).stdout);
  const supersedingRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    supersedingMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md",
    "--supersedes",
    anchor.id
  ])).stdout);
  const scopeFilteredRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    scopeFilteredMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "project",
    "--destination",
    "MEMORY.md",
    "--conflicts-with",
    anchor.id
  ])).stdout);
  const expiringRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    expiringMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--ttl",
    soonExpiry,
    "--destination",
    "MEMORY.md",
    "--conflicts-with",
    anchor.id
  ])).stdout);
  for (const [record, reason] of [
    [conflictRecord, "Accepted cross-destination MCP conflict for relationship filtering."],
    [supersedingRecord, "Accepted cross-destination MCP supersession for filtering."],
    [scopeFilteredRecord, "Accepted scoped MCP relationship record for filtering."],
    [expiringRecord, "Accepted expiring MCP relationship record for filtering."]
  ]) {
    await runCli([
      "accept",
      "--root",
      root,
      record.id,
      "--reason",
      reason
    ]);
  }

  const before = await readWriteSnapshot(root);
  const probe = await startInitializedProbeForRoot(t, root);
  const defaultResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md"
  }));
  const constrainedResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: "mcp-client:phase-7j",
      allowedScopes: ["repo"],
      validUntil,
      excludeConflicts: true,
      excludeSupersedes: true
    }
  }));
  const invalidConflictResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: "mcp-client:phase-7j",
      allowedScopes: ["repo"],
      excludeConflicts: "true"
    }
  }));
  const invalidSupersedesResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: "mcp-client:phase-7j",
      allowedScopes: ["repo"],
      excludeSupersedes: 1
    }
  }));
  const flatConflictAliasResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readPermission: {
      actor: "mcp-client:phase-7j",
      allowedScopes: ["repo"]
    },
    excludeConflicts: true
  }), { isError: true });
  const flatSupersedesAliasResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md",
    readExcludeSupersedes: true
  }), { isError: true });
  const defaultContext = defaultResult.structuredContent;
  const constrainedContext = constrainedResult.structuredContent;
  const resourcePayload = await readJsonResource(probe, "mempr://context/MEMORY.md");
  const resourceContext = resourcePayload.context ?? resourcePayload;

  assert.equal(defaultContext.ok, true);
  assert.deepEqual(defaultContext.recordIds, [
    cleanRecord.id,
    conflictRecord.id,
    supersedingRecord.id,
    scopeFilteredRecord.id,
    expiringRecord.id
  ]);
  assert(
    defaultContext.warnings.some((warning) => warning.recordIds.includes(expiringRecord.id)),
    `default MCP reads should still warn for ${expiringRecord.id}`
  );
  assertReadContextBoundary(defaultContext);

  assert.equal(constrainedContext.ok, true);
  assert.deepEqual(constrainedContext.recordIds, [cleanRecord.id]);
  assert.deepEqual(constrainedContext.records.map((record) => record.memory), [cleanMemory]);
  assert.deepEqual(constrainedContext.warnings, []);
  assertNoEcho(toolText(constrainedResult), [
    conflictMemory,
    supersedingMemory,
    scopeFilteredMemory,
    expiringMemory,
    anchorMemory
  ]);
  assertReadContextBoundary(constrainedContext);

  for (const result of [invalidConflictResult, invalidSupersedesResult]) {
    assertPermissionDeniedContext(result.structuredContent, [
      cleanMemory,
      conflictMemory,
      supersedingMemory,
      scopeFilteredMemory,
      expiringMemory,
      anchorMemory
    ], { code: "read_permission_invalid_relationship_constraint" });
    assert.equal(
      result.structuredContent.issues[0].code,
      "read_permission_invalid_relationship_constraint"
    );
  }

  for (const result of [flatConflictAliasResult, flatSupersedesAliasResult]) {
    assert.match(toolText(result), /unsupported|argument/i);
    assertNoPermissionDeniedMetadataInToolResult(result);
    assertNoEcho(toolText(result), [
      cleanMemory,
      conflictMemory,
      supersedingMemory,
      scopeFilteredMemory,
      expiringMemory,
      anchorMemory
    ]);
  }
  assert.equal(resourceContext.ok, true);
  assert.deepEqual(resourceContext.recordIds, [
    cleanRecord.id,
    conflictRecord.id,
    supersedingRecord.id,
    scopeFilteredRecord.id,
    expiringRecord.id
  ]);
  assertReadContextBoundary(resourceContext);
  assert.deepEqual(await readWriteSnapshot(root), before);
  assert.equal(await countMemoryExportEvents(root), 0);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP context is read-only for nested destinations", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-context-nested-"));

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const record = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    "MCP nested context must not create destination directories.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "docs/MEMORY.md"
  ])).stdout);
  const before = await readWriteSnapshot(root, "docs/MEMORY.md");
  const probe = await startInitializedProbeForRoot(t, root);
  const result = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "docs/MEMORY.md",
    scopes: ["repo"]
  }));

  assert.equal(result.structuredContent.ok, true);
  assert.deepEqual(result.structuredContent.recordIds, [record.id]);

  const resourcePayload = await readJsonResource(probe, "mempr://context/docs/MEMORY.md");
  const resourceContext = resourcePayload.context ?? resourcePayload;
  assert.equal(resourceContext.ok, true);
  assert.deepEqual(resourceContext.recordIds, [record.id]);

  await assertPathMissing(join(root, "docs"));
  assert.deepEqual(await readWriteSnapshot(root, "docs/MEMORY.md"), before);
  assert.equal(await countMemoryExportEvents(root), 0);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP context returns non-leaky blocked contexts without write side effects", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "mempr-mcp-context-blockers-"));
  const expiredRoot = join(parent, "expired");

  t.after(async () => {
    await rm(parent, { force: true, recursive: true });
  });
  await mkdir(expiredRoot, { recursive: true });

  const expiredMemory = "MCP context must not echo expired memory.";
  const expiredQuote = "MCP context must not echo expired quote.";
  const expired = JSON.parse((await runCli([
    "propose",
    "--root",
    expiredRoot,
    "--json",
    "--memory",
    expiredMemory,
    "--quote",
    expiredQuote,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "project",
    "--destination",
    "MEMORY.md",
    "--ttl",
    "2000-01-01"
  ])).stdout);
  await runCli([
    "propose",
    "--root",
    expiredRoot,
    "--json",
    "--memory",
    "Fresh scoped memory cannot hide an expired MCP context blocker.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ]);

  const expiredProbe = await startInitializedProbeForRoot(t, expiredRoot);
  const expiredBefore = await readWriteSnapshot(expiredRoot);
  const expiredResult = assertToolResult(await callTool(expiredProbe, "mempr.context", {
    destination: "MEMORY.md",
    scope: "repo"
  }));

  assert.equal(expiredResult.structuredContent.ok, false);
  assert.deepEqual(expiredResult.structuredContent.recordIds, []);
  assert.equal(expiredResult.structuredContent.recordCount, 0);
  const expiredIssue = assertContextIssue(expiredResult.structuredContent, "expired_record");
  assert.deepEqual(expiredIssue.recordIds, [expired.id]);
  assertNoEcho(`${toolText(expiredResult)}\n${JSON.stringify(expiredResult.structuredContent.issues)}`, [
    expiredMemory,
    expiredQuote
  ]);

  const expiredResourcePayload = await readJsonResource(expiredProbe, "mempr://context/MEMORY.md");
  const expiredResourceContext = expiredResourcePayload.context ?? expiredResourcePayload;
  assert.equal(expiredResourceContext.ok, false);
  assert.deepEqual(expiredResourceContext.recordIds, []);
  const expiredResourceIssue = assertContextIssue(expiredResourceContext, "expired_record");
  assert.deepEqual(expiredResourceIssue.recordIds, [expired.id]);
  assertNoEcho(JSON.stringify(expiredResourceContext.issues), [
    expiredMemory,
    expiredQuote
  ]);

  assert.deepEqual(await readWriteSnapshot(expiredRoot), expiredBefore);
  assert.equal(await countMemoryExportEvents(expiredRoot), 0);

  await assertMcpContextRelationshipBlocked(t, parent, {
    relationship: "conflicts_with",
    issueCode: "relationship_conflict",
    linkedMemory: "MCP context must not echo linked conflict memory.",
    blockingMemory: "MCP context must not echo blocking conflict memory.",
    blockingArgs: (linkedId) => ["--conflicts-with", linkedId]
  });
  await assertMcpContextRelationshipBlocked(t, parent, {
    relationship: "supersedes",
    issueCode: "relationship_supersession",
    linkedMemory: "MCP context must not echo linked superseded memory.",
    blockingMemory: "MCP context must not echo blocking supersession memory.",
    blockingArgs: (linkedId) => ["--supersedes", linkedId]
  });
});

test("MCP resources/read context returns accepted exact-destination records without writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-resource-context-"));
  const repoMemory = "MCP context resource should include accepted repo memory.";
  const projectMemory = "MCP context resource should include accepted project memory.";
  const pendingMemory = "MCP context resource must omit pending target memory.";
  const rejectedMemory = "MCP context resource must omit rejected target memory.";
  const otherDestinationMemory = "MCP context resource must omit AGENTS destination memory.";

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const repoRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    repoMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
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
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "project",
    "--destination",
    "MEMORY.md"
  ])).stdout);
  await proposePending(root, pendingMemory, {
    destination: "MEMORY.md",
    risk: "medium",
    ttl: expiryDaysFromNow(3)
  });
  const rejectedCandidate = await proposePending(root, rejectedMemory, {
    destination: "MEMORY.md",
    risk: "high",
    ttl: expiryDaysFromNow(3)
  });
  await runCli([
    "reject",
    "--root",
    root,
    "--json",
    rejectedCandidate.id,
    "--reason",
    "Rejected before MCP context resource test."
  ]);
  await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    otherDestinationMemory,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "AGENTS.md"
  ]);

  const before = await readWriteSnapshot(root);
  const probe = await startInitializedProbeForRoot(t, root);
  const { payload, text } = await readJsonResourceContent(probe, "mempr://context/MEMORY.md");
  const context = contextFromPayload(payload);

  assert.equal(context.ok, true);
  assert.equal(context.destination, "MEMORY.md");
  assert.equal(context.scope, null);
  assert.deepEqual(context.scopes, []);
  assert.deepEqual(context.recordIds, [repoRecord.id, projectRecord.id]);
  assert.equal(context.recordCount, 2);
  assert.deepEqual(context.issues, []);
  assert.deepEqual(context.records.map((record) => record.id), [repoRecord.id, projectRecord.id]);
  assert.deepEqual(context.records.map((record) => record.memory), [repoMemory, projectMemory]);
  assertReadContextBoundary(context);
  assertNoEcho(text, [
    pendingMemory,
    rejectedMemory,
    otherDestinationMemory
  ]);
  assert.deepEqual(await readWriteSnapshot(root), before);
  assert.equal(await countMemoryExportEvents(root), 0);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP resources/read context is read-only for nested safe destinations", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-resource-context-nested-"));

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const record = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    "MCP nested context resource must not create destination directories.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "docs/MEMORY.md"
  ])).stdout);
  const before = await readWriteSnapshot(root, "docs/MEMORY.md");
  const probe = await startInitializedProbeForRoot(t, root);
  const { payload } = await readJsonResourceContent(probe, "mempr://context/docs/MEMORY.md");
  const context = contextFromPayload(payload);

  assert.equal(context.ok, true);
  assert.equal(context.destination, "docs/MEMORY.md");
  assert.deepEqual(context.recordIds, [record.id]);
  assert.equal(context.recordCount, 1);
  await assertPathMissing(join(root, "docs"));
  assert.deepEqual(await readWriteSnapshot(root, "docs/MEMORY.md"), before);
  assert.equal(await countMemoryExportEvents(root), 0);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP resources/read context returns non-leaky blocked context data", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "mempr-mcp-resource-context-blockers-"));
  const expiredRoot = join(parent, "expired");

  t.after(async () => {
    await rm(parent, { force: true, recursive: true });
  });
  await mkdir(expiredRoot, { recursive: true });

  const expiredMemory = "MCP resource context must not echo expired memory.";
  const expiredQuote = "MCP resource context must not echo expired quote.";
  const expired = JSON.parse((await runCli([
    "propose",
    "--root",
    expiredRoot,
    "--json",
    "--memory",
    expiredMemory,
    "--quote",
    expiredQuote,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "project",
    "--destination",
    "MEMORY.md",
    "--ttl",
    "2000-01-01"
  ])).stdout);
  await runCli([
    "propose",
    "--root",
    expiredRoot,
    "--json",
    "--memory",
    "Fresh MCP resource memory cannot hide an expired context blocker.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ]);

  const expiredProbe = await startInitializedProbeForRoot(t, expiredRoot);
  const expiredBefore = await readWriteSnapshot(expiredRoot);
  const expiredResource = await readJsonResourceContent(expiredProbe, "mempr://context/MEMORY.md");
  const expiredContext = contextFromPayload(expiredResource.payload);

  assert.equal(expiredContext.ok, false);
  assert.deepEqual(expiredContext.recordIds, []);
  assert.equal(expiredContext.recordCount, 0);
  const expiredIssue = assertContextIssue(expiredContext, "expired_record");
  assert.deepEqual(expiredIssue.recordIds, [expired.id]);
  assertNoEcho(expiredResource.text, [
    expiredMemory,
    expiredQuote
  ]);
  assert.deepEqual(await readWriteSnapshot(expiredRoot), expiredBefore);
  assert.equal(await countMemoryExportEvents(expiredRoot), 0);

  await assertMcpContextResourceRelationshipBlocked(t, parent, {
    relationship: "conflicts_with",
    issueCode: "relationship_conflict",
    linkedMemory: "MCP resource context must not echo linked conflict memory.",
    blockingMemory: "MCP resource context must not echo blocking conflict memory.",
    blockingArgs: (linkedId) => ["--conflicts-with", linkedId]
  });
  await assertMcpContextResourceRelationshipBlocked(t, parent, {
    relationship: "supersedes",
    issueCode: "relationship_supersession",
    linkedMemory: "MCP resource context must not echo linked superseded memory.",
    blockingMemory: "MCP resource context must not echo blocking supersession memory.",
    blockingArgs: (linkedId) => ["--supersedes", linkedId]
  });
});

test("MCP context surfaces block secret-like accepted metadata fields", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-context-secret-metadata-"));
  const secret = "token=memprFakemcpContextStatusReasonShouldNotEcho1234567890";

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  const record = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    "MCP context secret metadata boundary fixture.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ])).stdout);
  const ledgerPath = join(root, ".mempr", "ledger.jsonl");
  const ledgerRecords = (await readFile(ledgerPath, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  ledgerRecords[0].status_reason = `approved with token ${secret}`;
  await writeFile(
    ledgerPath,
    `${ledgerRecords.map((entry) => JSON.stringify(entry)).join("\n")}\n`
  );

  const before = await readWriteSnapshot(root);
  const probe = await startInitializedProbeForRoot(t, root);
  const toolResult = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md"
  }));
  const resource = await readJsonResourceContent(probe, "mempr://context/MEMORY.md");
  const resourceContext = contextFromPayload(resource.payload);

  assert.equal(toolResult.structuredContent.ok, false);
  assert.deepEqual(toolResult.structuredContent.records, []);
  assert.equal(toolResult.structuredContent.issues[0].code, "secret_like_content");
  assert.deepEqual(toolResult.structuredContent.issues[0].recordIds, [record.id]);
  assertNoEcho(toolText(toolResult), [secret]);

  assert.equal(resourceContext.ok, false);
  assert.deepEqual(resourceContext.records, []);
  assert.equal(resourceContext.issues[0].code, "secret_like_content");
  assert.deepEqual(resourceContext.issues[0].recordIds, [record.id]);
  assertNoEcho(resource.text, [secret]);

  assert.deepEqual(await readWriteSnapshot(root), before);
  assert.equal(await countMemoryExportEvents(root), 0);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP context status tool and resources report blockers without memory text or writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-context-status-"));
  const expiredMemory = "MCP status must not echo expired target memory.";
  const expiredQuote = "MCP status must not echo expired target quote.";
  const freshMemory = "MCP status must not echo fresh target memory.";
  const pendingMemory = "MCP status must not echo pending target memory.";
  const rejectedMemory = "MCP status must not echo rejected target memory.";
  const otherDestinationMemory = "MCP status must not echo accepted AGENTS memory.";

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

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
    "manual",
    "--source-trust",
    "trusted",
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
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md",
    "--ttl",
    expiryDaysFromNow(3)
  ])).stdout);
  await proposePending(root, pendingMemory, {
    destination: "MEMORY.md",
    risk: "medium",
    ttl: expiryDaysFromNow(3)
  });
  const rejectedCandidate = await proposePending(root, rejectedMemory, {
    destination: "MEMORY.md",
    risk: "high",
    ttl: expiryDaysFromNow(3)
  });
  await runCli([
    "reject",
    "--root",
    root,
    rejectedCandidate.id,
    "--reason",
    "Rejected before MCP context status."
  ]);
  const agentsCandidate = await proposePending(root, otherDestinationMemory, {
    destination: "AGENTS.md",
    risk: "medium"
  });
  const agents = JSON.parse((await runCli([
    "accept",
    "--root",
    root,
    "--json",
    agentsCandidate.id,
    "--reason",
    "Accepted before MCP context status."
  ])).stdout);

  const before = await readWriteSnapshot(root);
  const probe = await startInitializedProbeForRoot(t, root);
  const toolResult = assertToolResult(await callTool(probe, "mempr.context.status", {
    destination: "MEMORY.md"
  }));
  const toolStatus = contextStatusFromPayload(toolResult.structuredContent);

  assert.equal(toolStatus.ok, false);
  assert.equal(toolStatus.blocked, true);
  assert.equal(toolStatus.destination, "MEMORY.md");
  assert.equal(toolStatus.destinationCount, 1);
  assert.equal(toolStatus.blockedCount, 1);
  assert.equal(toolStatus.warningCount, 1);
  assert.deepEqual(statusDestinations(toolStatus).map((candidate) => candidate.destination), [
    "MEMORY.md"
  ]);
  const toolDestinationStatus = assertDestinationStatus(toolStatus, "MEMORY.md");
  assert.equal(toolDestinationStatus.ok, false);
  assertStatusCounts(toolDestinationStatus, { total: 4, accepted: 2, pending: 1, rejected: 1 });
  assert.deepEqual(toolDestinationStatus.acceptedRecordIds, [expired.id, fresh.id]);
  assert.deepEqual(
    toolDestinationStatus.warnings.map((warning) => warning.code),
    ["expiring_record"]
  );
  assert.deepEqual(toolDestinationStatus.warnings[0].recordIds, [fresh.id]);
  assert.equal(toolDestinationStatus.warnings[0].expiresAt, fresh.expires_at);
  const toolIssue = assertContextStatusIssue(toolDestinationStatus, "expired_record");
  assert.deepEqual(toolIssue.recordIds, [expired.id]);
  assertReadContextStatusBoundary(toolStatus);

  const filteredResource = await readJsonResourceContent(probe, "mempr://contexts/MEMORY.md");
  const filteredStatus = contextStatusFromPayload(filteredResource.payload);
  assert.deepEqual(filteredStatus, toolStatus);
  assertReadContextStatusBoundary(filteredStatus);

  const allResource = await readJsonResourceContent(probe, "mempr://contexts");
  const allStatus = contextStatusFromPayload(allResource.payload);
  const agentsStatus = assertDestinationStatus(allStatus, "AGENTS.md");
  assert.equal(agentsStatus.ok, true);
  assertStatusCounts(agentsStatus, { total: 1, accepted: 1, pending: 0, rejected: 0 });
  assert.deepEqual(agentsStatus.acceptedRecordIds, [agents.id]);
  assert.deepEqual(agentsStatus.warnings, []);
  assertReadContextStatusBoundary(allStatus);

  assertNoEcho(`${toolText(toolResult)}\n${filteredResource.text}\n${allResource.text}`, [
    expiredMemory,
    expiredQuote,
    freshMemory,
    pendingMemory,
    rejectedMemory,
    otherDestinationMemory
  ]);
  assert.deepEqual(await readWriteSnapshot(root), before);
  assert.equal(await countMemoryExportEvents(root), 0);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP context status rejects unsafe arguments and URIs without side effects", async (t) => {
  const { probe, root } = await startSeededProbe(t);
  const before = await readWriteSnapshot(root, "docs/MEMORY.md");

  for (const destination of [
    "../MEMORY.md",
    "/tmp/MEMORY.md",
    "https://example.com/MEMORY.md",
    "docs\\MEMORY.md",
    ""
  ]) {
    const response = await callTool(probe, "mempr.context.status", {
      destination
    });
    const result = assertToolResult(response, { isError: response.result?.isError === true });

    if (result.isError === true) {
      assert.match(toolText(result), /invalid|unsupported|argument|destination/i);
      assert.deepEqual(await readWriteSnapshot(root, "docs/MEMORY.md"), before);
      await assertPathMissing(join(root, "docs"));
      assert.equal(await countMemoryExportEvents(root), 0);
      continue;
    }

    const status = contextStatusFromPayload(result.structuredContent);
    const destinationStatus = assertDestinationStatus(status, destination);

    assert.equal(status.ok, false);
    assert.equal(status.blocked, true);
    assert.equal(destinationStatus.ok, false);
    assert.equal(destinationStatus.blocked, true);
    assertStatusCounts(destinationStatus, { total: 0, accepted: 0, pending: 0, rejected: 0 });
    assert.deepEqual(destinationStatus.acceptedRecordIds, []);
    const issue = assertContextStatusIssue(destinationStatus, "invalid_destination");
    assert.deepEqual(issue.recordIds, []);
    assert.match(toolText(result), /invalid|destination|blocked/i);
    assert.deepEqual(await readWriteSnapshot(root, "docs/MEMORY.md"), before);
    await assertPathMissing(join(root, "docs"));
    assert.equal(await countMemoryExportEvents(root), 0);
  }

  for (const args of [
    { destination: 42 },
    { confirm: true },
    { scope: "repo" },
    { actor: "mcp-client:phase-7h" },
    { allowedScopes: ["repo"] },
    { validUntil: "2099-01-01T00:00:00Z" },
    { readValidUntil: "2099-01-01T00:00:00Z" },
    { readPermission: { actor: "mcp-client:phase-7h", allowedScopes: ["repo"] } },
    {
      readPermission: {
        actor: "mcp-client:phase-7i",
        allowedScopes: ["repo"],
        validUntil: "2099-01-01T00:00:00Z"
      }
    },
    {
      readPermission: {
        actor: "mcp-client:phase-7j",
        allowedScopes: ["repo"],
        excludeConflicts: true,
        excludeSupersedes: true
      }
    }
  ]) {
    const result = assertToolResult(await callTool(probe, "mempr.context.status", args), {
      isError: true
    });

    assert.match(toolText(result), /invalid|unsupported|argument|destination/i);
    assertNoPermissionDeniedMetadataInToolResult(result);
    assert.deepEqual(await readWriteSnapshot(root, "docs/MEMORY.md"), before);
    await assertPathMissing(join(root, "docs"));
    assert.equal(await countMemoryExportEvents(root), 0);
  }

  for (const uri of [
    "file:///tmp/MEMORY.md",
    "https://example.com/MEMORY.md",
    "mempr://contexts/../MEMORY.md",
    "mempr://contexts/MEMORY.md/../AGENTS.md",
    "mempr://contexts/%2e%2e/MEMORY.md",
    "mempr://contexts/%252e%252e/MEMORY.md",
    "mempr://contexts/docs%2FMEMORY.md",
    "mempr://contexts/docs\\MEMORY.md",
    "mempr://contexts/https:%2F%2Fexample.com%2FMEMORY.md",
    "mempr://contexts/MEMORY.md?scope=repo",
    "mempr://contexts/MEMORY.md#fragment",
    "mempr://user:pass@contexts/MEMORY.md",
    "mempr://contexts/",
    "mempr://contexts/docs/",
    "mempr://contexts//MEMORY.md"
  ]) {
    const response = await probe.request("resources/read", { uri });

    assertJsonRpcError(response, -32602);
    assert.match(
      response.error.message,
      /resource|uri|mempr|unsupported|invalid|not found|unknown|destination/i
    );
    assert.deepEqual(await readWriteSnapshot(root, "docs/MEMORY.md"), before);
    await assertPathMissing(join(root, "docs"));
    assert.equal(await countMemoryExportEvents(root), 0);
  }

  assertJsonRpcOnlyStdout(probe);
});

test("MCP mutating tools are blocked without ledger or event writes", async (t) => {
  const { probe, root, seed } = await startSeededProbe(t);
  const before = await readWriteSnapshot(root);

  const attempts = [
    {
      name: "mempr.propose",
      args: {
        memory: "Blocked MCP proposal must not be written.",
        source: "mcp-readonly-test"
      }
    },
    {
      name: "mempr.review",
      args: {
        id: seed.target.id,
        decision: "accept",
        reason: "Blocked MCP review must not be written."
      }
    },
    {
      name: "mempr.export",
      args: {
        destination: "MEMORY.md"
      }
    }
  ];

  for (const attempt of attempts) {
    const result = assertToolResult(await callTool(probe, attempt.name, attempt.args), {
      isError: true
    });

    assert.match(
      toolText(result),
      /read.?only|mutation|write|not supported|disabled|confirm|blocked|not implemented/i
    );
    assert.deepEqual(await readWriteSnapshot(root), before);
  }

  assertJsonRpcOnlyStdout(probe);
});

test("MCP export preview renders named adapters without file or event side effects", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-export-preview-"));
  const agentsRecord = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    "MCP preview should use the AGENTS adapter.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "AGENTS.md"
  ])).stdout);
  await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    "MCP preview must not include MEMORY destination records.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ]);
  const beforeEvents = await readOptional(join(root, ".mempr", "events.jsonl"));
  const probe = new StdioMcpProbe(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
  });

  await initialize(probe);
  probe.notify("notifications/initialized");

  const result = assertToolResult(await callTool(probe, "mempr.export.preview", {
    destination: "AGENTS.md"
  }));

  assert.equal(result.structuredContent.dryRun, true);
  assert.equal(result.structuredContent.destination, "AGENTS.md");
  assert.equal(Object.hasOwn(result.structuredContent, "outputPath"), false);
  assert.deepEqual(result.structuredContent.adapter, {
    id: "local-file-agents-markdown",
    title: "AGENTS.md"
  });
  assert.deepEqual(result.structuredContent.recordIds, [agentsRecord.id]);
  assert.equal(result.structuredContent.recordCount, 1);
  assert.equal(result.structuredContent.destinationExists, false);
  assert.match(result.structuredContent.safe_content_preview, /## MemPR Coding Agent Memories/);
  assert.match(result.structuredContent.safe_content_preview, /### "repo"/);
  assert.match(result.structuredContent.safe_content_preview, /MCP preview should use the AGENTS adapter\./);
  assert.doesNotMatch(result.structuredContent.safe_content_preview, /MEMORY destination records/);
  assert.equal(await readOptional(join(root, "AGENTS.md")), null);
  assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), beforeEvents);
  assertJsonRpcOnlyStdout(probe);
});

test("MCP export preview reuses blockers and rejects unsafe preview destinations", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "mempr-mcp-export-preview-guards-"));
  const expiredRoot = join(parent, "expired");
  const conflictRoot = join(parent, "conflict");
  const unmanagedRoot = join(parent, "unmanaged");
  const unsafeRoot = join(parent, "unsafe-read");
  const outsideRoot = join(parent, "outside");

  t.after(async () => {
    await rm(parent, { force: true, recursive: true });
  });
  await mkdir(expiredRoot, { recursive: true });
  await mkdir(conflictRoot, { recursive: true });

  const expired = JSON.parse((await runCli([
    "propose",
    "--root",
    expiredRoot,
    "--json",
    "--memory",
    "Expired MCP preview memory must block.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--ttl",
    "2000-01-01",
    "--destination",
    "MEMORY.md"
  ])).stdout);
  const expiredProbe = await startInitializedProbeForRoot(t, expiredRoot);
  const expiredEvents = await readOptional(join(expiredRoot, ".mempr", "events.jsonl"));
  const expiredResult = assertToolResult(await callTool(expiredProbe, "mempr.export.preview", {
    destination: "MEMORY.md"
  }), { isError: true });

  assert.match(toolText(expiredResult), /expired/i);
  assert.match(toolText(expiredResult), new RegExp(escapeRegExp(expired.id)));
  assert.equal(await readOptional(join(expiredRoot, "MEMORY.md")), null);
  assert.equal(await readOptional(join(expiredRoot, ".mempr", "events.jsonl")), expiredEvents);

  const conflicted = JSON.parse((await runCli([
    "propose",
    "--root",
    conflictRoot,
    "--json",
    "--memory",
    "Accepted MCP preview conflicted record.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ])).stdout);
  const conflict = JSON.parse((await runCli([
    "propose",
    "--root",
    conflictRoot,
    "--json",
    "--memory",
    "Accepted MCP preview conflict record.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--risk",
    "medium",
    "--conflicts-with",
    conflicted.id,
    "--destination",
    "MEMORY.md"
  ])).stdout);
  await runCli([
    "accept",
    "--root",
    conflictRoot,
    conflict.id,
    "--reason",
    "Reviewed MCP preview conflict."
  ]);
  const conflictProbe = await startInitializedProbeForRoot(t, conflictRoot);
  const conflictEvents = await readOptional(join(conflictRoot, ".mempr", "events.jsonl"));
  const conflictResult = assertToolResult(await callTool(conflictProbe, "mempr.export.preview", {
    destination: "MEMORY.md"
  }), { isError: true });

  assert.match(toolText(conflictResult), /conflict/i);
  assert.match(toolText(conflictResult), new RegExp(escapeRegExp(conflict.id)));
  assert.match(toolText(conflictResult), new RegExp(escapeRegExp(conflicted.id)));
  assert.equal(await readOptional(join(conflictRoot, "MEMORY.md")), null);
  assert.equal(await readOptional(join(conflictRoot, ".mempr", "events.jsonl")), conflictEvents);

  await mkdir(unmanagedRoot, { recursive: true });
  await writeFile(join(unmanagedRoot, "package.json"), "{\"secret\":\"do not leak\"}\n");
  const unmanagedProbe = await startInitializedProbeForRoot(t, unmanagedRoot);
  const unmanagedBefore = await readOptional(join(unmanagedRoot, "package.json"));
  const unmanagedResult = assertToolResult(await callTool(unmanagedProbe, "mempr.export.preview", {
    destination: "package.json"
  }), { isError: true });

  assert.match(toolText(unmanagedResult), /managed block|destination/i);
  assert.doesNotMatch(toolText(unmanagedResult), /do not leak/);
  assert.equal(await readOptional(join(unmanagedRoot, "package.json")), unmanagedBefore);
  assert.equal(await readOptional(join(unmanagedRoot, ".mempr", "events.jsonl")), null);

  await mkdir(unsafeRoot, { recursive: true });
  await mkdir(outsideRoot, { recursive: true });
  await runCli([
    "propose",
    "--root",
    unsafeRoot,
    "--memory",
    "Unsafe MCP preview destination fixtures must not hang.",
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ]);
  const unsafeEvents = await readOptional(join(unsafeRoot, ".mempr", "events.jsonl"));
  await exec("mkfifo", [join(unsafeRoot, "MEMORY.md")]);
  const unsafeProbe = await startInitializedProbeForRoot(t, unsafeRoot);
  const fifoResult = assertToolResult(await callTool(unsafeProbe, "mempr.export.preview", {
    destination: "MEMORY.md"
  }), { isError: true });

  assert.match(toolText(fifoResult), /read safely|destination/i);
  assert.doesNotMatch(toolText(fifoResult), new RegExp(escapeRegExp(unsafeRoot)));
  assert.equal(await readOptional(join(unsafeRoot, ".mempr", "events.jsonl")), unsafeEvents);

  await rm(join(unsafeRoot, "MEMORY.md"), { force: true });
  await writeFile(join(outsideRoot, "MEMORY.md"), "outside target must not be read\n");
  await symlink(join(outsideRoot, "MEMORY.md"), join(unsafeRoot, "MEMORY.md"));
  const symlinkResult = assertToolResult(await callTool(unsafeProbe, "mempr.export.preview", {
    destination: "MEMORY.md"
  }), { isError: true });

  assert.match(toolText(symlinkResult), /read safely|destination/i);
  assert.doesNotMatch(toolText(symlinkResult), /outside target/);

  await rm(join(unsafeRoot, "MEMORY.md"), { force: true });
  await mkdir(join(unsafeRoot, "MEMORY.md"));
  const directoryResult = assertToolResult(await callTool(unsafeProbe, "mempr.export.preview", {
    destination: "MEMORY.md"
  }), { isError: true });

  assert.match(toolText(directoryResult), /read safely|destination/i);

  await rm(join(unsafeRoot, "MEMORY.md"), { force: true, recursive: true });
  await writeFile(join(unsafeRoot, "MEMORY.md"), "x".repeat(5 * 1024 * 1024 + 1));
  const oversizedResult = assertToolResult(await callTool(unsafeProbe, "mempr.export.preview", {
    destination: "MEMORY.md"
  }), { isError: true });

  assert.match(toolText(oversizedResult), /read safely|destination/i);

  for (const destination of [
    "../outside.md",
    "/tmp/outside.md",
    "https://example.com/MEMORY.md",
    "docs\\MEMORY.md"
  ]) {
    const result = assertToolResult(await callTool(unmanagedProbe, "mempr.export.preview", {
      destination
    }), { isError: true });

    assert.match(toolText(result), /invalid|destination/i);
  }
});

test("MCP resources/read returns application/json text for MemPR projections", async (t) => {
  const { probe, seed } = await startSeededProbe(t);

  const recordsPayload = await readJsonResource(probe, "mempr://records");
  const records = recordsPayload.records ?? recordsPayload;
  assert(Array.isArray(records));
  assert.deepEqual(
    records.map((record) => record.id).sort(),
    [seed.accepted.id, seed.rejected.id, seed.target.id].sort()
  );
  for (const record of records) {
    assert.equal(Object.hasOwn(record, "memory"), false);
    assert.equal(typeof record.memory_preview, "string");
    assert.equal(Object.hasOwn(record.source, "uri"), false);
    assert.equal(typeof record.source.uri_preview, "string");
  }

  const statusPayload = await readJsonResource(probe, "mempr://status");
  const status = statusPayload.status ?? statusPayload;
  assert.equal(status.ok, true);
  assert.equal(status.currentCount, 3);
  assert.equal(status.replayedCount, 3);

  const contextPayload = await readJsonResource(probe, "mempr://context/MEMORY.md");
  const context = contextPayload.context ?? contextPayload;
  assert.equal(context.ok, true);
  assert.equal(context.destination, "MEMORY.md");
  assert.deepEqual(context.scopes, []);
  assert.deepEqual(context.recordIds, [seed.accepted.id]);
  assert.equal(context.recordCount, 1);
  assert.deepEqual(context.issues, []);
  assert.deepEqual(context.records.map((record) => record.id), [seed.accepted.id]);

  const recordPayload = await readJsonResource(probe, `mempr://records/${seed.target.id}`);
  const record = recordPayload.record ?? recordPayload;
  assert.equal(record.id, seed.target.id);
  assert.equal(record.status, "pending");
  assert.equal(Object.hasOwn(record, "memory"), false);
  assert.equal(typeof record.memory_preview, "string");

  const reviewPayload = await readJsonResource(
    probe,
    `mempr://records/${seed.target.id}/review`
  );
  const review = reviewPayload.reviewContext ?? reviewPayload;
  assert.equal(review.candidate.id, seed.target.id);
  assert.deepEqual(review.supersedes.map((candidate) => candidate.id), [seed.accepted.id]);
  assert.deepEqual(review.conflicts_with.map((candidate) => candidate.id), [seed.rejected.id]);

  const historyPayload = await readJsonResource(
    probe,
    `mempr://records/${seed.target.id}/history`
  );
  const history = historyPayload.history ?? historyPayload;
  assert.equal(history.record.id, seed.target.id);
  assert.deepEqual(history.issues, []);
  assert(history.events.some((event) => event.type === "memory_proposed"));

  assertJsonRpcOnlyStdout(probe);
});

test("MCP resources/read sanitizes corrupted records, status roots, policy, and history", async (t) => {
  const root = await mkdtemp(join(tmpdir(), `mempr-mcp-${fakeOpenAiKey("ResourceRoot1234567890")}-`));
  const unsafeId = "legacy_corrupt_success_id";
  const sourceSecret = fakeOpenAiKey("memprFakeMcpResourceSource1234567890");
  const historySecret = fakeOpenAiKey("memprFakeMcpResourceHistory1234567890");
  const policySecret = fakeOpenAiKey("memprFakeMcpResourcePolicy1234567890");
  const record = fixedLegacyAcceptedRecord({
    id: unsafeId,
    memory: "MCP legacy ID resource should stay projected.",
    sourceUri: `manual://${sourceSecret}`
  });

  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });

  await seedLegacyLedgerMigration(root, record, {
    extraEvents: [{
      id: "evt_legacy_status_secret",
      type: "memory_status_changed",
      created_at: "2026-05-22T00:01:00.000Z",
      record_id: unsafeId,
      previous_status: "accepted",
      next_status: "accepted",
      reason: historySecret,
      record
    }]
  });
  await mkdir(join(root, ".mempr"), { recursive: true });
  await writeFile(join(root, ".mempr", "policy.json"), JSON.stringify({
    sensitiveTerms: [policySecret],
    blockSecretsWithoutPersistence: true
  }));

  const probe = await startInitializedProbeForRoot(t, root);
  const resources = [
    await readJsonResourceContent(probe, "mempr://records"),
    await readJsonResourceContent(probe, `mempr://records/${encodeURIComponent(unsafeId)}`),
    await readJsonResourceContent(probe, `mempr://records/${encodeURIComponent(unsafeId)}/history`),
    await readJsonResourceContent(probe, "mempr://context/MEMORY.md"),
    await readJsonResourceContent(probe, "mempr://contexts"),
    await readJsonResourceContent(probe, "mempr://status"),
    await readJsonResourceContent(probe, "mempr://policy")
  ];
  const combined = resources.map((resource) => resource.text).join("\n");
  const records = resources[0].payload.records;
  const recordPayload = resources[1].payload.record;
  const history = resources[2].payload;
  const policy = resources[6].payload.policy;

  assert.match(combined, /\[MEMPR_RECORD_ID_HASH:[0-9a-f]{16}\]/);
  assertNoEcho(combined, [
    unsafeId,
    sourceSecret,
    historySecret,
    policySecret,
    root
  ]);
  assert.equal(Object.hasOwn(records[0], "memory"), false);
  assert.equal(typeof records[0].memory_preview, "string");
  assert.equal(Object.hasOwn(recordPayload, "memory"), false);
  assert.equal(typeof recordPayload.source.uri_preview, "string");
  assert.equal(Object.hasOwn(recordPayload.source, "uri"), false);
  assert.equal(history.record.id, recordPayload.id);
  assert.equal(Object.hasOwn(policy, "blockSecretsWithoutPersistence"), false);
});

test("MCP resources/read rejects non-MemPR, traversal, and unknown URIs", async (t) => {
  const { probe, root } = await startSeededProbe(t);
  const before = await readWriteSnapshot(root);

  for (const uri of [
    "file:///etc/passwd",
    "https://example.com/mempr",
    "mempr://records/../status",
    "mempr://records/%2e%2e/status",
    "mempr://context",
    "mempr://context/",
    "mempr://context/../MEMORY.md",
    "mempr://context/%2e%2e/MEMORY.md",
    "mempr://context/docs%2FMEMORY.md",
    "mempr://context/docs\\MEMORY.md",
    "mempr://context/https:%2F%2Fexample.com%2FMEMORY.md",
    "mempr://context/MEMORY.md?scope=repo",
    "mempr://context/MEMORY.md#fragment",
    "mempr://user:pass@context/MEMORY.md",
    "mempr://unknown"
  ]) {
    const response = await probe.request("resources/read", { uri });

    assertJsonRpcError(response, -32602);
    assert.match(
      response.error.message,
      /resource|uri|mempr|unsupported|invalid|not found|unknown|no memory record/i
    );
    assert.deepEqual(await readWriteSnapshot(root), before);
  }

  assertJsonRpcOnlyStdout(probe);
});

test("MCP resources/read rejects unsafe context URIs without side effects", async (t) => {
  const { probe, root } = await startSeededProbe(t);
  const before = await readWriteSnapshot(root, "docs/MEMORY.md");

  for (const uri of [
    "file:///tmp/MEMORY.md",
    "https://example.com/MEMORY.md",
    "mempr://context/../MEMORY.md",
    "mempr://context/MEMORY.md/../AGENTS.md",
    "mempr://context/%2e%2e/MEMORY.md",
    "mempr://context/%252e%252e/MEMORY.md",
    "mempr://context/..%2fMEMORY.md",
    "mempr://context/docs%252FMEMORY.md",
    "mempr://context/docs\\MEMORY.md",
    "mempr://context/file:MEMORY.md",
    "mempr://context/https:%2F%2Fexample.com%2FMEMORY.md",
    "mempr://context/MEMORY.md?scope=repo",
    "mempr://context/MEMORY.md#fragment",
    "mempr://user:pass@context/MEMORY.md",
    "mempr://context",
    "mempr://context/",
    "mempr://context/docs/",
    "mempr://context//MEMORY.md",
    "mempr://context/%00MEMORY.md",
    "mempr://unknown/context/MEMORY.md"
  ]) {
    const response = await probe.request("resources/read", { uri });

    assertJsonRpcError(response, -32602);
    assert.match(
      response.error.message,
      /resource|uri|mempr|unsupported|invalid|not found|unknown|destination/i
    );
    assert.deepEqual(await readWriteSnapshot(root, "docs/MEMORY.md"), before);
    await assertPathMissing(join(root, "docs"));
    assert.equal(await countMemoryExportEvents(root), 0);
  }

  assertJsonRpcOnlyStdout(probe);
});

async function startSeededProbe(t) {
  const root = await mkdtemp(join(tmpdir(), "mempr-mcp-readonly-"));
  const seed = await seedWorkspace(root);
  const probe = new StdioMcpProbe(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
  });

  await initialize(probe);
  probe.notify("notifications/initialized");

  return { probe, root, seed };
}

async function startInitializedProbeForRoot(t, root, options = {}) {
  const probe = new StdioMcpProbe(root, options);

  t.after(async () => {
    await probe.close();
  });

  await initialize(probe);
  probe.notify("notifications/initialized");

  return probe;
}

async function seedWorkspace(root) {
  const acceptedCandidate = await proposePending(root, "Accepted memory for MCP review context.", {
    destination: "MEMORY.md",
    risk: "medium"
  });
  const accepted = JSON.parse((await runCli([
    "accept",
    "--root",
    root,
    "--json",
    acceptedCandidate.id,
    "--reason",
    "Accepted before MCP read-only tests."
  ])).stdout);

  const rejectedCandidate = await proposePending(root, "Rejected memory for MCP review context.", {
    destination: "TEAM.md",
    risk: "high"
  });
  const rejected = JSON.parse((await runCli([
    "reject",
    "--root",
    root,
    "--json",
    rejectedCandidate.id,
    "--reason",
    "Rejected before MCP read-only tests."
  ])).stdout);

  const target = await proposePending(root, "Pending memory for MCP read-only tests.", {
    conflictsWith: rejected.id,
    destination: "MEMORY.md",
    risk: "medium",
    supersedes: accepted.id
  });

  return { accepted, rejected, target };
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

  if (options.ttl) {
    args.push("--ttl", options.ttl);
  }

  const proposed = JSON.parse((await runCli(args)).stdout);
  assert.equal(proposed.status, "pending");
  return proposed;
}

function fixedLegacyAcceptedRecord({
  id,
  memory,
  sourceUri = "manual",
  destination = "MEMORY.md"
}) {
  return {
    schema_version: "mempr-record-v1",
    id,
    memory,
    source: {
      type: "manual",
      uri: sourceUri,
      verification: {
        status: "not_applicable",
        method: "manual",
        checked_at: null,
        reason: "Manual source."
      }
    },
    source_trust: "unknown",
    scope: "repo",
    kind: "fact",
    tags: [],
    confidence: null,
    risk: "low",
    decision: "auto_accept",
    decision_reason: "Legacy accepted test fixture.",
    policy_version: "test",
    destination,
    status: "accepted",
    status_reason: null,
    reviewer: null,
    approved_by: null,
    last_verified_at: null,
    last_used_at: null,
    retention_class: null,
    priority: null,
    applies_to_paths: [],
    ttl: null,
    expires_at: null,
    supersedes: [],
    conflicts_with: [],
    created_at: "2026-05-22T00:00:00.000Z",
    updated_at: "2026-05-22T00:00:00.000Z"
  };
}

async function seedLegacyLedgerMigration(root, record, options = {}) {
  await mkdir(join(root, ".mempr"), { recursive: true });
  await writeFile(join(root, ".mempr", "ledger.jsonl"), `${JSON.stringify(record)}\n`);
  await writeFile(join(root, ".mempr", "events.jsonl"), [
    JSON.stringify({
      id: "evt_legacy_migration_fixture",
      type: "ledger_migrated",
      created_at: "2026-05-22T00:00:00.000Z",
      source: "legacy_ledger_jsonl",
      record_count: 1,
      records: [record]
    }),
    ...(options.extraEvents ?? []).map((event) => JSON.stringify(event))
  ].join("\n") + "\n");
}

async function assertMcpContextRelationshipBlocked(t, parent, {
  relationship,
  issueCode,
  linkedMemory,
  blockingMemory,
  blockingArgs
}) {
  const root = join(parent, relationship);
  await mkdir(root, { recursive: true });
  const linkedQuote = `${linkedMemory} quote.`;
  const blockingQuote = `${blockingMemory} quote.`;
  const linked = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    linkedMemory,
    "--quote",
    linkedQuote,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ])).stdout);
  const blocking = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    blockingMemory,
    "--quote",
    blockingQuote,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--risk",
    "medium",
    "--destination",
    "MEMORY.md",
    ...blockingArgs(linked.id)
  ])).stdout);
  await runCli([
    "accept",
    "--root",
    root,
    blocking.id,
    "--reason",
    `Reviewed MCP context ${relationship} blocker.`
  ]);
  const probe = await startInitializedProbeForRoot(t, root);
  const before = await readWriteSnapshot(root);
  const result = assertToolResult(await callTool(probe, "mempr.context", {
    destination: "MEMORY.md"
  }));

  assert.equal(result.structuredContent.ok, false);
  assert.deepEqual(result.structuredContent.recordIds, []);
  assert.equal(result.structuredContent.recordCount, 0);
  const issue = assertContextIssue(result.structuredContent, issueCode);
  assert.equal(issue.relationship, relationship);
  assert.deepEqual(issue.recordIds, [blocking.id, linked.id]);
  assertNoEcho(`${toolText(result)}\n${JSON.stringify(result.structuredContent.issues)}`, [
    linkedMemory,
    linkedQuote,
    blockingMemory,
    blockingQuote
  ]);

  const resourcePayload = await readJsonResource(probe, "mempr://context/MEMORY.md");
  const resourceContext = resourcePayload.context ?? resourcePayload;
  assert.equal(resourceContext.ok, false);
  assert.deepEqual(resourceContext.recordIds, []);
  const resourceIssue = assertContextIssue(resourceContext, issueCode);
  assert.equal(resourceIssue.relationship, relationship);
  assert.deepEqual(resourceIssue.recordIds, [blocking.id, linked.id]);
  assertNoEcho(JSON.stringify(resourceContext.issues), [
    linkedMemory,
    linkedQuote,
    blockingMemory,
    blockingQuote
  ]);

  assert.deepEqual(await readWriteSnapshot(root), before);
  assert.equal(await countMemoryExportEvents(root), 0);
}

async function assertMcpContextResourceRelationshipBlocked(t, parent, {
  relationship,
  issueCode,
  linkedMemory,
  blockingMemory,
  blockingArgs
}) {
  const root = join(parent, `resource-${relationship}`);
  await mkdir(root, { recursive: true });
  const linkedQuote = `${linkedMemory} quote.`;
  const blockingQuote = `${blockingMemory} quote.`;
  const linked = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    linkedMemory,
    "--quote",
    linkedQuote,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--destination",
    "MEMORY.md"
  ])).stdout);
  const blocking = JSON.parse((await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    blockingMemory,
    "--quote",
    blockingQuote,
    "--source",
    "manual",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--risk",
    "medium",
    "--destination",
    "MEMORY.md",
    ...blockingArgs(linked.id)
  ])).stdout);
  await runCli([
    "accept",
    "--root",
    root,
    blocking.id,
    "--reason",
    `Reviewed MCP resource context ${relationship} blocker.`
  ]);
  const probe = await startInitializedProbeForRoot(t, root);
  const before = await readWriteSnapshot(root);
  const { payload, text } = await readJsonResourceContent(probe, "mempr://context/MEMORY.md");
  const context = contextFromPayload(payload);

  assert.equal(context.ok, false);
  assert.deepEqual(context.recordIds, []);
  assert.equal(context.recordCount, 0);
  const issue = assertContextIssue(context, issueCode);
  assert.equal(issue.relationship, relationship);
  assert.deepEqual(issue.recordIds, [blocking.id, linked.id]);
  assertNoEcho(text, [
    linkedMemory,
    linkedQuote,
    blockingMemory,
    blockingQuote
  ]);
  assert.deepEqual(await readWriteSnapshot(root), before);
  assert.equal(await countMemoryExportEvents(root), 0);
}

function runCli(args) {
  return exec("node", [CLI_PATH, ...args], {
    env: {
      ...process.env,
      NO_COLOR: "1"
    }
  });
}

function callTool(probe, name, args = {}) {
  return probe.request("tools/call", {
    name,
    arguments: args
  });
}

async function readJsonResource(probe, uri) {
  return (await readJsonResourceContent(probe, uri)).payload;
}

async function readJsonResourceContent(probe, uri) {
  const response = await probe.request("resources/read", { uri });

  assertJsonRpcSuccess(response);
  assert(isRecord(response.result));
  assert(Array.isArray(response.result.contents));
  assert.equal(response.result.contents.length, 1);

  const [content] = response.result.contents;
  assert(isRecord(content));
  assert.equal(content.uri, uri);
  assert.equal(content.mimeType, "application/json");
  assert.equal(typeof content.text, "string");

  return {
    payload: JSON.parse(content.text),
    text: content.text
  };
}

function contextFromPayload(payload) {
  const context = payload.context ?? payload;

  assert(isRecord(context), "Expected read-context payload");
  return context;
}

function contextStatusFromPayload(payload) {
  const status = payload.contextStatus ?? payload.status ?? payload;

  assert(isRecord(status), "Expected context-status payload");
  return status;
}

async function initialize(probe) {
  const response = await probe.request("initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: "mempr-mcp-readonly-tests",
      version: "0.0.0"
    }
  });

  assertJsonRpcSuccess(response);
  return response.result;
}

function assertToolResult(response, options = {}) {
  assertJsonRpcSuccess(response);
  assert(isRecord(response.result));
  assert(isRecord(response.result.structuredContent));
  assert(Array.isArray(response.result.content));

  const textItems = response.result.content.filter((item) => {
    return isRecord(item) && item.type === "text" && typeof item.text === "string";
  });
  assert(textItems.length > 0, "Expected at least one text content item.");
  assert(textItems.some((item) => item.text.trim().length > 0), "Expected non-empty text.");

  if (options.isError === true) {
    assert.equal(response.result.isError, true);
  } else {
    assert.notEqual(response.result.isError, true);
  }

  return response.result;
}

function toolText(result) {
  return result.content
    .filter((item) => isRecord(item) && item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
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
  assert.equal(Object.hasOwn(destinationStatus, "safe_content_preview"), false, "status must not include content");
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
  assertNoPermissionDeniedMetadataForNonPermissionIssue(issue, "context status issue");
  return issue;
}

function assertContextIssue(context, code) {
  assert(Array.isArray(context.issues), "context issues must be an array");
  const issue = context.issues.find((candidate) => {
    return isRecord(candidate) && candidate.code === code;
  });

  assert(issue, `Expected context issue ${code}`);
  assert(Array.isArray(issue.recordIds), "context issue must include recordIds");
  assertNoPermissionDeniedMetadataForNonPermissionIssue(issue, "context issue");
  return issue;
}

function assertPermissionDeniedContext(context, privateText, options = {}) {
  assert.equal(context.ok, false);
  assert.deepEqual(context.recordIds, []);
  assert.equal(context.recordCount, 0);
  assert.deepEqual(context.records, []);
  assert(Array.isArray(context.issues), "permission denial must include non-secret issues");
  assert(context.issues.length > 0, "permission denial must report an issue");

  for (const issue of context.issues) {
    assert.deepEqual(issue.recordIds, [], "permission denial must not reveal record ids");
  }

  if (options.code) {
    assert.equal(context.issues[0].code, options.code);
  }
  assertPermissionDeniedIssueMetadata(context, privateText, options);
  assertNoEcho(JSON.stringify(context), privateText);
}

function assertPermissionDeniedIssueMetadata(context, privateText, options = {}) {
  for (const [index, issue] of context.issues.entries()) {
    assert(
      READ_PERMISSION_DENIAL_ISSUE_CODES.has(issue.code),
      `permission denial issue ${index} must use a read permission code`
    );
    const metadata = issue.metadata;

    assert(isRecord(metadata), `permission denial issue ${index} must include metadata`);
    assert.deepEqual(
      Object.keys(metadata).sort(),
      [...READ_PERMISSION_DENIAL_METADATA_KEYS].sort(),
      `permission denial issue ${index} metadata keys`
    );
    assert.equal(metadata.action, "read");
    assert.equal(metadata.surface, "read_context");
    assert.equal(metadata.resource, "context");
    assert.equal(metadata.destination, context.destination);
    assert.deepEqual(metadata.scopes, context.scopes);
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

    if (options.code) {
      assert.equal(issue.code, options.code);
    }
    assertNoForbiddenPermissionDeniedMetadata(metadata, `permission denial issue ${index}`);
    assertNoEcho(JSON.stringify(metadata), privateText);
  }
}

function assertNoForbiddenPermissionDeniedMetadata(value, path) {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoForbiddenPermissionDeniedMetadata(item, `${path}.${index}`);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const key of Object.keys(value)) {
    assert.equal(
      READ_PERMISSION_DENIAL_FORBIDDEN_METADATA_KEYS.includes(key),
      false,
      `${path} must not include ${key}`
    );
    assertNoForbiddenPermissionDeniedMetadata(value[key], `${path}.${key}`);
  }
}

function assertNoPermissionDeniedMetadataForNonPermissionIssue(issue, path) {
  if (READ_PERMISSION_DENIAL_ISSUE_CODES.has(issue.code)) {
    return;
  }

  assert.equal(
    Object.hasOwn(issue, "metadata"),
    false,
    `${path} must not include permission denial metadata`
  );
}

function assertNoPermissionDeniedMetadataInToolResult(result) {
  const text = toolText(result);

  assert.doesNotMatch(text, /\bmetadata\b/);
  assert.doesNotMatch(text, /phase-7l|r5-read-policy|contractVersion|contentReturned|sideEffects/);
  if (result.structuredContent !== undefined) {
    assert.doesNotMatch(
      JSON.stringify(result.structuredContent),
      /phase-7l|r5-read-policy|contractVersion|contentReturned|sideEffects/
    );
  }
}

function assertReadContextBoundary(context) {
  assertObjectKeys(context, READ_CONTEXT_KEYS, "read context");
  assertReadContextIssuesBoundary(context.issues, "read context issues");
  assertReadContextWarningsBoundary(context.warnings, "read context warnings");

  const { records: _records, ...metadata } = context;
  assertNoReadGovernanceMetadata(metadata, "read context metadata");
}

function assertReadContextStatusBoundary(status) {
  assertObjectKeys(status, READ_CONTEXT_STATUS_KEYS, "read context status");
  assertReadContextIssuesBoundary(status.issues, "read context status issues");

  for (const destinationStatus of statusDestinations(status)) {
    assertObjectKeys(
      destinationStatus,
      READ_CONTEXT_DESTINATION_STATUS_KEYS,
      `read context status ${destinationStatus.destination}`
    );
    assertObjectKeys(
      destinationStatus.counts,
      READ_CONTEXT_STATUS_COUNT_KEYS,
      `read context status ${destinationStatus.destination} counts`
    );
    assertReadContextIssuesBoundary(
      destinationStatus.issues,
      `read context status ${destinationStatus.destination} issues`
    );
    assertReadContextWarningsBoundary(
      destinationStatus.warnings,
      `read context status ${destinationStatus.destination} warnings`
    );
  }

  assertNoReadGovernanceMetadata(status, "read context status");
}

function assertReadContextIssuesBoundary(issues, path) {
  assert(Array.isArray(issues), `${path} must be an array`);

  for (const [index, issue] of issues.entries()) {
    const expectedKeys = issue.relationship === undefined
      ? [...READ_CONTEXT_ISSUE_BASE_KEYS]
      : [...READ_CONTEXT_ISSUE_BASE_KEYS, "relationship"];

    if (READ_PERMISSION_DENIAL_ISSUE_CODES.has(issue.code)) {
      expectedKeys.push("metadata");
    } else {
      assertNoPermissionDeniedMetadataForNonPermissionIssue(issue, `${path}.${index}`);
    }

    assertObjectKeys(issue, expectedKeys, `${path}.${index}`);
  }
}

function assertReadContextWarningsBoundary(warnings, path) {
  assert(Array.isArray(warnings), `${path} must be an array`);

  for (const [index, warning] of warnings.entries()) {
    assertObjectKeys(warning, READ_CONTEXT_WARNING_KEYS, `${path}.${index}`);
  }
}

function assertNoReadGovernanceMetadata(value, path) {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoReadGovernanceMetadata(item, `${path}.${index}`);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    assertNoReadGovernanceFieldName(key, `${path}.${key}`);

    if (key === "message" && typeof item === "string") {
      assertNoReadGovernanceMessage(item, `${path}.${key}`);
    }

    assertNoReadGovernanceMetadata(item, `${path}.${key}`);
  }
}

function assertNoReadGovernanceFieldName(value, path) {
  const normalized = normalizeNameForBoundaryCheck(value);

  for (const pattern of READ_GOVERNANCE_FIELD_PATTERNS) {
    assert.doesNotMatch(normalized, pattern, `${path} must not expose read-governance fields`);
  }
}

function assertNoReadGovernanceMessage(value, path) {
  for (const pattern of READ_GOVERNANCE_MESSAGE_PATTERNS) {
    assert.doesNotMatch(value, pattern, `${path} must not claim read-governance enforcement`);
  }
}

function assertObjectKeys(value, expected, label) {
  assert(isRecord(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys changed`);
}

function assertNoEcho(value, privateText) {
  for (const text of privateText) {
    assert.doesNotMatch(value, new RegExp(escapeRegExp(text)));
  }
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

function normalizeNameForBoundaryCheck(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./:-]+/g, " ");
}

function assertJsonRpcSuccess(response) {
  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  assert.equal(typeof response.result, "object");
}

function assertJsonRpcError(response, code) {
  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.result, undefined);
  assert.equal(response.error?.code, code, JSON.stringify(response.error));
  assert.equal(typeof response.error?.message, "string");
}

async function readWriteSnapshot(root, destination = "MEMORY.md") {
  return {
    events: await readOptional(join(root, ".mempr", "events.jsonl")),
    ledger: await readOptional(join(root, ".mempr", "ledger.jsonl")),
    destination: await readOptional(join(root, destination))
  };
}

async function countMemoryExportEvents(root) {
  const events = await readOptional(join(root, ".mempr", "events.jsonl"));

  if (!events) {
    return 0;
  }

  return events
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line))
    .filter((event) => event.type === "memory_exported")
    .length;
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

function assertJsonRpcOnlyStdout(probe) {
  assert(probe.stdoutLines.length > 0, "Expected at least one JSON-RPC stdout line.");

  for (const [index, line] of probe.stdoutLines.entries()) {
    let message;

    assert.doesNotThrow(() => {
      message = JSON.parse(line);
    }, `stdout line ${index + 1} is not JSON: ${line}`);

    assert.equal(message.jsonrpc, "2.0", `stdout line ${index + 1} is not JSON-RPC 2.0`);
    assert(
      Object.hasOwn(message, "id") || typeof message.method === "string",
      `stdout line ${index + 1} is neither a JSON-RPC response nor notification`
    );
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class StdioMcpProbe {
  constructor(root, options = {}) {
    this.root = root;
    this.nextId = 1;
    this.messages = [];
    this.stdoutLines = [];
    this.stdoutText = "";
    this.stderrText = "";
    this.stdoutBuffer = "";
    this.responses = new Map();
    this.responseWaiters = new Map();
    this.messageWaiters = [];
    this.exit = undefined;
    this.child = spawn(process.execPath, [MCP_STDIO_PATH], {
      cwd: root,
      env: {
        ...process.env,
        ...(options.env ?? {}),
        MEMPR_ROOT: root,
        MEMPR_WORKSPACE_ROOT: root,
        NO_COLOR: "1"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderrText += chunk;
    });
    this.child.stdin.on("error", () => {
      // Pending response assertions include stdout/stderr context.
    });
    this.child.on("exit", (code, signal) => {
      this.exit = { code, signal };
      this.rejectPending(new Error(this.describeFailure("MCP server exited before responding")));
    });
    this.child.on("error", (error) => {
      this.rejectPending(error);
    });
  }

  request(method, params = {}) {
    const id = this.nextId++;
    const pending = this.waitForResponse(id, `${method} response`);

    this.writeJson({ jsonrpc: "2.0", id, method, params });

    return pending;
  }

  notify(method, params = {}) {
    this.writeJson({ jsonrpc: "2.0", method, params });
  }

  writeJson(message) {
    this.writeRaw(`${JSON.stringify(message)}\n`);
  }

  writeRaw(payload) {
    if (this.child.stdin.destroyed) {
      return;
    }

    this.child.stdin.write(payload);
  }

  waitForResponse(id, label) {
    const existing = this.responses.get(id);

    if (existing) {
      this.responses.delete(id);
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.responseWaiters.delete(id);
        reject(new Error(this.describeFailure(`Timed out waiting for ${label}`)));
      }, RESPONSE_TIMEOUT_MS);

      this.responseWaiters.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
    });
  }

  handleStdout(chunk) {
    this.stdoutText += chunk;
    this.stdoutBuffer += chunk;

    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        this.handleStdoutLine(line);
      }

      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  handleStdoutLine(line) {
    this.stdoutLines.push(line);

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    this.messages.push(message);

    if (Object.hasOwn(message, "id")) {
      const waiter = this.responseWaiters.get(message.id);

      if (waiter) {
        this.responseWaiters.delete(message.id);
        waiter.resolve(message);
      } else {
        this.responses.set(message.id, message);
      }
    }

    for (const waiter of [...this.messageWaiters]) {
      if (waiter.predicate(message)) {
        this.messageWaiters = this.messageWaiters.filter((current) => current !== waiter);
        waiter.resolve(message);
      }
    }
  }

  rejectPending(error) {
    for (const waiter of this.responseWaiters.values()) {
      waiter.reject(error);
    }
    this.responseWaiters.clear();

    for (const waiter of this.messageWaiters) {
      waiter.reject(error);
    }
    this.messageWaiters = [];
  }

  describeFailure(message) {
    const exit = this.exit
      ? `exit code ${this.exit.code}, signal ${this.exit.signal}`
      : "still running";

    return [
      message,
      `server: ${MCP_STDIO_PATH}`,
      `process: ${exit}`,
      `stdout: ${JSON.stringify(this.stdoutText)}`,
      `stderr: ${JSON.stringify(this.stderrText)}`
    ].join("\n");
  }

  async close() {
    await closeChildProcess(this.child);
  }

  hasExited() {
    return this.exit !== undefined
      || this.child.exitCode !== null
      || this.child.signalCode !== null;
  }

  async waitForExit(timeoutMs) {
    if (this.hasExited()) {
      return;
    }

    await Promise.race([once(this.child, "exit"), delay(timeoutMs)]);
  }

  destroyStdioStreams() {
    this.child.stdin.destroy();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
  }
}
