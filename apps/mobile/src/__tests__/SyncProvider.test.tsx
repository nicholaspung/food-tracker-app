import React from 'react';
import { act, create } from 'react-test-renderer';

import { useConnectivity } from '../providers/ConnectivityProvider';
import { SyncProvider } from '../providers/SyncProvider';

const mockReplay = jest.fn();
const mockStart = jest.fn();
const mockSubscribe = jest.fn();
const mockWaitUntilReady = jest.fn();

const mockAuthStoreState = {
  isValid: false,
  record: null as Record<string, unknown> | null,
  token: '',
};

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
  },
}));

jest.mock('../features', () => ({
  getAuthRecord: () => mockAuthStoreState.record,
}));

jest.mock('../lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      get token() {
        return mockAuthStoreState.token;
      },
      get record() {
        return mockAuthStoreState.record;
      },
      get isValid() {
        return mockAuthStoreState.isValid;
      },
    },
  },
}));

jest.mock('../lib/pocketbaseAuthStore', () => ({
  authStore: {
    waitUntilReady: (...args: unknown[]) => mockWaitUntilReady(...args),
  },
}));

jest.mock('../offline', () => ({
  syncEngine: {
    clearAll: jest.fn(),
    enqueue: jest.fn(),
    getQueuedMutations: jest.fn(),
    getSnapshot: jest.fn(() => ({
      failedCount: 0,
      isInitialized: false,
      isSyncing: false,
      lastError: null,
      lastSyncedAt: null,
      lastTrigger: null,
      nextRetryAt: null,
      queueDepth: 0,
    })),
    replay: (...args: unknown[]) => mockReplay(...args),
    retryAllFailed: jest.fn(),
    start: (...args: unknown[]) => mockStart(...args),
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

function TestChild() {
  return null;
}

const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

describe('SyncProvider', () => {
  beforeEach(() => {
    mockAuthStoreState.isValid = false;
    mockAuthStoreState.record = null;
    mockAuthStoreState.token = '';

    mockReplay.mockReset();
    mockReplay.mockResolvedValue(undefined);
    mockStart.mockReset();
    mockStart.mockResolvedValue(undefined);
    mockSubscribe.mockReset();
    mockSubscribe.mockImplementation(() => jest.fn());
    mockWaitUntilReady.mockReset();

    mockedUseConnectivity.mockReturnValue({
      connectionType: 'wifi',
      isConnected: true,
      isConnectionExpensive: false,
      isInternetReachable: true,
      isOnline: true,
      updatedAt: Date.now(),
    } as ReturnType<typeof useConnectivity>);
  });

  it('waits for async auth restore before replaying queued mutations on cold start', async () => {
    const waitUntilReady = createDeferredPromise<void>();
    mockWaitUntilReady.mockReturnValue(waitUntilReady.promise);

    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(
        <SyncProvider>
          <TestChild />
        </SyncProvider>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockReplay).not.toHaveBeenCalled();

    mockAuthStoreState.token = 'token_1';
    mockAuthStoreState.isValid = true;
    mockAuthStoreState.record = {
      created: '2026-04-23T10:00:00.000Z',
      id: 'user_1',
      verified: true,
    };

    await act(async () => {
      waitUntilReady.resolve();
      await waitUntilReady.promise;
      await Promise.resolve();
    });

    expect(mockReplay).toHaveBeenCalledWith('foreground');

    await act(async () => {
      renderer?.unmount();
    });
  });
});
