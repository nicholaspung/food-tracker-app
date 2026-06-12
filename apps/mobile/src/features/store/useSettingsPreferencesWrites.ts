import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RecordModel } from 'pocketbase';

import {
  type FeatureOutboxOperationPayload,
} from './featureOutboxOperations';
import {
  buildHomeFeedDefaultsUpdate,
} from './homeFeedPreferences';
import {
  getAuthRecord,
  saveAuthRecord,
  updateCollectionRecord,
} from './pocketbaseGateway';
import {
  saveNotificationPreferences,
  type NotificationPreferences,
} from './notificationPreferencesStore';
import {
  invalidateSettingsQueries,
  mapUserSettings,
  settingsQueryKeys,
  type UserSettings,
  type UserSettingsRecord,
} from './settingsQuery';
import {
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';

interface SaveSettingsPreferencesInput extends UserSettings {
  userId: string;
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
            await saveNotificationPreferences(input.notificationPreferences);
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
