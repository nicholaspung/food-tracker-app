import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import type * as ExpoNotifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import {
  deactivateNotificationDevice,
  registerNotificationDevice,
  revokeNotificationDevice,
} from '../features/store/notificationDevicesStore';
import { getEnvironmentStorageKey } from '../config/persistence';
import { localPersistence } from '../localPersistence';
import { logger } from '../lib/logger';
import { trackObservabilityEvent } from '../observability';
import type { RootStackParamList } from '../navigation/RootNavigator';

const NOTIFICATION_DEVICE_ID_STORAGE_KEY = localPersistence.notifications.keys.deviceId;
const NOTIFICATION_DEVICE_REVOCATION_STORAGE_KEY = getEnvironmentStorageKey(
  'food_tracker_notification_device_revocation_v1',
);
const NOTIFICATION_DEVICE_REVOCATION_KEYCHAIN_SERVICE = getEnvironmentStorageKey(
  'food_tracker_notification_device_revocation',
);
const NOTIFICATION_REGISTRATION_RETRY_DELAY_MS = 30_000;
const NOTIFICATION_TAP_ROUTE_RETRY_DELAY_MS = 250;
const NOTIFICATION_TAP_ROUTE_MAX_ATTEMPTS = 20;
const VISIT_REMINDER_NOTIFICATION_TYPE = 'visit_reminder';
const BILL_OWED_NOTIFICATION_TYPE = 'bill_owed';
const BILL_PAYMENT_REMINDER_NOTIFICATION_TYPE = 'bill_payment_reminder';
const MONTHLY_FRIENDS_ACTIVITY_NOTIFICATION_TYPE = 'monthly_friends_activity';

type NotificationAuthStatus = 'bootstrapping' | 'authenticated' | 'verification_required' | 'unauthenticated';
type NotificationsModule = typeof ExpoNotifications;
export type VisitReminderMinutes = 15 | 30 | 60;

interface NotificationDeviceRevocationState {
  deviceId: string;
  pendingDeactivation: boolean;
  revocationCapability: string;
  revocationId: string;
}

export class NotificationDeviceCleanupNotDurableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NotificationDeviceCleanupNotDurableError';
  }
}

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

export type RemoteNotificationPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable' | 'failed';

interface NavigationRefLike {
  isReady: () => boolean;
  navigate: <TRouteName extends keyof RootStackParamList>(
    routeName: TRouteName,
    params?: RootStackParamList[TRouteName],
  ) => void;
}

