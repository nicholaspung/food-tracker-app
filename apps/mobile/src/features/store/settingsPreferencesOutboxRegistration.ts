import type { RecordModel } from 'pocketbase';

import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  buildHomeFeedDefaultsUpdate,
  mapHomeFeedDefaultsFromRecord,
} from './homeFeedPreferences';
import { saveNotificationPreferences } from './notificationPreferencesStore';
import {
  saveAuthRecord,
  updateCollectionRecord,
} from './pocketbaseGateway';

export const SETTINGS_PREFERENCES_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: ['settings.visibility.save'] as const,
  replayAdapters: {
    'settings.visibility.save': replaySettingsPreferencesSave,
  },
});

async function replaySettingsPreferencesSave(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const settingsPayload = payload as FeatureOutboxOperationPayloadMap['settings.visibility.save'];
  const homeFeedDefaultsUpdate = buildHomeFeedDefaultsUpdate(
    mapHomeFeedDefaultsFromRecord(settingsPayload),
  );
  const updatedRecord = await updateCollectionRecord<RecordModel>(
    'users',
    settingsPayload.userId,
    {
      defaultListVisibility: settingsPayload.defaultListVisibility,
      defaultRestaurantVisibility: settingsPayload.defaultRestaurantVisibility,
      defaultVisitVisibility: settingsPayload.defaultVisitVisibility,
      ...homeFeedDefaultsUpdate,
    },
    {
      headers: requestOptions.headers,
    },
  );
  await replayNotificationPreferencesSave(settingsPayload, requestOptions);
  saveAuthRecord(updatedRecord);
}

async function replayNotificationPreferencesSave(
  settingsPayload: FeatureOutboxOperationPayloadMap['settings.visibility.save'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await saveNotificationPreferences(
    {
      notificationBillsEnabled: settingsPayload.bill_owed_enabled,
      notificationMonthlyFriendsActivityEnabled: settingsPayload.monthly_friends_activity_enabled,
      notificationTastingInvitesEnabled: settingsPayload.tasting_invites_enabled,
    },
    requestOptions,
  );
}
