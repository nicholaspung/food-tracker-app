import NetInfo, {
  NetInfoStateType,
  type NetInfoState,
} from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { logger } from '../lib/logger';

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

const ConnectivityContext = createContext<ConnectivitySnapshot | null>(null);

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<ConnectivitySnapshot>(DEFAULT_CONNECTIVITY_SNAPSHOT);

  useEffect(() => {
    let isMounted = true;

    const syncSnapshot = (state: NetInfoState) => {
      const nextSnapshot = resolveSnapshot(state);
      onlineManager.setOnline(nextSnapshot.isOnline);

      if (isMounted) {
        setSnapshot(nextSnapshot);
      }
    };

    void NetInfo.fetch().then(syncSnapshot).catch((error) => {
      logger.warn('[ConnectivityProvider] Failed to fetch initial connectivity state:', error);
    });

    const unsubscribe = NetInfo.addEventListener(syncSnapshot);

    return () => {
      isMounted = false;
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

function resolveSnapshot(state: NetInfoState): ConnectivitySnapshot {
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
