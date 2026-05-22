import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { readEvents } from "../dist/events.js";
import {
  assembleReadContext,
  previewMarkdownExport,
  proposeMemory,
  summarizeReadContextStatus,
  updateRecordStatus
} from "../dist/ledger.js";
import { readDiagnostics } from "../dist/diagnostics.js";
import { scanAcceptedMemoryRecords } from "../dist/scanner.js";

const exec = promisify(execFile);

test("accepted-memory scanner blocks secret-like accepted records at context and export preview without diagnostics writes", async () => {
  const root = await makeTempRoot();
  const secretMemory = "Emergency fixture api_key=sk-secretBoundaryValue1234567890.";
  const secretQuote = "Quote repeats api_key=sk-secretBoundaryQuote1234567890.";

  try {
    const rejected = await proposeMemory(
      {
        memory: secretMemory,
        quote: secretQuote,
        source: "manual",
        risk: "high",
        destination: "MEMORY.md"
      },
      root
    );
    const accepted = await updateRecordStatus(
      rejected.id,
      "accepted",
      "Accepted to verify boundary scanner blocks legacy secret-like records.",
      root
    );
    const eventsBefore = await readFile(join(root, ".mempr", "events.jsonl"), "utf8");

    const context = await assembleReadContext({ destination: "MEMORY.md" }, root);

    assert.equal(context.ok, false);
    assert.deepEqual(context.recordIds, []);
    assert.deepEqual(context.records, []);
    assert.equal(context.issues[0].code, "secret_like_content");
    assert.deepEqual(context.issues[0].recordIds, [accepted.id]);
    assert.match(context.issues[0].message, /Correlation ID: diag_/);
    assertNoEcho(JSON.stringify(context), [secretMemory, secretQuote]);

    await assert.rejects(
      previewMarkdownExport("MEMORY.md", root),
      (error) => {
        assert(error instanceof Error);
        assert.match(error.message, /blocked content/i);
        assert.match(error.message, new RegExp(escapeRegExp(accepted.id)));
        assert.match(error.message, /Correlation ID: diag_/);
        assertNoEcho(error.message, [secretMemory, secretQuote]);
        return true;
      }
    );

    assert.equal(await readFile(join(root, ".mempr", "events.jsonl"), "utf8"), eventsBefore);
    await assertPathMissing(join(root, "MEMORY.md"));
    await assertPathMissing(join(root, ".mempr", "diagnostics.jsonl"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepted-memory scanner warns for sensitive accepted records without blocking context, status, or preview", async () => {
  const root = await makeTempRoot();
  const sensitiveMemory = "The maintainer was diagnosed with asthma during onboarding.";
  const sensitiveQuote = "Medical condition details should stay out of warning metadata.";

  try {
    const pending = await proposeMemory(
      {
        memory: sensitiveMemory,
        quote: sensitiveQuote,
        source: "manual",
        risk: "high",
        destination: "MEMORY.md"
      },
      root
    );
    const accepted = await updateRecordStatus(
      pending.id,
      "accepted",
      "Accepted to verify non-blocking scanner warning.",
      root
    );

    const context = await assembleReadContext({ destination: "MEMORY.md" }, root);
    const status = await summarizeReadContextStatus({ destination: "MEMORY.md" }, root);
    const preview = await previewMarkdownExport("MEMORY.md", root);

    assert.equal(context.ok, true);
    assert.deepEqual(context.recordIds, [accepted.id]);
    assert.deepEqual(context.warnings.map((warning) => warning.code), ["sensitive_content"]);
    assert.deepEqual(context.warnings[0].recordIds, [accepted.id]);
    assert.match(context.warnings[0].message, /Correlation ID: diag_/);
    assertNoEcho(JSON.stringify(context.warnings), [sensitiveMemory, sensitiveQuote]);

    assert.equal(status.ok, true);
    assert.equal(status.warningCount, 1);
    assert.deepEqual(status.destinations[0].warnings.map((warning) => warning.code), [
      "sensitive_content"
    ]);
    assertNoEcho(JSON.stringify(status), [sensitiveMemory, sensitiveQuote]);

    assert.deepEqual(preview.warnings.map((warning) => warning.code), ["sensitive_content"]);
    assertNoEcho(JSON.stringify(preview.warnings), [sensitiveMemory, sensitiveQuote]);
    assert.match(preview.content, /diagnosed with asthma/);
    await assertPathMissing(join(root, "MEMORY.md"));
    assert.equal(countExportEvents(await readEvents(root)), 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scanner treats explicit redaction marker values as redacted only when marker support is enabled", async () => {
  const record = fixedAcceptedRecord({
    memory: "The fixture password=[REDACTED] is intentionally redacted."
  });

  const supported = scanAcceptedMemoryRecords([record]);
  const unsupported = scanAcceptedMemoryRecords([record], {
    allowRedactionMarkers: false
  });

  assert.equal(supported.ok, true);
  assert.deepEqual(supported.issues, []);
  assert.equal(supported.redactionMarkerCount, 1);

  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.issues[0].code, "secret_like_content");
  assert.deepEqual(unsupported.issues[0].recordIds, [record.id]);
  assertNoEcho(JSON.stringify(unsupported.issues), [record.memory]);
});

test("CLI diagnostics writes a separate redacted support bundle with correlation id", async () => {
  const root = await makeTempRoot();
  const secretMemory = "Diagnostics fixture token=sk-diagnosticsSecret1234567890.";
  const sensitiveMemory = "Diagnostics fixture patient was diagnosed with migraines.";
  const quote = "Diagnostics quote includes token=sk-diagnosticsQuote1234567890.";

  try {
    const secret = await proposeMemory(
      {
        memory: secretMemory,
        quote,
        source: "manual",
        risk: "high",
        destination: "MEMORY.md"
      },
      root
    );
    await updateRecordStatus(
      secret.id,
      "accepted",
      "Accepted to verify diagnostics redaction.",
      root
    );
    const sensitive = await proposeMemory(
      {
        memory: sensitiveMemory,
        source: "manual",
        risk: "high",
        destination: "MEMORY.md"
      },
      root
    );
    await updateRecordStatus(
      sensitive.id,
      "accepted",
      "Accepted to verify diagnostics warning summary.",
      root
    );

    const result = await rejectedRunCli([
      "diagnostics",
      "--root",
      root,
      "--json"
    ]);
    const payload = JSON.parse(result.stdout);
    const diagnosticsFile = join(root, ".mempr", "diagnostics.jsonl");
    const diagnosticsContent = await readFile(diagnosticsFile, "utf8");
    const entries = await readDiagnostics(root);

    assert.equal(payload.dryRun, false);
    assert.equal(payload.diagnosticsPath, diagnosticsFile);
    assert.match(payload.bundle.correlationId, /^diag_/);
    assert.equal(payload.bundle.summary.scanBlockers, 1);
    assert.equal(payload.bundle.summary.scanWarnings, 1);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, payload.bundle.correlationId);
    assert.equal(entries[0].type, "support_bundle_created");
    assertNoEcho(`${result.stdout}\n${diagnosticsContent}`, [
      secretMemory,
      sensitiveMemory,
      quote,
      "sk-diagnosticsSecret1234567890",
      "sk-diagnosticsQuote1234567890",
      "diagnosed with migraines"
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function fixedAcceptedRecord({ memory }) {
  return {
    id: "mem_redacted_marker",
    memory,
    source: {
      type: "manual",
      uri: "manual"
    },
    source_trust: "unknown",
    scope: "repo",
    risk: "low",
    decision: "auto_accept",
    decision_reason: "Fixed scanner test record.",
    policy_version: "test",
    destination: "MEMORY.md",
    status: "accepted",
    status_reason: null,
    ttl: null,
    expires_at: null,
    supersedes: [],
    conflicts_with: [],
    created_at: "2026-05-22T00:00:00.000Z",
    updated_at: "2026-05-22T00:00:00.000Z"
  };
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-diagnostics-scanner-test-"));
}

async function rejectedRunCli(args) {
  try {
    await exec("node", ["dist/cli.js", ...args]);
  } catch (error) {
    return error;
  }

  assert.fail(`Expected command to fail: mempr ${args.join(" ")}`);
}

function countExportEvents(events) {
  return events.filter((event) => event.type === "memory_exported").length;
}

async function assertPathMissing(path) {
  await assert.rejects(access(path), (error) => {
    assert(error instanceof Error);
    assert.equal(error.code, "ENOENT");
    return true;
  });
}

function assertNoEcho(value, privateText) {
  for (const text of privateText) {
    assert.doesNotMatch(value, new RegExp(escapeRegExp(text)));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
