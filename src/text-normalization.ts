export function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

export function normalizeUnknownText(value: unknown): string | undefined {
  return typeof value === "string" ? normalizeOptionalText(value) : undefined;
}
