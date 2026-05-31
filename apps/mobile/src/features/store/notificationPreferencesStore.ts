import { type FeatureWriteRequestOptions } from './featureStoreShared';
import { sendApiRequest } from './pocketbaseGateway';

export interface NotificationPreferencesRecord {
  tastingInvitesEnabled?: unknown;
  billOwedEnabled?: unknown;
  monthlyFriendsActivityEnabled?: unknown;
  tasting_invites_enabled?: unknown;
  bill_owed_enabled?: unknown;
  monthly_friends_activity_enabled?: unknown;
}

export interface NotificationPreferences {
  notificationTastingInvitesEnabled: boolean;
  notificationBillsEnabled: boolean;
  notificationMonthlyFriendsActivityEnabled: boolean;
}

export function mapNotificationPreferences(
  record: NotificationPreferencesRecord | null | undefined,
): NotificationPreferences {
  const billOwedEnabled = record?.billOwedEnabled ?? record?.bill_owed_enabled;
  const monthlyFriendsActivityEnabled =
    record?.monthlyFriendsActivityEnabled ?? record?.monthly_friends_activity_enabled;
  const tastingInvitesEnabled = record?.tastingInvitesEnabled ?? record?.tasting_invites_enabled;

  return {
    notificationBillsEnabled: billOwedEnabled === false ? false : true,
    notificationMonthlyFriendsActivityEnabled: monthlyFriendsActivityEnabled === false ? false : true,
    notificationTastingInvitesEnabled: tastingInvitesEnabled === false ? false : true,
  };
}

export async function getNotificationPreferences(
  userId: string,
  options?: { signal?: AbortSignal },
): Promise<NotificationPreferences> {
  void userId;
  const response = await sendApiRequest<NotificationPreferencesRecord>(
    '/api/notification-preferences',
    {
      method: 'GET',
      signal: options?.signal,
    },
  );
  return mapNotificationPreferences(response);
}

export async function saveNotificationPreferences(
  preferences: NotificationPreferences,
  options?: FeatureWriteRequestOptions,
): Promise<NotificationPreferencesRecord> {
  return sendApiRequest<NotificationPreferencesRecord>(
    '/api/notification-preferences',
    {
      method: 'PUT',
      body: {
        billOwedEnabled: preferences.notificationBillsEnabled,
        monthlyFriendsActivityEnabled: preferences.notificationMonthlyFriendsActivityEnabled,
        tastingInvitesEnabled: preferences.notificationTastingInvitesEnabled,
      },
      headers: options?.headers,
    },
  );
}
