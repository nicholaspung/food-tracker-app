import {
  FREE_MONTHLY_PHOTO_UPLOAD_LIMIT,
  formatFreeMonthlyPhotoLimitStatus,
  formatLimitExceededMessage,
  parseLimitExceededError,
} from '../features/store/usageLimitsGateway';

describe('usageLimitsGateway helpers', () => {
  it('parses limit payload from nested error data', () => {
    const payload = parseLimitExceededError({
      data: {
        code: 'LIMIT_EXCEEDED',
        message: 'Monthly menu scan limit reached.',
        metric: 'menu_scans',
        limit: 25,
        used: 25,
        remaining: 0,
        monthKey: '2026-02',
      },
    });

    expect(payload).not.toBeNull();
    expect(payload?.metric).toBe('menu_scans');
    expect(payload?.limit).toBe(25);
  });

  it('parses limit payload from JSON-string error message', () => {
    const payload = parseLimitExceededError(
      new Error(
        JSON.stringify({
          code: 'LIMIT_EXCEEDED',
          message: 'Monthly food place search limit reached.',
          metric: 'places_queries',
          limit: 100,
          used: 100,
          remaining: 0,
          monthKey: '2026-02',
        }),
      ),
    );

    expect(payload).not.toBeNull();
    expect(formatLimitExceededMessage(payload!)).toBe('Search limit reached for this month (100).');
  });

  it('preserves contextual photo limit messages for per-record failures', () => {
    const payload = parseLimitExceededError({
      data: {
        code: 'LIMIT_EXCEEDED',
        message: 'Photo upload limit reached for this note (1).',
        metric: 'photo_uploads',
        limit: 1,
        used: 1,
        remaining: 0,
        monthKey: '2026-02',
      },
    });

    expect(payload).not.toBeNull();
    expect(formatLimitExceededMessage(payload!)).toBe('Photo upload limit reached for this note (1).');
  });

  it('formats storefront read limit payloads', () => {
    const payload = parseLimitExceededError({
      data: {
        code: 'LIMIT_EXCEEDED',
        message: 'Monthly storefront read limit reached.',
        metric: 'storefront_reads',
        limit: 25,
        used: 25,
        remaining: 0,
        monthKey: '2026-02',
      },
    });

    expect(payload).not.toBeNull();
    expect(formatLimitExceededMessage(payload!)).toBe('Storefront read limit reached for this month (25).');
  });

  it('formats the free monthly photo remaining estimate from the shared limit', () => {
    expect(FREE_MONTHLY_PHOTO_UPLOAD_LIMIT).toBe(100);
    expect(formatFreeMonthlyPhotoLimitStatus(0)).toBe(
      'Free users can upload up to 100 photos per month. Remaining estimate: 0.',
    );
  });
});
