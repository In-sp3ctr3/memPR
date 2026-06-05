import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

export async function closeChildProcess(child, options = {}) {
  const {
    closeStdin = true,
    gracefulTimeoutMs = 250,
    terminateTimeoutMs = 1000,
    killTimeoutMs = 1000
  } = options;

  if (hasExited(child)) {
    destroyStdioStreams(child);
    return;
  }

  if (closeStdin && child.stdin && !child.stdin.destroyed) {
    child.stdin.end();
  }

  await waitForExit(child, gracefulTimeoutMs);

  if (!hasExited(child)) {
    child.kill("SIGTERM");
    await waitForExit(child, terminateTimeoutMs);
  }

  if (!hasExited(child)) {
    child.kill("SIGKILL");
    await waitForExit(child, killTimeoutMs);
  }

  destroyStdioStreams(child);
}

export function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForExit(child, timeoutMs) {
  if (hasExited(child)) {
    return;
  }

  await Promise.race([
    once(child, "exit"),
    delay(timeoutMs)
  ]);
}

function destroyStdioStreams(child) {
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    if (stream && !stream.destroyed) {
      stream.destroy();
    }
  }
}
