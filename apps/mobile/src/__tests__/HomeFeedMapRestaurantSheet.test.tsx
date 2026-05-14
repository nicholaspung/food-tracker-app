import { formatMapItemDate } from '../screens/home/homeFeedMapDateFormatting';

describe('formatMapItemDate', () => {
  it('redacts friends map item dates to the month label', () => {
    expect(formatMapItemDate('2026-04-30T12:00:00.000Z', 'friends')).toBe('April 2026');
  });

  it('keeps mine map item dates as full display dates', () => {
    expect(formatMapItemDate('2026-04-30T12:00:00.000Z', 'mine')).toBe('Apr 30, 2026');
  });

  it('preserves already-redacted friends month values', () => {
    expect(formatMapItemDate('2026-05', 'friends')).toBe('May 2026');
  });
});
