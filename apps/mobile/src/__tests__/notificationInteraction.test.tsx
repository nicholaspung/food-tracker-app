import React from 'react';
import { act, create } from 'react-test-renderer';
import * as SecureStore from 'expo-secure-store';

import {
  NotificationDeviceCleanupNotDurableError,
  clearNotificationDeviceIdentity,
  getVisitReminderNotificationStatus,
  registerCurrentRemoteNotificationDevice,
  routeNotificationResponse,
  scheduleVisitReminderNotification,
  setNotificationsModuleLoaderForTests,
  unregisterCurrentNotificationDevice,
  useForegroundNotificationPresentation,
  useNotificationTapRouting,
  useRemoteNotificationRegistration,
} from '../notifications/notificationInteraction';
import {
  deactivateNotificationDevice,
  registerNotificationDevice,
  revokeNotificationDevice,
} from '../features/store/notificationDevicesStore';
import { getEnvironmentStorageKey } from '../config/persistence';
import { logger } from '../lib/logger';
import { trackObservabilityEvent } from '../observability';

const mockAddNotificationResponseReceivedListener = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockGetAllScheduledNotificationsAsync = jest.fn();
const mockGetLastNotificationResponseAsync = jest.fn();
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockRemoveNotificationListener = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockSetNotificationHandler = jest.fn();
const mockRemoveAppStateListener = jest.fn();
let mockAppStateListener: ((state: string) => void) | null = null;
const mockAsyncStorageState = new Map<string, string>();
let mockIsDevice = true;
const mockGetRandomBytesAsync = jest.fn();
const notificationDeviceRevocationStorageKey = getEnvironmentStorageKey(
  'food_tracker_notification_device_revocation_v1',
);

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

jest.mock('expo-device', () => ({
  get isDevice() {
    return mockIsDevice;
  },
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: (...args: unknown[]) => mockGetRandomBytesAsync(...args),
}));

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: (...args: unknown[]) =>
    mockAddNotificationResponseReceivedListener(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
  getAllScheduledNotificationsAsync: (...args: unknown[]) => mockGetAllScheduledNotificationsAsync(...args),
  getLastNotificationResponseAsync: (...args: unknown[]) => mockGetLastNotificationResponseAsync(...args),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockAsyncStorageState.get(key) ?? null),
  removeItem: jest.fn(async (key: string) => {
    mockAsyncStorageState.delete(key);
  }),
  setItem: jest.fn(async (key: string, value: string) => {
    mockAsyncStorageState.set(key, value);
  }),
}));

