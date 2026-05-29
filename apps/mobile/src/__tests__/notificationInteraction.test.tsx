import React from 'react';
import { act, create } from 'react-test-renderer';

import {
  routeNotificationResponse,
  setNotificationsModuleLoaderForTests,
  unregisterCurrentNotificationDevice,
  useForegroundNotificationPresentation,
  useNotificationTapRouting,
  useRemoteNotificationRegistration,
} from '../notifications/notificationInteraction';
import {
  deactivateNotificationDevice,
  registerNotificationDevice,
} from '../features/store/notificationDevicesStore';

const mockAddNotificationResponseReceivedListener = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockGetLastNotificationResponseAsync = jest.fn();
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockRemoveNotificationListener = jest.fn();
const mockSetNotificationHandler = jest.fn();
const mockRemoveAppStateListener = jest.fn();
let mockAppStateListener: ((state: string) => void) | null = null;
const mockAsyncStorageState = new Map<string, string>();

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_eventName: string, listener: (state: string) => void) => {
      mockAppStateListener = listener;
      return { remove: mockRemoveAppStateListener };
    }),
    currentState: 'active',
  },
  NativeModules: {},
  Platform: {
    OS: 'ios',
  },
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      eas: {
        projectId: 'project_1',
      },
    },
  },
}));

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: (...args: unknown[]) =>
    mockAddNotificationResponseReceivedListener(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
  getLastNotificationResponseAsync: (...args: unknown[]) => mockGetLastNotificationResponseAsync(...args),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockAsyncStorageState.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockAsyncStorageState.set(key, value);
  }),
}));

jest.mock('../features/store/notificationDevicesStore', () => ({
  deactivateNotificationDevice: jest.fn(),
  registerNotificationDevice: jest.fn(),
}));

jest.mock('../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

const mockedRegisterNotificationDevice = registerNotificationDevice as jest.MockedFunction<
  typeof registerNotificationDevice
>;
const mockedDeactivateNotificationDevice = deactivateNotificationDevice as jest.MockedFunction<
  typeof deactivateNotificationDevice
>;

function RegistrationHarness({ status = 'authenticated', userId = 'user_1' }) {
  useRemoteNotificationRegistration(status as 'authenticated', userId);
  return React.createElement('RegistrationHarness');
}

function ForegroundPresentationHarness() {
  useForegroundNotificationPresentation();
  return React.createElement('ForegroundPresentationHarness');
}

function TapRoutingHarness({ navigationRef, status = 'authenticated' }: { navigationRef: any; status?: string }) {
  useNotificationTapRouting(navigationRef, status as 'authenticated');
  return React.createElement('TapRoutingHarness');
}

async function flushNotificationEffects(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}

describe('notificationInteraction', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-28T12:00:00.000Z'));
    mockAsyncStorageState.clear();
    mockAddNotificationResponseReceivedListener.mockReset();
    mockGetExpoPushTokenAsync.mockReset();
    mockGetLastNotificationResponseAsync.mockReset();
    mockGetPermissionsAsync.mockReset();
    mockRequestPermissionsAsync.mockReset();
    mockRemoveNotificationListener.mockReset();
    mockSetNotificationHandler.mockReset();
    mockRemoveAppStateListener.mockReset();
    mockAppStateListener = null;
    mockedRegisterNotificationDevice.mockReset();
    mockedDeactivateNotificationDevice.mockReset();

    mockAddNotificationResponseReceivedListener.mockReturnValue({
      remove: mockRemoveNotificationListener,
    });
    mockGetLastNotificationResponseAsync.mockResolvedValue(null);
    mockGetPermissionsAsync.mockResolvedValue({ granted: true });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[test]' });
    mockedRegisterNotificationDevice.mockResolvedValue(undefined);
    mockedDeactivateNotificationDevice.mockResolvedValue(undefined);
    setNotificationsModuleLoaderForTests(async () => ({
      addNotificationResponseReceivedListener: mockAddNotificationResponseReceivedListener,
      getExpoPushTokenAsync: mockGetExpoPushTokenAsync,
      getLastNotificationResponseAsync: mockGetLastNotificationResponseAsync,
      getPermissionsAsync: mockGetPermissionsAsync,
      requestPermissionsAsync: mockRequestPermissionsAsync,
      setNotificationHandler: mockSetNotificationHandler,
    }) as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers the authenticated device only after notification permission is granted', async () => {
    await act(async () => {
      create(<RegistrationHarness />);
      await flushNotificationEffects();
    });

    expect(mockGetPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockedRegisterNotificationDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'ios',
        pushToken: 'ExponentPushToken[test]',
      }),
    );
  });

  it('does not register when permission is denied', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: false });

    await act(async () => {
      create(<RegistrationHarness />);
      await flushNotificationEffects();
    });

    expect(mockedRegisterNotificationDevice).not.toHaveBeenCalled();
  });

  it('retries notification device registration when the app returns to foreground', async () => {
    mockedRegisterNotificationDevice
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(undefined);

    let renderer: any;
    await act(async () => {
      renderer = create(<RegistrationHarness />);
      await flushNotificationEffects();
    });

    expect(mockedRegisterNotificationDevice).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockAppStateListener?.('active');
      await flushNotificationEffects();
    });

    expect(mockedRegisterNotificationDevice).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer.unmount();
    });
    expect(mockRemoveAppStateListener).toHaveBeenCalledTimes(1);
  });

  it('shows foreground notifications as banners and notification list entries', async () => {
    await act(async () => {
      create(<ForegroundPresentationHarness />);
      await flushNotificationEffects();
    });

    expect(mockSetNotificationHandler).toHaveBeenCalledWith({
      handleNotification: expect.any(Function),
    });

    const handler = mockSetNotificationHandler.mock.calls[0][0];
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });

  it('deactivates the persisted device during logout cleanup', async () => {
    mockAsyncStorageState.set('notifications.deviceId', 'device_1');

    await unregisterCurrentNotificationDevice();

    expect(mockedDeactivateNotificationDevice).toHaveBeenCalledWith('device_1');
  });

  it('routes tasting invite notification taps to the tasting sessions list', async () => {
    const navigate = jest.fn();
    const navigationRef = {
      isReady: () => true,
      navigate,
    };
    const response = {
      notification: {
        request: {
          content: {
            data: {
              notificationType: 'tasting_invite',
            },
          },
        },
      },
    };

    expect(routeNotificationResponse(response as any, navigationRef)).toBe(true);
    expect(navigate).toHaveBeenCalledWith('TastingSessions');
  });

  it('subscribes to notification response taps while authenticated', async () => {
    const navigationRef = {
      isReady: () => true,
      navigate: jest.fn(),
    };

    let renderer: any;
    await act(async () => {
      renderer = create(<TapRoutingHarness navigationRef={navigationRef} />);
      await flushNotificationEffects();
    });

    expect(mockAddNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
    expect(mockRemoveNotificationListener).toHaveBeenCalledTimes(1);
  });
});
