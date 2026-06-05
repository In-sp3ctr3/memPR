import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createSignedReadPayload } from "../dist/identity.js";
import {
  assembleReadContext,
  listRecords,
  proposeMemory
} from "../dist/ledger.js";
import { createMemprMcpServer } from "../dist/mcp-server.js";
import { fakeOpenAiKey } from "./helpers/fake-secrets.js";

const exec = promisify(execFile);
const CLI_PATH = "dist/cli.js";

test("read policy gate is dormant when .mempr/read-policy.json is absent", async () => {
  const root = await makeTempRoot();

  try {
    const record = await proposeMemory({
      memory: "No-policy reads keep existing default behavior.",
      scope: "repo",
      sourceTrust: "trusted",
      destination: "MEMORY.md"
    }, root);

    const context = await assembleReadContext({ destination: "MEMORY.md" }, root);
    const records = await listRecords({}, root);

    assert.equal(context.ok, true);
    assert.deepEqual(context.recordIds, [record.id]);
    assert.deepEqual(records.map((candidate) => candidate.id), [record.id]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("signed local-key principal can satisfy deterministic read policy", async () => {
  const root = await makeTempRoot();
  const privateMemory = "Signed policy allows this repo memory.";
  const privateQuote = "Signed policy quote should only appear on allowed reads.";

  try {
    const record = await proposeMemory({
      memory: privateMemory,
      quote: privateQuote,
      scope: "repo",
      source: "manual",
      sourceTrust: "trusted",
      destination: "MEMORY.md"
    }, root);
    const principal = await installPrincipal(root, "agent-a");
    await writeReadPolicy(root, [{
      effect: "allow",
      principals: ["agent-a"],
      surfaces: ["read_context"],
      destinations: ["MEMORY.md"],
      scopes: ["repo"]
    }]);

    const denied = await assembleReadContext({
      destination: "MEMORY.md",
      scope: "repo"
    }, root);
    const auth = signRead(principal, {
      action: "read",
      surface: "read_context",
      resource: "context",
      destination: "MEMORY.md",
      scopes: ["repo"]
    });
    const allowed = await assembleReadContext({
      destination: "MEMORY.md",
      scope: "repo",
      readAccess: auth
    }, root);

    assert.equal(denied.ok, false);
    assert.equal(denied.issues[0].code, "read_identity_missing");
    assertDeniedNoContent(JSON.stringify(denied), [privateMemory, privateQuote, record.id]);

    assert.equal(allowed.ok, true);
    assert.deepEqual(allowed.recordIds, [record.id]);
    assert.equal(allowed.records[0].memory, privateMemory);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("read policy deny rules take precedence over matching allows", async () => {
  const root = await makeTempRoot();
  const privateMemory = "Deny precedence must not leak this memory.";

  try {
    const record = await proposeMemory({
      memory: privateMemory,
      scope: "repo",
      sourceTrust: "trusted",
      destination: "MEMORY.md"
    }, root);
    const principal = await installPrincipal(root, "agent-a");
    await writeReadPolicy(root, [
      {
        effect: "allow",
        principals: ["agent-a"],
        surfaces: ["read_context"],
        destinations: ["MEMORY.md"],
        scopes: ["repo"]
      },
      {
        effect: "deny",
        principals: ["agent-a"],
        surfaces: ["read_context"],
        destinations: ["MEMORY.md"],
        scopes: ["repo"]
      }
    ]);

    const auth = signRead(principal, {
      action: "read",
      surface: "read_context",
      resource: "context",
      destination: "MEMORY.md",
      scopes: ["repo"]
    });
    const denied = await assembleReadContext({
      destination: "MEMORY.md",
      scope: "repo",
      readAccess: auth
    }, root);

    assert.equal(denied.ok, false);
    assert.equal(denied.issues[0].code, "read_policy_denied");
    assertDeniedNoContent(JSON.stringify(denied), [privateMemory, record.id, "agent-a"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("CLI and MCP read auth arguments satisfy the same signed request", async () => {
  const root = await makeTempRoot();
  const privateMemory = "CLI and MCP signed policy read memory.";

  try {
    const record = await proposeMemory({
      memory: privateMemory,
      scope: "repo",
      sourceTrust: "trusted",
      destination: "MEMORY.md"
    }, root);
    const principal = await installPrincipal(root, "agent-a");
    await writeReadPolicy(root, [{
      effect: "allow",
      principals: ["agent-a"],
      surfaces: ["read_context"],
      destinations: ["MEMORY.md"],
      scopes: ["repo"]
    }]);
    const auth = signRead(principal, {
      action: "read",
      surface: "read_context",
      resource: "context",
      destination: "MEMORY.md",
      scopes: ["repo"]
    }, {
      signedAt: "2026-05-22T00:00:00.000Z",
      nonce: "read-policy-test"
    });

    const cli = await exec("node", [
      CLI_PATH,
      "context",
      "--root",
      root,
      "--destination",
      "MEMORY.md",
      "--scope",
      "repo",
      "--read-principal",
      auth.principalId,
      "--read-signature",
      auth.signature,
      "--read-signed-at",
      auth.signedAt,
      "--read-nonce",
      auth.nonce,
      "--json"
    ]);
    const cliContext = JSON.parse(cli.stdout);

    assert.equal(cliContext.ok, true);
    assert.deepEqual(cliContext.recordIds, [record.id]);
    assert.equal(cliContext.records[0].memory, privateMemory);

    const previousCwd = process.cwd();

    try {
      process.chdir(root);
      const server = createMemprMcpServer();
      const response = await server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "mempr.context",
          arguments: {
            destination: "MEMORY.md",
            scope: "repo",
            readAccess: auth
          }
        }
      });

      assert.equal(response.error, undefined);
      assert.equal(response.result.structuredContent.ok, true);
      assert.deepEqual(response.result.structuredContent.recordIds, [record.id]);
    } finally {
      process.chdir(previousCwd);
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("secret-like read-policy matcher values fail closed without leaking", async () => {
  const root = await makeTempRoot();
  const secret = fakeOpenAiKey("ReadPolicyMatcherShouldNotLeak1234567890");

  try {
    await proposeMemory({
      memory: "Malformed read policy should deny without leaking matcher data.",
      scope: "repo",
      sourceTrust: "trusted",
      destination: "MEMORY.md"
    }, root);
    await writeReadPolicy(root, [{
      effect: "allow",
      principals: ["agent-a"],
      surfaces: ["read_context"],
      destinations: ["MEMORY.md"],
      scopes: [secret]
    }]);

    const denied = await assembleReadContext({
      destination: "MEMORY.md",
      scope: "repo"
    }, root);
    const serialized = JSON.stringify(denied);

    assert.equal(denied.ok, false);
    assert.equal(denied.issues[0].code, "read_policy_malformed");
    assertDeniedNoContent(serialized, [secret]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("secret-like signed read nonce fails closed without leaking", async () => {
  const root = await makeTempRoot();
  const secret = fakeOpenAiKey("ReadNonceShouldNotLeak1234567890");
  const privateMemory = "Secret-like nonce denial must not leak memory.";

  try {
    await proposeMemory({
      memory: privateMemory,
      scope: "repo",
      sourceTrust: "trusted",
      destination: "MEMORY.md"
    }, root);
    const principal = await installPrincipal(root, "agent-a");
    await writeReadPolicy(root, [{
      effect: "allow",
      principals: ["agent-a"],
      surfaces: ["read_context"],
      destinations: ["MEMORY.md"],
      scopes: ["repo"]
    }]);
    const auth = signRead(principal, {
      action: "read",
      surface: "read_context",
      resource: "context",
      destination: "MEMORY.md",
      scopes: ["repo"]
    }, {
      nonce: secret
    });

    const denied = await assembleReadContext({
      destination: "MEMORY.md",
      scope: "repo",
      readAccess: auth
    }, root);
    const serialized = JSON.stringify(denied);

    assert.equal(denied.ok, false);
    assert.equal(denied.issues[0].code, "read_identity_invalid");
    assertDeniedNoContent(serialized, [secret, privateMemory]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "mempr-read-policy-"));
}

async function installPrincipal(root, principalId) {
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({
    format: "der",
    type: "spki"
  }).toString("base64");

  await mkdir(join(root, ".mempr"), { recursive: true });
  await writeFile(join(root, ".mempr", "principals.json"), `${JSON.stringify({
    version: 1,
    principals: [{
      id: principalId,
      kind: "local_key",
      algorithm: "ed25519",
      publicKey,
      status: "active"
    }]
  }, null, 2)}\n`);

  return {
    principalId,
    privateKey: keys.privateKey
  };
}

async function writeReadPolicy(root, rules) {
  await writeFile(join(root, ".mempr", "read-policy.json"), `${JSON.stringify({
    version: 1,
    rules
  }, null, 2)}\n`);
}

function signRead(principal, request, extras = {}) {
  const auth = {
    principalId: principal.principalId,
    signedAt: extras.signedAt ?? null,
    nonce: extras.nonce ?? null
  };
  const payload = createSignedReadPayload(principal.principalId, request, auth);

  return {
    ...auth,
    signature: sign(null, Buffer.from(payload), principal.privateKey).toString("base64")
  };
}

function assertDeniedNoContent(value, forbidden) {
  for (const text of forbidden) {
    assert.doesNotMatch(value, new RegExp(escapeRegExp(text)));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
