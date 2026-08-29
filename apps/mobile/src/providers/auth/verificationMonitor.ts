import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { resolveDateValue } from '../../lib/dateFormatting';
import { logger } from '../../lib/logger';
import type { EmailVerificationStatus } from '../../lib/emailVerificationAccess';
import type { AuthStatus } from './authSession';

const FOCUSED_VERIFICATION_REFRESH_DELAYS_MS = [15_000, 30_000, 60_000] as const;

interface VerificationMonitorOptions {
  hasActiveSession: () => boolean;
  isOnline: boolean;
  refreshAuthSession: () => Promise<void>;
  syncAuthSnapshot: () => void;
  status: AuthStatus;
  verificationGraceEndsAt: string | null;
  verificationStatus: EmailVerificationStatus;
}

export function useVerificationMonitor({
  hasActiveSession,
  isOnline,
  refreshAuthSession,
  status,
  syncAuthSnapshot,
  verificationGraceEndsAt,
  verificationStatus,
}: VerificationMonitorOptions): void {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const hasPendingForegroundRefreshRef = useRef(false);

  const refreshOnForeground = useCallback(() => {
    if (!hasActiveSession()) {
      hasPendingForegroundRefreshRef.current = false;
      syncAuthSnapshot();
      return;
    }

    if (!isOnline) {
      hasPendingForegroundRefreshRef.current = true;
      return;
    }

    hasPendingForegroundRefreshRef.current = false;
    void refreshAuthSession().catch((error) => {
      logger.warn('[VerificationMonitor] foreground auth refresh failed:', error);
    });
  }, [hasActiveSession, isOnline, refreshAuthSession, syncAuthSnapshot]);

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
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (previousState !== 'background' || nextState !== 'active') {
        return;
      }

      refreshOnForeground();
    });

    return () => subscription.remove();
  }, [refreshOnForeground]);

  useEffect(() => {
    if (
      !isOnline ||
      !hasPendingForegroundRefreshRef.current ||
      appStateRef.current !== 'active'
    ) {
      return;
    }

    refreshOnForeground();
  }, [isOnline, refreshOnForeground]);
}

interface FocusedVerificationMonitorOptions {
  enabled: boolean;
  isFocused: boolean;
  isOnline: boolean;
  refreshAuthSession: () => Promise<void>;
}

export function useFocusedVerificationMonitor({
  enabled,
  isFocused,
  isOnline,
  refreshAuthSession,
}: FocusedVerificationMonitorOptions): void {
  useEffect(() => {
    if (!enabled || !isFocused || !isOnline) {
      return undefined;
    }

    let isActive = true;
    let isAppActive = AppState.currentState === 'active';
    let refreshDelayIndex = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const clearScheduledRefresh = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleRefresh = (delayMs: number) => {
      clearScheduledRefresh();
      timeoutId = setTimeout(() => {
        timeoutId = null;
        if (!isActive || !isAppActive) {
          return;
        }

        void refreshAuthSession()
          .catch(() => {
            // The focused check is passive; explicit screen actions surface their own errors.
          })
          .finally(() => {
            if (!isActive || !isAppActive) {
              return;
            }

            const nextDelayMs = FOCUSED_VERIFICATION_REFRESH_DELAYS_MS[
              Math.min(refreshDelayIndex, FOCUSED_VERIFICATION_REFRESH_DELAYS_MS.length - 1)
            ];
            refreshDelayIndex += 1;
            scheduleRefresh(nextDelayMs);
          });
      }, delayMs);
    };

    if (isAppActive) {
      // Check immediately on focus, then back off to at most once per minute while visible.
      scheduleRefresh(0);
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      isAppActive = nextState === 'active';
      clearScheduledRefresh();
      if (isAppActive) {
        refreshDelayIndex = 0;
        // The app-level foreground refresh runs immediately, so resume focused polling afterward.
        scheduleRefresh(FOCUSED_VERIFICATION_REFRESH_DELAYS_MS[0]);
      }
    });

    return () => {
      isActive = false;
      clearScheduledRefresh();
      subscription.remove();
    };
  }, [enabled, isFocused, isOnline, refreshAuthSession]);
}
