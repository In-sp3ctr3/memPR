#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";

const DEFAULT_TIMEOUT_MS = 30_000;
const exec = promisify(execFile);

const { files, suite, timeoutMs } = parseArgs(process.argv.slice(2));

if (files.length === 0) {
  console.error("Usage: node scripts/run-node-tests.mjs [--suite name] [--timeout ms] <test-file...>");
  process.exit(2);
}

console.log(`[mempr-test] suite=${suite} files=${files.length} timeout=${timeoutMs}ms`);

for (const file of files) {
  const result = await runTestFile(file, timeoutMs);

  if (result.ok) {
    continue;
  }

  console.error(`[mempr-test] failed ${file}${result.timedOut ? " (timeout)" : ""}`);
  process.exit(result.code ?? 1);
}

function parseArgs(args) {
  const files = [];
  let suite = "default";
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--suite") {
      suite = args[++index] ?? suite;
      continue;
    }

    if (arg.startsWith("--suite=")) {
      suite = arg.slice("--suite=".length) || suite;
      continue;
    }

    if (arg === "--timeout") {
      timeoutMs = normalizeTimeout(args[++index]);
      continue;
    }

    if (arg.startsWith("--timeout=")) {
      timeoutMs = normalizeTimeout(arg.slice("--timeout=".length));
      continue;
    }

    files.push(arg);
  }

  return {
    files,
    suite,
    timeoutMs
  };
}

function normalizeTimeout(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_TIMEOUT_MS;
}

async function runTestFile(file, timeoutMs) {
  console.log(`[mempr-test] start ${file}`);
  const detached = process.platform !== "win32";
  const child = spawn(
    process.execPath,
    [
      "--test",
      "--test-concurrency=1",
      `--test-timeout=${timeoutMs}`,
      file
    ],
    {
      detached,
      stdio: ["ignore", "inherit", "inherit"]
    }
  );

  let timedOut = false;
  let killTimer;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    void printProcessGroup(file, child.pid, "timeout");
    terminate(child, detached, "SIGTERM");
    killTimer = setTimeout(() => {
      void printProcessGroup(file, child.pid, "timeout after SIGTERM");
      terminate(child, detached, "SIGKILL");
    }, 1_000);
  }, timeoutMs + 2_000);

  const [code, signal] = await once(child, "close");
  clearTimeout(timeoutTimer);
  clearTimeout(killTimer);

  const leftovers = await processGroupSnapshot(child.pid);

  if (leftovers.length > 0) {
    console.error(`[mempr-test] leftover processes after ${file}:`);
    console.error(formatProcessSnapshot(leftovers));
    terminate(child, detached, "SIGKILL");
    const remaining = await waitForProcessGroupExit(child.pid, 1_000);

    if (remaining.length > 0) {
      console.error(`[mempr-test] process group still alive after SIGKILL for ${file}:`);
      console.error(formatProcessSnapshot(remaining));
    }

    return {
      ok: false,
      code: timedOut ? 124 : 125,
      signal,
      timedOut
    };
  }

  if (timedOut) {
    return {
      ok: false,
      code: 124,
      signal,
      timedOut
    };
  }

  if (code === 0) {
    console.log(`[mempr-test] pass ${file}`);
    return {
      ok: true,
      code,
      signal,
      timedOut
    };
  }

  return {
    ok: false,
    code: typeof code === "number" ? code : 1,
    signal,
    timedOut
  };
}

async function printProcessGroup(file, pid, label) {
  const snapshot = await processGroupSnapshot(pid);

  if (snapshot.length === 0) {
    console.error(`[mempr-test] ${label} ${file}; no child process group entries found`);
    return;
  }

  console.error(`[mempr-test] ${label} ${file}; process group:`);
  console.error(formatProcessSnapshot(snapshot));
}

async function waitForProcessGroupExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = await processGroupSnapshot(pid);

  while (snapshot.length > 0 && Date.now() < deadline) {
    await delay(50);
    snapshot = await processGroupSnapshot(pid);
  }

  return snapshot;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function processGroupSnapshot(pid) {
  if (process.platform === "win32" || pid === undefined) {
    return [];
  }

  try {
    const { stdout } = await exec("ps", [
      "-eo",
      "pid=,ppid=,pgid=,command="
    ], {
      maxBuffer: 1024 * 1024
    });

    return parseProcessSnapshot(stdout, pid);
  } catch {
    return [];
  }
}

function parseProcessSnapshot(stdout, pgid) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);

      if (!match) {
        return null;
      }

      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        command: match[4]
      };
    })
    .filter((entry) => entry !== null && entry.pgid === pgid);
}

function formatProcessSnapshot(processes) {
  return processes
    .map((entry) => `${entry.pid} ${entry.ppid} ${entry.pgid} ${entry.command}`)
    .join("\n");
}

function terminate(child, detached, signal) {
  if (child.pid === undefined) {
    return;
  }

  try {
    if (detached) {
      process.kill(-child.pid, signal);
      return;
    }

    child.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }
}
