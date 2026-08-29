import {
  FREE_MONTHLY_PHOTO_UPLOAD_LIMIT,
  formatFreeMonthlyPhotoLimitStatus,
  formatLimitExceededMessage,
  getMonthlyUsage,
  parseLimitExceededError,
  parseMonthlyUsageSnapshot,
  type MonthlyUsageSnapshot,
} from '../features/store/usageLimitsGateway';
import { sendApiRequest } from '../features/store/pocketbaseGateway';

jest.mock('../features/store/pocketbaseGateway', () => ({
  sendApiRequest: jest.fn(),
}));

const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;

const validSnapshot: MonthlyUsageSnapshot = {
  monthKey: '2026-02',
  userTier: 'free',
  limits: {
    photoUploadsPerRecord: 1,
    photoUploadsMonthly: 5,
    placesQueriesMonthly: 100,
    menuScansMonthly: 5,
    receiptScansMonthly: 5,
    storefrontReadsMonthly: 5,
  },
  usage: {
    photoUploads: 2,
    placesQueries: 10,
    menuScans: 1,
    receiptScans: 1,
    storefrontReads: 1,
  },
  remaining: {
    photoUploadsMonthly: 3,
    placesQueriesMonthly: 90,
    menuScansMonthly: 4,
    receiptScansMonthly: 4,
    storefrontReadsMonthly: 4,
  },
};

describe('usageLimitsGateway helpers', () => {
  beforeEach(() => {
    mockedSendApiRequest.mockReset();
  });

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

  it.each(['admin', 'subscriber', 'free'] as const)(
    'parses a complete %s monthly usage snapshot',
    (userTier) => {
      const snapshot = {
        ...validSnapshot,
        userTier,
        limits: {
          ...validSnapshot.limits,
          photoUploadsMonthly: userTier === 'admin' ? null : 5,
        },
        remaining: {
          ...validSnapshot.remaining,
          photoUploadsMonthly: userTier === 'admin' ? null : 3,
        },
      };

      expect(parseMonthlyUsageSnapshot(snapshot)).toEqual(snapshot);
    },
  );

  it.each([
    ['missing nested record', { ...validSnapshot, remaining: undefined }],
    ['invalid tier', { ...validSnapshot, userTier: 'staff' }],
    [
      'invalid usage number',
      { ...validSnapshot, usage: { ...validSnapshot.usage, photoUploads: Number.NaN } },
    ],
    [
      'invalid nullable limit',
      { ...validSnapshot, limits: { ...validSnapshot.limits, menuScansMonthly: 'unlimited' } },
    ],
    [
      'null usage value',
      { ...validSnapshot, usage: { ...validSnapshot.usage, placesQueries: null } },
    ],
  ])('rejects a snapshot with %s', (_label, snapshot) => {
    expect(parseMonthlyUsageSnapshot(snapshot)).toBeNull();
  });

  it('rejects malformed successful API responses', async () => {
    mockedSendApiRequest.mockResolvedValue({
      ...validSnapshot,
      limits: { photoUploadsMonthly: 5 },
    });

    await expect(getMonthlyUsage()).rejects.toThrow('Invalid monthly usage response.');
  });

  it('returns a decoded successful API response', async () => {
    mockedSendApiRequest.mockResolvedValue(validSnapshot);

    await expect(getMonthlyUsage({ viewAsTier: 'subscriber' })).resolves.toEqual(validSnapshot);
    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/usage/monthly?view_as_tier=subscriber',
      { method: 'GET', signal: undefined },
    );
  });
});
