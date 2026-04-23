import React from 'react';
import { act, create } from 'react-test-renderer';

import { useQueuedLogoutConfirmation } from '../hooks/useQueuedLogoutConfirmation';
import { useAuth } from '../providers/AuthProvider';
import { useSync } from '../providers/SyncProvider';

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../providers/SyncProvider', () => ({
  useSync: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseSync = useSync as jest.MockedFunction<typeof useSync>;

function HookConsumer({
  onLoggedOut,
}: {
  onLoggedOut?: () => void | Promise<void>;
}) {
  const state = useQueuedLogoutConfirmation({ onLoggedOut });

  return React.createElement('QueuedLogoutState', state);
}

describe('useQueuedLogoutConfirmation', () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
    mockedUseSync.mockReset();
  });

  it('opens and closes the confirmation modal for queued writes before logging out', async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      signOut,
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseSync.mockReturnValue({
      queueDepth: 2,
    } as unknown as ReturnType<typeof useSync>);

    let renderer: any;
    await act(async () => {
      renderer = create(<HookConsumer />);
    });

    await act(async () => {
      await renderer.root.findByType('QueuedLogoutState').props.requestLogout();
    });

    expect(renderer.root.findByType('QueuedLogoutState').props.isConfirmVisible).toBe(true);
    expect(signOut).not.toHaveBeenCalled();

    act(() => {
      renderer.root.findByType('QueuedLogoutState').props.cancelLogout();
    });

    expect(renderer.root.findByType('QueuedLogoutState').props.isConfirmVisible).toBe(false);

    await act(async () => {
      await renderer.root.findByType('QueuedLogoutState').props.requestLogout();
      await renderer.root.findByType('QueuedLogoutState').props.confirmLogout();
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType('QueuedLogoutState').props.isConfirmVisible).toBe(false);
  });

  it('logs out immediately without showing the modal when no queued writes exist', async () => {
    const onLoggedOut = jest.fn();
    const signOut = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      signOut,
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseSync.mockReturnValue({
      queueDepth: 0,
    } as unknown as ReturnType<typeof useSync>);

    let renderer: any;
    await act(async () => {
      renderer = create(<HookConsumer onLoggedOut={onLoggedOut} />);
    });

    await act(async () => {
      await renderer.root.findByType('QueuedLogoutState').props.requestLogout();
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType('QueuedLogoutState').props.isConfirmVisible).toBe(false);
  });
});
