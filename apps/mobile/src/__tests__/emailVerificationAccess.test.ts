import {
  EMAIL_VERIFICATION_GRACE_PERIOD_MS,
  resolveEmailVerificationAccess,
} from '../lib/emailVerificationAccess';

describe('emailVerificationAccess', () => {
  it('returns verified when the user is already verified', () => {
    expect(
      resolveEmailVerificationAccess({
        verified: true,
        createdAt: '2026-04-18T12:00:00.000Z',
        now: new Date('2026-04-21T12:00:00.000Z'),
      }),
    ).toEqual({
      status: 'verified',
      graceEndsAt: null,
    });
  });

  it('returns grace_period while the user is still inside the 72-hour window', () => {
    const createdAt = new Date('2026-04-20T12:00:00.000Z');

    const access = resolveEmailVerificationAccess({
      verified: false,
      createdAt: createdAt.toISOString(),
      now: createdAt.getTime() + 2 * 60 * 60 * 1000,
    });

    expect(access.status).toBe('grace_period');
    expect(access.graceEndsAt).toBe(new Date(createdAt.getTime() + EMAIL_VERIFICATION_GRACE_PERIOD_MS).toISOString());
  });

  it('returns grace_expired after the grace window ends', () => {
    expect(
      resolveEmailVerificationAccess({
        verified: false,
        createdAt: '2026-04-18T12:00:00.000Z',
        now: new Date('2026-04-21T12:00:00.000Z'),
      }).status,
    ).toBe('grace_expired');
  });

  it('fails closed when the created timestamp is invalid', () => {
    expect(
      resolveEmailVerificationAccess({
        verified: false,
        createdAt: 'not-a-date',
        now: new Date('2026-04-21T12:00:00.000Z'),
      }),
    ).toEqual({
      status: 'grace_expired',
      graceEndsAt: null,
    });
  });
});
