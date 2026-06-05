import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import {
  exportMarkdown,
  getRecordHistory,
  getReviewContext,
  listRecords,
  proposeMemory,
  renderRecordHistory,
  renderReviewContext
} from "../dist/ledger.js";
import { MCP_PROTOCOL_VERSION } from "../dist/mcp-contract.js";
import { verifyMemorySource } from "../dist/provenance.js";
import { closeChildProcess } from "./helpers/process-cleanup.js";
import { fakeOpenAiKey } from "./helpers/fake-secrets.js";

const exec = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = join(REPO_ROOT, "dist", "cli.js");
const MCP_STDIO_PATH = join(REPO_ROOT, "dist", "mcp-stdio.js");
const RESPONSE_TIMEOUT_MS = 2_500;
const FILE_SOURCE_REVIEW_REASON = "File source could not be verified and requires reviewer confirmation.";

test("file quote verification passes when quote appears in file", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "package.json"), "{\n  \"name\": \"mempr\"\n}\n");

    const verification = await verifyMemorySource({
      root,
      sourceType: "file",
      sourceUri: "package.json",
      quote: "\"name\": \"mempr\"",
      verifySource: true
    });

    assert.equal(verification.status, "verified");
    assert.equal(verification.method, "file_quote");
    assert.equal(verification.path, "package.json");
    assert.match(verification.content_hash, /^[0-9a-f]{64}$/);
    assert.match(verification.quote_hash, /^[0-9a-f]{64}$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("file quote verification fails when quote is missing", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "README.md"), "# MemPR\n\nLocal memory governance.\n");

    const verification = await verifyMemorySource({
      root,
      sourceType: "file",
      sourceUri: "README.md",
      quote: "Missing source quote",
      verifySource: true
    });

    assert.equal(verification.status, "failed");
    assert.equal(verification.method, "file_quote");
    assert.match(verification.reason, /quote was not found/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("file line range verification passes when quote appears in selected lines", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "notes.md"), [
      "one",
      "two",
      "The selected quote lives here.",
      "four"
    ].join("\n"));

    const verification = await verifyMemorySource({
      root,
      sourceType: "file",
      sourceUri: "notes.md",
      quote: "selected quote lives here",
      sourceLineStart: 3,
      sourceLineEnd: 3,
      verifySource: true
    });

    assert.equal(verification.status, "verified");
    assert.equal(verification.method, "file_quote");
    assert.equal(verification.start_line, 3);
    assert.equal(verification.end_line, 3);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("file line range verification fails when quote only appears outside selected lines", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "notes.md"), [
      "The quote is outside the selected line.",
      "two",
      "three"
    ].join("\n"));

    const verification = await verifyMemorySource({
      root,
      sourceType: "file",
      sourceUri: "notes.md",
      quote: "quote is outside",
      sourceLineStart: 2,
      sourceLineEnd: 3,
      verifySource: true
    });

    assert.equal(verification.status, "failed");
    assert.equal(verification.method, "file_quote");
    assert.equal(verification.start_line, 2);
    assert.equal(verification.end_line, 3);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("file hash verification passes for exact SHA-256", async () => {
  const root = await makeTempRoot();
  const content = "hash me exactly\n";

  try {
    await writeFile(join(root, "hash.txt"), content);

    const verification = await verifyMemorySource({
      root,
      sourceType: "file",
      sourceUri: "hash.txt",
      sourceHash: sha256(content),
      verifySource: true
    });

    assert.equal(verification.status, "verified");
    assert.equal(verification.method, "file_hash");
    assert.equal(verification.content_hash, sha256(content));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("file hash verification fails for wrong hash", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "hash.txt"), "actual content\n");

    const verification = await verifyMemorySource({
      root,
      sourceType: "file",
      sourceUri: "hash.txt",
      sourceHash: sha256("different content\n"),
      verifySource: true
    });

    assert.equal(verification.status, "failed");
    assert.equal(verification.method, "file_hash");
    assert.match(verification.reason, /hash did not match/i);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("file source path rejects absolute paths", async () => {
  const verification = await verifyMemorySource({
    root: "/tmp",
    sourceType: "file",
    sourceUri: "/tmp/package.json",
    quote: "name",
    verifySource: true
  });

  assert.equal(verification.status, "failed");
  assert.equal(verification.method, "none");
  assert.match(verification.reason, /repository-relative/i);
});

test("file source path rejects traversal", async () => {
  const verification = await verifyMemorySource({
    root: "/tmp",
    sourceType: "file",
    sourceUri: "../package.json",
    quote: "name",
    verifySource: true
  });

  assert.equal(verification.status, "failed");
  assert.equal(verification.method, "none");
  assert.match(verification.reason, /traversal/i);
});

test("file source path rejects local state, Git, dependency, build, and coverage paths", async () => {
  for (const sourceUri of [
    ".mempr/ledger.jsonl",
    ".git/config",
    "node_modules/pkg/index.js",
    "dist/index.js",
    "build/out.js",
    "coverage/lcov.info"
  ]) {
    const verification = await verifyMemorySource({
      root: "/tmp",
      sourceType: "file",
      sourceUri,
      quote: "name",
      verifySource: true
    });

    assert.equal(verification.status, "failed");
    assert.equal(verification.method, "none");
    assert.match(verification.reason, /MemPR, Git, dependency, build, or coverage paths/i);
  }
});

test("CLI propose source verification rejects FIFO source files without hanging or leaking paths", async () => {
  const rootSecret = fakeOpenAiKey("ProvenanceFifoRoot123456789012");
  const root = await mkdtemp(join(tmpdir(), `${rootSecret}-`));
  const source = "fifo-source.txt";

  try {
    await exec("mkfifo", [join(root, source)]);
    const started = Date.now();
    const result = await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "FIFO source verification should fail safely.",
      "--source",
      source,
      "--source-type",
      "file",
      "--verify-source",
      "--source-trust",
      "trusted",
      "--scope",
      "repo",
      "--destination",
      "MEMORY.md"
    ]);
    const elapsed = Date.now() - started;
    const record = JSON.parse(result.stdout);
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    assert(elapsed < 5_000, `FIFO source verification took ${elapsed}ms`);
    assert.equal(record.status, "pending");
    assert.equal(record.source.verification.status, "failed");
    assert.match(record.source.verification.reason, /could not be read/i);
    assert.doesNotMatch(combinedOutput, new RegExp(rootSecret));
    assert.doesNotMatch(combinedOutput, new RegExp(escapeRegExp(root)));
    assert.doesNotMatch(await fileTextOrNull(join(root, ".mempr", "events.jsonl")) ?? "", new RegExp(rootSecret));
    assert.doesNotMatch(await fileTextOrNull(join(root, ".mempr", "ledger.jsonl")) ?? "", new RegExp(rootSecret));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("file source verification rejects symlink, directory, and oversized sources", async () => {
  const root = await makeTempRoot();
  const outside = await makeTempRoot();

  try {
    await writeFile(join(outside, "outside.txt"), "outside target must not be read\n");
    await symlink(join(outside, "outside.txt"), join(root, "linked.txt"));
    await mkdir(join(root, "source-dir"));
    await writeFile(join(root, "oversized.txt"), "x".repeat(1024 * 1024 + 1));

    for (const source of ["linked.txt", "source-dir", "oversized.txt"]) {
      const verification = await verifyMemorySource({
        root,
        sourceType: "file",
        sourceUri: source,
        verifySource: true
      });

      assert.equal(verification.status, "failed", source);
      assert.match(verification.reason, /could not be read/i);
    }
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("file source verification rejects symlinked parent directories without reading outside content", async () => {
  const root = await makeTempRoot();
  const outside = await makeTempRoot();
  const source = "docs/sub/source.txt";
  const outsideContent = "Outside symlink parent source must never verify.\n";
  const outsideHash = sha256(outsideContent);

  try {
    await mkdir(join(outside, "sub"), { recursive: true });
    await writeFile(join(outside, "sub", "source.txt"), outsideContent);
    await symlink(outside, join(root, "docs"));

    const verification = await verifyMemorySource({
      root,
      sourceType: "file",
      sourceUri: source,
      quote: "Outside symlink parent source",
      verifySource: true
    });

    assert.equal(verification.status, "failed");
    assert.equal(verification.method, "none");
    assert.match(verification.reason, /could not be read/i);
    assert.notEqual(verification.content_hash, outsideHash);

    for (const [label, extraArgs, expectedStatus] of [
      ["without verify-source", [], "unverified"],
      ["with verify-source", ["--verify-source"], "failed"]
    ]) {
      const result = await runCli([
        "propose",
        "--root",
        root,
        "--json",
        "--memory",
        `Symlinked parent file source fixture ${label}.`,
        "--source",
        source,
        "--source-type",
        "file",
        "--source-trust",
        "trusted",
        "--scope",
        "repo",
        "--risk",
        "low",
        "--destination",
        "MEMORY.md",
        ...extraArgs
      ]);
      const record = JSON.parse(result.stdout);
      const combinedOutput = `${result.stdout}\n${result.stderr}`;

      assertUnverifiedFileReview(record);
      assert.equal(record.source.verification.status, expectedStatus);
      assert.notEqual(record.source.verification.content_hash, outsideHash);
      assert.doesNotMatch(combinedOutput, new RegExp(escapeRegExp(outsideContent.trim())));
    }
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("trusted file sources that cannot be verified require review without verify-source", async () => {
  for (const caseName of ["missing", "fifo", "directory", "symlink", "hardlink"]) {
    const root = await makeTempRoot();
    const outside = await makeTempRoot();

    try {
      const source = await createUnreadableFileSourceFixture(root, outside, caseName);
      const record = await proposeMemory({
        memory: `Unreadable trusted file source fixture: ${caseName}.`,
        source,
        sourceType: "file",
        sourceTrust: "trusted",
        scope: "repo",
        risk: "low",
        destination: "MEMORY.md"
      }, root);

      assertUnverifiedFileReview(record);
      assert.equal(record.source.verification.status, "unverified");
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  }
});

test("MCP trusted file sources that cannot be verified require review", async (t) => {
  const fixtures = [];

  t.after(async () => {
    for (const fixture of fixtures.reverse()) {
      await fixture.probe.close().catch(() => undefined);
      await rm(fixture.root, { force: true, recursive: true });
      await rm(fixture.outside, { force: true, recursive: true });
    }
  });

  for (const caseName of ["missing", "fifo", "directory", "symlink", "hardlink"]) {
    const root = await makeTempRoot();
    const outside = await makeTempRoot();
    const probe = await startInitializedProbe(root);

    fixtures.push({ root, outside, probe });

    const source = await createUnreadableFileSourceFixture(root, outside, caseName);
    const proposeResponse = await callTool(probe, "mempr.propose", {
      confirm: true,
      memory: `MCP unreadable trusted file source fixture: ${caseName}.`,
      source,
      sourceType: "file",
      sourceTrust: "trusted",
      scope: "repo",
      risk: "low",
      destination: "MEMORY.md"
    });
    const proposeResult = assertToolResult(proposeResponse);

    assertUnverifiedFileReview(proposeResult.structuredContent.record);
    assert.equal(proposeResult.structuredContent.record.source.verification.status, "unverified");

    const previewResponse = await callTool(probe, "mempr.preview_memory_diff", {
      memory: `MCP unreadable trusted file source preview fixture: ${caseName}.`,
      source,
      sourceType: "file",
      sourceTrust: "trusted",
      scope: "repo",
      risk: "low",
      destination: "MEMORY.md"
    });
    const previewResult = assertToolResult(previewResponse);

    assertUnverifiedFilePreviewReview(previewResult.structuredContent.preview);
    assert.equal(previewResult.structuredContent.preview.sourceVerification.status, "unverified");
  }
});

test("MCP preview rejects symlinked source parents without verified outside evidence", async (t) => {
  const root = await makeTempRoot();
  const outside = await makeTempRoot();
  const source = "docs/sub/source.txt";
  const outsideContent = "MCP outside symlink parent source must never verify.\n";
  const outsideHash = sha256(outsideContent);
  const probe = await startInitializedProbe(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  });

  await mkdir(join(outside, "sub"), { recursive: true });
  await writeFile(join(outside, "sub", "source.txt"), outsideContent);
  await symlink(outside, join(root, "docs"));

  const beforeLedger = await fileTextOrNull(join(root, ".mempr", "ledger.jsonl"));
  const beforeEvents = await fileTextOrNull(join(root, ".mempr", "events.jsonl"));
  const response = await callTool(probe, "mempr.preview_memory_diff", {
    memory: "MCP preview symlinked parent source fixture.",
    source,
    sourceType: "file",
    sourceTrust: "trusted",
    scope: "repo",
    risk: "low",
    destination: "MEMORY.md"
  });
  const result = assertToolResult(response);
  const preview = result.structuredContent.preview;
  const serialized = JSON.stringify(result);

  assertUnverifiedFilePreviewReview(preview);
  assert.equal(preview.sourceVerification.status, "unverified");
  assert.notEqual(preview.sourceVerification.content_hash, outsideHash);
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(outsideContent.trim())));
  assert.equal(await fileTextOrNull(join(root, ".mempr", "ledger.jsonl")), beforeLedger);
  assert.equal(await fileTextOrNull(join(root, ".mempr", "events.jsonl")), beforeEvents);
});

test("hardlinked file sources cannot verify outside content", async (t) => {
  const root = await makeTempRoot();
  const outside = await makeTempRoot();
  const source = "source.txt";
  const quoteContent = "Use hardlinked outside content.";
  const outsideOnlyContent = "Outside-only hardlinked file content must not be echoed.";
  const fullOutsideContent = `${quoteContent}\n${outsideOnlyContent}\n`;
  const outsideHash = sha256(fullOutsideContent);
  const probe = await startInitializedProbe(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  });

  await writeFile(join(outside, "source.txt"), fullOutsideContent);
  await link(join(outside, "source.txt"), join(root, source));

  const verification = await verifyMemorySource({
    root,
    sourceType: "file",
    sourceUri: source,
    quote: quoteContent,
    verifySource: true
  });

  assert.equal(verification.status, "failed");
  assert.match(verification.reason, /single-link|read/i);
  assert.notEqual(verification.content_hash, outsideHash);

  const memory = "Hardlinked file source must require review.";
  const record = await proposeMemory({
    memory,
    source,
    sourceType: "file",
    sourceTrust: "trusted",
    quote: quoteContent,
    scope: "repo",
    risk: "low",
    destination: "MEMORY.md"
  }, root);

  assertVerificationReview(record, /single-link|read/i);
  assert.notEqual(record.source.verification.content_hash, outsideHash);

  const cli = await runCli([
    "propose",
    "--root",
    root,
    "--json",
    "--memory",
    memory,
    "--source",
    source,
    "--source-type",
    "file",
    "--source-trust",
    "trusted",
    "--scope",
    "repo",
    "--risk",
    "low",
    "--destination",
    "MEMORY.md",
    "--quote",
    quoteContent
  ]);
  const cliRecord = JSON.parse(cli.stdout);

  assertVerificationReview(cliRecord, /single-link|read/i);
  assert.notEqual(cliRecord.source.verification.content_hash, outsideHash);
  assert.doesNotMatch(`${cli.stdout}\n${cli.stderr}`, new RegExp(escapeRegExp(outsideOnlyContent)));

  const previewResponse = await callTool(probe, "mempr.preview_memory_diff", {
    memory,
    source,
    sourceType: "file",
    sourceTrust: "trusted",
    scope: "repo",
    risk: "low",
    destination: "MEMORY.md",
    quote: quoteContent
  });
  const previewResult = assertToolResult(previewResponse);
  const preview = previewResult.structuredContent.preview;

  assert.equal(preview.policy.decision, "review");
  assert.equal(preview.policy.risk, "medium");
  assert.equal(preview.policy.reason, FILE_SOURCE_REVIEW_REASON);
  assert.equal(preview.sourceVerification.status, "failed");
  assert.match(preview.sourceVerification.reason, /single-link|read/i);
  assert.notEqual(preview.sourceVerification.content_hash, outsideHash);
  assert.doesNotMatch(JSON.stringify(previewResult), new RegExp(escapeRegExp(outsideOnlyContent)));
});

test("URL source does not fetch network and remains unverified", async () => {
  const verification = await verifyMemorySource({
    root: "/tmp",
    sourceType: "url",
    sourceUri: "https://example.test/mempr",
    sourceHash: sha256("remote content"),
    verifySource: true
  });

  assert.equal(verification.status, "unverified");
  assert.equal(verification.method, "url_hash");
  assert.equal(verification.content_hash, sha256("remote content"));
});

test("manual source is not applicable", async () => {
  const verification = await verifyMemorySource({
    root: "/tmp",
    sourceType: "manual",
    sourceUri: "manual"
  });

  assert.equal(verification.status, "not_applicable");
  assert.equal(verification.method, "manual");
  assert.equal(verification.reason, "Manual source has no verifiable backing document.");
});

test("legacy records without verification normalize with the unverified default", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeMemory({
      memory: "Legacy records normalize missing provenance metadata."
    }, root);
    const ledgerPath = join(root, ".mempr", "ledger.jsonl");
    const legacyRecord = {
      ...record,
      source: {
        type: record.source.type,
        uri: record.source.uri
      }
    };

    await writeFile(ledgerPath, `${JSON.stringify(legacyRecord)}\n`);

    const [normalized] = await listRecords({}, root);

    assert.deepEqual(normalized.source.verification, {
      status: "unverified",
      method: "none",
      checked_at: null,
      reason: "Record was created before source verification metadata existed."
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("autoAcceptRequiresVerifiedSource forces unverified low-risk trusted sources to review", async () => {
  const root = await makeTempRoot();

  try {
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(join(root, ".mempr", "policy.json"), JSON.stringify({
      autoAcceptRequiresVerifiedSource: true
    }));

    const record = await proposeMemory({
      memory: "Trusted low-risk source still needs verification.",
      source: "docs/missing.md",
      sourceTrust: "trusted",
      scope: "repo",
      risk: "low"
    }, root);

    assert.equal(record.risk, "medium");
    assert.equal(record.decision, "review");
    assert.equal(record.status, "pending");
    assert.equal(record.source.verification?.status, "unverified");
    assert.equal(record.decision_reason, FILE_SOURCE_REVIEW_REASON);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("API source verification failures never auto-accept low-risk trusted proposals", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "package.txt"), "Package text says use pnpm.\n");
    const wrongHash = sha256("different package text\n");
    const cases = [
      {
        label: "missing file with verifySource",
        input: {
          source: "missing-file.txt",
          verifySource: true
        },
        verificationReason: /could not be read/i
      },
      {
        label: "missing file with quote evidence",
        input: {
          source: "missing-quote.txt",
          quote: "npm"
        },
        verificationReason: /could not be read/i
      },
      {
        label: "missing file with hash evidence",
        input: {
          source: "missing-hash.txt",
          sourceHash: wrongHash
        },
        verificationReason: /could not be read/i
      },
      {
        label: "missing file with line evidence",
        input: {
          source: "missing-lines.txt",
          sourceLineStart: 1,
          sourceLineEnd: 1
        },
        verificationReason: /could not be read/i
      },
      {
        label: "wrong quote",
        input: {
          source: "package.txt",
          quote: "not present"
        },
        verificationReason: /quote was not found/i
      },
      {
        label: "wrong hash",
        input: {
          source: "package.txt",
          sourceHash: wrongHash
        },
        verificationReason: /hash did not match/i
      }
    ];

    for (const testCase of cases) {
      const record = await proposeMemory({
        memory: `API verification failure fixture: ${testCase.label}.`,
        sourceTrust: "trusted",
        scope: "repo",
        risk: "low",
        destination: "MEMORY.md",
        ...testCase.input
      }, root);

      assertVerificationReview(record, testCase.verificationReason);
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI source verification failures never auto-accept low-risk trusted proposals", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "package.txt"), "Package text says use pnpm.\n");
    const wrongHash = sha256("different package text\n");
    const cases = [
      {
        label: "missing file with verifySource",
        args: [
          "--source",
          "missing-file.txt",
          "--verify-source"
        ],
        verificationReason: /could not be read/i
      },
      {
        label: "missing file with quote evidence",
        args: [
          "--source",
          "missing-quote.txt",
          "--quote",
          "npm"
        ],
        verificationReason: /could not be read/i
      },
      {
        label: "missing file with hash evidence",
        args: [
          "--source",
          "missing-hash.txt",
          "--source-hash",
          wrongHash
        ],
        verificationReason: /could not be read/i
      },
      {
        label: "missing file with line evidence",
        args: [
          "--source",
          "missing-lines.txt",
          "--source-line-start",
          "1",
          "--source-line-end",
          "1"
        ],
        verificationReason: /could not be read/i
      },
      {
        label: "wrong quote",
        args: [
          "--source",
          "package.txt",
          "--quote",
          "not present"
        ],
        verificationReason: /quote was not found/i
      },
      {
        label: "wrong hash",
        args: [
          "--source",
          "package.txt",
          "--source-hash",
          wrongHash
        ],
        verificationReason: /hash did not match/i
      }
    ];

    for (const testCase of cases) {
      const result = await runCli([
        "propose",
        "--root",
        root,
        "--json",
        "--memory",
        `CLI verification failure fixture: ${testCase.label}.`,
        "--source-trust",
        "trusted",
        "--scope",
        "repo",
        "--risk",
        "low",
        "--destination",
        "MEMORY.md",
        ...testCase.args
      ]);
      const record = JSON.parse(result.stdout);

      assertVerificationReview(record, testCase.verificationReason);
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("MCP source verification failures never auto-accept low-risk trusted proposals", async (t) => {
  const root = await makeTempRoot();
  const probe = await startInitializedProbe(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
  });

  await writeFile(join(root, "package.txt"), "Package text says use pnpm.\n");
  const wrongHash = sha256("different package text\n");
  const cases = [
    {
      label: "missing file with verifySource",
      args: {
        source: "missing-file.txt",
        verifySource: true
      },
      verificationReason: /could not be read/i
    },
    {
      label: "missing file with quote evidence",
      args: {
        source: "missing-quote.txt",
        quote: "npm"
      },
      verificationReason: /could not be read/i
    },
    {
      label: "missing file with hash evidence",
      args: {
        source: "missing-hash.txt",
        sourceHash: wrongHash
      },
      verificationReason: /could not be read/i
    },
    {
      label: "missing file with line evidence",
      args: {
        source: "missing-lines.txt",
        sourceLineStart: 1,
        sourceLineEnd: 1
      },
      verificationReason: /could not be read/i
    },
    {
      label: "wrong quote",
      args: {
        source: "package.txt",
        quote: "not present"
      },
      verificationReason: /quote was not found/i
    },
    {
      label: "wrong hash",
      args: {
        source: "package.txt",
        sourceHash: wrongHash
      },
      verificationReason: /hash did not match/i
    }
  ];

  for (const testCase of cases) {
    const response = await callTool(probe, "mempr.propose", {
      confirm: true,
      memory: `MCP verification failure fixture: ${testCase.label}.`,
      sourceTrust: "trusted",
      scope: "repo",
      risk: "low",
      destination: "MEMORY.md",
      ...testCase.args
    });
    const result = assertToolResult(response);

    assertVerificationReview(result.structuredContent.record, testCase.verificationReason);
  }
});

test("MCP preview reports failed source evidence as review without writes", async (t) => {
  const root = await makeTempRoot();
  const probe = await startInitializedProbe(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
  });

  const beforeLedger = await fileTextOrNull(join(root, ".mempr", "ledger.jsonl"));
  const beforeEvents = await fileTextOrNull(join(root, ".mempr", "events.jsonl"));
  const wrongHash = sha256("different package text\n");
  const cases = [
    {
      label: "missing file with verifySource",
      args: {
        source: "missing-file.txt",
        verifySource: true
      }
    },
    {
      label: "missing file with quote evidence",
      args: {
        source: "missing-quote.txt",
        quote: "npm"
      }
    },
    {
      label: "missing file with hash evidence",
      args: {
        source: "missing-hash.txt",
        sourceHash: wrongHash
      }
    },
    {
      label: "missing file with line evidence",
      args: {
        source: "missing-lines.txt",
        sourceLineStart: 1,
        sourceLineEnd: 1
      }
    }
  ];

  for (const testCase of cases) {
    const response = await callTool(probe, "mempr.preview_memory_diff", {
      memory: `Preview failed evidence fixture: ${testCase.label}.`,
      sourceTrust: "trusted",
      scope: "repo",
      risk: "low",
      destination: "MEMORY.md",
      ...testCase.args
    });
    const result = assertToolResult(response);
    const preview = result.structuredContent.preview;

    assert.equal(preview.policy.decision, "review");
    assert.equal(preview.policy.risk, "medium");
    assert.equal(preview.policy.reason, FILE_SOURCE_REVIEW_REASON);
    assert.equal(preview.sourceVerification.status, "failed");
    assert.match(preview.sourceVerification.reason, /could not be read/i);
  }

  assert.equal(await fileTextOrNull(join(root, ".mempr", "ledger.jsonl")), beforeLedger);
  assert.equal(await fileTextOrNull(join(root, ".mempr", "events.jsonl")), beforeEvents);
});

test("CLI flags populate verification metadata", async () => {
  const root = await makeTempRoot();
  const source = "docs/provenance.md";

  try {
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, source), [
      "# Provenance",
      "MemPR verifies quoted source lines before auto-accepting durable memory."
    ].join("\n"));

    const result = await runCli([
      "propose",
      "--root",
      root,
      "--json",
      "--memory",
      "MemPR verifies quoted source lines.",
      "--source",
      source,
      "--source-trust",
      "trusted",
      "--scope",
      "repo",
      "--risk",
      "low",
      "--quote",
      "verifies quoted source lines",
      "--source-line-start",
      "2",
      "--source-line-end",
      "2",
      "--verify-source",
      "--git-commit",
      "abc123"
    ]);
    const record = JSON.parse(result.stdout);

    assert.equal(record.status, "accepted");
    assert.equal(record.source.verification.status, "verified");
    assert.equal(record.source.verification.method, "file_quote");
    assert.equal(record.source.verification.path, source);
    assert.equal(record.source.verification.start_line, 2);
    assert.equal(record.source.verification.end_line, 2);
    assert.equal(record.source.verification.git_commit, "abc123");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("MCP args populate verification metadata", async (t) => {
  const root = await makeTempRoot();
  const source = "docs/mcp-provenance.md";
  const probe = await startInitializedProbe(root);

  t.after(async () => {
    await probe.close();
    await rm(root, { force: true, recursive: true });
  });

  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, source), [
    "# MCP Provenance",
    "MCP proposals can carry source verification inputs."
  ].join("\n"));

  const response = await callTool(probe, "mempr.propose", {
    confirm: true,
    memory: "MCP proposals carry source verification inputs.",
    source,
    sourceTrust: "trusted",
    scope: "repo",
    risk: "low",
    quote: "carry source verification inputs",
    verifySource: true,
    sourceLineStart: 2,
    sourceLineEnd: 2,
    gitCommit: "def456"
  });
  const result = assertToolResult(response);
  const verification = result.structuredContent.record.source.verification;

  assert.equal(result.structuredContent.record.status, "accepted");
  assert.equal(verification.status, "verified");
  assert.equal(verification.method, "file_quote");
  assert.equal(verification.path, source);
  assert.equal(verification.start_line, 2);
  assert.equal(verification.end_line, 2);
  assert.equal(verification.git_commit, "def456");
});

test("export renders verification status safely", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "README.md"), "# MemPR\nVerified export provenance.\n");
    const record = await proposeMemory({
      memory: "Verified export provenance.",
      source: "README.md",
      sourceTrust: "trusted",
      scope: "repo",
      risk: "low",
      quote: "Verified export provenance.",
      sourceLineStart: 2,
      sourceLineEnd: 2,
      verifySource: true
    }, root);
    const preview = await exportMarkdown("MEMORY.md", root, { dryRun: true });

    assert.equal(record.status, "accepted");
    assert.match(preview.safe_content_preview, /source_verified: "verified"/);
    assert.match(preview.safe_content_preview, /source_verification_method: "file_quote"/);
    assert.match(preview.safe_content_preview, /source_lines: "2-2"/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("review and history rendering show verification summaries", async () => {
  const root = await makeTempRoot();

  try {
    await writeFile(join(root, "README.md"), "# MemPR\nRender verified provenance.\n");
    const record = await proposeMemory({
      memory: "Render verified provenance.",
      source: "README.md",
      sourceTrust: "trusted",
      scope: "repo",
      risk: "low",
      quote: "Render verified provenance.",
      sourceLineStart: 2,
      sourceLineEnd: 2,
      verifySource: true
    }, root);
    const reviewText = renderReviewContext(await getReviewContext(record.id, root));
    const historyText = renderRecordHistory(await getRecordHistory(record.id, root));

    assert.match(
      reviewText,
      /source_verification: verified via file_quote README\.md:2-2/
    );
    assert.match(
      historyText,
      /source_verification: verified via file_quote README\.md:2-2/
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function runCli(args) {
  return exec(process.execPath, [CLI_PATH, ...args], {
    env: {
      ...process.env,
      NO_COLOR: "1"
    },
    timeout: 5_000,
    killSignal: "SIGKILL"
  });
}

async function startInitializedProbe(root) {
  const probe = new StdioMcpProbe(root);

  await initialize(probe);
  probe.notify("notifications/initialized");

  return probe;
}

function callTool(probe, name, args = {}) {
  return probe.request("tools/call", {
    name,
    arguments: args
  });
}

async function initialize(probe) {
  const response = await probe.request("initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: "mempr-provenance-tests",
      version: "0.0.0"
    }
  });

  assertJsonRpcSuccess(response);
  return response.result;
}

function assertToolResult(response) {
  assertJsonRpcSuccess(response);
  assert.equal(response.result.isError, undefined, toolText(response.result));
  assert(Array.isArray(response.result.content), "Expected MCP tool content array.");
  assert(isRecord(response.result.structuredContent), "Expected structuredContent.");
  return response.result;
}

function assertJsonRpcSuccess(response) {
  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  assert(response.result !== undefined, "Expected JSON-RPC result.");
}

function toolText(result) {
  return Array.isArray(result.content)
    ? result.content.map((entry) => entry.text).join("\n")
    : "";
}

function assertVerificationReview(record, verificationReason) {
  assert.equal(record.status, "pending");
  assert.equal(record.decision, "review");
  assert.equal(record.risk, "medium");
  assert.equal(record.decision_reason, FILE_SOURCE_REVIEW_REASON);
  assert.equal(record.source.verification.status, "failed");
  assert.match(record.source.verification.reason, verificationReason);
}

function assertUnverifiedFileReview(record) {
  assert.equal(record.status, "pending");
  assert.equal(record.decision, "review");
  assert.equal(record.risk, "medium");
  assert.equal(record.decision_reason, FILE_SOURCE_REVIEW_REASON);
  assert.notEqual(record.source.verification.status, "verified");
}

function assertUnverifiedFilePreviewReview(preview) {
  assert.equal(preview.policy.decision, "review");
  assert.equal(preview.policy.risk, "medium");
  assert.equal(preview.policy.reason, FILE_SOURCE_REVIEW_REASON);
  assert.notEqual(preview.sourceVerification.status, "verified");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function createUnreadableFileSourceFixture(root, outside, caseName) {
  switch (caseName) {
    case "missing":
      return "missing-source.txt";
    case "fifo":
      await exec("mkfifo", [join(root, "fifo-source.txt")], {
        timeout: 5_000,
        killSignal: "SIGKILL"
      });
      return "fifo-source.txt";
    case "directory":
      await mkdir(join(root, "source-dir"));
      return "source-dir";
    case "symlink":
      await writeFile(join(outside, "source.txt"), "outside final symlink source must not be read\n");
      await symlink(join(outside, "source.txt"), join(root, "linked-source.txt"));
      return "linked-source.txt";
    case "hardlink":
      await writeFile(join(outside, "source.txt"), "outside hardlinked source must not be read\n");
      await link(join(outside, "source.txt"), join(root, "hardlinked-source.txt"));
      return "hardlinked-source.txt";
    default:
      throw new Error(`Unknown unreadable source fixture: ${caseName}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-provenance-"));
}

async function fileTextOrNull(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class StdioMcpProbe {
  constructor(root) {
    this.root = root;
    this.nextId = 1;
    this.messages = [];
    this.stdoutText = "";
    this.stderrText = "";
    this.stdoutBuffer = "";
    this.responses = new Map();
    this.responseWaiters = new Map();
    this.exit = undefined;
    this.child = spawn(process.execPath, [MCP_STDIO_PATH], {
      cwd: root,
      env: {
        ...process.env,
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

    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.responseWaiters.delete(id);
        rejectPromise(new Error(this.describeFailure(`Timed out waiting for ${label}`)));
      }, RESPONSE_TIMEOUT_MS);

      this.responseWaiters.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolvePromise(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          rejectPromise(error);
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
  }

  describeFailure(message) {
    return [
      message,
      `stdout: ${this.stdoutText}`,
      `stderr: ${this.stderrText}`,
      this.exit ? `exit: ${JSON.stringify(this.exit)}` : undefined
    ].filter(Boolean).join("\n");
  }

  rejectPending(error) {
    for (const waiter of this.responseWaiters.values()) {
      waiter.reject(error);
    }

    this.responseWaiters.clear();
  }

  async close() {
    await closeChildProcess(this.child);
  }
}
