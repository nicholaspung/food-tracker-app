import { persistQueryClient } from '@tanstack/query-persist-client-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { logger } from '../lib/logger';
import { trackStartupMilestone } from '../lib/startupDiagnostics';
import { initializeObservability, setObservabilityContext, trackObservabilityEvent } from '../observability';
import {
  setProductAnalyticsAnonymousId,
  trackProductEvent,
} from '../observability/productAnalytics';
import { SplashScreen } from '../screens/SplashScreen';
import { queryPersister, removeLegacyQueryCache, shouldPersistQuery } from './queryPersistence';
import { AuthProvider } from './AuthProvider';
import { ConnectivityProvider } from './ConnectivityProvider';
import { ErrorToastProvider } from './ErrorToastProvider';
import { OtaUpdatesProvider } from './OtaUpdatesProvider';
import { SyncProvider } from './SyncProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});
const PRODUCT_ANALYTICS_ANONYMOUS_ID_KEY = 'analytics.product.anonymousId';
const QUERY_PERSISTENCE_RESTORE_TIMEOUT_MS = 4000;

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [isQueryPersistenceReady, setIsQueryPersistenceReady] = useState(false);
  const appStartedAtRef = useRef(Date.now());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const sessionStartedAtRef = useRef(Date.now());
  const hasTrackedColdStartRef = useRef(false);

  useEffect(() => {
    trackStartupMilestone('APP_PROVIDERS_MOUNTED');
    initializeObservability();
    void resolveProductAnalyticsAnonymousId().then(setProductAnalyticsAnonymousId).catch((error) => {
      logger.warn('[AppProviders] Failed to resolve product analytics anonymous id:', error);
    });
    focusManager.setFocused(appStateRef.current === 'active');
    setObservabilityContext({
      appState: appStateRef.current,
      sessionActive: true,
    });
    trackObservabilityEvent('SESSION_STARTED', {
      appState: appStateRef.current,
      source: 'AppProviders',
      trigger: 'cold_start',
    });
    trackProductEvent('retention.session_started', {
      appState: appStateRef.current,
      source: 'AppProviders',
      trigger: 'cold_start',
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    const restoreStartedAt = Date.now();
    let restoreFailed = false;
    let unsubscribe = () => {};

    const restorePersistedQueries = async () => {
      trackStartupMilestone('QUERY_RESTORE_STARTED');
      try {
        const removedLegacyKeys = await removeLegacyQueryCache();
        trackObservabilityEvent('QUERY_CACHE_RESET_APPLIED', {
          removedLegacyKeys,
          source: 'AppProviders',
        });
      } catch (error) {
        logger.warn('[AppProviders] Failed to remove legacy React Query cache:', error);
      }

      const [nextUnsubscribe, restorePromise] = persistQueryClient({
        queryClient,
        persister: queryPersister,
        maxAge: 1000 * 60 * 60 * 24,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistQuery,
        },
      });

      unsubscribe = nextUnsubscribe;
      await withTimeout(
        restorePromise,
        QUERY_PERSISTENCE_RESTORE_TIMEOUT_MS,
        'Persisted React Query cache restore timed out.',
      );
    };

    void restorePersistedQueries()
      .catch((error) => {
        restoreFailed = true;
        logger.warn('[AppProviders] Failed to restore persisted React Query cache:', error);
      })
      .finally(() => {
        if (isMounted) {
          setIsQueryPersistenceReady(true);
          trackStartupMilestone('QUERY_RESTORE_READY', {
            durationMs: Date.now() - restoreStartedAt,
            restoreFailed,
          });
          if (!hasTrackedColdStartRef.current) {
            hasTrackedColdStartRef.current = true;
            trackObservabilityEvent('APP_COLD_START_COMPLETED', {
              appStartupDurationMs: Date.now() - appStartedAtRef.current,
              queryRestoreDurationMs: Date.now() - restoreStartedAt,
              restoreFailed,
              source: 'AppProviders',
            });
          }
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      focusManager.setFocused(nextState === 'active');
      setObservabilityContext({
        appState: nextState,
      });

      if (previousState === 'background' && nextState === 'active') {
        sessionStartedAtRef.current = Date.now();
        setObservabilityContext({
          sessionActive: true,
        });
        trackObservabilityEvent('APP_FOREGROUNDED', {
          previousAppState: previousState,
          source: 'AppProviders',
        });
        trackObservabilityEvent('SESSION_STARTED', {
          previousAppState: previousState,
          source: 'AppProviders',
          trigger: 'foreground',
        });
        trackProductEvent('retention.session_started', {
          previousAppState: previousState,
          source: 'AppProviders',
          trigger: 'foreground',
        });
        return;
      }

      if (previousState === 'active' && nextState === 'background') {
        const sessionDurationMs = Date.now() - sessionStartedAtRef.current;
        setObservabilityContext({
          sessionActive: false,
        });
        trackObservabilityEvent('APP_BACKGROUNDED', {
          nextAppState: nextState,
          sessionDurationMs,
          source: 'AppProviders',
        });
        trackObservabilityEvent('SESSION_ENDED', {
          reason: 'background',
          sessionDurationMs,
          source: 'AppProviders',
        });
        trackProductEvent('retention.session_ended', {
          reason: 'background',
          sessionDurationMs,
          source: 'AppProviders',
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <ConnectivityProvider>
      <QueryClientProvider client={queryClient}>
        <SyncProvider>
          {isQueryPersistenceReady ? (
            <OtaUpdatesProvider>
              <AuthProvider>
                <ErrorToastProvider>{children}</ErrorToastProvider>
              </AuthProvider>
            </OtaUpdatesProvider>
          ) : (
            <SplashScreen />
          )}
        </SyncProvider>
      </QueryClientProvider>
    </ConnectivityProvider>
  );
}

async function resolveProductAnalyticsAnonymousId(): Promise<string> {
  const existingAnonymousId = await AsyncStorage.getItem(PRODUCT_ANALYTICS_ANONYMOUS_ID_KEY);
  if (existingAnonymousId?.trim()) {
    return existingAnonymousId;
  }

  const nextAnonymousId = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(PRODUCT_ANALYTICS_ANONYMOUS_ID_KEY, nextAnonymousId);
  return nextAnonymousId;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}
