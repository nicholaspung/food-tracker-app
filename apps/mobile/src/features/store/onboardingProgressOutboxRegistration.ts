import type { RecordModel } from 'pocketbase';

import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
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

export const ONBOARDING_PROGRESS_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'onboarding.main.complete',
    'onboarding.more-card.dismiss',
    'onboarding.add-card.dismiss',
  ] as const,
  replayAdapters: {
    'onboarding.main.complete': replayMainOnboardingComplete,
    'onboarding.more-card.dismiss': replayMoreOnboardingCardDismiss,
    'onboarding.add-card.dismiss': replayAddOnboardingCardDismiss,
  },
});

async function replayMainOnboardingComplete(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const onboardingPayload = payload as FeatureOutboxOperationPayloadMap['onboarding.main.complete'];
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
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const onboardingPayload = payload as FeatureOutboxOperationPayloadMap['onboarding.more-card.dismiss'];
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
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const onboardingPayload = payload as FeatureOutboxOperationPayloadMap['onboarding.add-card.dismiss'];
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
