import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { syncLiveAdapter } from "../dist/live-adapters.js";
import { readDiagnostics } from "../dist/diagnostics.js";
import { scanAcceptedMemoryRecords } from "../dist/scanner.js";
import { fakeOpenAiKey } from "./helpers/fake-secrets.js";

const exec = promisify(execFile);

test("accepted-memory scanner blocks secret-like accepted records at context and export preview without diagnostics writes", async () => {
  const root = await makeTempRoot();
  const secretMemory = "Emergency fixture api_key=memprFakesecretBoundaryValue1234567890.";
  const secretQuote = "Quote repeats api_key=memprFakesecretBoundaryQuote1234567890.";

  try {
    const accepted = await seedAcceptedRecord(root, fixedAcceptedRecord({
      id: "mem_legacy_secret_scanner",
      memory: secretMemory,
      quote: secretQuote
    }));
    const eventsBefore = await readOptional(join(root, ".mempr", "events.jsonl"));

    const context = await assembleReadContext({ destination: "MEMORY.md" }, root);

    assert.equal(context.ok, false);
    assert.deepEqual(context.recordIds, []);
    assert.deepEqual(context.records, []);
    assert.equal(context.issues[0].code, "secret_like_content");
    assert.match(context.issues[0].recordIds[0], /^\[MEMPR_RECORD_ID_HASH:/);
    assert.match(context.issues[0].message, /Correlation ID: diag_/);
    assertNoEcho(JSON.stringify(context), [secretMemory, secretQuote]);

    await assert.rejects(
      previewMarkdownExport("MEMORY.md", root),
      (error) => {
        assert(error instanceof Error);
        assert.match(error.message, /blocked content/i);
        assert.match(error.message, /\[MEMPR_RECORD_ID_HASH:[0-9a-f]{16}\]/);
        assert.match(error.message, /Correlation ID: diag_/);
        assertNoEcho(error.message, [secretMemory, secretQuote]);
        return true;
      }
    );

    assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), eventsBefore);
    await assertPathMissing(join(root, "MEMORY.md"));
    await assertPathMissing(join(root, ".mempr", "diagnostics.jsonl"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepted-memory scanner blocks secret-like source URI before export", async () => {
  const root = await makeTempRoot();
  const secretUri = "docs/token=memprFakesourceUriScannerSecret1234567890.md";

  try {
    const record = fixedAcceptedRecord({
      id: "mem_secret_source_uri",
      memory: "Source URI scanner fixture.",
      sourceUri: secretUri
    });
    await seedAcceptedRecord(root, record);
    const scan = scanAcceptedMemoryRecords([record]);

    assert.equal(scan.ok, false);
    assert.equal(scan.issues[0].code, "secret_like_content");
    assert.deepEqual(scan.issues[0].fields, ["source.uri"]);
    assertNoEcho(JSON.stringify(scan.issues), [secretUri]);

    await assert.rejects(
      previewMarkdownExport("MEMORY.md", root),
      /blocked content/i
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepted-memory scanner blocks secret-like source quote before export", async () => {
  const root = await makeTempRoot();
  const secretQuote = "Source quote says api_key=memprFakesourceQuoteScannerSecret1234567890.";

  try {
    const record = fixedAcceptedRecord({
      id: "mem_secret_source_quote",
      memory: "Source quote scanner fixture.",
      quote: secretQuote
    });
    await seedAcceptedRecord(root, record);
    const scan = scanAcceptedMemoryRecords([record]);

    assert.equal(scan.ok, false);
    assert.equal(scan.issues[0].code, "secret_like_content");
    assert.deepEqual(scan.issues[0].fields, ["source.quote"]);
    assertNoEcho(JSON.stringify(scan.issues), [secretQuote]);

    await assert.rejects(
      previewMarkdownExport("MEMORY.md", root),
      /blocked content/i
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepted-memory scanner blocks managed block markers in memory before export", async () => {
  const root = await makeTempRoot();

  try {
    const record = fixedAcceptedRecord({
      id: "mem_marker_memory",
      memory: "Unsafe marker <!-- mempr:start --> in memory."
    });
    await seedAcceptedRecord(root, record);
    const scan = scanAcceptedMemoryRecords([record]);

    assert.equal(scan.ok, false);
    assert.equal(scan.issues[0].code, "managed_block_marker_content");
    assert.deepEqual(scan.issues[0].fields, ["memory"]);

    await assert.rejects(
      previewMarkdownExport("MEMORY.md", root),
      /managed block markers/i
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepted-memory scanner blocks managed block markers in scope before export", async () => {
  const root = await makeTempRoot();

  try {
    const record = fixedAcceptedRecord({
      id: "mem_marker_scope",
      memory: "Scope marker scanner fixture.",
      scope: "repo <!-- mempr:end -->"
    });
    await seedAcceptedRecord(root, record);
    const scan = scanAcceptedMemoryRecords([record]);

    assert.equal(scan.ok, false);
    assert.equal(scan.issues[0].code, "managed_block_marker_content");
    assert.deepEqual(scan.issues[0].fields, ["scope"]);

    await assert.rejects(
      previewMarkdownExport("MEMORY.md", root),
      /managed block markers/i
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepted-memory scanner blocks secret-like destination before export", async () => {
  const root = await makeTempRoot();
  const destination = "token=memprFakedestinationScannerSecret1234567890/MEMORY.md";

  try {
    const record = fixedAcceptedRecord({
      id: "mem_secret_destination",
      memory: "Destination scanner fixture.",
      destination
    });
    await seedAcceptedRecord(root, record);
    const scan = scanAcceptedMemoryRecords([record]);

    assert.equal(scan.ok, false);
    assert.equal(scan.issues[0].code, "secret_like_content");
    assert.deepEqual(scan.issues[0].fields, ["destination"]);
    assertNoEcho(JSON.stringify(scan.issues), [destination]);

    await assert.rejects(
      previewMarkdownExport(destination, root),
      /blocked content|secret-like content|invalid export destination/i
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepted-memory scanner blocks secret-like metadata returned by context surfaces", async () => {
  const cases = [
    {
      field: "status_reason",
      apply: (record, secret) => {
        record.status_reason = `accepted with token ${secret}`;
      }
    },
    {
      field: "reviewer",
      apply: (record, secret) => {
        record.reviewer = `reviewer-${secret}`;
      }
    },
    {
      field: "approved_by",
      apply: (record, secret) => {
        record.approved_by = `approver-${secret}`;
      }
    },
    {
      field: "retention_class",
      apply: (record, secret) => {
        record.retention_class = `retain-${secret}`;
      }
    },
    {
      field: "source.verification.git_commit",
      apply: (record, secret) => {
        record.source.verification = {
          status: "verified",
          method: "file_quote",
          checked_at: "2026-05-22T00:00:00.000Z",
          reason: "Source quote matched file content.",
          git_commit: secret
        };
      }
    }
  ];

  for (const testCase of cases) {
    const root = await makeTempRoot();
    const secret = `token=memprFake${testCase.field.replaceAll(".", "-").replaceAll("_", "-")}ShouldNotEcho1234567890`;

    try {
      const record = fixedAcceptedRecord({
        id: `mem_secret_${testCase.field.replaceAll(".", "_")}`,
        memory: `Scanner metadata fixture for ${testCase.field}.`
      });
      testCase.apply(record, secret);
      await seedAcceptedRecord(root, record);

      const scan = scanAcceptedMemoryRecords([record]);
      const context = await assembleReadContext({ destination: "MEMORY.md" }, root);
      const liveReport = await syncLiveAdapter({
        destination: "MEMORY.md",
        dryRun: true
      }, root);

      assert.equal(scan.ok, false, testCase.field);
      assert.equal(scan.issues[0].code, "secret_like_content", testCase.field);
      assert.deepEqual(scan.issues[0].fields, [testCase.field], testCase.field);
      assertNoEcho(JSON.stringify(scan.issues), [secret]);

      assert.equal(context.ok, false, testCase.field);
      assert.deepEqual(context.records, [], testCase.field);
      assert.equal(context.issues[0].code, "secret_like_content", testCase.field);
      assertNoEcho(JSON.stringify(context), [secret]);

      await assert.rejects(
        previewMarkdownExport("MEMORY.md", root),
        (error) => {
          assert(error instanceof Error);
          assert.match(error.message, /blocked content/i);
          assertNoEcho(error.message, [secret]);
          return true;
        },
        testCase.field
      );

      assert.equal(liveReport.ok, false, testCase.field);
      assert.equal(liveReport.blocked, true, testCase.field);
      assert.deepEqual(liveReport.issues, ["secret_like_content"], testCase.field);
      assertNoEcho(JSON.stringify(liveReport), [secret]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
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
    assert.match(preview.safe_content_preview, /diagnosed with asthma/);
    await assertPathMissing(join(root, "MEMORY.md"));
    assert.equal(countExportEvents(await readEvents(root)), 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("invalid accepted legacy destination blocks status and appears in diagnostics", async () => {
  const root = await makeTempRoot();
  const destination = "../outside/MEMORY.md";

  try {
    const record = fixedAcceptedRecord({
      id: "mem_invalid_destination",
      memory: "Invalid destination scanner fixture.",
      destination
    });
    await seedAcceptedRecord(root, record);

    const scan = scanAcceptedMemoryRecords([record]);
    const status = await summarizeReadContextStatus({}, root);
    const diagnostics = await rejectedRunCli([
      "diagnostics",
      "--root",
      root,
      "--dry-run",
      "--json"
    ]);
    const payload = JSON.parse(diagnostics.stdout);

    assert.equal(scan.ok, false);
    assert.equal(scan.issues[0].code, "invalid_destination");
    assert.match(scan.issues[0].recordIds[0], /^\[MEMPR_RECORD_ID_HASH:/);
    assert.equal(status.ok, false);
    assert.equal(status.blocked, true);
    assert.deepEqual(status.destinations[0].issues.map((issue) => issue.code), [
      "invalid_destination"
    ]);
    assert.match(status.destinations[0].issues[0].recordIds[0], /^\[MEMPR_RECORD_ID_HASH:/);
    assert.equal(payload.bundle.summary.scanBlockers, 1);
    assert.equal(payload.bundle.scan.issues[0].code, "invalid_destination");
    assert.match(payload.bundle.scan.issues[0].recordIds[0], /^\[MEMPR_RECORD_ID_HASH:/);

    await assert.rejects(
      previewMarkdownExport(destination, root),
      /invalid export destination/i
    );
    await assertPathMissing(join(root, ".mempr", "diagnostics.jsonl"));
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
  assert.match(unsupported.issues[0].recordIds[0], /^\[MEMPR_RECORD_ID_HASH:/);
  assertNoEcho(JSON.stringify(unsupported.issues), [record.memory]);
});

test("CLI diagnostics writes a separate redacted support bundle with correlation id", async () => {
  const root = await makeTempRoot();
  const secretMemory = "Diagnostics fixture token=memprFakediagnosticsSecret1234567890.";
  const sensitiveMemory = "Diagnostics fixture patient was diagnosed with migraines.";
  const quote = "Diagnostics quote includes token=memprFakediagnosticsQuote1234567890.";

  try {
    await seedAcceptedRecord(root, fixedAcceptedRecord({
      id: "mem_legacy_secret_diagnostics",
      memory: secretMemory,
      quote
    }));
    await seedAcceptedRecord(root, fixedAcceptedRecord({
      id: "mem_diag_000001",
      memory: sensitiveMemory
    }));

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
    assert.equal(payload.diagnosticsPath, "[redacted]");
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
      "token=memprFakediagnosticsSecret1234567890",
      "token=memprFakediagnosticsQuote1234567890",
      "diagnosed with migraines"
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("diagnostics redacts corrupted legacy record ids everywhere in the bundle", async () => {
  const root = await makeTempRoot();
  const secret = fakeOpenAiKey("DiagnosticsRecordIdShouldNotLeak1234567890");
  const unsafeId = `legacy-${secret}`;

  try {
    await seedAcceptedRecord(root, fixedAcceptedRecord({
      id: unsafeId,
      memory: "Diagnostics corrupted id fixture."
    }));

    const result = await rejectedRunCli([
      "diagnostics",
      "--root",
      root,
      "--json"
    ]);
    const payload = JSON.parse(result.stdout);
    const diagnosticsContent = await readOptional(join(root, ".mempr", "diagnostics.jsonl"));
    const combined = `${result.stdout}\n${result.stderr ?? ""}\n${diagnosticsContent ?? ""}`;

    assertNoEcho(combined, [secret, unsafeId]);
    assert.match(combined, /\[MEMPR_RECORD_ID_HASH:[0-9a-f]{16}\]/);
    assert.match(payload.bundle.records[0].id, /^\[MEMPR_RECORD_ID_HASH:/);
    assert.match(payload.bundle.scan.issues[0].recordIds[0], /^\[MEMPR_RECORD_ID_HASH:/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function fixedAcceptedRecord({
  id = "mem_marker_fixture",
  memory,
  quote,
  sourceUri = "manual",
  scope = "repo",
  destination = "MEMORY.md"
}) {
  const record = {
    id,
    memory,
    source: {
      type: "manual",
      uri: sourceUri
    },
    source_trust: "unknown",
    scope,
    risk: "low",
    decision: "auto_accept",
    decision_reason: "Fixed scanner test record.",
    policy_version: "test",
    destination,
    status: "accepted",
    status_reason: null,
    ttl: null,
    expires_at: null,
    supersedes: [],
    conflicts_with: [],
    created_at: "2026-05-22T00:00:00.000Z",
    updated_at: "2026-05-22T00:00:00.000Z"
  };

  if (quote !== undefined) {
    record.source.quote = quote;
  }

  return record;
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-diagnostics-scanner-test-"));
}

async function seedAcceptedRecord(root, record) {
  const directory = join(root, ".mempr");
  const ledger = join(directory, "ledger.jsonl");
  const existing = await readOptional(ledger);

  await mkdir(directory, { recursive: true });
  await writeFile(ledger, `${existing ?? ""}${JSON.stringify(record)}\n`);
  return record;
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
