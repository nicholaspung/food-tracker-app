import React from 'react';
import { act, create } from 'react-test-renderer';

import {
  getVisitReminderNotificationStatus,
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
} from '../features/store/notificationDevicesStore';
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
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-28T12:00:00.000Z'));
    mockAsyncStorageState.clear();
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
    mockedRegisterNotificationDevice.mockResolvedValue(undefined);
    mockedDeactivateNotificationDevice.mockResolvedValue(undefined);
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

    expect(routeNotificationResponse(response as any, navigationRef)).toBe('routed');
    expect(navigate).toHaveBeenCalledWith('TastingSessions', {
      refreshSignal: expect.any(Number),
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

  it('routes bill owed notification taps to BillDetail', async () => {
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
    expect(navigate).toHaveBeenCalledWith('BillDetail', { billId: 'bill_1' });
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

    expect(navigate).toHaveBeenCalledWith('BillDetail', { billId: 'bill_1' });
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
