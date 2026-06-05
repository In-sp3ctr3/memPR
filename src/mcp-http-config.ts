import { resolve } from "node:path";
import { MEMPR_MCP_AUTHORIZATION } from "./mcp-contract.js";
import { isRecord } from "./mcp-http-io.js";
import type {
  HttpConfig,
  HttpToken
} from "./mcp-http-types.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3927;
const DEFAULT_PATH = "/mcp";
const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const KNOWN_SCOPES = new Set<string>(MEMPR_MCP_AUTHORIZATION.http.scopes);

export function loadConfig(): HttpConfig {
  const host = nonEmptyConfigString(
    process.env.MEMPR_MCP_HTTP_HOST ?? DEFAULT_HOST,
    "MEMPR_MCP_HTTP_HOST"
  );
  const port = integerConfig(
    process.env.MEMPR_MCP_HTTP_PORT ?? String(DEFAULT_PORT),
    "MEMPR_MCP_HTTP_PORT",
    { min: 1, max: 65_535 }
  );
  const endpointPath = endpointPathConfig(
    process.env.MEMPR_MCP_HTTP_PATH ?? DEFAULT_PATH
  );
  const resource = process.env.MEMPR_MCP_HTTP_RESOURCE
    ?? `http://${host}:${port}${endpointPath}`;
  const parsedResource = urlConfig(resource, "MEMPR_MCP_HTTP_RESOURCE");
  const allowWildcardOrigins = booleanEnv(
    process.env.MEMPR_MCP_HTTP_ALLOW_INSECURE_WILDCARD_ORIGIN
  );
  const allowedOrigins = allowedOriginsConfig(
    csv(process.env.MEMPR_MCP_HTTP_ALLOWED_ORIGINS, [
      `http://${host}:${port}`,
      parsedResource.origin
    ]),
    allowWildcardOrigins
  );
  const allowedHosts = nonEmptyStringList(
    csv(process.env.MEMPR_MCP_HTTP_ALLOWED_HOSTS, [
      `${host}:${port}`,
      parsedResource.host
    ]),
    "MEMPR_MCP_HTTP_ALLOWED_HOSTS"
  );
  const rateLimitPerMinute = integerConfig(
    process.env.MEMPR_MCP_HTTP_RATE_LIMIT ?? "120",
    "MEMPR_MCP_HTTP_RATE_LIMIT",
    { min: 0 }
  );
  const maxBodyBytes = integerConfig(
    process.env.MEMPR_MCP_HTTP_MAX_BODY_BYTES ?? String(DEFAULT_MAX_BODY_BYTES),
    "MEMPR_MCP_HTTP_MAX_BODY_BYTES",
    { min: 1 }
  );

  return {
    host,
    port,
    endpointPath,
    resource: parsedResource.href,
    authorizationServers: csv(process.env.MEMPR_MCP_HTTP_AUTH_SERVERS),
    allowedOrigins,
    allowedHosts,
    rateLimitPerMinute,
    maxBodyBytes,
    root: resolve(process.env.MEMPR_ROOT ?? process.cwd()),
    tokens: parseTokens(process.env.MEMPR_MCP_HTTP_TOKENS, parsedResource.href)
  };
}

function parseTokens(value: string | undefined, resource: string): HttpToken[] {
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("MEMPR_MCP_HTTP_TOKENS must be a JSON array.");
  }

  return parsed.map((entry) => {
    if (
      !isRecord(entry)
      || typeof entry.token !== "string"
      || !entry.token.trim()
      || typeof entry.subject !== "string"
      || !entry.subject.trim()
    ) {
      throw new Error("MEMPR_MCP_HTTP_TOKENS entries require token and subject.");
    }
    if (!Array.isArray(entry.scopes)) {
      throw new Error("MEMPR_MCP_HTTP_TOKENS entries require scopes array.");
    }

    const scopes = entry.scopes.map((scope) => {
      if (typeof scope !== "string" || !KNOWN_SCOPES.has(scope)) {
        throw new Error("MEMPR_MCP_HTTP_TOKENS entries contain unknown scopes.");
      }

      return scope;
    });

    const audience = typeof entry.audience === "string" && entry.audience.trim()
      ? entry.audience.trim()
      : resource;

    if (audience !== resource) {
      throw new Error("MEMPR_MCP_HTTP_TOKENS entry audience must match MEMPR_MCP_HTTP_RESOURCE.");
    }

    return {
      token: entry.token.trim(),
      subject: entry.subject.trim(),
      audience,
      issuer: typeof entry.issuer === "string" && entry.issuer.trim()
        ? entry.issuer.trim()
        : undefined,
      scopes,
      expiresAt: typeof entry.expiresAt === "string" && entry.expiresAt.trim()
        ? entry.expiresAt.trim()
        : undefined
    };
  });
}

function csv(value: string | undefined, fallback: string[] = []): string[] {
  if (!value) {
    return fallback;
  }

  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function nonEmptyConfigString(value: string, name: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${name} must be non-empty.`);
  }

  return normalized;
}

function endpointPathConfig(value: string): string {
  const path = nonEmptyConfigString(value, "MEMPR_MCP_HTTP_PATH");

  if (
    !path.startsWith("/")
    || path.includes("?")
    || path.includes("#")
    || path.includes("//")
    || path.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("MEMPR_MCP_HTTP_PATH must start with / and must not contain ?, #, //, or traversal segments.");
  }

  return path;
}

function integerConfig(
  value: string,
  name: string,
  { min, max }: { min: number; max?: number }
): number {
  const number = Number(value);

  if (
    !Number.isFinite(number)
    || !Number.isInteger(number)
    || number < min
    || (max !== undefined && number > max)
  ) {
    throw new Error(`${name} must be an integer${max === undefined ? "" : ` between ${min} and ${max}`}.`);
  }

  return number;
}

function urlConfig(value: string, name: string): URL {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }

    return parsed;
  } catch {
    throw new Error(`${name} must be a valid http or https URL.`);
  }
}

function allowedOriginsConfig(values: string[], allowWildcard: boolean): string[] {
  const origins = nonEmptyStringList(values, "MEMPR_MCP_HTTP_ALLOWED_ORIGINS");

  for (const origin of origins) {
    if (origin === "*") {
      if (!allowWildcard) {
        throw new Error("MEMPR_MCP_HTTP_ALLOWED_ORIGINS must not include * unless insecure wildcard origin mode is enabled.");
      }

      continue;
    }

    try {
      const parsed = new URL(origin);

      if (parsed.origin !== origin) {
        throw new Error("not an origin");
      }
    } catch {
      throw new Error("MEMPR_MCP_HTTP_ALLOWED_ORIGINS entries must be URL origins.");
    }
  }

  return origins;
}

function nonEmptyStringList(values: string[], name: string): string[] {
  if (values.length === 0 || values.some((value) => !value.trim())) {
    throw new Error(`${name} entries must be non-empty.`);
  }

  return values;
}

function booleanEnv(value: string | undefined): boolean {
  return value === "1" || value === "true";
}
