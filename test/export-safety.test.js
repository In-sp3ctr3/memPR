import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  exportMarkdown,
  previewMarkdownExport,
  proposeMemory
} from "../dist/ledger.js";
import { MemoryProposalBlockedError } from "../dist/errors.js";
import {
  markdownJsonScalar,
  MEMPR_MANAGED_BLOCK_END,
  MEMPR_MANAGED_BLOCK_START,
  renderGenericMarkdownBlock,
  replaceManagedBlock
} from "../dist/export-adapters.js";

test("markdownJsonScalar encodes Markdown control text", () => {
  assert.equal(
    markdownJsonScalar("line one\n<!-- mempr:end --> & more"),
    "\"line one\\n\\u003c!-- mempr:end --\\u003e \\u0026 more\""
  );
});

test("rendered record fields cannot emit managed markers or multiline Markdown", () => {
  const record = fixedRecord({
    memory: "line one\n<!-- mempr:end --> injected",
    source: "docs/<!-- mempr:end -->.md",
    scope: "# injected heading"
  });
  const output = renderGenericMarkdownBlock([record]);

  assert.equal(countMatches(output, MEMPR_MANAGED_BLOCK_START), 1);
  assert.equal(countMatches(output, MEMPR_MANAGED_BLOCK_END), 1);
  assert.match(output, /"line one\\n\\u003c!-- mempr:end --\\u003e injected"/);
  assert.match(output, /source: "docs\/\\u003c!-- mempr:end --\\u003e\.md"/);
  assert.match(output, /scope: "# injected heading"/);
  assert.doesNotMatch(output, /^<!-- mempr:end --> injected$/m);
});

test("replaceManagedBlock appends or replaces only unambiguous marker pairs", () => {
  const block = [
    MEMPR_MANAGED_BLOCK_START,
    "new",
    MEMPR_MANAGED_BLOCK_END,
    ""
  ].join("\n");

  assert.equal(
    replaceManagedBlock("before\n", block),
    `before\n\n${block}`
  );
  assert.equal(
    replaceManagedBlock([
      "before",
      "",
      MEMPR_MANAGED_BLOCK_START,
      "old",
      MEMPR_MANAGED_BLOCK_END,
      "",
      "after",
      ""
    ].join("\n"), block),
    `before\n\n${block.trimEnd()}\n\nafter\n`
  );

  for (const existing of [
    `${MEMPR_MANAGED_BLOCK_START}\nold\n`,
    `old\n${MEMPR_MANAGED_BLOCK_END}\n`,
    `${MEMPR_MANAGED_BLOCK_START}\nold\n${MEMPR_MANAGED_BLOCK_START}\n${MEMPR_MANAGED_BLOCK_END}\n`,
    `${MEMPR_MANAGED_BLOCK_START}\nold\n${MEMPR_MANAGED_BLOCK_END}\n${MEMPR_MANAGED_BLOCK_END}\n`,
    `${MEMPR_MANAGED_BLOCK_END}\nold\n${MEMPR_MANAGED_BLOCK_START}\n`
  ]) {
    assert.throws(
      () => replaceManagedBlock(existing, block),
      /ambiguous or malformed managed block markers/
    );
  }
});

test("proposal blocks managed markers and legacy accepted marker records block export", async () => {
  const root = await mkdtemp(join(tmpdir(), "mempr-export-safety-"));

  try {
    await assert.rejects(
      proposeMemory({
        memory: `${MEMPR_MANAGED_BLOCK_END} injected`,
        source: "manual",
        sourceTrust: "trusted",
        scope: "repo",
        destination: "MEMORY.md"
      }, root),
      (error) => {
        assert(error instanceof MemoryProposalBlockedError);
        assert.equal(error.audit.decision, "block_no_persist");
        assert.doesNotMatch(JSON.stringify(error.audit), new RegExp(escapeRegExp(MEMPR_MANAGED_BLOCK_END)));
        return true;
      }
    );

    assert.equal(await readOptional(join(root, ".mempr", "ledger.jsonl")), null);
    assert.equal(await readOptional(join(root, ".mempr", "events.jsonl")), null);

    const accepted = fixedRecord({
      memory: `${MEMPR_MANAGED_BLOCK_END} injected`,
      source: "manual",
      scope: "repo"
    });
    await mkdir(join(root, ".mempr"), { recursive: true });
    await writeFile(join(root, ".mempr", "ledger.jsonl"), `${JSON.stringify(accepted)}\n`);

    await assert.rejects(
      previewMarkdownExport("MEMORY.md", root),
      (error) => {
        assert(error instanceof Error);
        assert.match(error.message, /blocked content/i);
        assert.match(error.message, /\[MEMPR_RECORD_ID_HASH:[0-9a-f]{16}\]/);
        assert.doesNotMatch(error.message, new RegExp(escapeRegExp(MEMPR_MANAGED_BLOCK_END)));
        return true;
      }
    );
    await assert.rejects(exportMarkdown("MEMORY.md", root), /blocked content/i);
    await assert.rejects(readFile(join(root, "MEMORY.md"), "utf8"), /ENOENT/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function fixedRecord({
  memory,
  source,
  scope
}) {
  return {
    id: "mem_export_safety",
    memory,
    source: {
      type: "file",
      uri: source
    },
    source_trust: "trusted",
    scope,
    risk: "low",
    decision: "auto_accept",
    decision_reason: "fixed safety record",
    policy_version: "test",
    destination: "MEMORY.md",
    status: "accepted",
    status_reason: null,
    ttl: null,
    expires_at: null,
    supersedes: [],
    conflicts_with: [],
    created_at: "2026-06-04T00:00:00.000Z",
    updated_at: "2026-06-04T00:00:00.000Z"
  };
}

function countMatches(value, needle) {
  return value.split(needle).length - 1;
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