let cachedNotificationsModule: NotificationsModule | null | undefined;
let hasLoggedNotificationsModuleUnavailable = false;
let notificationDeviceDeactivationCount = 0;
let notificationDeviceRegistrationTail: Promise<void> = Promise.resolve();
const pendingNotificationDeviceRegistrations = new Set<Promise<unknown>>();
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
  const existingDeviceId = await localPersistence.notifications.storage.getItem(NOTIFICATION_DEVICE_ID_STORAGE_KEY);
  if (existingDeviceId?.trim()) {
    return existingDeviceId;
  }

  const nextDeviceId = `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  await localPersistence.notifications.storage.setItem(NOTIFICATION_DEVICE_ID_STORAGE_KEY, nextDeviceId);
  return nextDeviceId;
}

export async function clearNotificationDeviceIdentity(): Promise<void> {
  await Promise.all([
    localPersistence.notifications.storage.removeItem(NOTIFICATION_DEVICE_ID_STORAGE_KEY),
    clearNotificationDeviceRevocationState(),
  ]);
}

export async function unregisterCurrentNotificationDevice(): Promise<void> {
  notificationDeviceDeactivationCount += 1;
  try {
    await waitForPendingNotificationDeviceRegistrations();
    const deviceId = await localPersistence.notifications.storage.getItem(NOTIFICATION_DEVICE_ID_STORAGE_KEY);
    if (!deviceId?.trim()) {
      return;
    }

    let revocationState: NotificationDeviceRevocationState | null;
    try {
      revocationState = await readNotificationDeviceRevocationState();
    } catch (error) {
      await deactivateNotificationDeviceWithoutTombstone(deviceId, error);
      return;
    }
    if (!revocationState) {
      await deactivateNotificationDeviceWithoutTombstone(deviceId);
      return;
    }
    if (revocationState.deviceId !== deviceId) {
      throw new NotificationDeviceCleanupNotDurableError(
        'Stored notification device cleanup does not match the current device.',
      );
    }

    if (revocationState.pendingDeactivation) {
      try {
        await revokeNotificationDevice({
          revocationCapability: revocationState.revocationCapability,
          revocationId: revocationState.revocationId,
        });
      } catch (error) {
        logger.warn('[NotificationInteraction] Notification device revocation remains queued:', error);
        return;
      }

      await clearNotificationDeviceIdentity();
      return;
    }

    try {
      await writeNotificationDeviceRevocationState({
        ...revocationState,
        pendingDeactivation: true,
      });
    } catch (error) {
      throw new NotificationDeviceCleanupNotDurableError(
        'Could not persist notification device cleanup before sign-out.',
        { cause: error },
      );
    }

    try {
      await deactivateNotificationDevice(deviceId);
    } catch (error) {
      logger.warn('[NotificationInteraction] Notification device deactivation queued for retry:', error);
      return;
    }

    await clearNotificationDeviceIdentity();
  } finally {
    notificationDeviceDeactivationCount -= 1;
  }
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

      activeAttempt = runNotificationDeviceRegistrationWorkflow(() =>
        registerRemoteNotificationDevice(trigger),
      )
        .then(() => undefined)
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

          if (!isTransientExpoPushTokenServiceError(error)) {
            logger.warn('[NotificationInteraction] Failed to register notification device:', error);
          }
          trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_FAILED', {
            errorMessage: error instanceof Error ? error.message : String(error),
            reason: isTransientExpoPushTokenServiceError(error)
              ? 'transient_expo_push_token_service_unavailable'
              : 'registration_failed',
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
      await replayPendingNotificationDeviceDeactivation();
      const notifications = await loadNotificationsModule();
      if (!notifications) {
        trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SKIPPED', {
          reason: 'native_module_unavailable',
          source: 'NotificationInteraction',
          trigger,
        });
        return;
      }

      const existingPermission = await notifications.getPermissionsAsync();
      if (!existingPermission.granted || isCancelled) {
        if (!existingPermission.granted) {
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

      const [registrationState, pushToken] = await Promise.all([
        resolveNotificationDeviceRegistrationState(),
        notifications.getExpoPushTokenAsync({ projectId }),
      ]);
      if (isCancelled) {
        return;
      }

      await registerNotificationDevice({
        deviceId: registrationState.deviceId,
        platform: Platform.OS,
        pushToken: pushToken.data,
        revocationCapability: registrationState.revocationCapability,
        revocationId: registrationState.revocationId,
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

export async function registerCurrentRemoteNotificationDevice(
  trigger: 'settings' | 'auth' | 'foreground' | 'retry' = 'settings',
): Promise<boolean> {
  const result = await runNotificationDeviceRegistrationWorkflow(() =>
    registerCurrentRemoteNotificationDeviceWorkflow(trigger),
  );
  return result ?? false;
}

async function registerCurrentRemoteNotificationDeviceWorkflow(
  trigger: 'settings' | 'auth' | 'foreground' | 'retry',
): Promise<boolean> {
  await replayPendingNotificationDeviceDeactivation();
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SKIPPED', {
      reason: 'native_module_unavailable',
      source: 'NotificationInteraction',
      trigger,
    });
    return false;
  }

  const existingPermission = await notifications.getPermissionsAsync();
  if (!existingPermission.granted) {
    trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SKIPPED', {
      reason: 'permission_denied',
      source: 'NotificationInteraction',
      trigger,
    });
    return false;
  }

  const projectId = resolveExpoProjectId();
  if (!projectId) {
    trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SKIPPED', {
      reason: 'missing_expo_project_id',
      source: 'NotificationInteraction',
      trigger,
    });
    return false;
  }

  const [registrationState, pushToken] = await Promise.all([
    resolveNotificationDeviceRegistrationState(),
    notifications.getExpoPushTokenAsync({ projectId }),
  ]);
  await registerNotificationDevice({
    deviceId: registrationState.deviceId,
    platform: Platform.OS,
    pushToken: pushToken.data,
    revocationCapability: registrationState.revocationCapability,
    revocationId: registrationState.revocationId,
  });
  trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SUCCEEDED', {
    platform: Platform.OS,
    source: 'NotificationInteraction',
    trigger,
  });
  return true;
}

function runNotificationDeviceRegistrationWorkflow<T>(
  workflow: () => Promise<T>,
): Promise<T | undefined> {
  if (notificationDeviceDeactivationCount > 0) {
    return Promise.resolve(undefined);
  }

  const previousRegistration = notificationDeviceRegistrationTail.catch(() => undefined);
  let releaseRegistration = () => {};
  const registrationGate = new Promise<void>((resolve) => {
    releaseRegistration = resolve;
  });
  notificationDeviceRegistrationTail = previousRegistration.then(() => registrationGate);

  const registration = (async () => {
    await previousRegistration;
    try {
      if (notificationDeviceDeactivationCount > 0) {
        return undefined;
      }
      return await workflow();
    } finally {
      releaseRegistration();
    }
  })();
  pendingNotificationDeviceRegistrations.add(registration);
  void registration.then(() => {
    pendingNotificationDeviceRegistrations.delete(registration);
  }, () => {
    pendingNotificationDeviceRegistrations.delete(registration);
  });
  return registration;
}

async function waitForPendingNotificationDeviceRegistrations(): Promise<void> {
  while (pendingNotificationDeviceRegistrations.size > 0) {
    await Promise.allSettled(Array.from(pendingNotificationDeviceRegistrations));
  }
}

async function deactivateNotificationDeviceWithoutTombstone(
  deviceId: string,
  stateError?: unknown,
): Promise<void> {
  try {
    await deactivateNotificationDevice(deviceId);
  } catch (error) {
    throw new NotificationDeviceCleanupNotDurableError(
      'Notification device cleanup failed without a durable tombstone.',
      { cause: stateError ?? error },
    );
  }

  try {
    await clearNotificationDeviceIdentity();
  } catch (error) {
    logger.warn('[NotificationInteraction] Failed to clear inactive notification device state:', error);
  }
}

async function replayPendingNotificationDeviceDeactivation(): Promise<void> {
  const state = await readNotificationDeviceRevocationState();
  if (!state?.pendingDeactivation) {
    return;
  }

  await revokeNotificationDevice({
    revocationCapability: state.revocationCapability,
    revocationId: state.revocationId,
  });
  await clearNotificationDeviceIdentity();
}

async function resolveNotificationDeviceRegistrationState(): Promise<NotificationDeviceRevocationState> {
  const existingState = await readNotificationDeviceRevocationState();
  if (existingState) {
    if (existingState.pendingDeactivation) {
      throw new Error('Pending notification device cleanup must complete before registration.');
    }
    await localPersistence.notifications.storage.setItem(
      NOTIFICATION_DEVICE_ID_STORAGE_KEY,
      existingState.deviceId,
    );
    return existingState;
  }

  const deviceId = await resolveNotificationDeviceId();
  const [revocationCapability, revocationId] = await Promise.all([
    createSecureRandomHex(),
    createSecureRandomHex(),
  ]);
  const state: NotificationDeviceRevocationState = {
    deviceId,
    pendingDeactivation: false,
    revocationCapability,
    revocationId,
  };
  await writeNotificationDeviceRevocationState(state);
  return state;
}

async function createSecureRandomHex(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function readNotificationDeviceRevocationState(): Promise<NotificationDeviceRevocationState | null> {
  const serialized = await SecureStore.getItemAsync(
    NOTIFICATION_DEVICE_REVOCATION_STORAGE_KEY,
    notificationDeviceSecureStoreOptions(),
  );
  if (!serialized) {
    return null;
  }

  const parsed = JSON.parse(serialized) as Partial<NotificationDeviceRevocationState>;
  if (
    typeof parsed.deviceId !== 'string' ||
    !parsed.deviceId.trim() ||
    typeof parsed.pendingDeactivation !== 'boolean' ||
    typeof parsed.revocationCapability !== 'string' ||
    !/^[a-f0-9]{64}$/.test(parsed.revocationCapability) ||
    typeof parsed.revocationId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(parsed.revocationId)
  ) {
    throw new Error('Stored notification device revocation state is invalid.');
  }

  return parsed as NotificationDeviceRevocationState;
}

async function writeNotificationDeviceRevocationState(
  state: NotificationDeviceRevocationState,
): Promise<void> {
  await SecureStore.setItemAsync(
    NOTIFICATION_DEVICE_REVOCATION_STORAGE_KEY,
    JSON.stringify(state),
    notificationDeviceSecureStoreOptions(),
  );
}

async function clearNotificationDeviceRevocationState(): Promise<void> {
  await SecureStore.deleteItemAsync(
    NOTIFICATION_DEVICE_REVOCATION_STORAGE_KEY,
    notificationDeviceSecureStoreOptions(),
  );
}

function notificationDeviceSecureStoreOptions() {
  return {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    keychainService: NOTIFICATION_DEVICE_REVOCATION_KEYCHAIN_SERVICE,
  };
}

function isIosSimulatorMissingApnsEntitlementError(error: unknown): boolean {
  if (Platform.OS !== 'ios' || Device.isDevice) {
    return false;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  return errorMessage.includes('no valid') && errorMessage.includes('aps-environment');
}

function isTransientExpoPushTokenServiceError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return (
    errorMessage.includes('Error encountered while fetching Expo token') &&
    (errorMessage.includes('service unavailable') ||
      errorMessage.includes('no healthy upstream') ||
      errorMessage.includes('upstream connect error') ||
      errorMessage.includes('connection timeout'))
  );
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

      if (status !== 'authenticated') {
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

    if (status === 'authenticated') {
      routePendingResponse();
    }

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

export async function getRemoteNotificationPermissionStatus(): Promise<RemoteNotificationPermissionStatus> {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return 'unavailable';
  }

  try {
    const permission = await notifications.getPermissionsAsync();
    if (permission.granted) {
      return 'granted';
    }
    return permission.canAskAgain === false ? 'denied' : 'undetermined';
  } catch (error) {
    logger.warn('[NotificationInteraction] Failed to read notification permission:', error);
    return 'failed';
  }
}

export async function requestRemoteNotificationPermission(): Promise<RemoteNotificationPermissionStatus> {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return 'unavailable';
  }

  try {
    const existingPermission = await notifications.getPermissionsAsync();
    if (existingPermission.granted) {
      return 'granted';
    }

    const requestedPermission = await notifications.requestPermissionsAsync();
    if (requestedPermission.granted) {
      return 'granted';
    }
    return requestedPermission.canAskAgain === false ? 'denied' : 'undetermined';
  } catch (error) {
    logger.warn('[NotificationInteraction] Failed to request notification permission:', error);
    return 'failed';
  }
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
      routeName: 'Home';
      params: RootStackParamList['Home'];
    }
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
  | {
      notificationType: string;
      routeName: 'Bills';
      params: RootStackParamList['Bills'];
    }
  | {
      notificationType: string;
      routeName: 'BillDetail';
      params: RootStackParamList['BillDetail'];
    }
  | null {
  const data = response?.notification.request.content.data;
  if (!data) {
    return null;
  }
  const notificationType = resolveNotificationType(data);

  if (notificationType === MONTHLY_FRIENDS_ACTIVITY_NOTIFICATION_TYPE || data.route === 'Home') {
    return {
      notificationType: MONTHLY_FRIENDS_ACTIVITY_NOTIFICATION_TYPE,
      routeName: 'Home',
      params: {
        initialView: {
          feedMode: 'friends',
          filtersExpanded: true,
          searchQuery: '',
          sortFilter: 'created',
          typeFilter: 'visits',
        },
      },
    };
  }

  if (notificationType === 'tasting_invite') {
    return {
      notificationType: 'tasting_invite',
      routeName: 'TastingSessions',
      params: {
        refreshSignal: Date.now(),
      },
    };
  }

  if (notificationType === VISIT_REMINDER_NOTIFICATION_TYPE) {
    return {
      notificationType: VISIT_REMINDER_NOTIFICATION_TYPE,
      routeName: 'CreateVisit',
      params: undefined,
    };
  }

  if (notificationType === BILL_PAYMENT_REMINDER_NOTIFICATION_TYPE || data.route === 'BillDetail') {
    const billId = resolveNotificationBillId(data);
    if (!billId) {
      return null;
    }

    return {
      notificationType: BILL_PAYMENT_REMINDER_NOTIFICATION_TYPE,
      routeName: 'BillDetail',
      params: {
        billId,
      },
    };
  }

  if (notificationType === BILL_OWED_NOTIFICATION_TYPE || data.route === 'Bills') {
    return {
      notificationType: BILL_OWED_NOTIFICATION_TYPE,
      routeName: 'Bills',
      params: {
        billId: resolveNotificationBillId(data),
        refreshSignal: Date.now(),
      },
    };
  }

  return null;
}

function resolveNotificationType(data: Record<string, unknown>): string | null {
  const notificationType = data.notificationType;
  if (typeof notificationType === 'string' && notificationType.trim()) {
    return notificationType.trim();
  }

  const signalType = data.signal_type;
  if (typeof signalType === 'string' && signalType.trim()) {
    return signalType.trim();
  }

  const type = data.type;
  if (typeof type === 'string' && type.trim()) {
    return type.trim();
  }

  return null;
}

function resolveNotificationBillId(data: Record<string, unknown>): string | undefined {
  for (const key of ['billId', 'bill_id', 'sourceRecord', 'source_record']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
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
  return hasExpoModule('ExpoPushTokenManager');
}

function hasExpoModule(moduleName: string): boolean {
  const expoGlobal = globalThis as typeof globalThis & {
    expo?: {
      modules?: Record<string, unknown>;
    };
  };
  return Boolean(expoGlobal.expo?.modules?.[moduleName]);
}
