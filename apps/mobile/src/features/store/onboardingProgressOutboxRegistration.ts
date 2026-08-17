import type { RecordModel } from 'pocketbase';
import type { QueryClient } from '@tanstack/react-query';

import {
  createFeatureOutboxDomainRegistration,
  type FeatureOutboxSuccessfulReplayOutcome,
} from './featureOutboxDomainRegistration';
import { createFeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  buildAddOnboardingCardDismissedState,
  buildMainOnboardingCompletedState,
  buildMoreOnboardingCardDismissedState,
  getMobileOnboardingState,
} from './onboardingStore';
import {
  getCollectionRecord,
  saveAuthRecord,
  updateCollectionRecord,
} from './pocketbaseGateway';
import { moreFeatureSignalQueryKeys } from './moreFeatureSignalsQuery';
import { profileQueryKeys } from './profileQuery';

export const ONBOARDING_PROGRESS_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'onboarding.main.complete',
    'onboarding.more-card.dismiss',
    'onboarding.add-card.dismiss',
  ] as const,
  payloadDecoders: {
    'onboarding.main.complete': createFeatureOutboxPayloadDecoder('onboarding.main.complete', [
      { key: 'userId', type: 'string' },
    ]),
    'onboarding.more-card.dismiss': createFeatureOutboxPayloadDecoder(
      'onboarding.more-card.dismiss',
      [
        { key: 'userId', type: 'string' },
        { key: 'cardId', type: 'string' },
      ],
    ),
    'onboarding.add-card.dismiss': createFeatureOutboxPayloadDecoder(
      'onboarding.add-card.dismiss',
      [
        { key: 'userId', type: 'string' },
        { key: 'cardId', type: 'string' },
      ],
    ),
  },
  replayAdapters: {
    'onboarding.main.complete': replayMainOnboardingComplete,
    'onboarding.more-card.dismiss': replayMoreOnboardingCardDismiss,
    'onboarding.add-card.dismiss': replayAddOnboardingCardDismiss,
  },
  replayCacheEffects: {
    'onboarding.main.complete': reconcileOnboardingReplayCaches,
    'onboarding.more-card.dismiss': reconcileOnboardingReplayCaches,
    'onboarding.add-card.dismiss': reconcileOnboardingReplayCaches,
  },
});

type OnboardingReplayOperationName =
  | 'onboarding.main.complete'
  | 'onboarding.more-card.dismiss'
  | 'onboarding.add-card.dismiss';

async function reconcileOnboardingReplayCaches(
  queryClient: QueryClient,
  _outcome: FeatureOutboxSuccessfulReplayOutcome<OnboardingReplayOperationName>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: moreFeatureSignalQueryKeys.summary }),
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.profile }),
  ]);
}

async function replayMainOnboardingComplete(
  onboardingPayload: FeatureOutboxOperationPayloadMap['onboarding.main.complete'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const currentRecord = await getCollectionRecord<RecordModel & { mobileOnboardingState?: unknown }>(
    'users',
    onboardingPayload.userId,
  );
  const updatedRecord = await updateCollectionRecord<RecordModel>(
    'users',
    onboardingPayload.userId,
    {
      mobileOnboardingState: buildMainOnboardingCompletedState(
        getMobileOnboardingState(currentRecord),
        {
          completedAt: onboardingPayload.completedAt,
          version: onboardingPayload.version,
        },
      ),
    },
    {
      headers: requestOptions.headers,
    },
  );
  saveAuthRecord(updatedRecord);
}

async function replayMoreOnboardingCardDismiss(
  onboardingPayload: FeatureOutboxOperationPayloadMap['onboarding.more-card.dismiss'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const currentRecord = await getCollectionRecord<RecordModel & { mobileOnboardingState?: unknown }>(
    'users',
    onboardingPayload.userId,
  );
  const updatedRecord = await updateCollectionRecord<RecordModel>(
    'users',
    onboardingPayload.userId,
    {
      mobileOnboardingState: buildMoreOnboardingCardDismissedState(
        getMobileOnboardingState(currentRecord),
        {
          cardId: onboardingPayload.cardId,
          dismissedAt: onboardingPayload.dismissedAt,
        },
      ),
    },
    {
      headers: requestOptions.headers,
    },
  );
  saveAuthRecord(updatedRecord);
}

async function replayAddOnboardingCardDismiss(
  onboardingPayload: FeatureOutboxOperationPayloadMap['onboarding.add-card.dismiss'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const currentRecord = await getCollectionRecord<RecordModel & { mobileOnboardingState?: unknown }>(
    'users',
    onboardingPayload.userId,
  );
  const updatedRecord = await updateCollectionRecord<RecordModel>(
    'users',
    onboardingPayload.userId,
    {
      mobileOnboardingState: buildAddOnboardingCardDismissedState(
        getMobileOnboardingState(currentRecord),
        {
          cardId: onboardingPayload.cardId,
          dismissedAt: onboardingPayload.dismissedAt,
        },
      ),
    },
    {
      headers: requestOptions.headers,
    },
  );
  saveAuthRecord(updatedRecord);
}
