import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import {
  exportMarkdown,
  previewMarkdownExport,
  proposeMemory,
  updateRecordStatus
} from "../dist/ledger.js";
import { readEvents } from "../dist/events.js";
import {
  renderAgentsMarkdownBlock,
  renderClaudeMarkdownBlock,
  renderGenericMarkdownBlock,
  selectExportAdapter
} from "../dist/export-adapters.js";

const FIXED_RECORDS = [
  fixedRecord({
    id: "mem_0001_npm",
    memory: "This repository uses npm scripts for build and test.",
    scope: "repo",
    source: { type: "file", uri: "package.json" },
    sourceTrust: "trusted",
    createdAt: "2026-05-21T10:00:00.000Z"
  }),
  fixedRecord({
    id: "mem_0002_reviews",
    memory: "Prefer concise PR review comments.",
    scope: "user",
    source: { type: "manual", uri: "manual" },
    sourceTrust: "unknown",
    createdAt: "2026-05-21T10:05:00.000Z"
  })
];

const GROUPED_RECORDS = [
  fixedRecord({
    id: "mem_1001_zeta_first",
    memory: "Zeta scope first input record.",
    scope: "zeta",
    source: { type: "manual", uri: "zeta-first" },
    sourceTrust: "unknown",
    createdAt: "2026-05-21T11:00:00.000Z"
  }),
  fixedRecord({
    id: "mem_1002_user_first",
    memory: "User scope first input record.",
    scope: "user",
    source: { type: "manual", uri: "user-first" },
    sourceTrust: "trusted",
    createdAt: "2026-05-21T11:01:00.000Z"
  }),
  fixedRecord({
    id: "mem_1003_repo_first",
    memory: "Repo scope first input record.",
    scope: "repo",
    source: { type: "file", uri: "repo-first.md" },
    sourceTrust: "trusted",
    createdAt: "2026-05-21T11:02:00.000Z"
  }),
  fixedRecord({
    id: "mem_1004_project_first",
    memory: "Project scope first input record.",
    scope: "project",
    source: { type: "file", uri: "project-first.md" },
    sourceTrust: "unknown",
    createdAt: "2026-05-21T11:03:00.000Z"
  }),
  fixedRecord({
    id: "mem_1005_alpha_first",
    memory: "Alpha scope first input record.",
    scope: "alpha",
    source: { type: "manual", uri: "alpha-first" },
    sourceTrust: "unknown",
    createdAt: "2026-05-21T11:04:00.000Z"
  }),
  fixedRecord({
    id: "mem_1006_user_second",
    memory: "User scope second input record.",
    scope: "user",
    source: { type: "manual", uri: "user-second" },
    sourceTrust: "unknown",
    createdAt: "2026-05-21T11:05:00.000Z"
  }),
  fixedRecord({
    id: "mem_1007_repo_second",
    memory: "Repo scope second input record.",
    scope: "repo",
    source: { type: "file", uri: "repo-second.md" },
    sourceTrust: "unknown",
    createdAt: "2026-05-21T11:06:00.000Z"
  }),
  fixedRecord({
    id: "mem_1008_zeta_second",
    memory: "Zeta scope second input record.",
    scope: "zeta",
    source: { type: "manual", uri: "zeta-second" },
    sourceTrust: "trusted",
    createdAt: "2026-05-21T11:07:00.000Z"
  })
];

test("generic Markdown managed block output is stable for fixed records", () => {
  assert.equal(
    renderGenericMarkdownBlock(FIXED_RECORDS),
    [
      "<!-- mempr:start -->",
      "## Accepted Memories",
      "",
      "- This repository uses npm scripts for build and test.",
      "  - scope: repo",
      "  - source: package.json",
      "  - source_trust: trusted",
      "  - id: mem_0001_npm",
      "- Prefer concise PR review comments.",
      "  - scope: user",
      "  - source: manual",
      "  - source_trust: unknown",
      "  - id: mem_0002_reviews",
      "",
      "<!-- mempr:end -->",
      ""
    ].join("\n")
  );
});

