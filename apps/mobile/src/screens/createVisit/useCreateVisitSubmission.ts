import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import {
  type MonthlyUsageSnapshot,
} from '../../features';
import {
  submitCreateVisit,
  submitEditVisit,
} from '../../features/visitSubmission/createVisitSubmissionLifecycle';
import { useVisitWrites } from '../../features/store/useVisitWrites';
import { useWriteTelemetry } from '../../features/store/useWriteTelemetry';
import {
  type CreateVisitNavigationProp,
  type DraftVisitItem,
  type VisitVisibility,
} from './shared';

interface UseCreateVisitSubmissionParams {
  draftItems: DraftVisitItem[];
  editVisitId?: string;
  hasDeletedPersistedVisitItem: boolean;
  isDisplayFreeUser: boolean;
  isEditMode: boolean;
  isOnline?: boolean;
  monthlyUsageSnapshot: MonthlyUsageSnapshot | null;
  navigation: CreateVisitNavigationProp;
  queryClient: QueryClient;
  restaurantId: string | null;
  restaurantName: string;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setSourceListItemId: Dispatch<SetStateAction<string | null>>;
  onSubmitSucceeded?: () => void;
  shouldEnforceUsageLimitsClientSide: boolean;
  sourceNoteId?: string;
  sourceListItemId: string | null;
  visitDate: string;
  visitVisibility: VisitVisibility;
}

export function useCreateVisitSubmission({
  draftItems,
  editVisitId,
  hasDeletedPersistedVisitItem,
  isDisplayFreeUser,
  isEditMode,
  isOnline,
  monthlyUsageSnapshot,
  navigation,
  queryClient,
  restaurantId,
  restaurantName,
  setErrorMessage,
  setSourceListItemId,
  onSubmitSucceeded,
  shouldEnforceUsageLimitsClientSide,
  sourceNoteId,
  sourceListItemId,
  visitDate,
  visitVisibility,
}: UseCreateVisitSubmissionParams) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trackWriteTelemetry = useWriteTelemetry();
  const visitWrites = useVisitWrites();
  const isCurrentlyOnline = isOnline ?? false;

  const navigateAfterEdit = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Home');
  }, [navigation]);

  const submitVisit = useCallback(async () => {
    if (!isEditMode) {
      setErrorMessage(null);
      setIsSubmitting(true);

      try {
        const result = await submitCreateVisit({
          draftItems,
          isDisplayFreeUser,
          isOnline: isCurrentlyOnline,
          monthlyUsageSnapshot,
          queryClient,
          restaurantId,
          restaurantName,
          shouldEnforceUsageLimitsClientSide,
          sourceListItemId,
          sourceNoteId,
          trackWriteTelemetry,
          visitDate,
          visitVisibility,
          visitWrites,
        });

        if (!('destination' in result)) {
          setErrorMessage(result.errorMessage);
          return;
        }

        if (result.clearSourceListItemId) {
          setSourceListItemId(null);
        }
        onSubmitSucceeded?.();
        if (result.destination.params) {
          navigation.navigate(result.destination.name, result.destination.params);
          return;
        }
        navigation.navigate(result.destination.name);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await submitEditVisit({
        draftItems,
        hasDeletedPersistedVisitItem,
        isOnline: isCurrentlyOnline,
        restaurantId,
        restaurantName,
        sourceListItemId,
        sourceNoteId,
        visitDate,
        visitId: editVisitId,
        visitVisibility,
        visitWrites,
      });

      if (!('navigationIntent' in result)) {
        setErrorMessage(result.errorMessage);
        return;
      }

      onSubmitSucceeded?.();
      navigateAfterEdit();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save visit.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    draftItems,
    editVisitId,
    hasDeletedPersistedVisitItem,
    isDisplayFreeUser,
    isEditMode,
    isCurrentlyOnline,
    monthlyUsageSnapshot,
    navigation,
    navigateAfterEdit,
    queryClient,
    restaurantId,
    restaurantName,
    setErrorMessage,
    setSourceListItemId,
    onSubmitSucceeded,
    shouldEnforceUsageLimitsClientSide,
    sourceNoteId,
    sourceListItemId,
    trackWriteTelemetry,
    visitWrites,
    visitDate,
    visitVisibility,
  ]);

  return {
    isSubmitting,
    submitVisit,
  };
}
