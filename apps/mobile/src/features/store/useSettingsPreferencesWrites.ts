import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RecordModel } from 'pocketbase';

import {
  type FeatureOutboxOperationPayload,
} from './featureOutboxOperations';
import {
  buildHomeFeedDefaultsUpdate,
  type HomeFeedDefaultMode,
  type HomeFeedDefaultSort,
  type HomeFeedDefaultTypeFilter,
} from './homeFeedPreferences';
import { escapeFilterValue } from './featureStoreShared';
import {
  createCollectionRecord,
  getAuthRecord,
  listCollectionPage,
  saveAuthRecord,
  updateCollectionRecord,
} from './pocketbaseGateway';
import { invalidateSettingsQueries, settingsQueryKeys } from './settingsQuery';
import {
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';

export type VisitVisibility = 'friends' | 'private';
export type RestaurantVisibility = 'private' | 'friends';
export type ListVisibility = 'private' | 'friends';

export interface UserSettingsRecord {
  defaultVisitVisibility?: unknown;
  defaultRestaurantVisibility?: unknown;
  defaultListVisibility?: unknown;
  defaultHomeFeedMode?: unknown;
  defaultHomeFeedTypeFilter?: unknown;
  defaultHomeFeedSort?: unknown;
}

export interface NotificationPreferencesRecord {
  id?: string;
  user?: unknown;
  tasting_invites_enabled?: unknown;
  bill_owed_enabled?: unknown;
  monthly_friends_activity_enabled?: unknown;
}

export interface NotificationPreferences {
  notificationTastingInvitesEnabled: boolean;
  notificationBillsEnabled: boolean;
  notificationMonthlyFriendsActivityEnabled: boolean;
}

export interface UserSettings {
  visitVisibility: VisitVisibility;
  restaurantVisibility: RestaurantVisibility;
  listVisibility: ListVisibility;
  homeFeedMode: HomeFeedDefaultMode;
  homeFeedTypeFilter: HomeFeedDefaultTypeFilter;
  homeFeedSort: HomeFeedDefaultSort;
  notificationPreferences: NotificationPreferences;
}

interface SaveSettingsPreferencesInput extends UserSettings {
  userId: string;
}

function normalizeVisitVisibility(value: unknown): VisitVisibility {
  return value === 'private' ? 'private' : 'friends';
}

function normalizeRestaurantVisibility(value: unknown): RestaurantVisibility {
  return value === 'private' ? 'private' : 'friends';
}

function normalizeListVisibility(value: unknown): ListVisibility {
  return value === 'private' ? 'private' : 'friends';
}

export function mapUserSettings(record: UserSettingsRecord): UserSettings {
  const homeFeedDefaults = {
    homeFeedMode: record.defaultHomeFeedMode === 'friends' ? 'friends' : 'mine',
    homeFeedTypeFilter:
      record.defaultHomeFeedTypeFilter === 'all' || record.defaultHomeFeedTypeFilter === 'food-products'
        ? record.defaultHomeFeedTypeFilter
        : 'visits',
    homeFeedSort: record.defaultHomeFeedSort === 'tracked' ? 'tracked' : 'created',
  } as const;

  return {
    visitVisibility: normalizeVisitVisibility(record.defaultVisitVisibility),
    restaurantVisibility: normalizeRestaurantVisibility(record.defaultRestaurantVisibility),
    listVisibility: normalizeListVisibility(record.defaultListVisibility),
    notificationPreferences: mapNotificationPreferences(record as NotificationPreferencesRecord),
    ...homeFeedDefaults,
  };
}

function mapNotificationPreferences(
  record: NotificationPreferencesRecord | null | undefined,
): NotificationPreferences {
  return {
    notificationBillsEnabled: record?.bill_owed_enabled === false ? false : true,
    notificationMonthlyFriendsActivityEnabled:
      record?.monthly_friends_activity_enabled === false ? false : true,
    notificationTastingInvitesEnabled: record?.tasting_invites_enabled === false ? false : true,
  };
}

export async function getNotificationPreferences(
  userId: string,
  options?: { signal?: AbortSignal },
): Promise<NotificationPreferences> {
  const response = await listCollectionPage<NotificationPreferencesRecord>(
    'notification_preferences',
    {
      filter: `user = "${escapeFilterValue(userId)}"`,
      pageSize: 1,
      signal: options?.signal,
    },
  );
  return mapNotificationPreferences(response.items[0]);
}

async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
): Promise<NotificationPreferencesRecord> {
  const payload = buildNotificationPreferencesUpdate(preferences);
  const response = await listCollectionPage<NotificationPreferencesRecord>(
    'notification_preferences',
    {
      filter: `user = "${escapeFilterValue(userId)}"`,
      pageSize: 1,
    },
  );
  const existingRecordId = response.items[0]?.id;
  if (existingRecordId) {
    return updateCollectionRecord<NotificationPreferencesRecord>(
      'notification_preferences',
      existingRecordId,
      payload,
    );
  }

  return createCollectionRecord<NotificationPreferencesRecord>('notification_preferences', {
    user: userId,
    ...payload,
  });
}

