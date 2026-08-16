import { act, create } from 'react-test-renderer';

import { useVerificationMonitor } from '../providers/auth/verificationMonitor';

let appStateListener: ((state: 'active' | 'background') => void) | null = null;

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn((_event: string, listener: (state: 'active' | 'background') => void) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    }),
  },
}));

jest.mock('../lib/logger', () => ({ logger: { warn: jest.fn() } }));

function VerificationMonitorHarness({
  hasActiveSession,
  refreshAuthSession,
  syncAuthSnapshot,
}: {
  hasActiveSession: () => boolean;
  refreshAuthSession: () => Promise<void>;
  syncAuthSnapshot: () => void;
}) {
  useVerificationMonitor({
    hasActiveSession,
    refreshAuthSession,
    status: 'authenticated',
    syncAuthSnapshot,
    verificationGraceEndsAt: '2026-04-21T12:00:01.000Z',
    verificationStatus: 'grace_period',
  });
  return null;
}

describe('verification monitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
    appStateListener = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('re-evaluates access at the grace deadline and polls pending verification', async () => {
    const refreshAuthSession = jest.fn().mockResolvedValue(undefined);
    const syncAuthSnapshot = jest.fn();

    await act(async () => {
      create(
        <VerificationMonitorHarness
          hasActiveSession={() => true}
          refreshAuthSession={refreshAuthSession}
          syncAuthSnapshot={syncAuthSnapshot}
        />,
      );
    });

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(syncAuthSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(14_000);
      await Promise.resolve();
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);
  });

  it('refreshes the auth session when the app returns to the foreground', async () => {
    const refreshAuthSession = jest.fn().mockResolvedValue(undefined);

    await act(async () => {
      create(
        <VerificationMonitorHarness
          hasActiveSession={() => true}
          refreshAuthSession={refreshAuthSession}
          syncAuthSnapshot={jest.fn()}
        />,
      );
    });

    await act(async () => {
      appStateListener?.('background');
      appStateListener?.('active');
      await Promise.resolve();
    });

    expect(refreshAuthSession).toHaveBeenCalledTimes(1);
  });
});
