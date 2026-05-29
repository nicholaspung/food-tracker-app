import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type * as ExpoNotifications from 'expo-notifications';
import { useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';

import {
  deactivateNotificationDevice,
  registerNotificationDevice,
} from '../features/store/notificationDevicesStore';
import { logger } from '../lib/logger';
import { trackObservabilityEvent } from '../observability';
import type { RootStackParamList } from '../navigation/RootNavigator';

const NOTIFICATION_DEVICE_ID_STORAGE_KEY = 'notifications.deviceId';

type NotificationAuthStatus = 'bootstrapping' | 'authenticated' | 'verification_required' | 'unauthenticated';
type NotificationsModule = typeof ExpoNotifications;

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

    const register = async () => {
      const notifications = await loadNotificationsModule();
      if (!notifications) {
        trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SKIPPED', {
          reason: 'native_module_unavailable',
          source: 'NotificationInteraction',
        });
        return;
      }

      const permission = await ensureRemoteNotificationPermission(notifications);
      if (!permission || isCancelled) {
        return;
      }

      const projectId = resolveExpoProjectId();
      if (!projectId) {
        trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_SKIPPED', {
          reason: 'missing_expo_project_id',
          source: 'NotificationInteraction',
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
    };

    void register().catch((error) => {
      logger.warn('[NotificationInteraction] Failed to register notification device:', error);
      trackObservabilityEvent('NOTIFICATION_DEVICE_REGISTRATION_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        source: 'NotificationInteraction',
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [status, userId]);
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
  useEffect(() => {
    if (status !== 'authenticated') {
      return undefined;
    }

    let subscription: { remove: () => void } | null = null;

    const routeResponse = (response: ExpoNotifications.NotificationResponse | null | undefined) => {
      routeNotificationResponse(response, navigationRef);
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
      subscription?.remove();
    };
  }, [navigationRef, status]);
}

export function routeNotificationResponse(
  response: ExpoNotifications.NotificationResponse | null | undefined,
  navigationRef: NavigationRefLike,
): boolean {
  const data = response?.notification.request.content.data;
  if (!data || data.notificationType !== 'tasting_invite') {
    return false;
  }

  if (!navigationRef.isReady()) {
    return false;
  }

  navigationRef.navigate('TastingSessions');
  trackObservabilityEvent('NOTIFICATION_TAP_ROUTED', {
    notificationType: 'tasting_invite',
    route: 'TastingSessions',
    source: 'NotificationInteraction',
  });
  return true;
}

async function ensureRemoteNotificationPermission(notifications: NotificationsModule): Promise<boolean> {
  const existingPermission = await notifications.getPermissionsAsync();
  if (existingPermission.granted) {
    return true;
  }

  const requestedPermission = await notifications.requestPermissionsAsync();
  return requestedPermission.granted;
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
