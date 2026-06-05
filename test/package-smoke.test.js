import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_GUARD_BINARY_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|tgz|gz)$/i;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldSkipReleaseStringGuard(file) {
  return file === "CHANGELOG.md" || RELEASE_GUARD_BINARY_EXTENSIONS.test(file);
}

test("package metadata exposes local-first release bins and Node compatibility", async () => {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8"));

  assert.equal(pkg.version, "1.0.0");
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.main, "./dist/index.js");
  assert.equal(pkg.types, "./dist/index.d.ts");
  assert.deepEqual(pkg.exports, {
    ".": {
      types: "./dist/index.d.ts",
      default: "./dist/index.js"
    },
    "./mcp": {
      types: "./dist/mcp-server.d.ts",
      default: "./dist/mcp-server.js"
    },
    "./package.json": "./package.json"
  });
  assert.deepEqual(pkg.bin, {
    mempr: "./dist/cli.js",
    "mempr-mcp": "./dist/mcp-stdio.js",
    "mempr-mcp-http": "./dist/mcp-http.js"
  });
});

test("release strings stay aligned for 1.0", async () => {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8"));
  const mcpServer = await readFile(join(REPO_ROOT, "src", "mcp-server.ts"), "utf8");
  const security = await readFile(join(REPO_ROOT, "SECURITY.md"), "utf8");
  const previousMinor = "0." + "2";
  const staleServerVersionPattern = new RegExp(
    `SERVER_VERSION\\s*=\\s*["']${escapeRegExp(previousMinor)}\\.0["']`
  );
  const currentServerVersionPattern = new RegExp(
    `SERVER_VERSION\\s*=\\s*["']${escapeRegExp(pkg.version)}["']`
  );

  assert.doesNotMatch(mcpServer, staleServerVersionPattern);
  assert.match(mcpServer, currentServerVersionPattern);
  assert.doesNotMatch(security, /\|\s*1\.x\s*\|\s*Not released\s*\|/i);
  assert.doesNotMatch(security, /\bin\s+0\.2\.x\b/i);

  const { stdout } = await exec("git", ["ls-files", "-z"], { cwd: REPO_ROOT });
  const staleReleasePattern = new RegExp(
    `\\bv?${escapeRegExp(previousMinor)}\\.0\\b|\\b${escapeRegExp(previousMinor)}\\.x\\b`
  );

  for (const file of stdout.split("\0").filter(Boolean)) {
    if (shouldSkipReleaseStringGuard(file)) {
      continue;
    }

    const contents = await readFile(join(REPO_ROOT, file), "utf8");

    assert.doesNotMatch(contents, staleReleasePattern, `${file} has stale release wording`);
  }
});

test("npm pack dry-run includes CLI, stdio MCP, HTTP MCP, and docs", async () => {
  const { stdout } = await exec("npm", ["pack", "--dry-run", "--json"], {
    cwd: REPO_ROOT
  });
  const [packed] = JSON.parse(stdout);
  const files = new Set(packed.files.map((file) => file.path));

  for (const expected of [
    "dist/index.js",
    "dist/index.d.ts",
    "dist/cli.js",
    "dist/mcp-stdio.js",
    "dist/mcp-http.js",
    "dist/mcp-contract.js",
    "README.md",
    "docs/assets/mempr-readme-header.png",
    "docs/assets/mempr-mascot.png",
    "package.json"
  ]) {
    assert(files.has(expected), `Expected package file ${expected}`);
  }

  for (const disallowed of [
    ".git/",
    ".mempr/",
    "node_modules/",
    ".DS_Store",
    "__MACOSX/"
  ]) {
    assert.equal(
      [...files].some((file) => file === disallowed || file.startsWith(disallowed)),
      false,
      `Package must not include ${disallowed}`
    );
  }
});

test("installed packed package import exposes the public SDK boundary", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "mempr-package-smoke-"));

  try {
    await writeFile(join(sandbox, "package.json"), "{\"type\":\"module\"}\n");
    const { stdout: packStdout } = await exec("npm", ["pack", REPO_ROOT, "--json"], {
      cwd: sandbox
    });
    const [packed] = JSON.parse(packStdout);
    const tarballPath = join(sandbox, packed.filename);

    await exec("npm", ["install", "--no-audit", "--no-fund", tarballPath], {
      cwd: sandbox
    });

    const probe = [
      "const mod = await import('@in-sp3ctr3/mempr');",
      "if (typeof mod.proposeMemory !== 'function') throw new Error('missing proposeMemory');",
      "if (typeof mod.verifyMemorySource !== 'function') throw new Error('missing verifyMemorySource');",
      "if (typeof mod.scanPersistentFields !== 'function') throw new Error('missing scanPersistentFields');",
      "if (typeof mod.redactTextForReport !== 'function') throw new Error('missing redactTextForReport');",
      "if ('blockSecretsWithoutPersistence' in mod.DEFAULT_POLICY_CONFIG) throw new Error('secret blocking config leaked');",
      "if ('replayEvents' in mod) throw new Error('raw event replay leaked');",
      "console.log(JSON.stringify({ ok: true, keys: Object.keys(mod).sort() }));"
    ].join("\n");
    const { stdout } = await exec("node", [
      "--input-type=module",
      "--eval",
      probe
    ], { cwd: sandbox });
    const payload = JSON.parse(stdout);

    assert.equal(payload.ok, true);
    assert(payload.keys.includes("proposeMemory"));
  } finally {
    await rm(sandbox, { force: true, recursive: true });
  }
});
