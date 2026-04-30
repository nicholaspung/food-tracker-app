import { formatDisplayDate } from '../../lib/dateFormatting';

export function buildBookmarkLookupIds(...ids: (string | undefined)[]): string[] {
  return Array.from(
    new Set(
      ids
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

export function formatMonthYearLabel(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const label = formatDisplayDate(value, {
    fallback: '',
    options: { month: 'short', year: 'numeric' },
  });
  return label || null;
}

export function formatFullDateLabel(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const label = formatDisplayDate(value, {
    fallback: '',
    options: { month: 'short', day: 'numeric', year: 'numeric' },
  });
  return label || null;
}

export function normalizeMenuItemKey(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed || value;
}
