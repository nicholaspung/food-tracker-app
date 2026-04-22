import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

import { logger } from '../lib/logger';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from './ConnectivityProvider';

const FOREGROUND_OTA_CHECK_COOLDOWN_MS = 15 * 60 * 1000;

function buildObservabilityProperties(trigger: 'foreground') {
  return {
    currentChannel: Updates.channel ?? 'unknown',
    currentUpdateId: Updates.updateId ?? 'embedded',
    runtimeVersion: Updates.runtimeVersion ?? 'unknown',
    source: 'OtaUpdatesProvider',
    trigger,
  };
}

export function OtaUpdatesProvider({ children }: { children: React.ReactNode }) {
  const { isOnline } = useConnectivity();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isOnlineRef = useRef(isOnline);
  const isCheckingRef = useRef(false);
  const lastForegroundCheckAtRef = useRef<number | null>(null);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (previousState !== 'background' || nextState !== 'active') {
        return;
      }

      if (__DEV__) {
        trackObservabilityEvent('OTA_AUTO_CHECK_SKIPPED', {
          ...buildObservabilityProperties('foreground'),
          reason: 'development',
        });
        return;
      }

      if (!Updates.isEnabled) {
        trackObservabilityEvent('OTA_AUTO_CHECK_SKIPPED', {
          ...buildObservabilityProperties('foreground'),
          reason: 'updates_disabled',
        });
        return;
      }

      if (!isOnlineRef.current) {
        trackObservabilityEvent('OTA_AUTO_CHECK_SKIPPED', {
          ...buildObservabilityProperties('foreground'),
          reason: 'offline',
        });
        return;
      }

      if (isCheckingRef.current) {
        trackObservabilityEvent('OTA_AUTO_CHECK_SKIPPED', {
          ...buildObservabilityProperties('foreground'),
          reason: 'in_flight',
        });
        return;
      }

      const now = Date.now();
      if (
        lastForegroundCheckAtRef.current !== null &&
        now - lastForegroundCheckAtRef.current < FOREGROUND_OTA_CHECK_COOLDOWN_MS
      ) {
        trackObservabilityEvent('OTA_AUTO_CHECK_SKIPPED', {
          ...buildObservabilityProperties('foreground'),
          reason: 'cooldown',
        });
        return;
      }

      lastForegroundCheckAtRef.current = now;
      isCheckingRef.current = true;
      trackObservabilityEvent('OTA_AUTO_CHECK_STARTED', buildObservabilityProperties('foreground'));

      void Updates.checkForUpdateAsync()
        .then(async (checkResult) => {
          if (!checkResult.isAvailable && !checkResult.isRollBackToEmbedded) {
            return;
          }

          trackObservabilityEvent('OTA_AUTO_UPDATE_AVAILABLE', {
            ...buildObservabilityProperties('foreground'),
            isRollbackToEmbedded: checkResult.isRollBackToEmbedded,
          });

          const fetchResult = await Updates.fetchUpdateAsync();
          trackObservabilityEvent('OTA_AUTO_DOWNLOAD_SUCCEEDED', {
            ...buildObservabilityProperties('foreground'),
            isNew: fetchResult.isNew,
            isRollbackToEmbedded: fetchResult.isRollBackToEmbedded,
          });
        })
        .catch((error) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown OTA update error.';
          logger.warn('[OtaUpdatesProvider] Failed to check or fetch OTA update:', error);
          trackObservabilityEvent('OTA_AUTO_CHECK_FAILED', {
            ...buildObservabilityProperties('foreground'),
            errorMessage,
          });
        })
        .finally(() => {
          isCheckingRef.current = false;
        });
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return children;
}
