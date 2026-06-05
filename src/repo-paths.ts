import { isAbsolute } from "node:path";

const RESERVED_REPO_PATH_SEGMENTS = new Set([
  ".mempr",
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage"
]);

export function normalizeRepoRelativePath(value: string, label = "Path"): string {
  const path = value.trim();

  if (!path) {
    throw new Error(`${label} is required.`);
  }

  if (
    /[\u0000-\u001F\u007F]/.test(path)
    || path.includes("\\")
    || isAbsolute(path)
    || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)
  ) {
    throw new Error(`${label} must be repository-relative.`);
  }

  const segments = path.split("/");

  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${label} must not contain traversal segments.`);
  }

  if (segments.some((segment) => RESERVED_REPO_PATH_SEGMENTS.has(segment))) {
    throw new Error(`${label} must not target MemPR, Git, dependency, build, or coverage paths.`);
  }

  return path;
}
