import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildAuthRateLimitKey,
  checkAuthRateLimit,
  isAuthRateLimitError,
  recordAuthRateLimitFailure,
  recordAuthRateLimitSuccess,
  recordServerAuthRateLimit,
} from '../lib/authRateLimiter';
import { logger } from '../lib/logger';

jest.mock('../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

describe('authRateLimiter', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
    mockedLogger.warn.mockReset();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows the first two failures without cooldown and blocks progressively after that', async () => {
    expect(await recordAuthRateLimitFailure('login', 'USER@example.com')).toMatchObject({
      allowed: true,
      failedAttempts: 1,
      remainingMs: 0,
    });
    expect(await recordAuthRateLimitFailure('login', 'user@example.com')).toMatchObject({
      allowed: true,
      failedAttempts: 2,
      remainingMs: 0,
    });
    expect(await recordAuthRateLimitFailure('login', 'user@example.com')).toMatchObject({
      allowed: false,
      failedAttempts: 3,
      remainingMs: 30_000,
    });

    jest.advanceTimersByTime(30_000);

    expect(await recordAuthRateLimitFailure('login', 'user@example.com')).toMatchObject({
      allowed: false,
      failedAttempts: 4,
      remainingMs: 60_000,
    });

    jest.advanceTimersByTime(60_000);

    expect(await recordAuthRateLimitFailure('login', 'user@example.com')).toMatchObject({
      allowed: false,
      failedAttempts: 5,
      remainingMs: 300_000,
    });

    jest.advanceTimersByTime(300_000);

    expect(await recordAuthRateLimitFailure('login', 'user@example.com')).toMatchObject({
      allowed: false,
      failedAttempts: 6,
      remainingMs: 900_000,
    });
  });

  it('clears state after a successful submission', async () => {
    await recordAuthRateLimitFailure('signup', 'user@example.com');
    await recordAuthRateLimitFailure('signup', 'user@example.com');
    await recordAuthRateLimitFailure('signup', 'user@example.com');

    expect(await checkAuthRateLimit('signup', 'user@example.com')).toMatchObject({
      allowed: false,
    });

    await recordAuthRateLimitSuccess('signup', 'user@example.com');

    expect(await checkAuthRateLimit('signup', 'user@example.com')).toMatchObject({
      allowed: true,
      failedAttempts: 0,
    });
  });

  it('persists state in AsyncStorage and clears expired blocks', async () => {
    await recordAuthRateLimitFailure('waitlist', 'user@example.com');
    await recordAuthRateLimitFailure('waitlist', 'user@example.com');
    await recordAuthRateLimitFailure('waitlist', 'user@example.com');

    expect(await checkAuthRateLimit('waitlist', 'user@example.com')).toMatchObject({
      allowed: false,
      remainingMs: 30_000,
    });

    jest.advanceTimersByTime(30_000);

    expect(await checkAuthRateLimit('waitlist', 'user@example.com')).toMatchObject({
      allowed: true,
      remainingMs: 0,
    });
  });

  it('fails open and logs when storage cannot be read', async () => {
    mockedAsyncStorage.getItem.mockRejectedValueOnce(new Error('storage unavailable'));

    expect(await checkAuthRateLimit('login', 'user@example.com')).toMatchObject({
      allowed: true,
    });
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      '[AuthRateLimiter] Failed to read persisted state:',
      expect.any(Error),
    );
  });

  it('fails open and logs when storage cannot be written', async () => {
    mockedAsyncStorage.setItem.mockRejectedValueOnce(new Error('storage full'));

    expect(await recordServerAuthRateLimit('login', 'user@example.com')).toMatchObject({
      allowed: true,
      failedAttempts: 0,
    });
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      '[AuthRateLimiter] Failed to persist state:',
      expect.any(Error),
    );
  });

  it('sets a 15 minute cooldown for server rate-limit responses', async () => {
    expect(await recordServerAuthRateLimit('password_reset_request', 'user@example.com')).toMatchObject({
      allowed: false,
      failedAttempts: 6,
      remainingMs: 900_000,
    });
  });

  it('normalizes keys and separates flows', () => {
    expect(buildAuthRateLimitKey('login', ' USER@example.COM ')).toBe('login:user@example.com');
    expect(buildAuthRateLimitKey('signup', 'USER@example.com')).toBe('signup:user@example.com');
    expect(buildAuthRateLimitKey('login')).toBe('login:anonymous');
  });

  it('detects common auth rate-limit errors', () => {
    expect(isAuthRateLimitError({ status: 429 })).toBe(true);
    expect(isAuthRateLimitError(new Error('Too many failed attempts. Try again later.'))).toBe(true);
    expect(
      isAuthRateLimitError({
        response: {
          data: {
            email: {
              message: 'Already requested recently.',
            },
          },
        },
      }),
    ).toBe(true);
    expect(isAuthRateLimitError(new Error('Invalid password'))).toBe(false);
  });
});
