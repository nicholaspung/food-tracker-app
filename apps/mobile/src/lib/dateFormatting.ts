interface FormatDisplayDateOptions {
  locale?: string | string[];
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
}

function resolveDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function formatDisplayDate(
  value: unknown,
  { locale, options, fallback = 'Unknown' }: FormatDisplayDateOptions = {},
): string {
  const resolvedDate = resolveDate(value);
  if (!resolvedDate) {
    return fallback;
  }

  return resolvedDate.toLocaleDateString(locale, options);
}
