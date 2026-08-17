import { useCallback } from 'react';
import type { RecordModel } from 'pocketbase';

import {
  type AddOnboardingCardId,
  type MobileOnboardingState,
  type MoreOnboardingCardId,
} from '../../types/auth';
import {
  buildAddOnboardingCardDismissedState,
  buildMainOnboardingCompletedState,
  buildMoreOnboardingCardDismissedState,
  completeMainOnboarding as completeMainOnboardingRecord,
  dismissAddOnboardingCard as dismissAddOnboardingCardRecord,
  dismissMoreOnboardingCard as dismissMoreOnboardingCardRecord,
  MAIN_ONBOARDING_VERSION,
  saveOptimisticMobileOnboardingState,
  type CompleteMainOnboardingInput,
  type DismissAddOnboardingCardInput,
  type DismissMoreOnboardingCardInput,
} from './onboardingStore';
import {
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';

interface CompleteMainOnboardingWriteInput extends CompleteMainOnboardingInput {
  currentOnboardingState: MobileOnboardingState | null | undefined;
  userId: string;
}

interface DismissAddOnboardingCardWriteInput extends DismissAddOnboardingCardInput {
  currentOnboardingState: MobileOnboardingState | null | undefined;
  userId: string;
}

interface DismissMoreOnboardingCardWriteInput extends DismissMoreOnboardingCardInput {
  currentOnboardingState: MobileOnboardingState | null | undefined;
  userId: string;
}

export function useOnboardingProgressWrites() {
  const writeFeature = useOfflineAwareFeatureWrite();

  const completeMainOnboarding = useCallback(
    async ({
      completedAt,
      currentOnboardingState,
      userId,
      version = MAIN_ONBOARDING_VERSION,
    }: CompleteMainOnboardingWriteInput): Promise<OfflineAwareFeatureWriteResult<RecordModel>> => {
      const input = {
        completedAt,
        version,
      };
      const result = await writeFeature({
        operationName: 'onboarding.main.complete',
        trackOnlineWrite: false,
        offline: {
          strategy: 'outbox',
          payload: {
            userId,
            ...input,
          },
        },
        execute: completeMainOnboardingRecord.bind(null, userId, input),
      });

      if (result.status === 'queued') {
        saveOptimisticMobileOnboardingState(
          buildMainOnboardingCompletedState(currentOnboardingState, input),
        );
      }

      return result;
    },
    [writeFeature],
  );

  const dismissAddOnboardingCard = useCallback(
    async ({
      cardId,
      currentOnboardingState,
      dismissedAt,
      userId,
    }: DismissAddOnboardingCardWriteInput): Promise<OfflineAwareFeatureWriteResult<RecordModel>> => {
      const input = {
        cardId,
        dismissedAt,
      };
      const result = await writeFeature({
        operationName: 'onboarding.add-card.dismiss',
        trackOnlineWrite: false,
        offline: {
          strategy: 'outbox',
          payload: {
            userId,
            cardId,
            dismissedAt,
          },
        },
        execute: dismissAddOnboardingCardRecord.bind(null, userId, input),
      });

      if (result.status === 'queued') {
        saveOptimisticMobileOnboardingState(
          buildAddOnboardingCardDismissedState(currentOnboardingState, input),
        );
      }

      return result;
    },
    [writeFeature],
  );

  const dismissMoreOnboardingCard = useCallback(
    async ({
      cardId,
      currentOnboardingState,
      dismissedAt,
      userId,
    }: DismissMoreOnboardingCardWriteInput): Promise<OfflineAwareFeatureWriteResult<RecordModel>> => {
      const input = {
        cardId,
        dismissedAt,
      };
      const result = await writeFeature({
        operationName: 'onboarding.more-card.dismiss',
        trackOnlineWrite: false,
        offline: {
          strategy: 'outbox',
          payload: {
            userId,
            cardId,
            dismissedAt,
          },
        },
        execute: dismissMoreOnboardingCardRecord.bind(null, userId, input),
      });

      if (result.status === 'queued') {
        saveOptimisticMobileOnboardingState(
          buildMoreOnboardingCardDismissedState(currentOnboardingState, input),
        );
      }

      return result;
    },
    [writeFeature],
  );

  return {
    completeMainOnboarding,
    dismissAddOnboardingCard,
    dismissMoreOnboardingCard,
  };
}

export type OnboardingProgressWrites = ReturnType<typeof useOnboardingProgressWrites>;
export type OnboardingProgressAddDismissInput = {
  cardId: AddOnboardingCardId;
  dismissedAt: string;
};
export type OnboardingProgressMoreDismissInput = {
  cardId: MoreOnboardingCardId;
  dismissedAt: string;
};
