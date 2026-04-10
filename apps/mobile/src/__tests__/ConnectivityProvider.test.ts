import type { NetInfoState } from '@react-native-community/netinfo';

import { probeAppReachability, resolveSnapshot } from '../providers/ConnectivityProvider';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    refresh: jest.fn(),
  },
  NetInfoStateType: {
    unknown: 'unknown',
  },
}));

jest.mock('../observability', () => ({
  setObservabilityContext: jest.fn(),
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../lib/logger', () => ({
  logger: {
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
  },
}));

function createNetInfoState(
  overrides: Partial<NetInfoState>,
): NetInfoState {
  return {
    details: null,
    isConnected: true,
    isInternetReachable: true,
    isWifiEnabled: true,
    type: 'wifi',
    ...overrides,
  } as unknown as NetInfoState;
}

describe('ConnectivityProvider helpers', () => {
  it('keeps connected networks online while reachability is still unknown', () => {
    const snapshot = resolveSnapshot(createNetInfoState({ isInternetReachable: null }));

    expect(snapshot.isConnected).toBe(true);
    expect(snapshot.isInternetReachable).toBe(true);
    expect(snapshot.isOnline).toBe(true);
  });

  it('treats connected but unreachable NetInfo states as offline before recovery probing', () => {
    const snapshot = resolveSnapshot(createNetInfoState({ isInternetReachable: false }));

    expect(snapshot.isConnected).toBe(true);
    expect(snapshot.isInternetReachable).toBe(false);
    expect(snapshot.isOnline).toBe(false);
  });

  it('treats app responses as proof that the app network path is reachable', async () => {
    const fetchImplementation = jest.fn(async () => ({
      status: 503,
    })) as unknown as typeof fetch;

    await expect(probeAppReachability(fetchImplementation)).resolves.toEqual({
      isReachable: true,
      statusCode: 503,
    });
  });

  it('does not recover connectivity when the app reachability probe fails', async () => {
    const fetchImplementation = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    await expect(probeAppReachability(fetchImplementation)).resolves.toEqual({
      isReachable: false,
      statusCode: null,
    });
  });
});