test("AGENTS.md adapter output is stable for fixed and empty record sets", () => {
  assert.equal(
    renderAgentsMarkdownBlock(FIXED_RECORDS),
    [
      "<!-- mempr:start -->",
      "## MemPR Coding Agent Memories",
      "",
      "Accepted memories for coding agents. Use them as repository context and keep the provenance attached to each item.",
      "",
      "### repo",
      "",
      "- This repository uses npm scripts for build and test.",
      "  - scope: repo",
      "  - source: package.json",
      "  - source_trust: trusted",
      "  - id: mem_0001_npm",
      "",
      "### user",
      "",
      "- Prefer concise PR review comments.",
      "  - scope: user",
      "  - source: manual",
      "  - source_trust: unknown",
      "  - id: mem_0002_reviews",
      "",
      "<!-- mempr:end -->",
      ""
    ].join("\n")
  );

  assert.equal(
    renderAgentsMarkdownBlock([]),
    [
      "<!-- mempr:start -->",
      "## MemPR Coding Agent Memories",
      "",
      "Accepted memories for coding agents. Use them as repository context and keep the provenance attached to each item.",
      "",
      "_No accepted MemPR memories for coding agents yet._",
      "",
      "<!-- mempr:end -->",
      ""
    ].join("\n")
  );
});

test("CLAUDE.md adapter output is stable for fixed and empty record sets", () => {
  assert.equal(
    renderClaudeMarkdownBlock(FIXED_RECORDS),
    [
      "<!-- mempr:start -->",
      "## MemPR Claude Project Context",
      "",
      "Accepted project context for Claude. Keep it concise, specific, and traceable.",
      "",
      "### repo",
      "",
      "- This repository uses npm scripts for build and test.",
      "  - scope: repo",
      "  - source: package.json",
      "  - source_trust: trusted",
      "  - id: mem_0001_npm",
      "",
      "### user",
      "",
      "- Prefer concise PR review comments.",
      "  - scope: user",
      "  - source: manual",
      "  - source_trust: unknown",
      "  - id: mem_0002_reviews",
      "",
      "<!-- mempr:end -->",
      ""
    ].join("\n")
  );

  assert.equal(
    renderClaudeMarkdownBlock([]),
    [
      "<!-- mempr:start -->",
      "## MemPR Claude Project Context",
      "",
      "Accepted project context for Claude. Keep it concise, specific, and traceable.",
      "",
      "_No accepted MemPR memories for Claude yet._",
      "",
      "<!-- mempr:end -->",
      ""
    ].join("\n")
  );
});

test("AGENTS.md adapter groups scopes deterministically and preserves record order", () => {
  assert.equal(
    renderAgentsMarkdownBlock(GROUPED_RECORDS),
    [
      "<!-- mempr:start -->",
      "## MemPR Coding Agent Memories",
      "",
      "Accepted memories for coding agents. Use them as repository context and keep the provenance attached to each item.",
      "",
      "### repo",
      "",
      "- Repo scope first input record.",
      "  - scope: repo",
      "  - source: repo-first.md",
      "  - source_trust: trusted",
      "  - id: mem_1003_repo_first",
      "- Repo scope second input record.",
      "  - scope: repo",
      "  - source: repo-second.md",
      "  - source_trust: unknown",
      "  - id: mem_1007_repo_second",
      "",
      "### project",
      "",
      "- Project scope first input record.",
      "  - scope: project",
      "  - source: project-first.md",
      "  - source_trust: unknown",
      "  - id: mem_1004_project_first",
      "",
      "### user",
      "",
      "- User scope first input record.",
      "  - scope: user",
      "  - source: user-first",
      "  - source_trust: trusted",
      "  - id: mem_1002_user_first",
      "- User scope second input record.",
      "  - scope: user",
      "  - source: user-second",
      "  - source_trust: unknown",
      "  - id: mem_1006_user_second",
      "",
      "### alpha",
      "",
      "- Alpha scope first input record.",
      "  - scope: alpha",
      "  - source: alpha-first",
      "  - source_trust: unknown",
      "  - id: mem_1005_alpha_first",
      "",
      "### zeta",
      "",
      "- Zeta scope first input record.",
      "  - scope: zeta",
      "  - source: zeta-first",
      "  - source_trust: unknown",
      "  - id: mem_1001_zeta_first",
      "- Zeta scope second input record.",
      "  - scope: zeta",
      "  - source: zeta-second",
      "  - source_trust: trusted",
      "  - id: mem_1008_zeta_second",
      "",
      "<!-- mempr:end -->",
      ""
    ].join("\n")
  );
});

