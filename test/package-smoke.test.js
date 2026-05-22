import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("package metadata exposes local-first 1.0 bins and Node compatibility", async () => {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8"));

  assert.equal(pkg.version, "1.0.0");
  assert.equal(pkg.engines.node, ">=20");
  assert.deepEqual(pkg.bin, {
    mempr: "./dist/cli.js",
    "mempr-mcp": "./dist/mcp-stdio.js",
    "mempr-mcp-http": "./dist/mcp-http.js"
  });
});

test("npm pack dry-run includes CLI, stdio MCP, HTTP MCP, and docs", async () => {
  const { stdout } = await exec("npm", ["pack", "--dry-run", "--json"], {
    cwd: REPO_ROOT
  });
  const [packed] = JSON.parse(stdout);
  const files = new Set(packed.files.map((file) => file.path));

  for (const expected of [
    "dist/cli.js",
    "dist/mcp-stdio.js",
    "dist/mcp-http.js",
    "dist/mcp-contract.js",
    "README.md",
    "package.json"
  ]) {
    assert(files.has(expected), `Expected package file ${expected}`);
  }
});
