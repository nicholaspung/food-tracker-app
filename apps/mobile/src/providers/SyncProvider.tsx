import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { getAuthRecord } from '../features/store/pocketbaseGateway';
import { reconcileSuccessfulFeatureOutboxReplay } from '../features/store/featureOutboxReplayAdapters';
import { resolveEmailVerificationAccess } from '../lib/emailVerificationAccess';
import { logger } from '../lib/logger';
import { pb } from '../lib/pocketbase';
import { authStore } from '../lib/pocketbaseAuthStore';
import { syncEngine } from '../offline';
import type { EnqueueMutationInput, QueuedMutation, SyncSnapshot } from '../offline';
import { useConnectivity } from './ConnectivityProvider';

interface SyncContextValue extends SyncSnapshot {
  beginMutationDelivery: (id: string) => Promise<void>;
  completeMutationDelivery: (id: string) => Promise<void>;
  deferMutationDelivery: (id: string, errorMessage: string) => Promise<void>;
  discardMutationDelivery: (id: string) => Promise<void>;
  discardQueuedMutations: (trigger?: 'auth_change' | 'logout') => Promise<number>;
  enqueueMutation: (input: EnqueueMutationInput) => Promise<QueuedMutation>;
  getQueuedMutations: (limit?: number) => Promise<QueuedMutation[]>;
  retryAllFailed: () => Promise<number>;
  replayNow: () => Promise<void>;
  stageMutation: (input: EnqueueMutationInput) => Promise<QueuedMutation>;
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

function hasReplayableSession(): boolean {
  return Boolean(pb.authStore.token && pb.authStore.isValid && pb.authStore.record?.id);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
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
    const unsubscribeSuccessfulReplay = syncEngine.subscribeSuccessfulReplay((outcome) =>
      reconcileSuccessfulFeatureOutboxReplay(queryClient, outcome),
    );

    const authReadyPromise = authStore.waitUntilReady().catch((error) => {
      logger.warn('[SyncProvider] Failed waiting for auth restore before startup replay:', error);
    });

    void syncEngine
      .start()
      .then(() => authReadyPromise)
      .then(() => {
        if (
          isMounted &&
          isOnlineRef.current &&
          hasReplayableSession() &&
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
      unsubscribeSuccessfulReplay();
    };
  }, [queryClient]);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;

    if (!wasOnline && isOnline) {
      if (hasReplayableSession() && !shouldBlockReplayForEmailVerification()) {
        void syncEngine.replay('reconnect');
      }
    }
  }, [isOnline]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        nextState === 'active' &&
        isOnline &&
        hasReplayableSession() &&
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
      const mutation = await syncEngine.enqueue({
        ...input,
        originAccountId: pb.authStore.record?.id ?? null,
      });
      if (isOnline && hasReplayableSession() && !shouldBlockReplayForEmailVerification()) {
        void syncEngine.replay('enqueue');
      }

      return mutation;
    },
    [isOnline],
  );

  const stageMutation = useCallback(
    async (input: EnqueueMutationInput): Promise<QueuedMutation> =>
      syncEngine.enqueue({
        ...input,
        originAccountId: pb.authStore.record?.id ?? null,
      }),
    [],
  );

  const beginMutationDelivery = useCallback(
    async (id: string): Promise<void> => syncEngine.beginDelivery(id),
    [],
  );

  const completeMutationDelivery = useCallback(
    async (id: string): Promise<void> => syncEngine.completeDelivery(id),
    [],
  );

  const deferMutationDelivery = useCallback(
    async (id: string, errorMessage: string): Promise<void> =>
      syncEngine.deferDelivery(id, errorMessage),
    [],
  );

  const discardMutationDelivery = useCallback(
    async (id: string): Promise<void> => syncEngine.discardDelivery(id),
    [],
  );

  const retryAllFailed = useCallback(async (): Promise<number> => {
    const resetCount = await syncEngine.retryAllFailed();
    if (isOnline && hasReplayableSession() && !shouldBlockReplayForEmailVerification()) {
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
    if (!isOnline || !hasReplayableSession() || shouldBlockReplayForEmailVerification()) {
      return;
    }

    await syncEngine.replay('manual');
  }, [isOnline]);

  const value = useMemo<SyncContextValue>(
    () => ({
      ...snapshot,
      beginMutationDelivery,
      completeMutationDelivery,
      deferMutationDelivery,
      discardMutationDelivery,
      discardQueuedMutations,
      enqueueMutation,
      getQueuedMutations,
      retryAllFailed,
      replayNow,
      stageMutation,
    }),
    [
      beginMutationDelivery,
      completeMutationDelivery,
      deferMutationDelivery,
      discardMutationDelivery,
      discardQueuedMutations,
      enqueueMutation,
      getQueuedMutations,
      replayNow,
      retryAllFailed,
      snapshot,
      stageMutation,
    ],
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
