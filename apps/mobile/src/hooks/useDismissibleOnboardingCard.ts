import { useCallback, useState } from 'react';

import type { OfflineAwareFeatureWriteResult } from '../features/store/useOfflineAwareFeatureWrite';
import type { MobileOnboardingState } from '../types/auth';

export interface DismissibleOnboardingCardInput<TCardId extends string> {
  cardId: TCardId;
  dismissedAt: string;
}

interface UseDismissibleOnboardingCardOptions<TCardId extends string, TResult> {
  cardId: TCardId;
  currentOnboardingState: MobileOnboardingState | null | undefined;
  dismissCard: (input: {
    cardId: TCardId;
    currentOnboardingState: MobileOnboardingState | null | undefined;
    dismissedAt: string;
    userId: string;
  }) => Promise<OfflineAwareFeatureWriteResult<TResult>>;
}

export function useDismissibleOnboardingCard<TCardId extends string, TResult>({
  cardId,
  currentOnboardingState,
  dismissCard,
}: UseDismissibleOnboardingCardOptions<TCardId, TResult>) {
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
        return await dismissCard({
          ...input,
          currentOnboardingState,
          userId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not update onboarding.';
        setErrorMessage(message);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      cardId,
      currentOnboardingState,
      dismissCard,
    ],
  );

  return {
    dismiss,
    errorMessage,
    isSubmitting,
    setErrorMessage,
  };
}