test("CLAUDE.md adapter groups scopes deterministically and preserves record order", () => {
  assert.equal(
    renderClaudeMarkdownBlock(GROUPED_RECORDS),
    [
      "<!-- mempr:start -->",
      "## MemPR Claude Project Context",
      "",
      "Accepted project context for Claude. Keep it concise, specific, and traceable.",
      "",
      "### repo",
      "",
      "- Repo scope first input record.",
      "  - scope: repo",
      "  - source: repo-first.md",
      "  - source_trust: trusted",
      "  - id: mem_1003_repo_first",
      "- Repo scope second input record.",
      "  - scope: repo",
      "  - source: repo-second.md",
      "  - source_trust: unknown",
      "  - id: mem_1007_repo_second",
      "",
      "### project",
      "",
      "- Project scope first input record.",
      "  - scope: project",
      "  - source: project-first.md",
      "  - source_trust: unknown",
      "  - id: mem_1004_project_first",
      "",
      "### user",
      "",
      "- User scope first input record.",
      "  - scope: user",
      "  - source: user-first",
      "  - source_trust: trusted",
      "  - id: mem_1002_user_first",
      "- User scope second input record.",
      "  - scope: user",
      "  - source: user-second",
      "  - source_trust: unknown",
      "  - id: mem_1006_user_second",
      "",
      "### alpha",
      "",
      "- Alpha scope first input record.",
      "  - scope: alpha",
      "  - source: alpha-first",
      "  - source_trust: unknown",
      "  - id: mem_1005_alpha_first",
      "",
      "### zeta",
      "",
      "- Zeta scope first input record.",
      "  - scope: zeta",
      "  - source: zeta-first",
      "  - source_trust: unknown",
      "  - id: mem_1001_zeta_first",
      "- Zeta scope second input record.",
      "  - scope: zeta",
      "  - source: zeta-second",
      "  - source_trust: trusted",
      "  - id: mem_1008_zeta_second",
      "",
      "<!-- mempr:end -->",
      ""
    ].join("\n")
  );
});

