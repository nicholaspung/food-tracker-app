import React from 'react';
import { act, create } from 'react-test-renderer';

import { trackObservabilityEvent } from '../observability';
import { OtaUpdatesProvider } from '../providers/OtaUpdatesProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';

const mockReact = React;
const mockAddEventListener = jest.fn();
const mockCheckForUpdateAsync = jest.fn();
const mockFetchUpdateAsync = jest.fn();
const mockReloadAsync = jest.fn();

let appStateListener: ((nextState: string) => void) | null = null;
const mockRemoveAppStateListener = jest.fn();
const mockUpdatesState = {
  channel: 'production',
  isEnabled: true,
  runtimeVersion: '1.0.0',
  updateId: 'update-123',
};

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
  },
}));

jest.mock('expo-updates', () => ({
  get channel() {
    return mockUpdatesState.channel;
  },
  checkForUpdateAsync: (...args: unknown[]) => mockCheckForUpdateAsync(...args),
  fetchUpdateAsync: (...args: unknown[]) => mockFetchUpdateAsync(...args),
  get isEnabled() {
    return mockUpdatesState.isEnabled;
  },
  reloadAsync: (...args: unknown[]) => mockReloadAsync(...args),
  get runtimeVersion() {
    return mockUpdatesState.runtimeVersion;
  },
  get updateId() {
    return mockUpdatesState.updateId;
  },
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<typeof trackObservabilityEvent>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

async function renderProvider() {
  let renderer: any;
  await act(async () => {
    renderer = create(
      <OtaUpdatesProvider>
        {mockReact.createElement('Child')}
      </OtaUpdatesProvider>,
    );
  });

  return renderer;
}

async function transitionToForeground() {
  if (!appStateListener) {
    throw new Error('Missing AppState change listener.');
  }

  await act(async () => {
    appStateListener?.('background');
  });

  await act(async () => {
    appStateListener?.('active');
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('OtaUpdatesProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
    Object.defineProperty(globalThis, '__DEV__', {
      configurable: true,
      value: false,
      writable: true,
    });

    appStateListener = null;
    mockRemoveAppStateListener.mockReset();
    mockAddEventListener.mockReset();
    mockCheckForUpdateAsync.mockReset();
    mockFetchUpdateAsync.mockReset();
    mockReloadAsync.mockReset();
    mockedTrackObservabilityEvent.mockReset();
    mockedUseConnectivity.mockReset();

    mockUpdatesState.channel = 'production';
    mockUpdatesState.isEnabled = true;
    mockUpdatesState.runtimeVersion = '1.0.0';
    mockUpdatesState.updateId = 'update-123';

    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as ReturnType<typeof useConnectivity>);
    mockAddEventListener.mockImplementation((_type: string, listener: (nextState: string) => void) => {
      appStateListener = listener;
      return {
        remove: mockRemoveAppStateListener,
      };
    });
    mockCheckForUpdateAsync.mockResolvedValue({
      isAvailable: false,
      isRollBackToEmbedded: false,
      manifest: undefined,
      reason: 'noUpdateAvailableOnServer',
    });
    mockFetchUpdateAsync.mockResolvedValue({
      isNew: true,
      isRollBackToEmbedded: false,
      manifest: {
        id: 'downloaded-update-1',
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips foreground OTA checks in development mode', async () => {
    Object.defineProperty(globalThis, '__DEV__', {
      configurable: true,
      value: true,
      writable: true,
    });

    await renderProvider();
    await transitionToForeground();

    expect(mockCheckForUpdateAsync).not.toHaveBeenCalled();
    expect(mockFetchUpdateAsync).not.toHaveBeenCalled();
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'OTA_AUTO_CHECK_SKIPPED',
      expect.objectContaining({
        reason: 'development',
        source: 'OtaUpdatesProvider',
        trigger: 'foreground',
      }),
    );
  });

  it('skips foreground OTA checks when expo-updates is disabled', async () => {
    mockUpdatesState.isEnabled = false;

    await renderProvider();
    await transitionToForeground();

    expect(mockCheckForUpdateAsync).not.toHaveBeenCalled();
    expect(mockFetchUpdateAsync).not.toHaveBeenCalled();
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'OTA_AUTO_CHECK_SKIPPED',
      expect.objectContaining({
        reason: 'updates_disabled',
        source: 'OtaUpdatesProvider',
        trigger: 'foreground',
      }),
    );
  });

  it('skips foreground OTA checks while offline', async () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as ReturnType<typeof useConnectivity>);

    await renderProvider();
    await transitionToForeground();

    expect(mockCheckForUpdateAsync).not.toHaveBeenCalled();
    expect(mockFetchUpdateAsync).not.toHaveBeenCalled();
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'OTA_AUTO_CHECK_SKIPPED',
      expect.objectContaining({
        reason: 'offline',
        source: 'OtaUpdatesProvider',
        trigger: 'foreground',
      }),
    );
  });

  it('checks once on foreground and does not fetch or reload when no update is available', async () => {
    await renderProvider();
    await transitionToForeground();

    expect(mockCheckForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mockFetchUpdateAsync).not.toHaveBeenCalled();
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'OTA_AUTO_CHECK_STARTED',
      expect.objectContaining({
        source: 'OtaUpdatesProvider',
        trigger: 'foreground',
      }),
    );
  });

  it('downloads an available update on foreground without reloading the current session', async () => {
    mockCheckForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      isRollBackToEmbedded: false,
      manifest: {
        id: 'available-update-1',
      },
      reason: 'updateAvailable',
    });

    await renderProvider();
    await transitionToForeground();

    expect(mockCheckForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mockFetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'OTA_AUTO_UPDATE_AVAILABLE',
      expect.objectContaining({
        isRollbackToEmbedded: false,
        source: 'OtaUpdatesProvider',
        trigger: 'foreground',
      }),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'OTA_AUTO_DOWNLOAD_SUCCEEDED',
      expect.objectContaining({
        isNew: true,
        isRollbackToEmbedded: false,
        source: 'OtaUpdatesProvider',
        trigger: 'foreground',
      }),
    );
  });

  it('skips repeated foreground checks inside the cooldown window', async () => {
    await renderProvider();
    await transitionToForeground();
    await transitionToForeground();

    expect(mockCheckForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'OTA_AUTO_CHECK_SKIPPED',
      expect.objectContaining({
        reason: 'cooldown',
        source: 'OtaUpdatesProvider',
        trigger: 'foreground',
      }),
    );
  });

  it('swallows fetch failures, tracks them, and leaves the tree mounted', async () => {
    mockCheckForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      isRollBackToEmbedded: false,
      manifest: {
        id: 'available-update-2',
      },
      reason: 'updateAvailable',
    });
    mockFetchUpdateAsync.mockRejectedValue(new Error('Download failed'));

    const renderer = await renderProvider();
    await transitionToForeground();

    expect(renderer.root.findAllByType('Child')).toHaveLength(1);
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'OTA_AUTO_CHECK_FAILED',
      expect.objectContaining({
        errorMessage: 'Download failed',
        source: 'OtaUpdatesProvider',
        trigger: 'foreground',
      }),
    );
  });
});
