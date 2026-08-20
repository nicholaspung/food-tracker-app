import type { RecordModel } from 'pocketbase';
import type { QueryClient } from '@tanstack/react-query';

import {
  createFeatureOutboxDomainRegistration,
  getReplayIdentityString,
  pickFeatureOutboxReplayIdentity,
  type FeatureOutboxSuccessfulReplayOutcome,
} from './featureOutboxDomainRegistration';
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
import { profileQueryKeys } from './profileQuery';
import { invalidateSettingsQueries } from './settingsQuery';

const decodeLegacySettingsPreferences = createFeatureOutboxPayloadDecoder(
  'settings.visibility.save',
  [
    { key: 'userId', type: 'string' },
    { key: 'defaultVisitVisibility', type: 'string', allowedValues: ['friends', 'private'] },
    { key: 'defaultRestaurantVisibility', type: 'string', allowedValues: ['friends', 'private'] },
    { key: 'defaultListVisibility', type: 'string', allowedValues: ['friends', 'private'] },
    { key: 'tasting_invites_enabled', type: 'boolean' },
    { key: 'bill_owed_enabled', type: 'boolean' },
    { key: 'monthly_friends_activity_enabled', type: 'boolean' },
  ],
);

export const SETTINGS_PREFERENCES_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: ['settings.visibility.save'] as const,
  legacyPayloadPolicy: 'decode-as-current',
  legacyPayloadDecoders: {
    'settings.visibility.save': (payload) => {
      const decoded = decodeLegacySettingsPreferences(payload);
      if (decoded.status !== 'ok') {
        return decoded;
      }

      const defaults = mapHomeFeedDefaultsFromRecord(decoded.payload);
      return {
        status: 'ok',
        payload: {
          ...decoded.payload,
          defaultHomeFeedMode: defaults.homeFeedMode,
          defaultHomeFeedTypeFilter: defaults.homeFeedTypeFilter,
          defaultHomeFeedSort: defaults.homeFeedSort,
        },
      };
    },
  },
  payloadDecoders: {
    'settings.visibility.save': createFeatureOutboxPayloadDecoder('settings.visibility.save', [
      { key: 'userId', type: 'string' },
      { key: 'defaultVisitVisibility', type: 'string', allowedValues: ['friends', 'private'] },
      { key: 'defaultRestaurantVisibility', type: 'string', allowedValues: ['friends', 'private'] },
      { key: 'defaultListVisibility', type: 'string', allowedValues: ['friends', 'private'] },
      { key: 'tasting_invites_enabled', type: 'boolean' },
      { key: 'bill_owed_enabled', type: 'boolean' },
      { key: 'monthly_friends_activity_enabled', type: 'boolean' },
      {
        key: 'defaultHomeFeedMode',
        type: 'string',
        allowedValues: ['mine', 'friends'],
      },
      {
        key: 'defaultHomeFeedTypeFilter',
        type: 'string',
        allowedValues: ['all', 'visits', 'food-products'],
      },
      {
        key: 'defaultHomeFeedSort',
        type: 'string',
        allowedValues: ['created', 'tracked'],
      },
    ]),
  },
  replayAdapters: {
    'settings.visibility.save': replaySettingsPreferencesSave,
  },
  replayIdentityResolvers: {
    'settings.visibility.save': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['userId']),
  },
  replayCacheEffects: {
    'settings.visibility.save': reconcileSettingsReplayCaches,
  },
});

async function reconcileSettingsReplayCaches(
  queryClient: QueryClient,
  outcome: FeatureOutboxSuccessfulReplayOutcome<'settings.visibility.save'>,
): Promise<void> {
  await Promise.all([
    invalidateSettingsQueries(
      queryClient,
      getReplayIdentityString(outcome, 'userId') ?? outcome.originAccountId,
    ),
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.profile }),
  ]);
}

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
