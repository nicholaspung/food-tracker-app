import { useCallback, useState } from 'react';

import { saveOptimisticMobileOnboardingState } from '../features';
import {
  type FeatureOutboxOperationName,
  type FeatureOutboxOperationPayload,
} from '../features/store/featureOutboxOperations';
import {
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from '../features/store/useOfflineAwareFeatureWrite';
import type { MobileOnboardingState } from '../types/auth';

interface DismissibleOnboardingCardInput<TCardId extends string> {
  cardId: TCardId;
  dismissedAt: string;
}

interface UseDismissibleOnboardingCardOptions<
  TCardId extends string,
  TName extends FeatureOutboxOperationName,
  TResult,
> {
  buildOptimisticState: (
    currentState: MobileOnboardingState | null | undefined,
    input: DismissibleOnboardingCardInput<TCardId>,
  ) => MobileOnboardingState;
  cardId: TCardId;
  createOfflinePayload: (
    userId: string,
    input: DismissibleOnboardingCardInput<TCardId>,
  ) => FeatureOutboxOperationPayload<TName>;
  currentOnboardingState: MobileOnboardingState | null | undefined;
  dismissCard: (
    userId: string,
    input: DismissibleOnboardingCardInput<TCardId>,
  ) => Promise<TResult>;
  operationName: TName;
}

export function useDismissibleOnboardingCard<
  TCardId extends string,
  TName extends FeatureOutboxOperationName,
  TResult,
>({
  buildOptimisticState,
  cardId,
  createOfflinePayload,
  currentOnboardingState,
  dismissCard,
  operationName,
}: UseDismissibleOnboardingCardOptions<TCardId, TName, TResult>) {
  const writeFeature = useOfflineAwareFeatureWrite();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dismiss = useCallback(
    async (userId: string): Promise<OfflineAwareFeatureWriteResult<TResult> | null> => {
      if (!userId) {
        setErrorMessage('Please sign in again to update onboarding.');
        return null;
      }

      setErrorMessage(null);
      setIsSubmitting(true);
      const dismissedAt = new Date().toISOString();
      const input = { cardId, dismissedAt };

      try {
        const saveResult = await writeFeature({
          operationName,
          trackOnlineWrite: false,
          offline: {
            strategy: 'outbox',
            payload: createOfflinePayload(userId, input),
          },
          execute: () => dismissCard(userId, input),
        });

        if (saveResult.status === 'queued') {
          saveOptimisticMobileOnboardingState(
            buildOptimisticState(currentOnboardingState, input),
          );
        }

        return saveResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not update onboarding.';
        setErrorMessage(message);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      buildOptimisticState,
      cardId,
      createOfflinePayload,
      currentOnboardingState,
      dismissCard,
      operationName,
      writeFeature,
    ],
  );

  return {
    dismiss,
    errorMessage,
    isSubmitting,
    setErrorMessage,
  };
}
