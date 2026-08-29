import React from 'react';
import { act, create } from 'react-test-renderer';

import { AppProviders } from '../providers/AppProviders';
import type { AuthBootstrapResult } from '../providers/AuthProvider';

const mockAuthBootstrapStarted = jest.fn();
const mockInitializeObservability = jest.fn();
const mockPersistQueryClientWithRestoreMetadata = jest.fn();
const mockClearPersistedQueryCache = jest.fn();
const mockQueryClientClear = jest.fn();
const mockSetObservabilityContext = jest.fn();
const mockTrackObservabilityEvent = jest.fn();
const mockTrackProductEvent = jest.fn();
const mockUnsubscribe = jest.fn();

let mockCompleteAuthBootstrap: ((result: AuthBootstrapResult) => void) | undefined;
let mockQueryRestorePromise: Promise<{ trimmed: boolean } | null>;
let mockRejectQueryRestore = (_error: Error) => {};
let mockResolveQueryRestore = (_metadata: { trimmed: boolean } | null) => {};

jest.mock('@tanstack/react-query', () => ({
  focusManager: {
    setFocused: jest.fn(),
  },
  QueryClient: jest.fn().mockImplementation(() => ({
    clear: (...args: unknown[]) => mockQueryClientClear(...args),
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('../localPersistence', () => ({
  localPersistence: {
    analytics: {
      keys: { anonymousId: 'anonymous-id' },
      storage: {
        getItem: jest.fn().mockResolvedValue('anon_existing'),
        setItem: jest.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

jest.mock('../lib/logger', () => ({
  logger: { warn: jest.fn() },
}));

jest.mock('../observability', () => ({
  initializeObservability: (...args: unknown[]) => mockInitializeObservability(...args),
  setObservabilityContext: (...args: unknown[]) => mockSetObservabilityContext(...args),
  trackObservabilityEvent: (...args: unknown[]) => mockTrackObservabilityEvent(...args),
}));

jest.mock('../observability/productAnalytics', () => ({
  setProductAnalyticsAnonymousId: jest.fn(),
  trackProductEvent: (...args: unknown[]) => mockTrackProductEvent(...args),
}));

jest.mock('../providers/queryPersistence', () => ({
  clearPersistedQueryCache: (...args: unknown[]) => mockClearPersistedQueryCache(...args),
  persistQueryClientWithRestoreMetadata: (...args: unknown[]) =>
    mockPersistQueryClientWithRestoreMetadata(...args),
  shouldPersistQuery: jest.fn(() => true),
}));

jest.mock('../providers/AuthProvider', () => {
  const mockReact = jest.requireActual<typeof React>('react');

  return {
    AuthProvider: ({
      children,
      onBootstrapComplete,
    }: {
      children: React.ReactNode;
      onBootstrapComplete?: (result: AuthBootstrapResult) => void;
    }) => {
      mockReact.useEffect(() => {
        mockAuthBootstrapStarted();
        mockCompleteAuthBootstrap = onBootstrapComplete;
      }, [onBootstrapComplete]);

      return children;
    },
  };
});

jest.mock('../providers/ConnectivityProvider', () => ({
  ConnectivityProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../providers/ErrorToastProvider', () => ({
  ErrorToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../providers/OtaUpdatesProvider', () => ({
  OtaUpdatesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../providers/SyncProvider', () => ({
  SyncProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../screens/SplashScreen', () => {
  const mockReact = jest.requireActual<typeof React>('react');

  return {
    SplashScreen: () => mockReact.createElement('SplashScreen'),
  };
});

describe('AppProviders', () => {
  beforeEach(() => {
    mockAuthBootstrapStarted.mockReset();
    mockInitializeObservability.mockReset();
    mockPersistQueryClientWithRestoreMetadata.mockReset();
    mockClearPersistedQueryCache.mockReset();
    mockQueryClientClear.mockReset();
    mockSetObservabilityContext.mockReset();
    mockTrackObservabilityEvent.mockReset();
    mockTrackProductEvent.mockReset();
    mockUnsubscribe.mockReset();
    mockCompleteAuthBootstrap = undefined;
    mockQueryRestorePromise = new Promise<{ trimmed: boolean } | null>((resolve, reject) => {
      mockResolveQueryRestore = resolve;
      mockRejectQueryRestore = reject;
    });
    mockPersistQueryClientWithRestoreMetadata.mockReturnValue([mockUnsubscribe, mockQueryRestorePromise]);
    mockClearPersistedQueryCache.mockResolvedValue(undefined);
  });

  it('starts auth and query restoration together and gates children until both finish', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <AppProviders>
          <AppContent />
        </AppProviders>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAuthBootstrapStarted).toHaveBeenCalledTimes(1);
    expect(mockPersistQueryClientWithRestoreMetadata).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAllByType('SplashScreen')).toHaveLength(1);

    await act(async () => {
      mockCompleteAuthBootstrap?.({
        authRestoreDurationMs: 120,
        hadPersistedToken: true,
        hasValidSession: true,
        outcome: 'successful_restore',
        refreshFailed: false,
      });
      await Promise.resolve();
    });

    expect(renderer!.root.findAllByType('SplashScreen')).toHaveLength(1);
    expect(renderer!.root.findAllByType('AppContent')).toHaveLength(0);

    await act(async () => {
      mockResolveQueryRestore(null);
      await mockQueryRestorePromise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderer!.root.findAllByType('SplashScreen')).toHaveLength(0);
    expect(renderer!.root.findAllByType('AppContent')).toHaveLength(1);
    expect(mockTrackObservabilityEvent).toHaveBeenCalledWith(
      'APP_COLD_START_COMPLETED',
      expect.objectContaining({
        appStartupDurationMs: expect.any(Number),
        authRestoreDurationMs: 120,
        authRestoreOutcome: 'successful_restore',
        queryRestoreDurationMs: expect.any(Number),
        queryRestoreOutcome: 'successful_restore',
      }),
    );
  });

  it('reports trimmed restores from metadata returned by the hydration pass', async () => {
    await act(async () => {
      create(
        <AppProviders>
          <AppContent />
        </AppProviders>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mockCompleteAuthBootstrap?.({
        authRestoreDurationMs: 120,
        hadPersistedToken: true,
        hasValidSession: true,
        outcome: 'successful_restore',
        refreshFailed: false,
      });
      mockResolveQueryRestore({ trimmed: true });
      await mockQueryRestorePromise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockTrackObservabilityEvent).toHaveBeenCalledWith(
      'APP_COLD_START_COMPLETED',
      expect.objectContaining({ queryRestoreOutcome: 'trimmed_restore' }),
    );
  });

  it('reports failed restores when persisted cache hydration rejects', async () => {
    await act(async () => {
      create(
        <AppProviders>
          <AppContent />
        </AppProviders>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mockCompleteAuthBootstrap?.({
        authRestoreDurationMs: 120,
        hadPersistedToken: true,
        hasValidSession: true,
        outcome: 'successful_restore',
        refreshFailed: false,
      });
      mockRejectQueryRestore(new Error('Corrupt cache'));
      await mockQueryRestorePromise.catch(() => undefined);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockTrackObservabilityEvent).toHaveBeenCalledWith(
      'APP_COLD_START_COMPLETED',
      expect.objectContaining({ queryRestoreOutcome: 'failed_restore' }),
    );
  });

  it('clears a timed-out restore again if its hydration finishes late', async () => {
    jest.useFakeTimers();
    let renderer: any;
    await act(async () => {
      renderer = create(
        <AppProviders>
          <AppContent />
        </AppProviders>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mockCompleteAuthBootstrap?.({
        authRestoreDurationMs: 120,
        hadPersistedToken: true,
        hasValidSession: true,
        outcome: 'successful_restore',
        refreshFailed: false,
      });
      await jest.advanceTimersByTimeAsync(4_000);
    });

    expect(renderer.root.findAllByType('AppContent')).toHaveLength(1);
    expect(mockTrackObservabilityEvent).toHaveBeenCalledWith(
      'APP_COLD_START_COMPLETED',
      expect.objectContaining({ queryRestoreOutcome: 'timeout' }),
    );
    expect(mockQueryClientClear).toHaveBeenCalledTimes(1);
    expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockResolveQueryRestore(null);
      await mockQueryRestorePromise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockQueryClientClear).toHaveBeenCalledTimes(2);
    expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('still clears late hydration when the first persisted-cache removal fails', async () => {
    jest.useFakeTimers();
    mockClearPersistedQueryCache
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValueOnce(undefined);

    await act(async () => {
      create(
        <AppProviders>
          <AppContent />
        </AppProviders>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mockCompleteAuthBootstrap?.({
        authRestoreDurationMs: 120,
        hadPersistedToken: true,
        hasValidSession: true,
        outcome: 'successful_restore',
        refreshFailed: false,
      });
      await jest.advanceTimersByTimeAsync(4_000);
    });

    expect(mockQueryClientClear).toHaveBeenCalledTimes(1);
    expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockResolveQueryRestore(null);
      await mockQueryRestorePromise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockQueryClientClear).toHaveBeenCalledTimes(2);
    expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});

function AppContent() {
  return React.createElement('AppContent');
}