function buildNotificationPreferencesUpdate(
  input: NotificationPreferences,
): Pick<
  FeatureOutboxOperationPayload<'settings.visibility.save'>,
  'bill_owed_enabled' | 'monthly_friends_activity_enabled' | 'tasting_invites_enabled'
> {
  return {
    bill_owed_enabled: input.notificationBillsEnabled,
    monthly_friends_activity_enabled: input.notificationMonthlyFriendsActivityEnabled,
    tasting_invites_enabled: input.notificationTastingInvitesEnabled,
  };
}

function buildUserSettingsRecordUpdate(
  settingsUpdate: Omit<FeatureOutboxOperationPayload<'settings.visibility.save'>, 'userId'>,
): Record<string, unknown> {
  return {
    defaultListVisibility: settingsUpdate.defaultListVisibility,
    defaultRestaurantVisibility: settingsUpdate.defaultRestaurantVisibility,
    defaultVisitVisibility: settingsUpdate.defaultVisitVisibility,
    defaultHomeFeedMode: settingsUpdate.defaultHomeFeedMode,
    defaultHomeFeedSort: settingsUpdate.defaultHomeFeedSort,
    defaultHomeFeedTypeFilter: settingsUpdate.defaultHomeFeedTypeFilter,
  };
}

function buildSettingsPreferencesUpdate(input: UserSettings): Omit<FeatureOutboxOperationPayload<'settings.visibility.save'>, 'userId'> {
  return {
    defaultListVisibility: input.listVisibility,
    defaultRestaurantVisibility: input.restaurantVisibility,
    defaultVisitVisibility: input.visitVisibility,
    ...buildNotificationPreferencesUpdate(input.notificationPreferences),
    ...buildHomeFeedDefaultsUpdate({
      homeFeedMode: input.homeFeedMode,
      homeFeedTypeFilter: input.homeFeedTypeFilter,
      homeFeedSort: input.homeFeedSort,
    }),
  };
}

export function useSettingsPreferencesWrites() {
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();

  const saveSettingsPreferences = useCallback(
    async (
      input: SaveSettingsPreferencesInput,
    ): Promise<OfflineAwareFeatureWriteResult<RecordModel & UserSettingsRecord>> => {
      const settingsUpdate = buildSettingsPreferencesUpdate(input);
      const result = await writeFeature({
        operationName: 'settings.visibility.save',
        trackOnlineWrite: false,
        offline: {
          strategy: 'outbox',
          payload: {
            userId: input.userId,
            ...settingsUpdate,
          },
        },
        execute: () =>
          updateCollectionRecord<RecordModel & UserSettingsRecord>(
            'users',
            input.userId,
            buildUserSettingsRecordUpdate(settingsUpdate),
          ).then(async (updatedUserRecord) => {
            await saveNotificationPreferences(input.userId, input.notificationPreferences);
            return updatedUserRecord;
          }),
      });

      if (result.status === 'queued') {
        const currentAuthRecord = getAuthRecord();
        if (currentAuthRecord) {
          saveAuthRecord({
            ...(currentAuthRecord as RecordModel),
            ...buildUserSettingsRecordUpdate(settingsUpdate),
          } as RecordModel);
        }

        queryClient.setQueryData(settingsQueryKeys.detail(input.userId), mapUserSettings(settingsUpdate));
        return result;
      }

      const nextSettings = mapUserSettings({
        ...result.result,
        ...buildNotificationPreferencesUpdate(input.notificationPreferences),
      });
      saveAuthRecord(result.result);
      queryClient.setQueryData(settingsQueryKeys.detail(input.userId), nextSettings);
      await invalidateSettingsQueries(queryClient, input.userId);
      return result;
    },
    [queryClient, writeFeature],
  );

  return {
    saveSettingsPreferences,
  };
}
