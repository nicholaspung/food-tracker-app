import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { resolveDateValue } from '../../lib/dateFormatting';
import { logger } from '../../lib/logger';
import type { EmailVerificationStatus } from '../../lib/emailVerificationAccess';
import type { AuthStatus } from './authSession';

const AUTH_VERIFICATION_STATUS_REFRESH_INTERVAL_MS = 15_000;

interface VerificationMonitorOptions {
  hasActiveSession: () => boolean;
  refreshAuthSession: () => Promise<void>;
  syncAuthSnapshot: () => void;
  status: AuthStatus;
  verificationGraceEndsAt: string | null;
  verificationStatus: EmailVerificationStatus;
}

export function useVerificationMonitor({
  hasActiveSession,
  refreshAuthSession,
  status,
  syncAuthSnapshot,
  verificationGraceEndsAt,
  verificationStatus,
}: VerificationMonitorOptions): void {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (status === 'bootstrapping' || verificationStatus !== 'grace_period' || !verificationGraceEndsAt) {
      return undefined;
    }

    const graceEndsAtDate = resolveDateValue(verificationGraceEndsAt);
    if (!graceEndsAtDate) {
      syncAuthSnapshot();
      return undefined;
    }

    const delayMs = graceEndsAtDate.getTime() - Date.now();
    if (delayMs <= 0) {
      syncAuthSnapshot();
      return undefined;
    }

    const timeoutId = setTimeout(syncAuthSnapshot, delayMs);
    return () => clearTimeout(timeoutId);
  }, [status, syncAuthSnapshot, verificationGraceEndsAt, verificationStatus]);

  useEffect(() => {
    const shouldPollVerificationStatus =
      appState === 'active' &&
      hasActiveSession() &&
      verificationStatus !== 'verified' &&
      (status === 'authenticated' || status === 'verification_required');

    if (!shouldPollVerificationStatus) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void refreshAuthSession().catch(() => {
        // Foreground refresh hooks surface meaningful auth failures. Polling stays silent.
      });
    }, AUTH_VERIFICATION_STATUS_REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [appState, hasActiveSession, refreshAuthSession, status, verificationStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      setAppState(nextState);

      if (previousState !== 'background' || nextState !== 'active') {
        return;
      }

      if (!hasActiveSession()) {
        syncAuthSnapshot();
        return;
      }

      void refreshAuthSession().catch((error) => {
        logger.warn('[VerificationMonitor] foreground auth refresh failed:', error);
      });
    });

    return () => subscription.remove();
  }, [hasActiveSession, refreshAuthSession, syncAuthSnapshot]);
}
