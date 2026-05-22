const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

const INVALID_TTL_MESSAGE = "Invalid TTL expiry. Use an ISO datetime with timezone or YYYY-MM-DD.";
const INVALID_EXPIRY_METADATA_MESSAGE = "Invalid memory expiry metadata.";

export interface NormalizedExpiry {
  ttl: string | null;
  expires_at: string | null;
}

export function normalizeExpiry(
  ttl: string | null | undefined,
  expiresAt?: string | null
): NormalizedExpiry {
  const normalizedTtl = normalizeExpiryValue(ttl);
  const normalizedExpiresAt = normalizeExpiryValue(expiresAt);

  if (!normalizedTtl) {
    if (normalizedExpiresAt) {
      throw new Error(INVALID_EXPIRY_METADATA_MESSAGE);
    }

    return {
      ttl: null,
      expires_at: null
    };
  }

  if (normalizedExpiresAt && normalizedExpiresAt !== normalizedTtl) {
    throw new Error(INVALID_EXPIRY_METADATA_MESSAGE);
  }

  return {
    ttl: normalizedTtl,
    expires_at: normalizedTtl
  };
}

export function isExpired(
  expiresAt: string | null | undefined,
  now = new Date()
): boolean {
  const normalized = normalizeExpiryValue(expiresAt);

  if (!normalized) {
    return false;
  }

  return Date.parse(normalized) <= now.getTime();
}

export function compareExpiry(
  left: string | null | undefined,
  right: string | null | undefined
): number {
  const normalizedLeft = normalizeExpiryValue(left);
  const normalizedRight = normalizeExpiryValue(right);

  if (normalizedLeft === normalizedRight) {
    return 0;
  }

  if (!normalizedLeft) {
    return 1;
  }

  if (!normalizedRight) {
    return -1;
  }

  return Date.parse(normalizedLeft) - Date.parse(normalizedRight);
}

function normalizeExpiryValue(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(normalized);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const expiresAt = new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      23,
      59,
      59,
      999
    ));

    if (!isValidCalendarDate(expiresAt, year, month, day)) {
      throw new Error(INVALID_TTL_MESSAGE);
    }

    return expiresAt.toISOString();
  }

  const datetimeMatch = ISO_DATETIME_PATTERN.exec(normalized);

  if (!datetimeMatch) {
    throw new Error(INVALID_TTL_MESSAGE);
  }

  const [, year, month, day, hour, minute, second = "00", zone] = datetimeMatch;
  const offset = zone === "Z" ? undefined : zone;

  if (
    !isValidDateParts(year, month, day)
    || Number(hour) > 23
    || Number(minute) > 59
    || Number(second) > 59
    || (offset && !isValidOffset(offset))
  ) {
    throw new Error(INVALID_TTL_MESSAGE);
  }

  const expiresAt = new Date(normalized);

  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error(INVALID_TTL_MESSAGE);
  }

  return expiresAt.toISOString();
}

function isValidCalendarDate(date: Date, year: string, month: string, day: string): boolean {
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day);
}

function isValidDateParts(year: string, month: string, day: string): boolean {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return isValidCalendarDate(date, year, month, day);
}

function isValidOffset(offset: string): boolean {
  const hour = Number(offset.slice(1, 3));
  const minute = Number(offset.slice(4, 6));
  return hour <= 23 && minute <= 59;
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}
