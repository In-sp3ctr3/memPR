import type { IncomingMessage, ServerResponse } from "node:http";

export async function readBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<{ ok: true; body: string } | { ok: false; error: "payload_too_large" }> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBodyBytes) {
      return {
        ok: false,
        error: "payload_too_large"
      };
    }

    chunks.push(buffer);
  }

  return {
    ok: true,
    body: Buffer.concat(chunks).toString("utf8")
  };
}

export function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