test("AGENTS.md and CLAUDE.md scope headings collapse unsafe whitespace", () => {
  const unsafeScopeRecord = fixedRecord({
    id: "mem_2001_scope_whitespace",
    memory: "Scope heading sanitizer keeps injected headings as text.",
    scope: "team\n### Injected Heading\twith   spacing\r\nrollout",
    source: { type: "manual", uri: "manual" },
    sourceTrust: "unknown",
    createdAt: "2026-05-21T12:00:00.000Z"
  });
  const groupedBody = [
    "### team ### Injected Heading with spacing rollout",
    "",
    "- Scope heading sanitizer keeps injected headings as text.",
    "  - scope: team ### Injected Heading with spacing rollout",
    "  - source: manual",
    "  - source_trust: unknown",
    "  - id: mem_2001_scope_whitespace",
    "",
    "<!-- mempr:end -->",
    ""
  ];

  const cases = [
    [
      "AGENTS.md",
      renderAgentsMarkdownBlock,
      [
        "<!-- mempr:start -->",
        "## MemPR Coding Agent Memories",
        "",
        "Accepted memories for coding agents. Use them as repository context and keep the provenance attached to each item.",
        "",
        ...groupedBody
      ].join("\n")
    ],
    [
      "CLAUDE.md",
      renderClaudeMarkdownBlock,
      [
        "<!-- mempr:start -->",
        "## MemPR Claude Project Context",
        "",
        "Accepted project context for Claude. Keep it concise, specific, and traceable.",
        "",
        ...groupedBody
      ].join("\n")
    ]
  ];

  for (const [label, render, expected] of cases) {
    const output = render([unsafeScopeRecord]);

    assert.equal(output, expected, label);
    assert.equal((output.match(/^### /gm) ?? []).length, 1, label);
    assert.doesNotMatch(output, /^### Injected Heading/m, label);
  }
});

test("selects compatible local file adapters by supported destination name", () => {
  const cases = [
    ["MEMORY.md", "local-file-generic-markdown"],
    ["docs/MEMORY.md", "local-file-generic-markdown"],
    ["AGENTS.md", "local-file-agents-markdown"],
    ["docs/AGENTS.md", "local-file-agents-markdown"],
    ["CLAUDE.md", "local-file-claude-markdown"],
    ["docs/CLAUDE.md", "local-file-claude-markdown"]
  ];

  for (const [destination, expectedId] of cases) {
    const adapter = selectExportAdapter(destination);

    assert.equal(adapter.id, expectedId, destination);
    assert.equal(typeof adapter.render, "function", destination);
    assert.equal(typeof adapter.renderManagedBlock, "function", destination);
    assert.equal(adapter.isCompatible(destination), true, destination);
  }
});

test("exportMarkdown writes adapter-specific AGENTS.md and CLAUDE.md output with exact destination events", async () => {
  const root = await makeTempRoot("mempr-export-adapter-specific-");

  try {
    const agentsRecord = await proposeMemory(
      {
        memory: "Use npm run test before merging adapter work.",
        source: "AGENTS.md",
        scope: "repo",
        destination: "AGENTS.md"
      },
      root
    );
    const nestedAgentsRecord = await proposeMemory(
      {
        memory: "Nested agent guidance must stay scoped to docs/AGENTS.md.",
        source: "docs/AGENTS.md",
        scope: "repo",
        destination: "docs/AGENTS.md"
      },
      root
    );
    const claudeRecord = await proposeMemory(
      {
        memory: "Keep Claude context concise and project-specific.",
        source: "CLAUDE.md",
        scope: "repo",
        destination: "CLAUDE.md"
      },
      root
    );
    const genericRecord = await proposeMemory(
      {
        memory: "Generic Markdown memory must stay out of named adapter exports.",
        source: "MEMORY.md",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );

    const agentsPath = await exportMarkdown("AGENTS.md", root);
    const claudePath = await exportMarkdown("CLAUDE.md", root);
    const agentsExport = await readFile(agentsPath, "utf8");
    const claudeExport = await readFile(claudePath, "utf8");
    const exportEvents = (await readEvents(root)).filter((event) => {
      return event.type === "memory_exported";
    });

    assert.equal(agentsPath, join(root, "AGENTS.md"));
    assert.equal(claudePath, join(root, "CLAUDE.md"));
    assert.equal(
      agentsExport,
      [
        "<!-- mempr:start -->",
        "## MemPR Coding Agent Memories",
        "",
        "Accepted memories for coding agents. Use them as repository context and keep the provenance attached to each item.",
        "",
        "### repo",
        "",
        "- Use npm run test before merging adapter work.",
        "  - scope: repo",
        "  - source: AGENTS.md",
        "  - source_trust: unknown",
        `  - id: ${agentsRecord.id}`,
        "",
        "<!-- mempr:end -->",
        ""
      ].join("\n")
    );
    assert.equal(
      claudeExport,
      [
        "<!-- mempr:start -->",
        "## MemPR Claude Project Context",
        "",
        "Accepted project context for Claude. Keep it concise, specific, and traceable.",
        "",
        "### repo",
        "",
        "- Keep Claude context concise and project-specific.",
        "  - scope: repo",
        "  - source: CLAUDE.md",
        "  - source_trust: unknown",
        `  - id: ${claudeRecord.id}`,
        "",
        "<!-- mempr:end -->",
        ""
      ].join("\n")
    );
    assert.doesNotMatch(agentsExport, new RegExp(escapeRegExp(nestedAgentsRecord.memory)));
    assert.doesNotMatch(agentsExport, new RegExp(escapeRegExp(claudeRecord.memory)));
    assert.doesNotMatch(agentsExport, new RegExp(escapeRegExp(genericRecord.memory)));
    assert.doesNotMatch(claudeExport, new RegExp(escapeRegExp(agentsRecord.memory)));
    assert.doesNotMatch(claudeExport, new RegExp(escapeRegExp(nestedAgentsRecord.memory)));
    assert.doesNotMatch(claudeExport, new RegExp(escapeRegExp(genericRecord.memory)));
    assert.equal(exportEvents.length, 2);
    assert.equal(exportEvents[0].destination, "AGENTS.md");
    assert.equal(exportEvents[0].output_path, agentsPath);
    assert.deepEqual(exportEvents[0].record_ids, [agentsRecord.id]);
    assert.equal(exportEvents[1].destination, "CLAUDE.md");
    assert.equal(exportEvents[1].output_path, claudePath);
    assert.deepEqual(exportEvents[1].record_ids, [claudeRecord.id]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("exportMarkdown rejects unsafe destinations before file or export-event side effects", async () => {
  const parent = await makeTempRoot("mempr-export-adapter-parent-");
  const root = join(parent, "workspace");

  try {
    await proposeMemory(
      {
        memory: "Accepted record exists before unsafe export attempts.",
        source: "package.json",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );

    const invalidDestinations = [
      ["absolute path", join(parent, "absolute-memory.md")],
      ["parent traversal", "../outside-memory.md"],
      ["current-directory segment", "./MEMORY.md"],
      ["nested dot segment", "docs/./MEMORY.md"],
      ["nested parent segment", "docs/../MEMORY.md"],
      ["backslash separator", "docs\\MEMORY.md"],
      ["https scheme", "https://example.com/MEMORY.md"],
      ["file scheme", "file:///tmp/MEMORY.md"],
      ["null byte", "MEMORY.md\0suffix"],
      ["empty string", ""],
      ["whitespace string", "   "]
    ];

    for (const [label, destination] of invalidDestinations) {
      const beforeTree = await readFileTree(parent);

      await assert.rejects(
        exportMarkdown(destination, root),
        /destination|path|safe|invalid|required/i,
        label
      );
      assert.deepEqual(await readFileTree(parent), beforeTree, label);
      assert.equal(await countExportEvents(root), 0, label);
    }
  } finally {
    await rm(parent, { force: true, recursive: true });
  }
});

test("exportMarkdown still exports a normal nested repo-relative destination", async () => {
  const root = await makeTempRoot("mempr-export-adapter-nested-");

  try {
    const record = await proposeMemory(
      {
        memory: "Nested destination memory exports normally.",
        source: "docs/MEMORY.md",
        scope: "repo",
        destination: "docs/MEMORY.md"
      },
      root
    );

    const outputPath = await exportMarkdown("docs/MEMORY.md", root);
    const exported = await readFile(outputPath, "utf8");
    const events = await readEvents(root);
    const exportEvents = events.filter((event) => event.type === "memory_exported");

    assert.equal(outputPath, join(root, "docs", "MEMORY.md"));
    assert.match(exported, /Nested destination memory exports normally\./);
    assert.equal(exportEvents.length, 1);
    assert.equal(exportEvents[0].destination, "docs/MEMORY.md");
    assert.deepEqual(exportEvents[0].record_ids, [record.id]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("exportMarkdown dry-run returns exact adapter preview without file or event side effects", async () => {
  const root = await makeTempRoot("mempr-export-dry-run-preview-");
  const destinationPath = join(root, "AGENTS.md");
  const existingDestination = [
    "# Existing Agent Notes",
    "",
    "Keep this header outside MemPR.",
    "",
    "<!-- mempr:start -->",
    "stale managed content",
    "<!-- mempr:end -->",
    "",
    "Keep this footer outside MemPR.",
    ""
  ].join("\n");

  try {
    await writeFile(destinationPath, existingDestination);
    const exported = await proposeMemory(
      {
        memory: "Dry-run preview should use the AGENTS adapter.",
        source: "AGENTS.md",
        scope: "repo",
        destination: "AGENTS.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: "Pending AGENTS memory must not appear in dry-run preview.",
        risk: "medium",
        destination: "AGENTS.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: "Nested AGENTS memory must stay out of the root AGENTS preview.",
        source: "docs/AGENTS.md",
        scope: "repo",
        destination: "docs/AGENTS.md"
      },
      root
    );
    await proposeMemory(
      {
        memory: "Generic Markdown memory must stay out of AGENTS preview.",
        source: "MEMORY.md",
        scope: "repo",
        destination: "MEMORY.md"
      },
      root
    );

    const expectedPreview = [
      "# Existing Agent Notes",
      "",
      "Keep this header outside MemPR.",
      "",
      "<!-- mempr:start -->",
      "## MemPR Coding Agent Memories",
      "",
      "Accepted memories for coding agents. Use them as repository context and keep the provenance attached to each item.",
      "",
      "### repo",
      "",
      "- Dry-run preview should use the AGENTS adapter.",
      "  - scope: repo",
      "  - source: AGENTS.md",
      "  - source_trust: unknown",
      `  - id: ${exported.id}`,
      "",
      "<!-- mempr:end -->",
      "",
      "Keep this footer outside MemPR.",
      ""
    ].join("\n");

    const preview = await previewMarkdownExport("AGENTS.md", root);

    assert.deepEqual(Object.keys(preview).sort(), [
      "adapter",
      "content",
      "destination",
      "destinationExists",
      "outputPath",
      "recordCount",
      "recordIds",
      "warnings"
    ]);
    assert.deepEqual(preview, {
      destination: "AGENTS.md",
      outputPath: destinationPath,
      adapter: {
        id: "local-file-agents-markdown",
        title: "AGENTS.md"
      },
      recordIds: [exported.id],
      recordCount: 1,
      destinationExists: true,
      warnings: [],
      content: expectedPreview
    });
    assert.equal(await readFile(destinationPath, "utf8"), existingDestination);
    assert.equal(await countExportEvents(root), 0);

    const outputPath = await exportMarkdown("AGENTS.md", root);
    assert.equal(outputPath, destinationPath);
    assert.equal(await readFile(destinationPath, "utf8"), expectedPreview);
    assert.equal(await countExportEvents(root), 1);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("exportMarkdown dry-run for nested destinations does not create parent directories", async () => {
  const root = await makeTempRoot("mempr-export-dry-run-nested-");

  try {
    const record = await proposeMemory(
      {
        memory: "Nested dry-run preview must not create directories.",
        source: "docs/MEMORY.md",
        scope: "repo",
        destination: "docs/MEMORY.md"
      },
      root
    );

    const preview = await previewMarkdownExport("docs/MEMORY.md", root);

    assert.equal(preview.destination, "docs/MEMORY.md");
    assert.equal(preview.outputPath, join(root, "docs", "MEMORY.md"));
    assert.equal(preview.adapter.id, "local-file-generic-markdown");
    assert.equal(preview.destinationExists, false);
    assert.deepEqual(preview.recordIds, [record.id]);
    assert.match(preview.content, /Nested dry-run preview must not create directories\./);
    await assertPathMissing(join(root, "docs"));
    await assertPathMissing(join(root, "docs", "MEMORY.md"));
    assert.equal(await countExportEvents(root), 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("exportMarkdown dry-run reuses TTL, relationship, and destination blockers without side effects", async () => {
  const parent = await makeTempRoot("mempr-export-dry-run-blockers-parent-");
  const expiredRoot = join(parent, "expired");
  const conflictRoot = join(parent, "conflict");
  const supersedesRoot = join(parent, "supersedes");
  const invalidRoot = join(parent, "invalid");

  try {
    const expired = await proposeMemory(
      {
        memory: "Expired dry-run memory must block preview.",
        source: "package.json",
        scope: "repo",
        destination: "MEMORY.md",
        ttl: "2000-01-01"
      },
      expiredRoot
    );

    await assertDryRunBlockedWithoutSideEffects({
      root: expiredRoot,
      destination: "MEMORY.md",
      pattern: /expired|stale/i,
      ids: [expired.id],
      missingPath: join(expiredRoot, "MEMORY.md")
    });

    const conflicted = await proposeMemory(
      {
        memory: "Accepted dry-run conflicted record.",
        source: "package.json",
        scope: "repo",
        destination: "MEMORY.md"
      },
      conflictRoot
    );
    const conflict = await proposeMemory(
      {
        memory: "Accepted dry-run conflict record.",
        source: "package.json",
        scope: "repo",
        destination: "MEMORY.md",
        conflictsWith: [conflicted.id]
      },
      conflictRoot
    );
    await updateRecordStatus(conflict.id, "accepted", "reviewed dry-run conflict", conflictRoot);

    await assertDryRunBlockedWithoutSideEffects({
      root: conflictRoot,
      destination: "MEMORY.md",
      pattern: /conflict/i,
      ids: [conflict.id, conflicted.id],
      missingPath: join(conflictRoot, "MEMORY.md")
    });

    const superseded = await proposeMemory(
      {
        memory: "Accepted dry-run superseded record.",
        source: "package.json",
        scope: "repo",
        destination: "MEMORY.md"
      },
      supersedesRoot
    );
    const replacement = await proposeMemory(
      {
        memory: "Accepted dry-run replacement record.",
        source: "package.json",
        scope: "repo",
        destination: "MEMORY.md",
        supersedes: [superseded.id]
      },
      supersedesRoot
    );
    await updateRecordStatus(
      replacement.id,
      "accepted",
      "reviewed dry-run supersession",
      supersedesRoot
    );

    await assertDryRunBlockedWithoutSideEffects({
      root: supersedesRoot,
      destination: "MEMORY.md",
      pattern: /supersed|supersession/i,
      ids: [replacement.id, superseded.id],
      missingPath: join(supersedesRoot, "MEMORY.md")
    });

    await proposeMemory(
      {
        memory: "Accepted memory exists before invalid dry-run destination.",
        source: "package.json",
        scope: "repo",
        destination: "MEMORY.md"
      },
      invalidRoot
    );

    await assertDryRunBlockedWithoutSideEffects({
      root: invalidRoot,
      destination: "../outside-memory.md",
      pattern: /destination|path|safe|invalid|required/i,
      ids: [],
      missingPath: join(parent, "outside-memory.md")
    });
  } finally {
    await rm(parent, { force: true, recursive: true });
  }
});

function fixedRecord({
  id,
  memory,
  scope,
  source,
  sourceTrust,
  createdAt,
  destination = "MEMORY.md"
}) {
  return {
    id,
    memory,
    source,
    source_trust: sourceTrust,
    scope,
    risk: "low",
    decision: "auto_accept",
    decision_reason: "fixed golden test record",
    policy_version: "v0.1",
    destination,
    status: "accepted",
    status_reason: null,
    ttl: null,
    expires_at: null,
    supersedes: [],
    conflicts_with: [],
    created_at: createdAt,
    updated_at: createdAt
  };
}

async function countExportEvents(root) {
  const events = await readEvents(root);
  return events.filter((event) => event.type === "memory_exported").length;
}

async function assertDryRunBlockedWithoutSideEffects({
  root,
  destination,
  pattern,
  ids,
  missingPath
}) {
  await assert.rejects(
    previewMarkdownExport(destination, root),
    (error) => {
      assert(error instanceof Error);
      assert.match(error.message, pattern);

      for (const id of ids) {
        assert.match(error.message, new RegExp(escapeRegExp(id)));
      }

      return true;
    }
  );

  await assertPathMissing(missingPath);
  assert.equal(await countExportEvents(root), 0);
}

async function assertPathMissing(path) {
  await assert.rejects(access(path), (error) => {
    assert(error instanceof Error);
    assert.equal(error.code, "ENOENT");
    return true;
  });
}

async function makeTempRoot(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function readFileTree(root) {
  const files = {};

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      const key = relative(root, path);

      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }

      if (entry.isFile()) {
        files[key] = await readFile(path, "utf8");
      }
    }
  }

  await walk(root);
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
