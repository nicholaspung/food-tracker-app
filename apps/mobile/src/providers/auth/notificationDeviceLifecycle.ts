import { logger } from '../../lib/logger';
import { unregisterCurrentNotificationDevice } from '../../notifications/notificationInteraction';

export interface NotificationDeviceLifecycle {
  deactivateForSignOut: (userId: string | null | undefined) => Promise<void>;
}

interface NotificationDeviceLifecycleDependencies {
  unregisterCurrentDevice: () => Promise<void>;
}

export function createNotificationDeviceLifecycle({
  unregisterCurrentDevice,
}: NotificationDeviceLifecycleDependencies): NotificationDeviceLifecycle {
  return {
    async deactivateForSignOut(userId) {
      if (!userId) {
        return;
      }

      await unregisterCurrentDevice().catch((error) => {
        logger.warn('[NotificationDeviceLifecycle] Failed to unregister notification device on sign-out:', error);
      });
    },
  };
}

export const notificationDeviceLifecycle = createNotificationDeviceLifecycle({
  unregisterCurrentDevice: unregisterCurrentNotificationDevice,
});
