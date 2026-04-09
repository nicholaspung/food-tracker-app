import { formatLimitExceededMessage, parseLimitExceededError } from '../features/store/usageLimitsGateway';

describe('usageLimitsGateway helpers', () => {
  it('parses limit payload from nested error data', () => {
    const payload = parseLimitExceededError({
      data: {
        code: 'LIMIT_EXCEEDED',
        message: 'Monthly menu scan limit reached.',
        metric: 'menu_scans',
        limit: 5,
        used: 5,
        remaining: 0,
        monthKey: '2026-02',
      },
    });

    expect(payload).not.toBeNull();
    expect(payload?.metric).toBe('menu_scans');
    expect(payload?.limit).toBe(5);
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
});
