import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { getAuthRecord } from '../features';
import { resolveEmailVerificationAccess } from '../lib/emailVerificationAccess';
import { logger } from '../lib/logger';
import { pb } from '../lib/pocketbase';
import { syncEngine } from '../offline';
import type { EnqueueMutationInput, QueuedMutation, SyncSnapshot } from '../offline';
import { useConnectivity } from './ConnectivityProvider';

interface SyncContextValue extends SyncSnapshot {
  discardQueuedMutations: (trigger?: 'auth_change' | 'logout') => Promise<number>;
  enqueueMutation: (input: EnqueueMutationInput) => Promise<QueuedMutation>;
  getQueuedMutations: (limit?: number) => Promise<QueuedMutation[]>;
  retryAllFailed: () => Promise<number>;
  replayNow: () => Promise<void>;
}

const INITIAL_SYNC_CONTEXT: SyncSnapshot = {
  isInitialized: false,
  isSyncing: false,
  queueDepth: 0,
  failedCount: 0,
  nextRetryAt: null,
  lastError: null,
  lastSyncedAt: null,
  lastTrigger: null,
};

const SyncContext = createContext<SyncContextValue | null>(null);

function shouldBlockReplayForEmailVerification(): boolean {
  const authRecord = getAuthRecord();
  if (!authRecord) {
    return false;
  }

  return (
    resolveEmailVerificationAccess({
      verified: Boolean(authRecord.verified),
      createdAt: authRecord.created,
    }).status === 'grace_expired'
  );
}

function hasAuthenticatedSession(): boolean {
  return Boolean(pb.authStore.token && pb.authStore.record?.id);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(syncEngine.getSnapshot());
  const { isOnline } = useConnectivity();
  const wasOnlineRef = useRef(isOnline);
  const isOnlineRef = useRef(isOnline);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = syncEngine.subscribe((nextSnapshot) => {
      if (isMounted) {
        setSnapshot(nextSnapshot);
      }
    });

    void syncEngine
      .start()
      .then(() => {
        if (
          isMounted &&
          isOnlineRef.current &&
          hasAuthenticatedSession() &&
          !shouldBlockReplayForEmailVerification()
        ) {
          return syncEngine.replay('foreground');
        }
        return undefined;
      })
      .catch((error) => {
        logger.error('[SyncProvider] Failed to initialize sync engine:', error);
        if (isMounted) {
          setSnapshot(INITIAL_SYNC_CONTEXT);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;

    if (!wasOnline && isOnline) {
      if (hasAuthenticatedSession() && !shouldBlockReplayForEmailVerification()) {
        void syncEngine.replay('reconnect');
      }
    }
  }, [isOnline]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        nextState === 'active' &&
        isOnline &&
        hasAuthenticatedSession() &&
        !shouldBlockReplayForEmailVerification()
      ) {
        void syncEngine.replay('foreground');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isOnline]);

  const enqueueMutation = useCallback(
    async (input: EnqueueMutationInput): Promise<QueuedMutation> => {
      const mutation = await syncEngine.enqueue(input);
      if (isOnline && hasAuthenticatedSession() && !shouldBlockReplayForEmailVerification()) {
        void syncEngine.replay('enqueue');
      }

      return mutation;
    },
    [isOnline],
  );

  const retryAllFailed = useCallback(async (): Promise<number> => {
    const resetCount = await syncEngine.retryAllFailed();
    if (isOnline && hasAuthenticatedSession() && !shouldBlockReplayForEmailVerification()) {
      void syncEngine.replay('manual');
    }
    return resetCount;
  }, [isOnline]);

  const discardQueuedMutations = useCallback(
    async (trigger: 'auth_change' | 'logout' = 'logout'): Promise<number> => syncEngine.clearAll(trigger),
    [],
  );

  const getQueuedMutations = useCallback(async (limit?: number): Promise<QueuedMutation[]> => {
    const safeLimit = typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : 25;
    return syncEngine.getQueuedMutations(safeLimit);
  }, []);

  const replayNow = useCallback(async (): Promise<void> => {
    if (!isOnline || !hasAuthenticatedSession() || shouldBlockReplayForEmailVerification()) {
      return;
    }

    await syncEngine.replay('manual');
  }, [isOnline]);

  const value = useMemo<SyncContextValue>(
    () => ({
      ...snapshot,
      discardQueuedMutations,
      enqueueMutation,
      getQueuedMutations,
      retryAllFailed,
      replayNow,
    }),
    [discardQueuedMutations, enqueueMutation, getQueuedMutations, replayNow, retryAllFailed, snapshot],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }

  return context;
}
