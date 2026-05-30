import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type * as ExpoNotifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';

import {
  deactivateNotificationDevice,
  registerNotificationDevice,
} from '../features/store/notificationDevicesStore';
import { logger } from '../lib/logger';
import { trackObservabilityEvent } from '../observability';
import type { RootStackParamList } from '../navigation/RootNavigator';

const NOTIFICATION_DEVICE_ID_STORAGE_KEY = 'notifications.deviceId';
const NOTIFICATION_REGISTRATION_RETRY_DELAY_MS = 30_000;
const NOTIFICATION_TAP_ROUTE_RETRY_DELAY_MS = 250;
const NOTIFICATION_TAP_ROUTE_MAX_ATTEMPTS = 20;
const VISIT_REMINDER_NOTIFICATION_TYPE = 'visit_reminder';

type NotificationAuthStatus = 'bootstrapping' | 'authenticated' | 'verification_required' | 'unauthenticated';
type NotificationsModule = typeof ExpoNotifications;
export type VisitReminderMinutes = 15 | 30 | 60;

export type ScheduleVisitReminderResult =
  | {
      status: 'scheduled';
      notificationId: string;
    }
  | {
      status: 'already_scheduled' | 'permission_denied' | 'unavailable' | 'failed';
      errorMessage?: string;
    };

export type VisitReminderNotificationStatus =
  | {
      status: 'scheduled' | 'none';
    }
  | {
      status: 'unavailable' | 'failed';
      errorMessage?: string;
    };

interface NavigationRefLike {
  isReady: () => boolean;
  navigate: <TRouteName extends keyof RootStackParamList>(
    routeName: TRouteName,
    params?: RootStackParamList[TRouteName],
  ) => void;
}

let cachedNotificationsModule: NotificationsModule | null | undefined;
let hasLoggedNotificationsModuleUnavailable = false;
let notificationsNativeAvailabilityChecker = hasNotificationsNativeModule;
let notificationsModuleLoader: () => Promise<NotificationsModule> = async () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('expo-notifications') as NotificationsModule;

export function setNotificationsModuleLoaderForTests(loader: () => Promise<NotificationsModule>): () => void {
  const previousLoader = notificationsModuleLoader;
  const previousAvailabilityChecker = notificationsNativeAvailabilityChecker;
  const previousCachedNotificationsModule = cachedNotificationsModule;
  const previousHasLoggedNotificationsModuleUnavailable = hasLoggedNotificationsModuleUnavailable;
  cachedNotificationsModule = undefined;
  hasLoggedNotificationsModuleUnavailable = false;
  notificationsNativeAvailabilityChecker = () => true;
  notificationsModuleLoader = loader;
  return () => {
    notificationsModuleLoader = previousLoader;
    notificationsNativeAvailabilityChecker = previousAvailabilityChecker;
    cachedNotificationsModule = previousCachedNotificationsModule;
    hasLoggedNotificationsModuleUnavailable = previousHasLoggedNotificationsModuleUnavailable;
  };
}