jest.mock('../features/store/notificationDevicesStore', () => ({
  deactivateNotificationDevice: jest.fn(),
  registerNotificationDevice: jest.fn(),
  revokeNotificationDevice: jest.fn(),
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
const mockedRevokeNotificationDevice = revokeNotificationDevice as jest.MockedFunction<
  typeof revokeNotificationDevice
>;
const mockedLogger = logger as jest.Mocked<typeof logger>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<typeof trackObservabilityEvent>;

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
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-28T12:00:00.000Z'));
    mockAsyncStorageState.clear();
    globalThis.localStorage.clear();
    mockAddNotificationResponseReceivedListener.mockReset();
    mockGetExpoPushTokenAsync.mockReset();
    mockGetAllScheduledNotificationsAsync.mockReset();
    mockGetLastNotificationResponseAsync.mockReset();
    mockGetPermissionsAsync.mockReset();
    mockRequestPermissionsAsync.mockReset();
    mockRemoveNotificationListener.mockReset();
    mockScheduleNotificationAsync.mockReset();
    mockSetNotificationHandler.mockReset();
    mockRemoveAppStateListener.mockReset();
    mockAppStateListener = null;
    mockIsDevice = true;
    mockedRegisterNotificationDevice.mockReset();
    mockedDeactivateNotificationDevice.mockReset();
    mockedRevokeNotificationDevice.mockReset();
    mockGetRandomBytesAsync.mockReset();
    mockedLogger.warn.mockReset();
    mockedTrackObservabilityEvent.mockReset();

    mockAddNotificationResponseReceivedListener.mockReturnValue({
      remove: mockRemoveNotificationListener,
    });
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([]);
    mockGetLastNotificationResponseAsync.mockResolvedValue(null);
    mockGetPermissionsAsync.mockResolvedValue({ granted: true });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
    mockScheduleNotificationAsync.mockResolvedValue('notification_1');
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[test]' });
    let randomByte = 1;
    mockGetRandomBytesAsync.mockImplementation(async () => new Uint8Array(32).fill(randomByte++));
    mockedRegisterNotificationDevice.mockResolvedValue(undefined);
    mockedDeactivateNotificationDevice.mockResolvedValue(undefined);
    mockedRevokeNotificationDevice.mockResolvedValue(undefined);
    await SecureStore.deleteItemAsync(notificationDeviceRevocationStorageKey);
    setNotificationsModuleLoaderForTests(async () => ({
      addNotificationResponseReceivedListener: mockAddNotificationResponseReceivedListener,
      getExpoPushTokenAsync: mockGetExpoPushTokenAsync,
      getAllScheduledNotificationsAsync: mockGetAllScheduledNotificationsAsync,
      getLastNotificationResponseAsync: mockGetLastNotificationResponseAsync,
      getPermissionsAsync: mockGetPermissionsAsync,
      requestPermissionsAsync: mockRequestPermissionsAsync,
      scheduleNotificationAsync: mockScheduleNotificationAsync,
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

  it('attempts remote push registration on supported iOS simulators', async () => {
    mockIsDevice = false;

    await act(async () => {
      create(<RegistrationHarness />);
      await flushNotificationEffects();
    });

    expect(mockGetPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project_1' });
    expect(mockedRegisterNotificationDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'ios',
        pushToken: 'ExponentPushToken[test]',
      }),
    );
  });

  it('suppresses missing APNs entitlement retries on unsupported iOS simulator builds', async () => {
    mockIsDevice = false;
    mockGetExpoPushTokenAsync.mockRejectedValue(
      new Error('no valid “aps-environment” entitlement string found for application'),
    );

    await act(async () => {
      create(<RegistrationHarness />);
      await flushNotificationEffects();
    });

    expect(mockedRegisterNotificationDevice).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'NOTIFICATION_DEVICE_REGISTRATION_SKIPPED',
      expect.objectContaining({
        reason: 'ios_simulator_missing_apns_entitlement',
        trigger: 'auth',
      }),
    );

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await flushNotificationEffects();
    });

    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledTimes(1);
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

  it('retries transient Expo push token service outages without warning in dev logs', async () => {
    mockGetExpoPushTokenAsync
      .mockRejectedValueOnce(
        new Error('Error encountered while fetching Expo token, expected an OK response, received: service unavailable (body: "no healthy upstream").'),
      )
      .mockResolvedValueOnce({ data: 'ExponentPushToken[test]' });

    await act(async () => {
      create(<RegistrationHarness />);
      await flushNotificationEffects();
    });

    expect(mockedRegisterNotificationDevice).not.toHaveBeenCalled();
    expect(mockedLogger.warn).not.toHaveBeenCalledWith(
      '[NotificationInteraction] Failed to register notification device:',
      expect.any(Error),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'NOTIFICATION_DEVICE_REGISTRATION_FAILED',
      expect.objectContaining({
        reason: 'transient_expo_push_token_service_unavailable',
        trigger: 'auth',
      }),
    );

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await flushNotificationEffects();
    });

    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledTimes(2);
    expect(mockedRegisterNotificationDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        pushToken: 'ExponentPushToken[test]',
      }),
    );
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
    globalThis.localStorage.setItem('notifications.deviceId', 'device_1');

    await unregisterCurrentNotificationDevice();

    expect(mockedDeactivateNotificationDevice).toHaveBeenCalledWith('device_1');
    expect(globalThis.localStorage.getItem('notifications.deviceId')).toBeNull();
  });

  it('keeps the persisted device when logout server deactivation fails', async () => {
    globalThis.localStorage.setItem('notifications.deviceId', 'device_1');
    mockedDeactivateNotificationDevice.mockRejectedValueOnce(new Error('server failed'));

    await expect(unregisterCurrentNotificationDevice()).rejects.toBeInstanceOf(
      NotificationDeviceCleanupNotDurableError,
    );

    expect(mockedDeactivateNotificationDevice).toHaveBeenCalledWith('device_1');
    expect(globalThis.localStorage.getItem('notifications.deviceId')).toBe('device_1');
  });

  it('persists a bearer-free tombstone on failed sign-out cleanup and replays it before another registration', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<RegistrationHarness />);
      await flushNotificationEffects();
    });

    const firstRegistration = mockedRegisterNotificationDevice.mock.calls[0][0];
    mockedDeactivateNotificationDevice.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(unregisterCurrentNotificationDevice()).resolves.toBeUndefined();

    const serializedTombstone = await SecureStore.getItemAsync(notificationDeviceRevocationStorageKey);
    expect(serializedTombstone).not.toContain('token_1');
    expect(JSON.parse(serializedTombstone ?? '{}')).toEqual({
      deviceId: firstRegistration.deviceId,
      pendingDeactivation: true,
      revocationCapability: firstRegistration.revocationCapability,
      revocationId: firstRegistration.revocationId,
    });

    await act(async () => {
      renderer.unmount();
      create(<RegistrationHarness userId="user_2" />);
      await flushNotificationEffects();
    });

    expect(mockedRevokeNotificationDevice).toHaveBeenCalledWith({
      revocationCapability: firstRegistration.revocationCapability,
      revocationId: firstRegistration.revocationId,
    });
    expect(mockedRevokeNotificationDevice.mock.invocationCallOrder[0]).toBeLessThan(
      mockedRegisterNotificationDevice.mock.invocationCallOrder[1],
    );
    expect(mockedRegisterNotificationDevice.mock.calls[1][0].revocationId).not.toBe(
      firstRegistration.revocationId,
    );
  });

  it('uses the pending scoped tombstone when another account signs out after replay fails', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<RegistrationHarness />);
      await flushNotificationEffects();
    });

    const firstRegistration = mockedRegisterNotificationDevice.mock.calls[0][0];
    mockedDeactivateNotificationDevice.mockRejectedValueOnce(new Error('network unavailable'));
    await unregisterCurrentNotificationDevice();

    mockedRevokeNotificationDevice.mockRejectedValueOnce(new Error('replay unavailable'));
    await act(async () => {
      renderer.unmount();
      renderer = create(<RegistrationHarness userId="user_2" />);
      await flushNotificationEffects();
    });

    expect(mockedRegisterNotificationDevice).toHaveBeenCalledTimes(1);
    expect(mockedRevokeNotificationDevice).toHaveBeenCalledWith({
      revocationCapability: firstRegistration.revocationCapability,
      revocationId: firstRegistration.revocationId,
    });

    await act(async () => {
      renderer.unmount();
    });
    mockedDeactivateNotificationDevice.mockClear();

    await unregisterCurrentNotificationDevice();

    expect(mockedRevokeNotificationDevice).toHaveBeenCalledTimes(2);
    expect(mockedRevokeNotificationDevice).toHaveBeenLastCalledWith({
      revocationCapability: firstRegistration.revocationCapability,
      revocationId: firstRegistration.revocationId,
    });
    expect(mockedDeactivateNotificationDevice).not.toHaveBeenCalled();
    expect(globalThis.localStorage.getItem('notifications.deviceId')).toBeNull();
    await expect(SecureStore.getItemAsync(notificationDeviceRevocationStorageKey)).resolves.toBeNull();
  });

  it('does not attempt sign-out deactivation when the cleanup tombstone cannot be persisted', async () => {
    await act(async () => {
      create(<RegistrationHarness />);
      await flushNotificationEffects();
    });
    mockedDeactivateNotificationDevice.mockClear();
    (SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>)
      .mockRejectedValueOnce(new Error('secure storage unavailable'));

    await expect(unregisterCurrentNotificationDevice()).rejects.toBeInstanceOf(
      NotificationDeviceCleanupNotDurableError,
    );

    expect(mockedDeactivateNotificationDevice).not.toHaveBeenCalled();
  });

  it('waits for an in-flight registration before deactivating during sign-out', async () => {
    const events: string[] = [];
    let completeRegistration = () => {};
    mockedRegisterNotificationDevice.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          events.push('registration_started');
          completeRegistration = () => {
            events.push('registration_completed');
            resolve();
          };
        }),
    );
    mockedDeactivateNotificationDevice.mockImplementationOnce(async () => {
      events.push('deactivated');
    });

    await act(async () => {
      create(<RegistrationHarness />);
      await flushNotificationEffects();
    });
    expect(events).toEqual(['registration_started']);

    const unregisterPromise = unregisterCurrentNotificationDevice();
    await Promise.resolve();
    expect(mockedDeactivateNotificationDevice).not.toHaveBeenCalled();

    completeRegistration();
    await unregisterPromise;

    expect(events).toEqual(['registration_started', 'registration_completed', 'deactivated']);
  });

  it('waits for registration preflight before deactivating during sign-out', async () => {
    const events: string[] = [];
    let completePermissionCheck = () => {};
    mockGetPermissionsAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          events.push('permission_started');
          completePermissionCheck = () => {
            events.push('permission_completed');
            resolve({ granted: true });
          };
        }),
    );
    mockedRegisterNotificationDevice.mockImplementationOnce(async () => {
      events.push('registered');
    });
    mockedDeactivateNotificationDevice.mockImplementationOnce(async () => {
      events.push('deactivated');
    });

    await act(async () => {
      create(<RegistrationHarness />);
      await flushNotificationEffects();
    });
    const unregisterPromise = unregisterCurrentNotificationDevice();
    await Promise.resolve();
    expect(mockedDeactivateNotificationDevice).not.toHaveBeenCalled();

    completePermissionCheck();
    await unregisterPromise;

    expect(events).toEqual([
      'permission_started',
      'permission_completed',
      'registered',
      'deactivated',
    ]);
  });

  it('serializes concurrent registration preflights onto one revocation identity', async () => {
    let completePushTokenRequest = () => {};
    mockGetExpoPushTokenAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completePushTokenRequest = () => resolve({ data: 'ExponentPushToken[first]' });
        }),
    );

    let renderer: any;
    await act(async () => {
      renderer = create(<RegistrationHarness />);
      await flushNotificationEffects();
    });
    const imperativeRegistration = registerCurrentRemoteNotificationDevice('settings');
    await Promise.resolve();

    expect(mockGetPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockedRegisterNotificationDevice).not.toHaveBeenCalled();

    await act(async () => {
      completePushTokenRequest();
      await imperativeRegistration;
      await flushNotificationEffects();
    });

    expect(mockedRegisterNotificationDevice).toHaveBeenCalledTimes(2);
    expect(mockedRegisterNotificationDevice.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        deviceId: mockedRegisterNotificationDevice.mock.calls[0][0].deviceId,
        revocationCapability:
          mockedRegisterNotificationDevice.mock.calls[0][0].revocationCapability,
        revocationId: mockedRegisterNotificationDevice.mock.calls[0][0].revocationId,
      }),
    );
    expect(mockGetRandomBytesAsync).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('blocks sign-out when secure revocation state cannot be read and server cleanup fails', async () => {
    globalThis.localStorage.setItem('notifications.deviceId', 'device_1');
    (SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>)
      .mockRejectedValueOnce(new Error('secure storage unavailable'));
    mockedDeactivateNotificationDevice.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(unregisterCurrentNotificationDevice()).rejects.toBeInstanceOf(
      NotificationDeviceCleanupNotDurableError,
    );

    expect(globalThis.localStorage.getItem('notifications.deviceId')).toBe('device_1');
  });

  it('blocks sign-out when stored revocation state is corrupt and server cleanup fails', async () => {
    globalThis.localStorage.setItem('notifications.deviceId', 'device_1');
    await SecureStore.setItemAsync(notificationDeviceRevocationStorageKey, 'not-json');
    mockedDeactivateNotificationDevice.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(unregisterCurrentNotificationDevice()).rejects.toBeInstanceOf(
      NotificationDeviceCleanupNotDurableError,
    );

    expect(globalThis.localStorage.getItem('notifications.deviceId')).toBe('device_1');
  });

  it('clears the persisted device identity after account deletion cleanup', async () => {
    globalThis.localStorage.setItem('notifications.deviceId', 'device_1');

    await clearNotificationDeviceIdentity();

    expect(globalThis.localStorage.getItem('notifications.deviceId')).toBeNull();
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

    expect(routeNotificationResponse(response as any, navigationRef)).toBe('routed');
    expect(navigate).toHaveBeenCalledWith('TastingSessions', {
      refreshSignal: expect.any(Number),
    });
  });

  it('routes monthly friends activity notification taps to the Home friends feed', async () => {
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
              notificationType: 'monthly_friends_activity',
              route: 'Home',
            },
          },
        },
      },
    };

    expect(routeNotificationResponse(response as any, navigationRef)).toBe('routed');
    expect(navigate).toHaveBeenCalledWith('Home', {
      initialView: {
        feedMode: 'friends',
        filtersExpanded: true,
        searchQuery: '',
        sortFilter: 'created',
        typeFilter: 'visits',
      },
    });
  });

  it('schedules a one-time local visit reminder after permission is available', async () => {
    const result = await scheduleVisitReminderNotification(30);

    expect(result).toEqual({
      notificationId: 'notification_1',
      status: 'scheduled',
    });
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Track your restaurant visit',
        body: 'Add the dishes and ratings while they are still fresh.',
        data: {
          reminderAt: '2026-05-28T12:30:00.000Z',
          notificationType: 'visit_reminder',
        },
      },
      trigger: {
        type: 'timeInterval',
        seconds: 1800,
        repeats: false,
      },
    });
  });

  it('requests permission before scheduling a local visit reminder when needed', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });

    const result = await scheduleVisitReminderNotification(15);

    expect(result.status).toBe('scheduled');
    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({
          seconds: 900,
        }),
      }),
    );
  });

  it('does not schedule a local visit reminder when permission is denied', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: false });

    const result = await scheduleVisitReminderNotification(60);

    expect(result.status).toBe('permission_denied');
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does not schedule another local visit reminder when one is already scheduled', async () => {
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      {
        content: {
          data: {
            reminderAt: '2026-05-28T12:30:00.000Z',
            notificationType: 'visit_reminder',
          },
        },
      },
    ]);

    const result = await scheduleVisitReminderNotification(30);

    expect(result).toEqual({
      errorMessage: 'You already have a visit reminder scheduled.',
      status: 'already_scheduled',
    });
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('reads scheduled local visit reminder status without requesting permission', async () => {
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      {
        content: {
          data: {
            reminderAt: '2026-05-28T12:30:00.000Z',
            notificationType: 'visit_reminder',
          },
        },
      },
    ]);

    const result = await getVisitReminderNotificationStatus();

    expect(result).toEqual({
      status: 'scheduled',
    });
    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not treat expired or unversioned local visit reminders as scheduled', async () => {
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      {
        content: {
          data: {
            reminderAt: '2026-05-28T11:59:00.000Z',
            notificationType: 'visit_reminder',
          },
        },
      },
      {
        content: {
          data: {
            notificationType: 'visit_reminder',
          },
        },
      },
    ]);

    const result = await getVisitReminderNotificationStatus();

    expect(result).toEqual({
      status: 'none',
    });
  });

  it('returns a scheduling failure instead of throwing when local reminder scheduling fails', async () => {
    mockScheduleNotificationAsync.mockRejectedValue(new Error('scheduler unavailable'));

    const result = await scheduleVisitReminderNotification(30);

    expect(result).toEqual({
      errorMessage: 'Could not schedule the reminder. Try again in a moment.',
      status: 'failed',
    });
  });

  it('routes visit reminder notification taps to CreateVisit', async () => {
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
              notificationType: 'visit_reminder',
            },
          },
        },
      },
    };

    expect(routeNotificationResponse(response as any, navigationRef)).toBe('routed');
    expect(navigate).toHaveBeenCalledWith('CreateVisit', undefined);
  });

  it('routes bill owed notification taps to the bills list with the target bill id', async () => {
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
              billId: 'bill_1',
              notificationType: 'bill_owed',
            },
          },
        },
      },
    };

    expect(routeNotificationResponse(response as any, navigationRef)).toBe('routed');
    expect(navigate).toHaveBeenCalledWith('Bills', {
      billId: 'bill_1',
      refreshSignal: expect.any(Number),
    });
  });

  it('routes bill detail notification payloads to bill detail', async () => {
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
              route: 'BillDetail',
              source_record: 'bill_1',
            },
          },
        },
      },
    };

    expect(routeNotificationResponse(response as any, navigationRef)).toBe('routed');
    expect(navigate).toHaveBeenCalledWith('BillDetail', {
      billId: 'bill_1',
    });
  });

  it('routes bill payment reminder notification taps to bill detail', async () => {
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
              billId: 'bill_1',
              notificationType: 'bill_payment_reminder',
            },
          },
        },
      },
    };

    expect(routeNotificationResponse(response as any, navigationRef)).toBe('routed');
    expect(navigate).toHaveBeenCalledWith('BillDetail', {
      billId: 'bill_1',
    });
  });

  it('retries notification tap routing until navigation is ready', async () => {
    const navigate = jest.fn();
    let isReady = false;
    const navigationRef = {
      isReady: () => isReady,
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
    mockGetLastNotificationResponseAsync.mockResolvedValue(response);

    await act(async () => {
      create(<TapRoutingHarness navigationRef={navigationRef} />);
      await flushNotificationEffects();
    });

    expect(navigate).not.toHaveBeenCalled();

    isReady = true;
    await act(async () => {
      jest.advanceTimersByTime(250);
      await flushNotificationEffects();
    });

    expect(navigate).toHaveBeenCalledWith('TastingSessions', {
      refreshSignal: expect.any(Number),
    });
  });

  it('captures a cold-start notification tap before authentication is ready and routes after auth', async () => {
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
              billId: 'bill_1',
              notificationType: 'bill_owed',
            },
          },
        },
      },
    };
    mockGetLastNotificationResponseAsync.mockResolvedValueOnce(response).mockResolvedValueOnce(null);

    let renderer: any;
    await act(async () => {
      renderer = create(<TapRoutingHarness navigationRef={navigationRef} status="bootstrapping" />);
      await flushNotificationEffects();
    });

    expect(navigate).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(<TapRoutingHarness navigationRef={navigationRef} status="authenticated" />);
      await flushNotificationEffects();
    });

    expect(navigate).toHaveBeenCalledWith('Bills', {
      billId: 'bill_1',
      refreshSignal: expect.any(Number),
    });
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
