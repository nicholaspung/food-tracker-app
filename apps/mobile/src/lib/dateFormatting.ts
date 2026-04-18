interface FormatDisplayDateOptions {
  locale?: string | string[];
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
}

interface FormatLocalDateOptions {
  locale?: string | string[];
  fallback?: string;
  options?: Intl.DateTimeFormatOptions;
}

interface ParsedDateTime {
  year: number;
  monthIndex: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

function toNumber(value: string): number {
  return Number.parseInt(value, 10);
}

function toMilliseconds(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const normalized = value.slice(0, 3).padEnd(3, '0');
  return toNumber(normalized);
}

function parseDateTime(
  year: string,
  month: string,
  day: string,
  hours: string,
  minutes: string,
  seconds: string | undefined,
  fraction: string | undefined,
): ParsedDateTime {
  return {
    year: toNumber(year),
    monthIndex: toNumber(month) - 1,
    day: toNumber(day),
    hours: toNumber(hours),
    minutes: toNumber(minutes),
    seconds: toNumber(seconds ?? '0'),
    milliseconds: toMilliseconds(fraction),
  };
}

function parseOffsetMinutes(value: string): number {
  const normalized = value.replace(':', '');
  const sign = normalized.startsWith('-') ? -1 : 1;
  const hours = toNumber(normalized.slice(1, 3));
  const minutes = toNumber(normalized.slice(3, 5));
  return sign * (hours * 60 + minutes);
}

function normalizeDateString(value: string): string {
  const trimmed = value.trim();

  // PocketBase returns "YYYY-MM-DD HH:mm:ss.SSSZ"; Hermes is stricter than browsers.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.replace(' ', 'T');
  }

  return trimmed;
}

function parsePocketBaseDateString(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const dateTimeMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T])(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/,
  );
  if (dateTimeMatch) {
    const [, year, month, day, hours, minutes, seconds, fraction, timezone] = dateTimeMatch;
    if (!year || !month || !day || !hours || !minutes) {
      return null;
    }

    const parsed = parseDateTime(year, month, day, hours, minutes, seconds, fraction);

    if (!timezone) {
      return new Date(
        parsed.year,
        parsed.monthIndex,
        parsed.day,
        parsed.hours,
        parsed.minutes,
        parsed.seconds,
        parsed.milliseconds,
      );
    }

    if (timezone === 'Z') {
      return new Date(
        Date.UTC(
          parsed.year,
          parsed.monthIndex,
          parsed.day,
          parsed.hours,
          parsed.minutes,
          parsed.seconds,
          parsed.milliseconds,
        ),
      );
    }

    const offsetMinutes = parseOffsetMinutes(timezone);
    const utcTimestamp =
      Date.UTC(
        parsed.year,
        parsed.monthIndex,
        parsed.day,
        parsed.hours,
        parsed.minutes,
        parsed.seconds,
        parsed.milliseconds,
      ) -
      offsetMinutes * 60_000;
    return new Date(utcTimestamp);
  }

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    if (!year || !month || !day) {
      return null;
    }

    return new Date(toNumber(year), toNumber(month) - 1, toNumber(day));
  }

  return null;
}

export function resolveDateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'string') {
    const normalized = normalizeDateString(value);
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }

    const parsedPocketBaseDate = parsePocketBaseDateString(value);
    if (!parsedPocketBaseDate || Number.isNaN(parsedPocketBaseDate.getTime())) {
      return null;
    }

    return parsedPocketBaseDate;
  }

  return null;
}

export function formatDisplayDate(
  value: unknown,
  { locale, options, fallback = 'Unknown' }: FormatDisplayDateOptions = {},
): string {
  const resolvedDate = resolveDateValue(value);
  if (!resolvedDate) {
    return fallback;
  }

  return resolvedDate.toLocaleDateString(locale, options);
}

export function formatDateToLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayLocalDateString(): string {
  return formatDateToLocalDateString(new Date());
}

export function localDateStringToUTC(localDateString: string): string {
  return new Date(`${localDateString}T00:00:00`).toISOString();
}

export function isValidLocalDate(localDateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDateString)) {
    return false;
  }

  const parsedDate = new Date(`${localDateString}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  return parsedDate.toISOString().slice(0, 10) === localDateString;
}

export function formatLocalDateLabel(
  localDateString: string,
  {
    locale,
    fallback = localDateString,
    options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    },
  }: FormatLocalDateOptions = {},
): string {
  const parsedDate = new Date(`${localDateString}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return fallback;
  }

  return parsedDate.toLocaleDateString(locale, options);
}
