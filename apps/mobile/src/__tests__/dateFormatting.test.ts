import {
  formatDisplayDate,
  formatStoredCalendarDateLabel,
  resolveDateValue,
} from '../lib/dateFormatting';

describe('resolveDateValue', () => {
  it('parses PocketBase timestamps with a space separator and timezone', () => {
    expect(resolveDateValue('2026-02-19 10:42:36.123Z')?.toISOString()).toBe(
      '2026-02-19T10:42:36.123Z',
    );
  });

  it('parses timestamps with microseconds and no timezone', () => {
    expect(resolveDateValue('2026-02-19 10:42:36.123456')?.getTime()).toBe(
      new Date(2026, 1, 19, 10, 42, 36, 123).getTime(),
    );
  });

  it('returns null for invalid values', () => {
    expect(resolveDateValue('invalid-date-value')).toBeNull();
  });
});

describe('formatDisplayDate', () => {
  it('parses PocketBase timestamps with a space separator and timezone', () => {
    const value = '2026-02-19 10:42:36.123Z';
    const expected = new Date('2026-02-19T10:42:36.123Z').toLocaleDateString();

    expect(formatDisplayDate(value)).toBe(expected);
  });

  it('parses timestamps with microseconds and no timezone', () => {
    const value = '2026-02-19 10:42:36.123456';
    const expected = new Date(2026, 1, 19, 10, 42, 36, 123).toLocaleDateString();

    expect(formatDisplayDate(value)).toBe(expected);
  });

  it('parses timestamps with explicit UTC offsets', () => {
    const value = '2026-02-19 10:42:36.123+00:00';
    const expected = new Date('2026-02-19T10:42:36.123+00:00').toLocaleDateString();

    expect(formatDisplayDate(value)).toBe(expected);
  });

  it('parses timestamps when seconds are omitted', () => {
    const value = '2026-02-19 10:42';
    const expected = new Date(2026, 1, 19, 10, 42, 0, 0).toLocaleDateString();

    expect(formatDisplayDate(value)).toBe(expected);
  });

  it('returns fallback for invalid values', () => {
    expect(formatDisplayDate('invalid-date-value', { fallback: 'Unknown' })).toBe('Unknown');
  });
});

describe('formatStoredCalendarDateLabel', () => {
  const labelOptions = {
    locale: 'en-US',
    options: {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    } as const,
  };

  it('formats the leading calendar date from UTC timestamps without timezone shifting the day', () => {
    expect(formatStoredCalendarDateLabel('2026-04-05T00:00:00.000Z', labelOptions)).toBe(
      'Apr 5, 2026',
    );
  });

  it('formats the leading calendar date from PocketBase space-separated timestamps', () => {
    expect(formatStoredCalendarDateLabel('2026-04-05 00:00:00.000Z', labelOptions)).toBe(
      'Apr 5, 2026',
    );
  });

  it('falls back to display-date formatting for non-string values', () => {
    const value = new Date(2026, 3, 5, 12, 30, 0, 0);

    expect(formatStoredCalendarDateLabel(value, labelOptions)).toBe(
      formatDisplayDate(value, labelOptions),
    );
  });

  it('returns fallback for invalid values', () => {
    expect(
      formatStoredCalendarDateLabel('2026-99-99T00:00:00.000Z', {
        ...labelOptions,
        fallback: 'Unknown date',
      }),
    ).toBe('Unknown date');
  });
});
