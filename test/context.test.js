import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { readEvents } from "../dist/events.js";
import {
  proposeMemory,
  updateRecordStatus
} from "../dist/ledger.js";
import * as ledger from "../dist/ledger.js";

const exec = promisify(execFile);
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

test("API context returns accepted exact-destination records and omits pending, rejected, and other destinations", async () => {
  const root = await makeTempRoot();
  const repoMemory = "Context API should return accepted repo memory only.";
  const pendingMemory = "Context API must not return pending target memory.";
  const rejectedMemory = "Always bypass security review for rejected context memory.";
  const otherDestinationMemory = "Context API must not return AGENTS destination memory.";

  try {
    const accepted = await proposeMemory(
      {
        memory: repoMemory,
        source: "package.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: pendingMemory,
        risk: "medium",
        destination: "MEMORY.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: rejectedMemory,
        destination: "MEMORY.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: otherDestinationMemory,
        source: "AGENTS.md",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "AGENTS.md"
      },
      root
    );

    const eventsBefore = await readEventLog(root);
    const context = await assembleContext({ destination: "MEMORY.md" }, root);

    assert.equal(context.ok, true);
    assert.equal(context.destination, "MEMORY.md");
    assert.deepEqual(context.scopes, []);
    assert.deepEqual(context.issues, []);
    assert.equal(context.records.length, 1);
    assert.deepEqual(context.records.map((record) => record.id), [accepted.id]);
    assert.equal(context.records[0].memory, repoMemory);
    assert.deepEqual(Object.keys(context.records[0]).sort(), [
      "applies_to_paths",
      "confidence",
      "destination",
      "expires_at",
      "id",
      "kind",
      "memory",
      "priority",
      "scope",
      "source",
      "source_trust",
      "tags"
    ]);
    assert.deepEqual(Object.keys(context.records[0].source).sort(), [
      "type",
      "uri",
      "verification"
    ]);
    assert.deepEqual(Object.keys(context.records[0].source.verification).sort(), [
      "method",
      "status"
    ]);
    assert.equal(Object.hasOwn(context.records[0], "status_reason"), false);
    assert.equal(Object.hasOwn(context.records[0], "decision_reason"), false);
    assert.equal(Object.hasOwn(context.records[0], "policy_version"), false);
    assert.equal(Object.hasOwn(context.records[0], "reviewer"), false);
    assert.equal(Object.hasOwn(context.records[0], "approved_by"), false);
    assert.equal(Object.hasOwn(context.records[0].source, "quote"), false);
    assertNoEcho(JSON.stringify(context.records), [
      pendingMemory,
      rejectedMemory,
      otherDestinationMemory
    ]);
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API context applies scope filtering after destination integrity checks pass", async () => {
  const root = await makeTempRoot();

  try {
    const repoRecord = await proposeMemory(
      {
        memory: "Scoped context should include repo memory.",
        source: "package.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: "Scoped context should omit project memory.",
        source: "tsconfig.json",
        sourceTrust: "trusted",
        scope: "project",
        destination: "MEMORY.md"
      },
      root
    );

    const context = await assembleContext(
      { destination: "MEMORY.md", scope: "repo" },
      root
    );

    assert.equal(context.ok, true);
    assert.deepEqual(context.scopes, ["repo"]);
    assert.equal(context.records.length, 1);
    assert.deepEqual(context.records.map((record) => record.scope), ["repo"]);
    assert.deepEqual(context.records.map((record) => record.id), [repoRecord.id]);
    assertNoEcho(JSON.stringify(context.records), ["Scoped context should omit project memory."]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API context opt-in permission constraint narrows accepted scopes without changing default reads", async () => {
  const root = await makeTempRoot();
  const repoMemory = "Permissioned API context repo preference.";
  const projectMemory = "Permissioned API context project preference.";
  const userMemory = "Permissioned API context user preference.";

  try {
    const repoRecord = await proposeMemory(
      {
        memory: repoMemory,
        quote: `${repoMemory} quote.`,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    const projectRecord = await proposeMemory(
      {
        memory: projectMemory,
        quote: `${projectMemory} quote.`,
        source: "manual",
        sourceTrust: "trusted",
        scope: "project",
        destination: "MEMORY.md"
      },
      root
    );
    const userRecord = await proposeMemory(
      {
        memory: userMemory,
        quote: `${userMemory} quote.`,
        source: "manual",
        scope: "user",
        destination: "MEMORY.md"
      },
      root
    );
    await updateRecordStatus(
      userRecord.id,
      "accepted",
      "Accepted unallowed scope for permission filtering.",
      root
    );

    const eventsBefore = await readEventLog(root);
    const defaultContext = await assembleContext({ destination: "MEMORY.md" }, root);
    const allowedContext = await assembleContext(
      {
        destination: "MEMORY.md",
        actor: "local-agent:phase-7h",
        allowedScopes: ["repo", "project"]
      },
      root
    );
    const requestedAllowedContext = await assembleContext(
      {
        destination: "MEMORY.md",
        actor: "local-agent:phase-7h",
        allowedScopes: ["repo", "project"],
        scopes: ["project"]
      },
      root
    );

    assert.equal(defaultContext.ok, true);
    assert.deepEqual(defaultContext.recordIds, [repoRecord.id, projectRecord.id, userRecord.id]);
    assert.deepEqual(defaultContext.records.map((record) => record.memory), [
      repoMemory,
      projectMemory,
      userMemory
    ]);

    assert.equal(allowedContext.ok, true);
    assert.deepEqual(allowedContext.recordIds, [repoRecord.id, projectRecord.id]);
    assert.deepEqual(allowedContext.records.map((record) => record.scope), ["repo", "project"]);
    assertNoEcho(JSON.stringify(allowedContext), [userMemory]);

    assert.equal(requestedAllowedContext.ok, true);
    assert.deepEqual(requestedAllowedContext.scopes, ["project"]);
    assert.deepEqual(requestedAllowedContext.recordIds, [projectRecord.id]);
    assert.deepEqual(requestedAllowedContext.records.map((record) => record.scope), ["project"]);
    assertNoEcho(JSON.stringify(requestedAllowedContext), [repoMemory, userMemory]);
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API context actor labels are caller-asserted and not inferred from identity hints", async () => {
  const root = await makeTempRoot();
  const repoMemory = "API Phase 7L actor-boundary memory must stay private on denial.";
  const repoQuote = "API Phase 7L actor-boundary quote must stay private on denial.";
  const callerActor = "phase-7l-api-caller-asserted";
  const alternateActor = "phase-7l-api-alternate-caller";
  const hintedActor = "phase-7l-api-env-or-session-actor";
  const hintedSession = "phase-7l-api-session-id";
  const hintedOauth = "phase-7l-api-oauth-subject";
  const hintedGrant = "phase-7l-api-grant";

  try {
    const record = await proposeMemory(
      {
        memory: repoMemory,
        quote: repoQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );

    const eventsBefore = await readEventLog(root);
    const defaultContext = await assembleContext(
      {
        destination: "MEMORY.md",
        identity: hintedActor,
        sessionId: hintedSession,
        oauthSubject: hintedOauth,
        grant: hintedGrant
      },
      root
    );
    const status = await assembleContextStatus(
      {
        destination: "MEMORY.md",
        identity: hintedActor,
        sessionId: hintedSession,
        oauthSubject: hintedOauth,
        grant: hintedGrant
      },
      root
    );
    const callerContext = await assembleContext(
      {
        destination: "MEMORY.md",
        readPermission: {
          actor: callerActor,
          allowedScopes: ["repo"],
          sessionId: hintedSession,
          oauthSubject: hintedOauth,
          grant: hintedGrant
        }
      },
      root
    );
    const alternateContext = await assembleContext(
      {
        destination: "MEMORY.md",
        readPermission: {
          actor: alternateActor,
          allowedScopes: ["repo"],
          sessionId: hintedSession,
          oauthSubject: hintedOauth,
          grant: hintedGrant
        }
      },
      root
    );
    const missingActorContext = await assembleContext(
      {
        destination: "MEMORY.md",
        readPermission: {
          allowedScopes: ["repo"],
          identity: hintedActor,
          sessionId: hintedSession,
          oauthSubject: hintedOauth,
          grant: hintedGrant
        },
        scopes: ["repo"]
      },
      root
    );

    assert.equal(defaultContext.ok, true);
    assert.deepEqual(defaultContext.recordIds, [record.id]);
    assert.equal(status.ok, true);
    assert.equal(status.blocked, false);
    assert.deepEqual(assertDestinationStatus(status, "MEMORY.md").acceptedRecordIds, [record.id]);

    assert.equal(callerContext.ok, true);
    assert.equal(alternateContext.ok, true);
    assert.deepEqual(callerContext.recordIds, [record.id]);
    assert.deepEqual(alternateContext.recordIds, callerContext.recordIds);
    assert.deepEqual(alternateContext.records, callerContext.records);
    assertNoEcho(JSON.stringify(callerContext), [
      callerActor,
      hintedActor,
      hintedSession,
      hintedOauth,
      hintedGrant
    ]);
    assertNoEcho(JSON.stringify(alternateContext), [
      alternateActor,
      hintedActor,
      hintedSession,
      hintedOauth,
      hintedGrant
    ]);

    assertPermissionDeniedContext(missingActorContext, [
      repoMemory,
      repoQuote,
      hintedActor,
      hintedSession,
      hintedOauth,
      hintedGrant
    ], { code: "read_permission_missing_actor" });
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API context opt-in permission constraint fails closed for disallowed or incomplete scopes", async () => {
  const root = await makeTempRoot();
  const repoMemory = "Denied permissioned API context must not echo repo memory.";
  const repoQuote = "Denied permissioned API context must not echo repo quote.";
  const projectMemory = "Denied permissioned API context must not echo project memory.";
  const projectQuote = "Denied permissioned API context must not echo project quote.";
  const validUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  try {
    await proposeMemory(
      {
        memory: repoMemory,
        quote: repoQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: projectMemory,
        quote: projectQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "project",
        destination: "MEMORY.md"
      },
      root
    );

    const eventsBefore = await readEventLog(root);
    const deniedContexts = [
      {
        context: await assembleContext(
          {
            destination: "MEMORY.md",
            actor: "local-agent:phase-7h",
            allowedScopes: ["repo"],
            scopes: ["repo", "project"]
          },
          root
        ),
        code: "invalid_scope"
      },
      {
        context: await assembleContext(
          {
            destination: "MEMORY.md",
            allowedScopes: ["repo"],
            scopes: ["repo"]
          },
          root
        ),
        code: "read_permission_missing_actor"
      },
      {
        context: await assembleContext(
          {
            destination: "MEMORY.md",
            actor: "local-agent:phase-7h",
            scopes: ["repo"]
          },
          root
        ),
        code: "read_permission_missing_allowed_scopes"
      },
      {
        context: await assembleContext(
          {
            destination: "MEMORY.md",
            readPermission: {
              validUntil
            },
            scopes: ["repo"]
          },
          root
        ),
        code: "read_permission_missing_actor"
      },
      {
        context: await assembleContext(
          {
            destination: "MEMORY.md",
            readPermission: {
              actor: "local-agent:phase-7i",
              validUntil
            },
            scopes: ["repo"]
          },
          root
        ),
        code: "read_permission_missing_allowed_scopes"
      },
      {
        context: await assembleContext(
          {
            destination: "MEMORY.md",
            readPermission: {
              allowedScopes: ["repo"],
              validUntil
            },
            scopes: ["repo"]
          },
          root
        ),
        code: "read_permission_missing_actor"
      }
    ];

    for (const { context, code } of deniedContexts) {
      assertPermissionDeniedContext(context, [
        repoMemory,
        repoQuote,
        projectMemory,
        projectQuote
      ], { code });
    }
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API context opt-in permission expiry constraint narrows records and warnings", async () => {
  const root = await makeTempRoot();
  const soonMemory = "API permission expiry should filter soon-expiring memory.";
  const exactMemory = "API permission expiry should filter exact-threshold memory.";
  const scopeFilteredMemory = "API permission expiry should not warn on scope-filtered memory.";
  const longMemory = "API permission expiry should keep long-lived memory.";
  const noExpiryMemory = "API permission expiry should keep no-expiry memory.";
  const soonExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const validUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  try {
    const soonRecord = await proposeMemory(
      {
        memory: soonMemory,
        source: "package.json",
        sourceTrust: "trusted",
        scope: "repo",
        ttl: soonExpiry,
        destination: "MEMORY.md"
      },
      root
    );
    const longRecord = await proposeMemory(
      {
        memory: longMemory,
        source: "tsconfig.json",
        sourceTrust: "trusted",
        scope: "repo",
        ttl: "2099-06-01T00:00:00Z",
        destination: "MEMORY.md"
      },
      root
    );
    const noExpiryRecord = await proposeMemory(
      {
        memory: noExpiryMemory,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    const exactRecord = await proposeMemory(
      {
        memory: exactMemory,
        source: "package-lock.json",
        sourceTrust: "trusted",
        scope: "repo",
        ttl: validUntil,
        destination: "MEMORY.md"
      },
      root
    );
    const scopeFilteredRecord = await proposeMemory(
      {
        memory: scopeFilteredMemory,
        source: "docs/MEMORY.md",
        sourceTrust: "trusted",
        scope: "project",
        ttl: soonExpiry,
        destination: "MEMORY.md"
      },
      root
    );

    const eventsBefore = await readEventLog(root);
    const defaultContext = await assembleContext({ destination: "MEMORY.md" }, root);
    const constrainedContext = await assembleContext(
      {
        destination: "MEMORY.md",
        readPermission: {
          actor: "local-agent:phase-7i",
          allowedScopes: ["repo"],
          validUntil
        }
      },
      root
    );
    const invalidContext = await assembleContext(
      {
        destination: "MEMORY.md",
        readPermission: {
          actor: "local-agent:phase-7i",
          allowedScopes: ["repo"],
          validUntil: "not an expiry"
        }
      },
      root
    );

    assert.equal(defaultContext.ok, true);
    for (const record of [soonRecord, exactRecord, scopeFilteredRecord]) {
      assert(
        defaultContext.warnings.some((warning) => warning.recordIds.includes(record.id)),
        `default reads should still warn for ${record.id}`
      );
    }
    assert.deepEqual(defaultContext.recordIds, [
      soonRecord.id,
      longRecord.id,
      noExpiryRecord.id,
      exactRecord.id,
      scopeFilteredRecord.id
    ]);

    assert.equal(constrainedContext.ok, true);
    assert.deepEqual(constrainedContext.recordIds, [longRecord.id, noExpiryRecord.id]);
    assert.deepEqual(constrainedContext.warnings, []);
    assertNoEcho(JSON.stringify(constrainedContext), [
      soonMemory,
      exactMemory,
      scopeFilteredMemory
    ]);

    assertPermissionDeniedContext(invalidContext, [
      soonMemory,
      exactMemory,
      scopeFilteredMemory,
      longMemory,
      noExpiryMemory
    ], { code: "read_permission_invalid_expiry_constraint" });
    assert.equal(invalidContext.issues[0].code, "read_permission_invalid_expiry_constraint");
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API context opt-in permission relationship constraints narrow records after scope and expiry", async () => {
  const root = await makeTempRoot();
  const cleanMemory = "API relationship permission should keep unrelated memory.";
  const conflictMemory = "API relationship permission should filter own conflict memory.";
  const supersedingMemory = "API relationship permission should filter own supersession memory.";
  const scopeFilteredMemory = "API relationship permission should not leak scoped conflict memory.";
  const expiringMemory = "API relationship permission should not warn on expiring conflict memory.";
  const anchorMemory = "API relationship permission anchor must stay out of target context.";
  const soonExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const validUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  try {
    const anchor = await proposeMemory(
      {
        memory: anchorMemory,
        source: "AGENTS.md",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "AGENTS.md"
      },
      root
    );
    const cleanRecord = await proposeMemory(
      {
        memory: cleanMemory,
        source: "package.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    const conflictRecord = await proposeMemory(
      {
        memory: conflictMemory,
        source: "tsconfig.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        conflictsWith: [anchor.id]
      },
      root
    );
    const supersedingRecord = await proposeMemory(
      {
        memory: supersedingMemory,
        source: "package-lock.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        supersedes: [anchor.id]
      },
      root
    );
    const scopeFilteredRecord = await proposeMemory(
      {
        memory: scopeFilteredMemory,
        source: "docs/MEMORY.md",
        sourceTrust: "trusted",
        scope: "project",
        destination: "MEMORY.md",
        conflictsWith: [anchor.id]
      },
      root
    );
    const expiringRecord = await proposeMemory(
      {
        memory: expiringMemory,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        ttl: soonExpiry,
        destination: "MEMORY.md",
        conflictsWith: [anchor.id]
      },
      root
    );
    await updateRecordStatus(
      conflictRecord.id,
      "accepted",
      "Accepted cross-destination conflict for relationship filtering.",
      root
    );
    await updateRecordStatus(
      supersedingRecord.id,
      "accepted",
      "Accepted cross-destination supersession for relationship filtering.",
      root
    );
    await updateRecordStatus(
      scopeFilteredRecord.id,
      "accepted",
      "Accepted scoped relationship record for permission filtering.",
      root
    );
    await updateRecordStatus(
      expiringRecord.id,
      "accepted",
      "Accepted expiring relationship record for permission filtering.",
      root
    );

    const eventsBefore = await readEventLog(root);
    const defaultContext = await assembleContext({ destination: "MEMORY.md" }, root);
    const constrainedContext = await assembleContext(
      {
        destination: "MEMORY.md",
        readPermission: {
          actor: "local-agent:phase-7j",
          allowedScopes: ["repo"],
          validUntil,
          excludeConflicts: true,
          excludeSupersedes: true
        }
      },
      root
    );
    const invalidConflictContext = await assembleContext(
      {
        destination: "MEMORY.md",
        readPermission: {
          actor: "local-agent:phase-7j",
          allowedScopes: ["repo"],
          excludeConflicts: "true"
        }
      },
      root
    );
    const invalidSupersedesContext = await assembleContext(
      {
        destination: "MEMORY.md",
        readPermission: {
          actor: "local-agent:phase-7j",
          allowedScopes: ["repo"],
          excludeSupersedes: 1
        }
      },
      root
    );

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
      "default reads should still warn for expiring relationship records"
    );

    assert.equal(constrainedContext.ok, true);
    assert.deepEqual(constrainedContext.recordIds, [cleanRecord.id]);
    assert.deepEqual(constrainedContext.records.map((record) => record.memory), [cleanMemory]);
    assert.deepEqual(constrainedContext.warnings, []);
    assertNoEcho(JSON.stringify(constrainedContext), [
      conflictMemory,
      supersedingMemory,
      scopeFilteredMemory,
      expiringMemory,
      anchorMemory
    ]);

    for (const context of [invalidConflictContext, invalidSupersedesContext]) {
      assertPermissionDeniedContext(context, [
        cleanMemory,
        conflictMemory,
        supersedingMemory,
        scopeFilteredMemory,
        expiringMemory,
        anchorMemory
      ], { code: "read_permission_invalid_relationship_constraint" });
      assert.equal(context.issues[0].code, "read_permission_invalid_relationship_constraint");
    }
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API context-status ignores read-context permission expiry constraints", async () => {
  const root = await makeTempRoot();
  const expiringMemory = "API status must not echo permission-expiring memory.";
  const projectMemory = "API status must not apply permission scope filters.";
  const validUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  try {
    const expiringRecord = await proposeMemory(
      {
        memory: expiringMemory,
        source: "package.json",
        sourceTrust: "trusted",
        scope: "repo",
        ttl: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        destination: "MEMORY.md"
      },
      root
    );
    const projectRecord = await proposeMemory(
      {
        memory: projectMemory,
        source: "tsconfig.json",
        sourceTrust: "trusted",
        scope: "project",
        destination: "MEMORY.md"
      },
      root
    );
    const before = await readReadOnlySnapshot(root, "MEMORY.md");

    const status = await assembleContextStatus({
      destination: "MEMORY.md",
      readPermission: {
        actor: "local-agent:phase-7i",
        allowedScopes: ["repo"],
        validUntil
      }
    }, root);
    const destinationStatus = assertDestinationStatus(status, "MEMORY.md");

    assert.equal(status.ok, true);
    assert.equal(destinationStatus.ok, true);
    assert.deepEqual(destinationStatus.acceptedRecordIds, [
      expiringRecord.id,
      projectRecord.id
    ]);
    assert.deepEqual(destinationStatus.warnings.map((warning) => warning.recordIds), [
      [expiringRecord.id]
    ]);
    assertNoEcho(JSON.stringify(status), [expiringMemory, projectMemory]);
    await assertStatusReadOnly(root, "MEMORY.md", before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API context fails closed for expired accepted target records before scope filtering", async () => {
  const root = await makeTempRoot();
  const expiredMemory = "Do not echo expired context memory.";
  const expiredQuote = "Do not echo expired context quote.";

  try {
    const expired = await proposeMemory(
      {
        memory: expiredMemory,
        quote: expiredQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "project",
        destination: "MEMORY.md",
        ttl: "2000-01-01"
      },
      root
    );
    await proposeMemory(
      {
        memory: "Fresh repo memory cannot hide an expired project record.",
        source: "package.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );

    const eventsBefore = await readEventLog(root);
    const context = await assembleContext(
      {
        destination: "MEMORY.md",
        scope: "repo",
        readPermission: {
          actor: "local-agent:phase-7i",
          allowedScopes: ["repo"],
          validUntil: "2099-01-01T00:00:00Z"
        }
      },
      root
    );

    assert.equal(context.ok, false);
    assert.deepEqual(context.records, []);
    assert.deepEqual(context.warnings, []);
    const issue = assertIssue(context, /expired|stale/i);
    assert.deepEqual(issue.recordIds, [expired.id]);
    assertNoEcho(JSON.stringify(context.issues), [expiredMemory, expiredQuote]);
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API context fails closed for accepted same-destination conflict and supersession pairs", async () => {
  await assertRelationshipContextBlocked({
    relationship: "conflicts_with",
    issuePattern: /conflict/i,
    linkedMemory: "Do not echo linked conflict context memory.",
    blockingMemory: "Do not echo blocking conflict context memory.",
    blockingInput: (linkedId) => ({ conflictsWith: [linkedId] })
  });

  await assertRelationshipContextBlocked({
    relationship: "supersedes",
    issuePattern: /supersed|supersession/i,
    linkedMemory: "Do not echo linked superseded context memory.",
    blockingMemory: "Do not echo blocking replacement context memory.",
    blockingInput: (linkedId) => ({ supersedes: [linkedId] })
  });
});

test("API context relationship exclusions do not bypass accepted same-destination blockers", async () => {
  const readPermission = {
    actor: "local-agent:phase-7j",
    allowedScopes: ["repo"],
    excludeConflicts: true,
    excludeSupersedes: true
  };

  await assertRelationshipContextBlocked({
    relationship: "conflicts_with",
    issuePattern: /conflict/i,
    linkedMemory: "Do not echo linked conflict despite exclusion memory.",
    blockingMemory: "Do not echo blocking conflict despite exclusion memory.",
    blockingInput: (linkedId) => ({ conflictsWith: [linkedId] }),
    contextOptions: { readPermission }
  });

  await assertRelationshipContextBlocked({
    relationship: "supersedes",
    issuePattern: /supersed|supersession/i,
    linkedMemory: "Do not echo linked superseded despite exclusion memory.",
    blockingMemory: "Do not echo blocking supersession despite exclusion memory.",
    blockingInput: (linkedId) => ({ supersedes: [linkedId] }),
    contextOptions: { readPermission }
  });
});

test("API context is read-only for nested destinations and does not create directories or export events", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeMemory(
      {
        memory: "Nested context reads must not create destination directories.",
        source: "docs/MEMORY.md",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "docs/MEMORY.md"
      },
      root
    );
    const eventsBefore = await readEventLog(root);

    const context = await assembleContext(
      { destination: "docs/MEMORY.md", scope: "repo" },
      root
    );

    assert.equal(context.ok, true);
    assert.deepEqual(context.records.map((candidate) => candidate.id), [record.id]);
    await assertPathMissing(join(root, "docs"));
    await assertContextReadOnly(root, "docs/MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API context status summarizes destination readiness without leaking memory text", async () => {
  const root = await makeTempRoot();
  const acceptedMemory = "Status API must not echo accepted target memory.";
  const acceptedQuote = "Status API must not echo accepted target quote.";
  const pendingMemory = "Status API must not echo pending target memory.";
  const rejectedMemory = "Status API must not echo rejected target memory.";
  const otherDestinationMemory = "Status API must not echo accepted AGENTS memory.";
  const nestedMemory = "Status API must not echo accepted nested memory.";

  try {
    const accepted = await proposeMemory(
      {
        memory: acceptedMemory,
        quote: acceptedQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: pendingMemory,
        risk: "medium",
        destination: "MEMORY.md"
      },
      root
    );
    const rejected = await proposeMemory(
      {
        memory: rejectedMemory,
        risk: "high",
        destination: "MEMORY.md"
      },
      root
    );
    await updateRecordStatus(rejected.id, "rejected", "Rejected before context status.", root);
    const otherDestination = await proposeMemory(
      {
        memory: otherDestinationMemory,
        source: "AGENTS.md",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "AGENTS.md"
      },
      root
    );
    const nested = await proposeMemory(
      {
        memory: nestedMemory,
        source: "docs/MEMORY.md",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "docs/MEMORY.md"
      },
      root
    );
    const before = await readReadOnlySnapshot(root, "docs/MEMORY.md");

    const status = await assembleContextStatus({}, root);

    assert.equal(status.ok, true);
    assert.equal(status.blocked, false);
    assert.equal(status.destination, null);
    assert.equal(status.destinationCount, 3);
    assert.equal(status.blockedCount, 0);
    const defaultStatus = assertDestinationStatus(status, "MEMORY.md");
    assert.equal(defaultStatus.ok, true);
    assertStatusCounts(defaultStatus, { total: 3, accepted: 1, pending: 1, rejected: 1 });
    assert.deepEqual(defaultStatus.acceptedRecordIds, [accepted.id]);
    assert.deepEqual(defaultStatus.issues, []);

    const agentsStatus = assertDestinationStatus(status, "AGENTS.md");
    assert.equal(agentsStatus.ok, true);
    assertStatusCounts(agentsStatus, { total: 1, accepted: 1, pending: 0, rejected: 0 });
    assert.deepEqual(agentsStatus.acceptedRecordIds, [otherDestination.id]);

    const nestedStatus = assertDestinationStatus(status, "docs/MEMORY.md");
    assert.equal(nestedStatus.ok, true);
    assertStatusCounts(nestedStatus, { total: 1, accepted: 1, pending: 0, rejected: 0 });
    assert.deepEqual(nestedStatus.acceptedRecordIds, [nested.id]);

    assertNoEcho(JSON.stringify(status), [
      acceptedMemory,
      acceptedQuote,
      pendingMemory,
      rejectedMemory,
      otherDestinationMemory,
      nestedMemory
    ]);
    await assertStatusReadOnly(root, "docs/MEMORY.md", before);
    await assertPathMissing(join(root, "docs"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API context status exact destination filter reports expired blockers without content", async () => {
  const root = await makeTempRoot();
  const expiredMemory = "Status API must not echo expired target memory.";
  const expiredQuote = "Status API must not echo expired target quote.";
  const freshMemory = "Status API must not echo fresh target memory.";
  const pendingMemory = "Status API must not echo pending target blocker memory.";
  const rejectedMemory = "Status API must not echo rejected target blocker memory.";
  const otherDestinationMemory = "Status API must not echo other destination memory.";

  try {
    const expired = await proposeMemory(
      {
        memory: expiredMemory,
        quote: expiredQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        ttl: "2000-01-01"
      },
      root
    );
    const fresh = await proposeMemory(
      {
        memory: freshMemory,
        source: "tsconfig.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: pendingMemory,
        risk: "medium",
        destination: "MEMORY.md"
      },
      root
    );
    const rejected = await proposeMemory(
      {
        memory: rejectedMemory,
        risk: "high",
        destination: "MEMORY.md"
      },
      root
    );
    await updateRecordStatus(rejected.id, "rejected", "Rejected before context status.", root);
    await proposeMemory(
      {
        memory: otherDestinationMemory,
        source: "AGENTS.md",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "AGENTS.md"
      },
      root
    );
    const before = await readReadOnlySnapshot(root, "MEMORY.md");

    const status = await assembleContextStatus({ destination: "MEMORY.md" }, root);

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
    assertNoEcho(JSON.stringify(status), [
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

test("API context status blocks accepted same-destination conflict and supersession pairs", async () => {
  await assertRelationshipContextStatusBlocked({
    relationship: "conflicts_with",
    issueCode: "relationship_conflict",
    linkedMemory: "Status API must not echo linked conflict memory.",
    blockingMemory: "Status API must not echo blocking conflict memory.",
    blockingInput: (linkedId) => ({ conflictsWith: [linkedId] })
  });

  await assertRelationshipContextStatusBlocked({
    relationship: "supersedes",
    issueCode: "relationship_supersession",
    linkedMemory: "Status API must not echo linked superseded memory.",
    blockingMemory: "Status API must not echo blocking supersession memory.",
    blockingInput: (linkedId) => ({ supersedes: [linkedId] })
  });
});

test("API context and status warn on accepted records approaching expiry without blocking", async () => {
  const root = await makeTempRoot();
  const expiringMemory = "Context warning must not echo expiring memory in warning metadata.";
  const expiringQuote = "Context warning must not echo expiring quote.";
  const farMemory = "Context warning must not warn on far future memory.";
  const pendingMemory = "Context warning must not warn on pending memory.";
  const rejectedMemory = "Context warning must not warn on rejected memory.";
  const otherDestinationMemory = "Context warning must not warn on other destination memory.";

  try {
    const expiring = await proposeMemory(
      {
        memory: expiringMemory,
        quote: expiringQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "project",
        destination: "MEMORY.md",
        ttl: expiryDaysFromNow(3)
      },
      root
    );
    const far = await proposeMemory(
      {
        memory: farMemory,
        source: "tsconfig.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        ttl: expiryDaysFromNow(30)
      },
      root
    );
    await proposeMemory(
      {
        memory: pendingMemory,
        risk: "medium",
        destination: "MEMORY.md",
        ttl: expiryDaysFromNow(3)
      },
      root
    );
    const rejected = await proposeMemory(
      {
        memory: rejectedMemory,
        risk: "high",
        destination: "MEMORY.md",
        ttl: expiryDaysFromNow(3)
      },
      root
    );
    await updateRecordStatus(rejected.id, "rejected", "Rejected before context warning.", root);
    await proposeMemory(
      {
        memory: otherDestinationMemory,
        source: "AGENTS.md",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "AGENTS.md",
        ttl: expiryDaysFromNow(3)
      },
      root
    );
    const before = await readReadOnlySnapshot(root, "MEMORY.md");

    const context = await assembleContext({ destination: "MEMORY.md", scope: "repo" }, root);
    const status = await assembleContextStatus({ destination: "MEMORY.md" }, root);
    const destinationStatus = assertDestinationStatus(status, "MEMORY.md");

    assert.equal(context.ok, true);
    assert.deepEqual(context.recordIds, [far.id]);
    assert.deepEqual(context.issues, []);
    assert.deepEqual(context.warnings.map((warning) => warning.code), ["expiring_record"]);
    assert.deepEqual(context.warnings[0].recordIds, [expiring.id]);
    assert.equal(context.warnings[0].destination, "MEMORY.md");
    assert.equal(context.warnings[0].expiresAt, expiring.expires_at);
    assert(context.warnings[0].daysUntilExpiry > 0);
    assert.equal(context.warnings[0].warningWindowDays, 7);
    assert.deepEqual(destinationStatus.warnings, context.warnings);
    assert.equal(status.warningCount, 1);
    assertNoEcho(JSON.stringify({
      contextWarnings: context.warnings,
      statusWarnings: destinationStatus.warnings
    }), [
      expiringMemory,
      expiringQuote,
      farMemory,
      pendingMemory,
      rejectedMemory,
      otherDestinationMemory
    ]);
    await assertStatusReadOnly(root, "MEMORY.md", before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API read-context and status metadata stay below permissioned read-governance boundary", async () => {
  const root = await makeTempRoot();

  try {
    const expiring = await proposeMemory(
      {
        memory: "Boundary test should surface expiry warning metadata only.",
        source: "package.json",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        ttl: expiryDaysFromNow(3)
      },
      root
    );
    const expired = await proposeMemory(
      {
        memory: "Boundary test should surface expiry issue metadata only.",
        source: "AGENTS.md",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "AGENTS.md",
        ttl: "2000-01-01"
      },
      root
    );

    const context = await assembleContext({ destination: "MEMORY.md" }, root);
    const status = await assembleContextStatus({}, root);

    assert.equal(context.ok, true);
    assert.deepEqual(context.recordIds, [expiring.id]);
    assert.deepEqual(context.issues, []);
    assert.deepEqual(context.warnings.map((warning) => warning.code), ["expiring_record"]);
    assert.deepEqual(context.warnings[0].recordIds, [expiring.id]);

    assert.equal(status.ok, false);
    assert.equal(status.blocked, true);
    assert.equal(status.warningCount, 1);
    assert.equal(status.blockedCount, 1);
    const blockedDestination = assertDestinationStatus(status, "AGENTS.md");
    const issue = assertContextStatusIssue(blockedDestination, "expired_record");
    assert.deepEqual(issue.recordIds, [expired.id]);

    assertReadContextBoundary(context);
    assertReadContextStatusBoundary(status);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context --json returns the same accepted exact-destination scoped records", async () => {
  const root = await makeTempRoot();
  const repoMemory = "CLI JSON context should include this repo memory.";
  const pendingMemory = "CLI JSON context must omit pending memory.";
  const otherDestinationMemory = "CLI JSON context must omit AGENTS memory.";

  try {
    const accepted = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      repoMemory,
      "--source",
      "package.json",
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
      "--memory",
      pendingMemory,
      "--risk",
      "medium",
      "--destination",
      "MEMORY.md"
    ]);
    await runCli([
      "propose",
      "--root",
      root,
      "--memory",
      otherDestinationMemory,
      "--source",
      "AGENTS.md",
      "--source-trust",
      "trusted",
      "--scope",
      "repo",
      "--destination",
      "AGENTS.md"
    ]);

    const eventsBefore = await readEventLog(root);
    const output = await runCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--scope",
      "repo",
      "--json"
    ]);
    const context = JSON.parse(output.stdout);

    assert.equal(context.ok, true);
    assert.equal(context.destination, "MEMORY.md");
    assert.deepEqual(context.scopes, ["repo"]);
    assert.deepEqual(context.issues, []);
    assert.equal(context.records.length, 1);
    assert.deepEqual(context.records.map((record) => record.id), [accepted.id]);
    assertNoEcho(JSON.stringify(context.records), [pendingMemory, otherDestinationMemory]);
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context --json opt-in permission constraint narrows accepted scopes", async () => {
  const root = await makeTempRoot();
  const repoMemory = "CLI permissioned context repo preference.";
  const projectMemory = "CLI permissioned context project preference.";
  const userMemory = "CLI permissioned context user preference.";

  try {
    const repoRecord = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      repoMemory,
      "--source",
      "package.json",
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
      "tsconfig.json",
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
      "Accepted unallowed scope for CLI permission filtering."
    ]);

    const eventsBefore = await readEventLog(root);
    const defaultOutput = await runCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--json"
    ]);
    const defaultContext = JSON.parse(defaultOutput.stdout);
    const allowedOutput = await runCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--read-actor",
      "local-agent:phase-7h",
      "--allowed-scopes",
      "repo,project",
      "--json"
    ]);
    const allowedContext = JSON.parse(allowedOutput.stdout);
    const requestedOutput = await runCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--read-actor",
      "local-agent:phase-7h",
      "--allowed-scopes",
      "repo,project",
      "--scope",
      "project",
      "--json"
    ]);
    const requestedContext = JSON.parse(requestedOutput.stdout);

    assert.equal(defaultContext.ok, true);
    assert.deepEqual(defaultContext.recordIds, [repoRecord.id, projectRecord.id, userRecord.id]);

    assert.equal(allowedContext.ok, true);
    assert.deepEqual(allowedContext.recordIds, [repoRecord.id, projectRecord.id]);
    assert.deepEqual(allowedContext.records.map((record) => record.scope), ["repo", "project"]);
    assertNoEcho(allowedOutput.stdout, [userMemory]);

    assert.equal(requestedContext.ok, true);
    assert.deepEqual(requestedContext.scopes, ["project"]);
    assert.deepEqual(requestedContext.recordIds, [projectRecord.id]);
    assert.deepEqual(requestedContext.records.map((record) => record.scope), ["project"]);
    assertNoEcho(requestedOutput.stdout, [repoMemory, userMemory]);
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context --json opt-in permission expiry constraint narrows records", async () => {
  const root = await makeTempRoot();
  const soonMemory = "CLI permission expiry should filter soon-expiring memory.";
  const exactMemory = "CLI permission expiry should filter exact-threshold memory.";
  const scopeFilteredMemory = "CLI permission expiry should not warn on scope-filtered memory.";
  const longMemory = "CLI permission expiry should keep long-lived memory.";
  const noExpiryMemory = "CLI permission expiry should keep no-expiry memory.";
  const soonExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const validUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  try {
    const soonRecord = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      soonMemory,
      "--source",
      "package.json",
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
      "tsconfig.json",
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
      "package-lock.json",
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
      "docs/MEMORY.md",
      "--source-trust",
      "trusted",
      "--scope",
      "project",
      "--ttl",
      soonExpiry,
      "--destination",
      "MEMORY.md"
    ])).stdout);

    const eventsBefore = await readEventLog(root);
    const defaultOutput = await runCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--json"
    ]);
    const defaultContext = JSON.parse(defaultOutput.stdout);
    const constrainedOutput = await runCli([
      "context",
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
      "--json"
    ]);
    const constrainedContext = JSON.parse(constrainedOutput.stdout);
    const invalidOutput = await rejectedRunCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--read-actor",
      "local-agent:phase-7i",
      "--allowed-scopes",
      "repo",
      "--read-valid-until",
      "not an expiry",
      "--json"
    ]);

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
        `default CLI reads should still warn for ${record.id}`
      );
    }

    assert.equal(constrainedContext.ok, true);
    assert.deepEqual(constrainedContext.recordIds, [longRecord.id, noExpiryRecord.id]);
    assert.deepEqual(constrainedContext.warnings, []);
    assertNoEcho(constrainedOutput.stdout, [soonMemory, exactMemory, scopeFilteredMemory]);

    assert.notDeepEqual(constrainedContext.recordIds, [
      soonRecord.id,
      longRecord.id,
      noExpiryRecord.id,
      exactRecord.id,
      scopeFilteredRecord.id
    ]);
    assertPermissionDeniedCliContext(invalidOutput, [
      soonMemory,
      exactMemory,
      scopeFilteredMemory,
      longMemory,
      noExpiryMemory
    ]);
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context --json opt-in permission relationship constraints narrow records", async () => {
  const root = await makeTempRoot();
  const cleanMemory = "CLI relationship permission should keep unrelated memory.";
  const conflictMemory = "CLI relationship permission should filter own conflict memory.";
  const supersedingMemory = "CLI relationship permission should filter own supersession memory.";
  const scopeFilteredMemory = "CLI relationship permission should not leak scoped conflict memory.";
  const expiringMemory = "CLI relationship permission should not warn on expiring conflict memory.";
  const anchorMemory = "CLI relationship permission anchor must stay out of target context.";
  const soonExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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
      "package.json",
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
      "tsconfig.json",
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
      "package-lock.json",
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
      "docs/MEMORY.md",
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
      [conflictRecord, "Accepted cross-destination CLI conflict for relationship filtering."],
      [supersedingRecord, "Accepted cross-destination CLI supersession for filtering."],
      [scopeFilteredRecord, "Accepted scoped CLI relationship record for filtering."],
      [expiringRecord, "Accepted expiring CLI relationship record for filtering."]
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

    const eventsBefore = await readEventLog(root);
    const defaultOutput = await runCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--json"
    ]);
    const defaultContext = JSON.parse(defaultOutput.stdout);
    const constrainedOutput = await runCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--read-actor",
      "local-agent:phase-7j",
      "--allowed-scopes",
      "repo",
      "--read-valid-until",
      validUntil,
      "--read-exclude-conflicts",
      "--read-exclude-supersedes",
      "--json"
    ]);
    const constrainedContext = JSON.parse(constrainedOutput.stdout);
    const invalidOutput = await rejectedRunCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--read-actor",
      "local-agent:phase-7j",
      "--allowed-scopes",
      "repo",
      "--read-exclude-conflicts=true",
      "--json"
    ]);

    assert.equal(defaultContext.ok, true);
    assert.deepEqual(defaultContext.recordIds, [
      cleanRecord.id,
      conflictRecord.id,
      supersedingRecord.id,
      scopeFilteredRecord.id,
      expiringRecord.id
    ]);

    assert.equal(constrainedContext.ok, true);
    assert.deepEqual(constrainedContext.recordIds, [cleanRecord.id]);
    assert.deepEqual(constrainedContext.records.map((record) => record.memory), [cleanMemory]);
    assert.deepEqual(constrainedContext.warnings, []);
    assertNoEcho(constrainedOutput.stdout, [
      conflictMemory,
      supersedingMemory,
      scopeFilteredMemory,
      expiringMemory,
      anchorMemory
    ]);

    assert.notEqual(invalidOutput.code, 0);
    assertNoEcho(`${invalidOutput.stdout}\n${invalidOutput.stderr}`, [
      cleanMemory,
      conflictMemory,
      supersedingMemory,
      scopeFilteredMemory,
      expiringMemory,
      anchorMemory
    ]);
    assert.match(invalidOutput.stderr, /read-exclude-conflicts|does not take a value|invalid/i);
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context --json opt-in permission constraint fails closed without content or writes", async () => {
  const root = await makeTempRoot();
  const repoMemory = "CLI permission denial must not echo repo memory.";
  const repoQuote = "CLI permission denial must not echo repo quote.";
  const projectMemory = "CLI permission denial must not echo project memory.";
  const projectQuote = "CLI permission denial must not echo project quote.";
  const validUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  try {
    await runCli([
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
    ]);
    await runCli([
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
    ]);

    const eventsBefore = await readEventLog(root);
    const deniedRuns = [
      {
        run: await rejectedRunCli([
          "context",
          "--root",
          root,
          "--destination",
          "MEMORY.md",
          "--read-actor",
          "local-agent:phase-7h",
          "--allowed-scopes",
          "repo",
          "--scope",
          "repo,project",
          "--json"
        ]),
        code: "invalid_scope"
      },
      {
        run: await rejectedRunCli([
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
        ]),
        code: "read_permission_missing_actor"
      },
      {
        run: await rejectedRunCli([
          "context",
          "--root",
          root,
          "--destination",
          "MEMORY.md",
          "--read-actor",
          "local-agent:phase-7h",
          "--scope",
          "repo",
          "--json"
        ]),
        code: "read_permission_missing_allowed_scopes"
      },
      {
        run: await rejectedRunCli([
          "context",
          "--root",
          root,
          "--destination",
          "MEMORY.md",
          "--read-valid-until",
          validUntil,
          "--scope",
          "repo",
          "--json"
        ]),
        code: "read_permission_missing_actor"
      },
      {
        run: await rejectedRunCli([
          "context",
          "--root",
          root,
          "--destination",
          "MEMORY.md",
          "--read-actor",
          "local-agent:phase-7i",
          "--read-valid-until",
          validUntil,
          "--scope",
          "repo",
          "--json"
        ]),
        code: "read_permission_missing_allowed_scopes"
      },
      {
        run: await rejectedRunCli([
          "context",
          "--root",
          root,
          "--destination",
          "MEMORY.md",
          "--allowed-scopes",
          "repo",
          "--read-valid-until",
          validUntil,
          "--scope",
          "repo",
          "--json"
        ]),
        code: "read_permission_missing_actor"
      }
    ];

    for (const { run, code } of deniedRuns) {
      assertPermissionDeniedCliContext(run, [
        repoMemory,
        repoQuote,
        projectMemory,
        projectQuote
      ], { code });
    }
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context text output renders accepted records without leaking excluded records", async () => {
  const root = await makeTempRoot();
  const acceptedMemory = "CLI text context should print accepted memory.";
  const pendingMemory = "CLI text context must not print pending memory.";

  try {
    const accepted = JSON.parse((await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      acceptedMemory,
      "--source",
      "package.json",
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
      "--memory",
      pendingMemory,
      "--risk",
      "medium",
      "--destination",
      "MEMORY.md"
    ]);

    const output = await runCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--scope",
      "repo"
    ]);

    assert.match(output.stdout, new RegExp(escapeRegExp(accepted.id)));
    assert.match(output.stdout, new RegExp(escapeRegExp(acceptedMemory)));
    assert.doesNotMatch(output.stdout, new RegExp(escapeRegExp(pendingMemory)));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI context --json exits non-zero with non-leaky issues for expired accepted records", async () => {
  const root = await makeTempRoot();
  const expiredMemory = "CLI JSON must not echo expired context memory.";
  const expiredQuote = "CLI JSON must not echo expired context quote.";

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
    const eventsBefore = await readEventLog(root);

    const error = await rejectedRunCli([
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--json"
    ]);
    const context = JSON.parse(error.stdout);

    assert.notEqual(error.code, 0);
    assert.equal(context.ok, false);
    assert.deepEqual(context.records, []);
    const issue = assertIssue(context, /expired|stale/i);
    assert.deepEqual(issue.recordIds, [expired.id]);
    assertNoEcho(`${error.stdout}\n${error.stderr}`, [expiredMemory, expiredQuote]);
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function assertRelationshipContextBlocked({
  relationship,
  issuePattern,
  linkedMemory,
  blockingMemory,
  blockingInput,
  contextOptions = {}
}) {
  const root = await makeTempRoot();
  const linkedQuote = `${linkedMemory} quote.`;
  const blockingQuote = `${blockingMemory} quote.`;

  try {
    const linked = await proposeMemory(
      {
        memory: linkedMemory,
        quote: linkedQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    const blocking = await proposeMemory(
      {
        memory: blockingMemory,
        quote: blockingQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        ...blockingInput(linked.id)
      },
      root
    );
    await updateRecordStatus(
      blocking.id,
      "accepted",
      `Reviewed accepted ${relationship} context blocker.`,
      root
    );
    const eventsBefore = await readEventLog(root);

    const context = await assembleContext({ destination: "MEMORY.md", ...contextOptions }, root);

    assert.equal(context.ok, false);
    assert.deepEqual(context.records, []);
    const issue = assertIssue(context, issuePattern);
    assert.equal(issue.relationship, relationship);
    assert.deepEqual(issue.recordIds, [blocking.id, linked.id]);
    assertNoEcho(JSON.stringify(context.issues), [
      linkedMemory,
      linkedQuote,
      blockingMemory,
      blockingQuote
    ]);
    await assertContextReadOnly(root, "MEMORY.md", eventsBefore);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function assertRelationshipContextStatusBlocked({
  relationship,
  issueCode,
  linkedMemory,
  blockingMemory,
  blockingInput
}) {
  const root = await makeTempRoot();
  const linkedQuote = `${linkedMemory} quote.`;
  const blockingQuote = `${blockingMemory} quote.`;

  try {
    const linked = await proposeMemory(
      {
        memory: linkedMemory,
        quote: linkedQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );
    const blocking = await proposeMemory(
      {
        memory: blockingMemory,
        quote: blockingQuote,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md",
        ...blockingInput(linked.id)
      },
      root
    );
    await updateRecordStatus(
      blocking.id,
      "accepted",
      `Reviewed accepted ${relationship} context status blocker.`,
      root
    );
    const before = await readReadOnlySnapshot(root, "MEMORY.md");

    const status = await assembleContextStatus({ destination: "MEMORY.md" }, root);

    assert.equal(status.ok, false);
    assert.equal(status.destinationCount, 1);
    assert.equal(status.blockedCount, 1);
    const destinationStatus = assertDestinationStatus(status, "MEMORY.md");
    assert.equal(destinationStatus.ok, false);
    assertStatusCounts(destinationStatus, { total: 2, accepted: 2, pending: 0, rejected: 0 });
    assert.deepEqual(destinationStatus.acceptedRecordIds, [linked.id, blocking.id]);
    const issue = assertContextStatusIssue(destinationStatus, issueCode);
    assert.equal(issue.relationship, relationship);
    assert.deepEqual(issue.recordIds, [blocking.id, linked.id]);
    assertNoEcho(JSON.stringify(status), [
      linkedMemory,
      linkedQuote,
      blockingMemory,
      blockingQuote
    ]);
    await assertStatusReadOnly(root, "MEMORY.md", before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function assembleContext(options, root) {
  assert.equal(
    typeof ledger.assembleReadContext,
    "function",
    "ledger exports assembleReadContext(options, root)"
  );
  return ledger.assembleReadContext(options, root);
}

async function assembleContextStatus(options, root) {
  const statusApi = ledger.summarizeReadContextStatus ?? ledger.getReadContextStatus;

  assert.equal(
    typeof statusApi,
    "function",
    "ledger exports summarizeReadContextStatus(options, root)"
  );
  return statusApi(options, root);
}

function assertIssue(context, pattern) {
  assert(Array.isArray(context.issues), "context issues must be an array");
  assert(context.issues.length > 0, "context must include at least one issue");
  const issue = context.issues.find((candidate) => {
    return pattern.test(JSON.stringify(candidate));
  });

  assert(issue, `Expected issue matching ${pattern}`);
  assert(Array.isArray(issue.recordIds), "issue must include recordIds");
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

function assertPermissionDeniedCliContext(run, privateText, options = {}) {
  assert.notEqual(run.code, 0);
  const context = JSON.parse(run.stdout);
  assertPermissionDeniedContext(context, privateText, options);
  assertNoEcho(`${run.stdout}\n${run.stderr}`, privateText);
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
  assertNoPermissionDeniedMetadataForNonPermissionIssue(issue, "context status issue");
  return issue;
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

async function assertContextReadOnly(root, destination, eventsBefore) {
  assert.equal(await readEventLog(root), eventsBefore);
  assert.equal(await countExportEvents(root), 0);
  await assertPathMissing(join(root, destination));
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

async function readEventLog(root) {
  return readFile(join(root, ".mempr", "events.jsonl"), "utf8");
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

async function countExportEvents(root) {
  const events = await readEvents(root);
  return events.filter((event) => event.type === "memory_exported").length;
}

async function assertPathMissing(path) {
  await assert.rejects(access(path), (error) => {
    assert(error instanceof Error);
    assert.equal(error.code, "ENOENT");
    return true;
  });
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-context-test-"));
}

function assertNoEcho(value, privateText) {
  for (const text of privateText) {
    assert.doesNotMatch(value, new RegExp(escapeRegExp(text)));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNameForBoundaryCheck(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./:-]+/g, " ");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expiryDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
