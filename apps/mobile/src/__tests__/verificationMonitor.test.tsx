import { act, create } from 'react-test-renderer';

import {
  useFocusedVerificationMonitor,
  useVerificationMonitor,
} from '../providers/auth/verificationMonitor';

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
  isOnline = true,
  refreshAuthSession,
  syncAuthSnapshot,
}: {
  hasActiveSession: () => boolean;
  isOnline?: boolean;
  refreshAuthSession: () => Promise<void>;
  syncAuthSnapshot: () => void;
}) {
  useVerificationMonitor({
    hasActiveSession,
    isOnline,
    refreshAuthSession,
    status: 'authenticated',
    syncAuthSnapshot,
    verificationGraceEndsAt: '2026-04-21T12:00:01.000Z',
    verificationStatus: 'grace_period',
  });
  return null;
}

function FocusedVerificationMonitorHarness({
  enabled = true,
  isFocused = true,
  isOnline = true,
  refreshAuthSession,
}: {
  enabled?: boolean;
  isFocused?: boolean;
  isOnline?: boolean;
  refreshAuthSession: () => Promise<void>;
}) {
  useFocusedVerificationMonitor({
    enabled,
    isFocused,
    isOnline,
    refreshAuthSession,
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

  it('re-evaluates access at the grace deadline without polling normal authenticated screens', async () => {
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
      jest.advanceTimersByTime(60_000);
    });

    expect(syncAuthSnapshot).toHaveBeenCalledTimes(1);
    expect(refreshAuthSession).not.toHaveBeenCalled();
  });

  it('refreshes the auth session once when the app returns online to the foreground', async () => {
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

  it('skips the foreground refresh while offline', async () => {
    const refreshAuthSession = jest.fn().mockResolvedValue(undefined);

    await act(async () => {
      create(
        <VerificationMonitorHarness
          hasActiveSession={() => true}
          isOnline={false}
          refreshAuthSession={refreshAuthSession}
          syncAuthSnapshot={jest.fn()}
        />,
      );
    });

    act(() => {
      appStateListener?.('background');
      appStateListener?.('active');
    });

    expect(refreshAuthSession).not.toHaveBeenCalled();
  });

  it('runs a skipped foreground refresh once connectivity recovers', async () => {
    const refreshAuthSession = jest.fn().mockResolvedValue(undefined);
    let renderer: any;

    await act(async () => {
      renderer = create(
        <VerificationMonitorHarness
          hasActiveSession={() => true}
          isOnline={false}
          refreshAuthSession={refreshAuthSession}
          syncAuthSnapshot={jest.fn()}
        />,
      );
    });

    act(() => {
      appStateListener?.('background');
      appStateListener?.('active');
    });
    expect(refreshAuthSession).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(
        <VerificationMonitorHarness
          hasActiveSession={() => true}
          isOnline
          refreshAuthSession={refreshAuthSession}
          syncAuthSnapshot={jest.fn()}
        />,
      );
      await Promise.resolve();
    });

    expect(refreshAuthSession).toHaveBeenCalledTimes(1);
  });

  it('checks immediately while focused and backs off to a one-minute maximum cadence', async () => {
    const refreshAuthSession = jest.fn().mockResolvedValue(undefined);

    await act(async () => {
      create(<FocusedVerificationMonitorHarness refreshAuthSession={refreshAuthSession} />);
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(3);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(4);
  });

  it('does not schedule focused checks while offline', async () => {
    const refreshAuthSession = jest.fn().mockResolvedValue(undefined);

    await act(async () => {
      create(
        <FocusedVerificationMonitorHarness
          isOnline={false}
          refreshAuthSession={refreshAuthSession}
        />,
      );
      jest.advanceTimersByTime(5 * 60_000);
    });

    expect(refreshAuthSession).not.toHaveBeenCalled();
  });

  it('waits for an in-flight focused check before scheduling another', async () => {
    let resolveRefresh = () => {};
    const refreshPromise = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const refreshAuthSession = jest.fn(() => refreshPromise);

    await act(async () => {
      create(<FocusedVerificationMonitorHarness refreshAuthSession={refreshAuthSession} />);
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(5 * 60_000);
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRefresh();
      await refreshPromise;
    });
    await act(async () => {
      jest.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(2);
  });

  it('does not resume an in-flight focused schedule while backgrounded', async () => {
    let resolveRefresh = () => {};
    const refreshPromise = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const refreshAuthSession = jest.fn(() => refreshPromise);

    await act(async () => {
      create(<FocusedVerificationMonitorHarness refreshAuthSession={refreshAuthSession} />);
    });
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);

    act(() => {
      appStateListener?.('background');
    });
    await act(async () => {
      resolveRefresh();
      await refreshPromise;
    });
    act(() => {
      jest.advanceTimersByTime(5 * 60_000);
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);

    act(() => {
      appStateListener?.('active');
    });
    await act(async () => {
      jest.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(2);
  });

  it('stops focused checks after blur', async () => {
    const refreshAuthSession = jest.fn().mockResolvedValue(undefined);
    let renderer: any;

    await act(async () => {
      renderer = create(<FocusedVerificationMonitorHarness refreshAuthSession={refreshAuthSession} />);
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(
        <FocusedVerificationMonitorHarness
          isFocused={false}
          refreshAuthSession={refreshAuthSession}
        />,
      );
    });
    act(() => {
      jest.advanceTimersByTime(5 * 60_000);
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);
  });

  it('stops focused checks after verification', async () => {
    const refreshAuthSession = jest.fn().mockResolvedValue(undefined);
    let renderer: any;

    await act(async () => {
      renderer = create(<FocusedVerificationMonitorHarness refreshAuthSession={refreshAuthSession} />);
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(
        <FocusedVerificationMonitorHarness
          enabled={false}
          refreshAuthSession={refreshAuthSession}
        />,
      );
    });
    act(() => {
      jest.advanceTimersByTime(5 * 60_000);
    });
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);
  });
});
