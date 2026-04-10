import NetInfo, {
  NetInfoStateType,
  type NetInfoState,
} from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { env } from '../config/env';
import { logger } from '../lib/logger';
import { setObservabilityContext, trackObservabilityEvent } from '../observability';

interface ConnectivitySnapshot {
  isConnected: boolean;
  isInternetReachable: boolean;
  isOnline: boolean;
  connectionType: NetInfoState['type'];
  isConnectionExpensive: boolean;
  updatedAt: number;
}

const DEFAULT_CONNECTIVITY_SNAPSHOT: ConnectivitySnapshot = {
  isConnected: true,
  isInternetReachable: true,
  isOnline: true,
  connectionType: NetInfoStateType.unknown,
  isConnectionExpensive: false,
  updatedAt: Date.now(),
};

const OFFLINE_REFRESH_INTERVAL_MS = 15_000;
const REACHABILITY_PROBE_TIMEOUT_MS = 5_000;
const REACHABILITY_PROBE_URL = env.pocketbaseUrl;

const ConnectivityContext = createContext<ConnectivitySnapshot | null>(null);

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<ConnectivitySnapshot>(DEFAULT_CONNECTIVITY_SNAPSHOT);
  const latestSnapshotRef = useRef<ConnectivitySnapshot>(DEFAULT_CONNECTIVITY_SNAPSHOT);
  const lastTrackedSnapshotRef = useRef<ConnectivitySnapshot>(DEFAULT_CONNECTIVITY_SNAPSHOT);

  useEffect(() => {
    let isMounted = true;
    let offlineRefreshInterval: ReturnType<typeof setInterval> | null = null;
    let reachabilityProbeId = 0;

    const clearOfflineRefreshInterval = () => {
      if (offlineRefreshInterval) {
        clearInterval(offlineRefreshInterval);
        offlineRefreshInterval = null;
      }
    };

    const refreshConnectivity = (source: 'foreground' | 'initial' | 'offline_interval') => {
      void NetInfo.refresh().then(syncSnapshot).catch((error) => {
        logger.warn(`[ConnectivityProvider] Failed to refresh connectivity (${source}):`, error);
      });
    };

    const applySnapshot = (nextSnapshot: ConnectivitySnapshot) => {
      if (!isMounted) {
        return;
      }

      latestSnapshotRef.current = nextSnapshot;
      onlineManager.setOnline(nextSnapshot.isOnline);
      setObservabilityContext({
        connectionType: nextSnapshot.connectionType,
        isConnectionExpensive: nextSnapshot.isConnectionExpensive,
        isOnline: nextSnapshot.isOnline,
      });
      const previousSnapshot = lastTrackedSnapshotRef.current;

      if (
        nextSnapshot.isOnline !== previousSnapshot.isOnline ||
        nextSnapshot.connectionType !== previousSnapshot.connectionType ||
        nextSnapshot.isConnectionExpensive !== previousSnapshot.isConnectionExpensive
      ) {
        trackObservabilityEvent('NETWORK_STATUS_CHANGED', {
          connectionType: nextSnapshot.connectionType,
          isConnectionExpensive: nextSnapshot.isConnectionExpensive,
          isOnline: nextSnapshot.isOnline,
          previousConnectionType: previousSnapshot.connectionType,
          previousIsOnline: previousSnapshot.isOnline,
        });
      }

      lastTrackedSnapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);

      if (nextSnapshot.isOnline) {
        clearOfflineRefreshInterval();
      } else if (!offlineRefreshInterval) {
        offlineRefreshInterval = setInterval(() => {
          refreshConnectivity('offline_interval');
        }, OFFLINE_REFRESH_INTERVAL_MS);
      }
    };

    const verifyReachabilityBeforeApplyingOffline = async (
      netInfoSnapshot: ConnectivitySnapshot,
      shouldDelayOfflineState: boolean,
    ) => {
      const probeId = ++reachabilityProbeId;
      const probeResult = await probeAppReachability();

      if (!isMounted || probeId !== reachabilityProbeId) {
        return;
      }

      if (probeResult.isReachable) {
        applySnapshot({
          ...netInfoSnapshot,
          isInternetReachable: true,
          isOnline: true,
          updatedAt: Date.now(),
        });
        trackObservabilityEvent('NETWORK_REACHABILITY_PROBE_RECOVERED', {
          connectionType: netInfoSnapshot.connectionType,
          probeStatusCode: probeResult.statusCode,
          source: 'ConnectivityProvider',
        });
        return;
      }

      if (shouldDelayOfflineState) {
        applySnapshot(netInfoSnapshot);
      }
    };

    const syncSnapshot = (state: NetInfoState) => {
      const nextSnapshot = resolveSnapshot(state);

      if (nextSnapshot.isConnected && !nextSnapshot.isOnline) {
        const wasOnline = latestSnapshotRef.current.isOnline;
        if (!wasOnline) {
          applySnapshot(nextSnapshot);
        }
        void verifyReachabilityBeforeApplyingOffline(nextSnapshot, wasOnline);
        return;
      }

      applySnapshot(nextSnapshot);
    };

    refreshConnectivity('initial');

    const unsubscribe = NetInfo.addEventListener(syncSnapshot);
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshConnectivity('foreground');
      }
    });

    return () => {
      isMounted = false;
      clearOfflineRefreshInterval();
      appStateSubscription.remove();
      unsubscribe();
    };
  }, []);

  const value = useMemo(() => snapshot, [snapshot]);

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivitySnapshot {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error('useConnectivity must be used within a ConnectivityProvider');
  }

  return context;
}

export function resolveSnapshot(state: NetInfoState): ConnectivitySnapshot {
  const isConnected = Boolean(state.isConnected);
  const isInternetReachable = state.isInternetReachable ?? true;
  const isOnline = isConnected && isInternetReachable;

  return {
    isConnected,
    isInternetReachable,
    isOnline,
    connectionType: state.type,
    isConnectionExpensive: Boolean(state.details?.isConnectionExpensive),
    updatedAt: Date.now(),
  };
}

interface ReachabilityProbeResult {
  isReachable: boolean;
  statusCode: number | null;
}

export async function probeAppReachability(
  fetchImplementation: typeof fetch | undefined = globalThis.fetch,
): Promise<ReachabilityProbeResult> {
  if (!fetchImplementation) {
    return {
      isReachable: false,
      statusCode: null,
    };
  }

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, REACHABILITY_PROBE_TIMEOUT_MS);

  try {
    const response = await fetchImplementation(REACHABILITY_PROBE_URL, {
      headers: {
        'Cache-Control': 'no-cache',
      },
      method: 'GET',
      signal: abortController.signal,
    });

    return {
      isReachable: response.status > 0,
      statusCode: response.status,
    };
  } catch {
    return {
      isReachable: false,
      statusCode: null,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
