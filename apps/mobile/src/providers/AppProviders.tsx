import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { logger } from '../lib/logger';
import { initializeObservability } from '../observability';
import { SplashScreen } from '../screens/SplashScreen';
import { AuthProvider } from './AuthProvider';
import { ConnectivityProvider } from './ConnectivityProvider';
import { SyncProvider } from './SyncProvider';

const QUERY_CACHE_STORAGE_KEY = 'food_tracker_mobile_query_cache_v1';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_STORAGE_KEY,
  throttleTime: 1000,
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [isQueryPersistenceReady, setIsQueryPersistenceReady] = useState(false);

  useEffect(() => {
    initializeObservability();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const [unsubscribe, restorePromise] = persistQueryClient({
      queryClient,
      persister: queryPersister,
      maxAge: 1000 * 60 * 60 * 24,
    });

    void restorePromise
      .catch((error) => {
        logger.warn('[AppProviders] Failed to restore persisted React Query cache:', error);
      })
      .finally(() => {
        if (isMounted) {
          setIsQueryPersistenceReady(true);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <ConnectivityProvider>
      <QueryClientProvider client={queryClient}>
        <SyncProvider>
          {isQueryPersistenceReady ? <AuthProvider>{children}</AuthProvider> : <SplashScreen />}
        </SyncProvider>
      </QueryClientProvider>
    </ConnectivityProvider>
  );
}
