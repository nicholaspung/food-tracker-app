import { normalizeAuthUser } from '../types/auth';

describe('normalizeAuthUser', () => {
  it('preserves valid mobile onboarding state', () => {
    expect(
      normalizeAuthUser({
        id: 'user_1',
        email: 'test@example.com',
        verified: true,
        mobileOnboardingState: {
          main: {
            completedVersion: 1,
            completedAt: '2026-04-28T12:00:00.000Z',
          },
          moreCards: {
            lists: {
              dismissedAt: '2026-04-28T12:01:00.000Z',
            },
            splitBill: {
              dismissedAt: '2026-04-28T12:02:00.000Z',
            },
            tipCalculator: {
              dismissedAt: '2026-04-28T12:03:00.000Z',
            },
          },
        },
      }),
    ).toMatchObject({
      id: 'user_1',
      mobileOnboardingState: {
        main: {
          completedVersion: 1,
          completedAt: '2026-04-28T12:00:00.000Z',
        },
        moreCards: {
          lists: {
            dismissedAt: '2026-04-28T12:01:00.000Z',
          },
          splitBill: {
            dismissedAt: '2026-04-28T12:02:00.000Z',
          },
          tipCalculator: {
            dismissedAt: '2026-04-28T12:03:00.000Z',
          },
        },
      },
    });
  });

  it('drops malformed mobile onboarding state', () => {
    expect(
      normalizeAuthUser({
        id: 'user_1',
        email: 'test@example.com',
        verified: true,
        mobileOnboardingState: {
          main: {
            completedVersion: 'latest',
          },
          moreCards: {
            lists: {
              dismissedAt: 123,
            },
            tipCalculator: {
              dismissedAt: false,
            },
          },
        },
      })?.mobileOnboardingState,
    ).toBeUndefined();
  });
});
