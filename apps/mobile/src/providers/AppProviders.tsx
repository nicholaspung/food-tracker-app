import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { localPersistence } from '../localPersistence';
import { logger } from '../lib/logger';
import { initializeObservability, setObservabilityContext, trackObservabilityEvent } from '../observability';
import {
  setProductAnalyticsAnonymousId,
  trackProductEvent,
} from '../observability/productAnalytics';
import { SplashScreen } from '../screens/SplashScreen';
import {
  clearPersistedQueryCache,
  persistQueryClientWithRestoreMetadata,
  shouldPersistQuery,
} from './queryPersistence';
import { AuthProvider, type AuthBootstrapResult } from './AuthProvider';
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
const QUERY_PERSISTENCE_RESTORE_TIMEOUT_MS = 4000;
type QueryRestoreOutcome = 'successful_restore' | 'trimmed_restore' | 'failed_restore' | 'timeout';

interface QueryRestoreResult {
  queryRestoreDurationMs: number;
  queryRestoreOutcome: QueryRestoreOutcome;
  restoreFailed: boolean;
}

interface RestoreBarrier {
  promise: Promise<void>;
  resolve: () => void;
}

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryRestoreResult, setQueryRestoreResult] = useState<QueryRestoreResult | null>(null);
  const [authBootstrapResult, setAuthBootstrapResult] = useState<AuthBootstrapResult | null>(null);
  const appStartedAtRef = useRef(Date.now());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const sessionStartedAtRef = useRef(Date.now());
  const hasTrackedColdStartRef = useRef(false);
  const queryRestoreBarrierRef = useRef<RestoreBarrier | null>(null);
  if (!queryRestoreBarrierRef.current) {
    queryRestoreBarrierRef.current = createRestoreBarrier();
  }
  const handleAuthBootstrapComplete = useCallback((result: AuthBootstrapResult) => {
    setAuthBootstrapResult(result);
  }, []);
  const waitForQueryPersistenceRestore = useCallback(
    () => queryRestoreBarrierRef.current?.promise ?? Promise.resolve(),
    [],
  );

  useEffect(() => {
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
    let didRestoreTimeout = false;
    const restoreStartedAt = Date.now();
    let restoreFailed = false;
    let queryRestoreOutcome: QueryRestoreOutcome = 'successful_restore';
    let unsubscribe = () => {};

    const restorePersistedQueries = async () => {
      const [nextUnsubscribe, restorePromise] = persistQueryClientWithRestoreMetadata({
        queryClient,
        maxAge: 1000 * 60 * 60 * 24,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistQuery,
        },
      });

      unsubscribe = nextUnsubscribe;
      try {
        const persistedCacheMetadata = await withTimeout(
          restorePromise,
          QUERY_PERSISTENCE_RESTORE_TIMEOUT_MS,
          'Persisted React Query cache restore timed out.',
          () => {
            didRestoreTimeout = true;
          },
        );
        queryRestoreOutcome = persistedCacheMetadata?.trimmed ? 'trimmed_restore' : 'successful_restore';
      } catch (error) {
        if (didRestoreTimeout) {
          unsubscribe();
          void restorePromise
            .then(async () => {
              if (didRestoreTimeout) {
                queryClient.clear();
                await clearPersistedQueryCache();
              }
            })
            .catch((lateRestoreError) => {
              logger.warn('[AppProviders] Failed to neutralize late query-cache hydration:', lateRestoreError);
            });
          queryClient.clear();
          await clearPersistedQueryCache();
        }
        throw error;
      }
    };

    void restorePersistedQueries()
      .catch((error) => {
        restoreFailed = true;
        queryRestoreOutcome = didRestoreTimeout || isTimeoutError(error) ? 'timeout' : 'failed_restore';
        logger.warn('[AppProviders] Failed to restore persisted React Query cache:', error);
      })
      .finally(() => {
        const queryRestoreDurationMs = Date.now() - restoreStartedAt;
        queryRestoreBarrierRef.current?.resolve();
        if (isMounted) {
          setQueryRestoreResult({
            queryRestoreDurationMs,
            queryRestoreOutcome,
            restoreFailed,
          });
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!queryRestoreResult || !authBootstrapResult || hasTrackedColdStartRef.current) {
      return;
    }

    hasTrackedColdStartRef.current = true;
    trackObservabilityEvent('APP_COLD_START_COMPLETED', {
      appStartupDurationMs: Date.now() - appStartedAtRef.current,
      authRefreshFailed: authBootstrapResult.refreshFailed,
      authRestoreDurationMs: authBootstrapResult.authRestoreDurationMs,
      authRestoreOutcome: authBootstrapResult.outcome,
      queryRestoreDurationMs: queryRestoreResult.queryRestoreDurationMs,
      queryRestoreOutcome: queryRestoreResult.queryRestoreOutcome,
      restoreFailed: queryRestoreResult.restoreFailed,
      source: 'AppProviders',
    });
  }, [authBootstrapResult, queryRestoreResult]);

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
          <OtaUpdatesProvider>
            <AuthProvider
              onBootstrapComplete={handleAuthBootstrapComplete}
              waitForLocalStateReset={waitForQueryPersistenceRestore}
            >
              {queryRestoreResult && authBootstrapResult ? (
                <ErrorToastProvider>{children}</ErrorToastProvider>
              ) : (
                <SplashScreen />
              )}
            </AuthProvider>
          </OtaUpdatesProvider>
        </SyncProvider>
      </QueryClientProvider>
    </ConnectivityProvider>
  );
}

function createRestoreBarrier(): RestoreBarrier {
  let resolve = () => {};
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

async function resolveProductAnalyticsAnonymousId(): Promise<string> {
  const existingAnonymousId = await localPersistence.analytics.storage.getItem(
    localPersistence.analytics.keys.anonymousId,
  );
  if (existingAnonymousId?.trim()) {
    return existingAnonymousId;
  }

  const nextAnonymousId = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  await localPersistence.analytics.storage.setItem(localPersistence.analytics.keys.anonymousId, nextAnonymousId);
  return nextAnonymousId;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      onTimeout?.();
      const error = new Error(message);
      error.name = 'TimeoutError';
      reject(error);
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

function isTimeoutError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'TimeoutError';
}
