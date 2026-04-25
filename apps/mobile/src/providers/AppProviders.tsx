import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { logger } from '../lib/logger';
import { initializeObservability, setObservabilityContext, trackObservabilityEvent } from '../observability';
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
    initializeObservability();
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
  }, []);

  useEffect(() => {
    let isMounted = true;
    const restoreStartedAt = Date.now();
    let restoreFailed = false;
    let unsubscribe = () => {};

    const restorePersistedQueries = async () => {
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
      await restorePromise;
    };

    void restorePersistedQueries()
      .catch((error) => {
        restoreFailed = true;
        logger.warn('[AppProviders] Failed to restore persisted React Query cache:', error);
      })
      .finally(() => {
        if (isMounted) {
          setIsQueryPersistenceReady(true);
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
