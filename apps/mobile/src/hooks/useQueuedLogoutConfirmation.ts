import { useCallback, useMemo, useState } from 'react';

import { useAuth } from '../providers/AuthProvider';
import { useSync } from '../providers/SyncProvider';

const DEFAULT_LOGOUT_CONFIRMATION_COPY = {
  cancelLabel: 'Stay Logged In',
  confirmLabel: 'Log Out & Discard',
  confirmLoadingLabel: 'Logging out...',
  description:
    'You have unsynced offline changes queued on this device. Logging out will discard those changes and clear cached data for this account.',
  title: 'Discard offline changes and log out?',
} as const;

interface UseQueuedLogoutConfirmationOptions {
  onLoggedOut?: () => void | Promise<void>;
}

export function useQueuedLogoutConfirmation(options: UseQueuedLogoutConfirmationOptions = {}) {
  const { signOut } = useAuth();
  const { queueDepth } = useSync();
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const onLoggedOut = options.onLoggedOut;

  const hasQueuedWrites = queueDepth > 0;

  const completeLogout = useCallback(async () => {
    setIsLoggingOut(true);

    try {
      await signOut();
      await onLoggedOut?.();
      setIsConfirmVisible(false);
    } finally {
      setIsLoggingOut(false);
    }
  }, [onLoggedOut, signOut]);

  const requestLogout = useCallback(async () => {
    if (isLoggingOut) {
      return;
    }

    if (!hasQueuedWrites) {
      await completeLogout();
      return;
    }

    setIsConfirmVisible(true);
  }, [completeLogout, hasQueuedWrites, isLoggingOut]);

  const confirmLogout = useCallback(async () => {
    if (isLoggingOut) {
      return;
    }

    await completeLogout();
  }, [completeLogout, isLoggingOut]);

  const cancelLogout = useCallback(() => {
    if (isLoggingOut) {
      return;
    }

    setIsConfirmVisible(false);
  }, [isLoggingOut]);

  return useMemo(
    () => ({
      ...DEFAULT_LOGOUT_CONFIRMATION_COPY,
      cancelLogout,
      confirmLogout,
      hasQueuedWrites,
      isConfirmVisible,
      isLoggingOut,
      requestLogout,
    }),
    [cancelLogout, confirmLogout, hasQueuedWrites, isConfirmVisible, isLoggingOut, requestLogout],
  );
}
