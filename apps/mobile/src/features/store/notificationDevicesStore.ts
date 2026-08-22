import { Platform } from 'react-native';

import { trackFeatureMutation } from './featureStoreShared';
import { sendApiRequest } from './pocketbaseGateway';

export interface RegisterNotificationDeviceInput {
  deviceId: string;
  pushToken: string;
  revocationCapability: string;
  revocationId: string;
  platform?: string;
}

export interface RevokeNotificationDeviceInput {
  revocationCapability: string;
  revocationId: string;
}

export async function registerNotificationDevice(
  input: RegisterNotificationDeviceInput,
): Promise<void> {
  await trackFeatureMutation('notification_device.register', () =>
    sendApiRequest('/api/notification-devices', {
      method: 'POST',
      body: {
        deviceId: input.deviceId,
        platform: input.platform ?? Platform.OS,
        pushToken: input.pushToken,
        revocationCapability: input.revocationCapability,
        revocationId: input.revocationId,
      },
    }),
  );
}

export async function deactivateNotificationDevice(deviceId: string): Promise<void> {
  const trimmedDeviceId = deviceId.trim();
  if (!trimmedDeviceId) {
    return;
  }

  await trackFeatureMutation('notification_device.deactivate', () =>
    sendApiRequest(`/api/notification-devices/${encodeURIComponent(trimmedDeviceId)}`, {
      method: 'DELETE',
    }),
  );
}

export async function revokeNotificationDevice(input: RevokeNotificationDeviceInput): Promise<void> {
  await trackFeatureMutation('notification_device.revoke', () =>
    sendApiRequest('/api/notification-devices/revoke', {
      method: 'POST',
      body: input,
    }),
  );
}
