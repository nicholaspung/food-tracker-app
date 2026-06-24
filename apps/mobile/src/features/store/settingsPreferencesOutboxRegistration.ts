import type { RecordModel } from 'pocketbase';

import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import { createFeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
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
  payloadDecoders: {
    'settings.visibility.save': createFeatureOutboxPayloadDecoder('settings.visibility.save', [
      { key: 'userId', type: 'string' },
      { key: 'defaultVisitVisibility', type: 'string', allowedValues: ['friends', 'private'] },
      { key: 'defaultRestaurantVisibility', type: 'string', allowedValues: ['friends', 'private'] },
      { key: 'defaultListVisibility', type: 'string', allowedValues: ['friends', 'private'] },
      { key: 'tasting_invites_enabled', type: 'boolean' },
      { key: 'bill_owed_enabled', type: 'boolean' },
      { key: 'monthly_friends_activity_enabled', type: 'boolean' },
    ]),
  },
  replayAdapters: {
    'settings.visibility.save': replaySettingsPreferencesSave,
  },
});

async function replaySettingsPreferencesSave(
  settingsPayload: FeatureOutboxOperationPayloadMap['settings.visibility.save'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
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