async function resolveNotificationDeviceId(): Promise<string> {
  const existingDeviceId = await AsyncStorage.getItem(NOTIFICATION_DEVICE_ID_STORAGE_KEY);
  if (existingDeviceId?.trim()) {
    return existingDeviceId;
  }

  const nextDeviceId = `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(NOTIFICATION_DEVICE_ID_STORAGE_KEY, nextDeviceId);
  return nextDeviceId;
}

export async function unregisterCurrentNotificationDevice(): Promise<void> {
  const deviceId = await AsyncStorage.getItem(NOTIFICATION_DEVICE_ID_STORAGE_KEY);
  if (!deviceId?.trim()) {
    return;
  }

  await deactivateNotificationDevice(deviceId);
}

export function useRemoteNotificationRegistration(status: NotificationAuthStatus, userId: string | null | undefined) {
  useEffect(() => {
    if (status !== 'authenticated' || !userId || Platform.OS === 'web') {
      return;
    }

    let isCancelled = false;
    let activeAttempt: Promise<void> | null = null;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const clearRetryTimeout = () => {
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
      }
    };

    const scheduleRetry = () => {
      clearRetryTimeout();
      retryTimeoutId = setTimeout(() => {
        retryTimeoutId = null;
        runRegistrationAttempt('retry');
      }, NOTIFICATION_REGISTRATION_RETRY_DELAY_MS);
    };

    const runRegistrationAttempt = (trigger: 'auth' | 'foreground' | 'retry') => {
      if (isCancelled || activeAttempt) {
        return;
      }

      activeAttempt = registerRemoteNotificationDevice(trigger)
        .catch((error) => {
          if (isIosSimulatorMissingApnsEntitlementError(error)) {
            trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SKIPPED', {
              errorMessage: error instanceof Error ? error.message : String(error),
              reason: 'ios_simulator_missing_apns_entitlement',
              source: 'NotificationInteraction',
              trigger,
            });
            return;
          }

          logger.warn('[NotificationInteraction] Failed to register notification device:', error);
          trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_FAILED', {
            errorMessage: error instanceof Error ? error.message : String(error),
            source: 'NotificationInteraction',
            trigger,
          });

          if (!isCancelled) {
            scheduleRetry();
          }
        })
        .finally(() => {
          activeAttempt = null;
        });
    };

    const registerRemoteNotificationDevice = async (trigger: 'auth' | 'foreground' | 'retry') => {
      const notifications = await loadNotificationsModule();
      if (!notifications) {
        trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SKIPPED', {
          reason: 'native_module_unavailable',
          source: 'NotificationInteraction',
          trigger,
        });
        return;
      }

      const permission = await ensureRemoteNotificationPermission(notifications);
      if (!permission || isCancelled) {
        if (!permission) {
          trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SKIPPED', {
            reason: 'permission_denied',
            source: 'NotificationInteraction',
            trigger,
          });
        }
        return;
      }

      const projectId = resolveExpoProjectId();
      if (!projectId) {
        trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SKIPPED', {
          reason: 'missing_expo_project_id',
          source: 'NotificationInteraction',
          trigger,
        });
        return;
      }

      const [deviceId, pushToken] = await Promise.all([
        resolveNotificationDeviceId(),
        notifications.getExpoPushTokenAsync({ projectId }),
      ]);
      if (isCancelled) {
        return;
      }

      await registerNotificationDevice({
        deviceId,
        platform: Platform.OS,
        pushToken: pushToken.data,
      });
      trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SUCCEEDED', {
        platform: Platform.OS,
        source: 'NotificationInteraction',
        trigger,
      });
    };

    runRegistrationAttempt('auth');

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        runRegistrationAttempt('foreground');
      }
    });

    return () => {
      isCancelled = true;
      clearRetryTimeout();
      appStateSubscription.remove();
    };
  }, [status, userId]);
}

function isIosSimulatorMissingApnsEntitlementError(error: unknown): boolean {
  if (Platform.OS !== 'ios' || Device.isDevice) {
    return false;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  return errorMessage.includes('no valid') && errorMessage.includes('aps-environment');
}

export function useForegroundNotificationPresentation() {
  useEffect(() => {
    let isCancelled = false;
    let didInstallHandler = false;

    void loadNotificationsModule()
      .then((notifications) => {
        if (!notifications || isCancelled) {
          return;
        }

        notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        didInstallHandler = true;
      })
      .catch((error: unknown) => {
        logger.warn('[NotificationInteraction] Failed to install notification presentation handler:', error);
      });

    return () => {
      isCancelled = true;
      if (didInstallHandler) {
        void loadNotificationsModule().then((notifications) => notifications?.setNotificationHandler(null));
      }
    };
  }, []);
}

export function useNotificationTapRouting(navigationRef: NavigationRefLike, status: NotificationAuthStatus) {
  const pendingResponseRef = useRef<ExpoNotifications.NotificationResponse | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);

  useEffect(() => {
    if (status !== 'authenticated') {
      return undefined;
    }

    let subscription: { remove: () => void } | null = null;

    const clearRetryTimeout = () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };

    const routePendingResponse = () => {
      const response = pendingResponseRef.current;
      if (!response) {
        return;
      }

      const result = routeNotificationResponse(response, navigationRef);
      if (result === 'routed' || result === 'ignored') {
        pendingResponseRef.current = null;
        retryAttemptRef.current = 0;
        clearRetryTimeout();
        return;
      }

      if (retryAttemptRef.current >= NOTIFICATION_TAP_ROUTE_MAX_ATTEMPTS) {
        const pendingRoute = resolveNotificationRoute(response);
        trackObservabilityEvent('NOTIFICATION_TAP_ROUTE_DROPPED', {
          notificationType: pendingRoute?.notificationType ?? 'unknown',
          reason: 'navigation_not_ready',
          route: pendingRoute?.routeName ?? 'unknown',
          source: 'NotificationInteraction',
        });
        pendingResponseRef.current = null;
        retryAttemptRef.current = 0;
        clearRetryTimeout();
        return;
      }

      retryAttemptRef.current += 1;
      clearRetryTimeout();
      retryTimeoutRef.current = setTimeout(routePendingResponse, NOTIFICATION_TAP_ROUTE_RETRY_DELAY_MS);
    };

    const routeResponse = (response: ExpoNotifications.NotificationResponse | null | undefined) => {
      if (!response) {
        return;
      }
      pendingResponseRef.current = response;
      retryAttemptRef.current = 0;
      routePendingResponse();
    };

    void loadNotificationsModule()
      .then((notifications) => {
        if (!notifications) {
          return;
        }
        subscription = notifications.addNotificationResponseReceivedListener(routeResponse);
        return notifications.getLastNotificationResponseAsync().then(routeResponse);
      })
      .catch((error: unknown) => {
        logger.warn('[NotificationInteraction] Failed to read last notification response:', error);
      });

    return () => {
      clearRetryTimeout();
      subscription?.remove();
    };
  }, [navigationRef, status]);
}

export function routeNotificationResponse(
  response: ExpoNotifications.NotificationResponse | null | undefined,
  navigationRef: NavigationRefLike,
): 'routed' | 'ignored' | 'not_ready' {
  const route = resolveNotificationRoute(response);
  if (!route) {
    return 'ignored';
  }

  if (!navigationRef.isReady()) {
    return 'not_ready';
  }

  navigationRef.navigate(route.routeName, route.params);
  trackObservabilityEvent('NOTIFICATION_TAP_ROUTED', {
    notificationType: route.notificationType,
    route: route.routeName,
    source: 'NotificationInteraction',
  });
  return 'routed';
}

export async function scheduleVisitReminderNotification(
  minutes: VisitReminderMinutes,
): Promise<ScheduleVisitReminderResult> {
  const existingReminderStatus = await getVisitReminderNotificationStatus();
  if (existingReminderStatus.status === 'scheduled') {
    trackObservabilityEvent('VISIT_REMINDER_NOTIFICATION_SKIPPED', {
      reason: 'already_scheduled',
      source: 'NotificationInteraction',
    });
    return {
      status: 'already_scheduled',
      errorMessage: 'You already have a visit reminder scheduled.',
    };
  }

  if (existingReminderStatus.status === 'unavailable' || existingReminderStatus.status === 'failed') {
    return existingReminderStatus;
  }

  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return buildNotificationsUnavailableResult();
  }

  const hasPermission = await ensureNotificationPermission(notifications);
  if (!hasPermission) {
    trackObservabilityEvent('VISIT_REMINDER_NOTIFICATION_SKIPPED', {
      reason: 'permission_denied',
      source: 'NotificationInteraction',
    });
    return {
      status: 'permission_denied',
      errorMessage: 'Notification permission is off. Enable notifications in system settings to use reminders.',
    };
  }

  try {
    const reminderAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const notificationId = await notifications.scheduleNotificationAsync({
      content: {
        title: 'Track your restaurant visit',
        body: 'Add the dishes and ratings while they are still fresh.',
        data: {
          reminderAt,
          notificationType: VISIT_REMINDER_NOTIFICATION_TYPE,
        },
      },
      trigger: {
        type: 'timeInterval',
        seconds: minutes * 60,
        repeats: false,
      } as ExpoNotifications.TimeIntervalTriggerInput,
    });

    trackObservabilityEvent('VISIT_REMINDER_NOTIFICATION_SCHEDULED', {
      minutes,
      source: 'NotificationInteraction',
    });
    return {
      status: 'scheduled',
      notificationId,
    };
  } catch (error) {
    logger.warn('[NotificationInteraction] Failed to schedule visit reminder:', error);
    trackObservabilityEvent('VISIT_REMINDER_NOTIFICATION_FAILED', {
      errorMessage: error instanceof Error ? error.message : String(error),
      minutes,
      source: 'NotificationInteraction',
    });
    return {
      status: 'failed',
      errorMessage: 'Could not schedule the reminder. Try again in a moment.',
    };
  }
}

export async function getVisitReminderNotificationStatus(): Promise<VisitReminderNotificationStatus> {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return buildNotificationsUnavailableResult();
  }

  try {
    const scheduledNotifications = await notifications.getAllScheduledNotificationsAsync();
    const existingVisitReminder = scheduledNotifications.find(isFutureVisitReminderNotificationRequest);
    return {
      status: existingVisitReminder ? 'scheduled' : 'none',
    };
  } catch (error) {
    logger.warn('[NotificationInteraction] Failed to read scheduled visit reminders:', error);
    trackObservabilityEvent('VISIT_REMINDER_NOTIFICATION_STATUS_FAILED', {
      errorMessage: error instanceof Error ? error.message : String(error),
      source: 'NotificationInteraction',
    });
    return {
      status: 'failed',
      errorMessage: 'Could not check scheduled reminders. Try again in a moment.',
    };
  }
}

async function ensureRemoteNotificationPermission(notifications: NotificationsModule): Promise<boolean> {
  return ensureNotificationPermission(notifications);
}

async function ensureNotificationPermission(notifications: NotificationsModule): Promise<boolean> {
  const existingPermission = await notifications.getPermissionsAsync();
  if (existingPermission.granted) {
    return true;
  }

  const requestedPermission = await notifications.requestPermissionsAsync();
  return requestedPermission.granted;
}

function resolveNotificationRoute(
  response: ExpoNotifications.NotificationResponse | null | undefined,
):
  | {
      notificationType: string;
      routeName: 'TastingSessions';
      params: RootStackParamList['TastingSessions'];
    }
  | {
      notificationType: string;
      routeName: 'CreateVisit';
      params: RootStackParamList['CreateVisit'];
    }
  | null {
  const data = response?.notification.request.content.data;
  if (!data || typeof data.notificationType !== 'string') {
    return null;
  }

  if (data.notificationType === 'tasting_invite') {
    return {
      notificationType: 'tasting_invite',
      routeName: 'TastingSessions',
      params: {
        refreshSignal: Date.now(),
      },
    };
  }

  if (data.notificationType === VISIT_REMINDER_NOTIFICATION_TYPE) {
    return {
      notificationType: VISIT_REMINDER_NOTIFICATION_TYPE,
      routeName: 'CreateVisit',
      params: undefined,
    };
  }

  return null;
}

function isFutureVisitReminderNotificationRequest(notification: ExpoNotifications.NotificationRequest): boolean {
  if (notification.content.data?.notificationType !== VISIT_REMINDER_NOTIFICATION_TYPE) {
    return false;
  }

  const reminderAt = notification.content.data.reminderAt;
  if (typeof reminderAt !== 'string') {
    return false;
  }

  const reminderAtTime = Date.parse(reminderAt);
  return Number.isFinite(reminderAtTime) && reminderAtTime > Date.now();
}

function buildNotificationsUnavailableResult(): { status: 'unavailable'; errorMessage: string } {
  return {
    status: 'unavailable',
    errorMessage: 'Notifications are not available on this device.',
  };
}

function resolveExpoProjectId(): string | null {
  const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof easProjectId === 'string' && easProjectId.trim() ? easProjectId : null;
}

async function loadNotificationsModule(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  if (cachedNotificationsModule !== undefined) {
    return cachedNotificationsModule;
  }

  if (!notificationsNativeAvailabilityChecker()) {
    cachedNotificationsModule = null;
    return null;
  }

  try {
    cachedNotificationsModule = await notificationsModuleLoader();
    return cachedNotificationsModule;
  } catch (error) {
    cachedNotificationsModule = null;
    if (!hasLoggedNotificationsModuleUnavailable) {
      hasLoggedNotificationsModuleUnavailable = true;
      logger.warn('[NotificationInteraction] Expo notifications native module unavailable:', error);
    }
    return null;
  }
}

function hasNotificationsNativeModule(): boolean {
  if (hasExpoModule('ExpoPushTokenManager')) {
    return true;
  }

  const legacyProxy = NativeModules?.NativeUnimoduleProxy as
    | {
        exportedMethods?: Record<string, unknown>;
      }
    | undefined;
  return Boolean(legacyProxy?.exportedMethods?.ExpoPushTokenManager);
}

function hasExpoModule(moduleName: string): boolean {
  const expoGlobal = globalThis as typeof globalThis & {
    expo?: {
      modules?: Record<string, unknown>;
    };
  };
  return Boolean(expoGlobal.expo?.modules?.[moduleName]);
}
