import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import {
  createVisit,
  formatLimitExceededMessage,
  linkVisitToListBookmark,
  parseLimitExceededError,
  restaurantListQueryKeys,
  updateVisit,
  type MonthlyUsageSnapshot,
  type UpdateVisitInput,
} from '../../features';
import {
  createVisitApiMutationInput,
  updateVisitApiMutationInput,
} from '../../features/store/featureOutboxOperations';
import type {
  FeatureOutboxOperationName,
  FeatureOutboxOperationPayload,
} from '../../features/store/featureOutboxOperations';
import type { EnqueueMutationInput } from '../../offline/types';
import { isValidLocalDate, localDateStringToUTC } from '../../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import { trackObservabilityEvent } from '../../observability';
import {
  FREE_MONTHLY_PHOTO_LIMIT,
  type CreateVisitNavigationProp,
  type DraftVisitItem,
  type VisitVisibility,
} from './shared';

type QueueFeatureOutbox = <TName extends FeatureOutboxOperationName>(
  operationName: TName,
  payload: FeatureOutboxOperationPayload<TName>,
) => Promise<void>;

interface UseCreateVisitSubmissionParams {
  draftItems: DraftVisitItem[];
  editVisitId?: string;
  isDisplayFreeUser: boolean;
  isEditMode: boolean;
  isOnline: boolean;
  monthlyUsageSnapshot: MonthlyUsageSnapshot | null;
  navigation: CreateVisitNavigationProp;
  queryClient: QueryClient;
  queueFeatureApiMutation: (input: EnqueueMutationInput) => Promise<unknown>;
  queueFeatureOutbox: QueueFeatureOutbox;
  queueWrite: (operationName: string) => Promise<void>;
  restaurantId: string | null;
  restaurantName: string;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setSourceListItemId: Dispatch<SetStateAction<string | null>>;
  shouldEnforceUsageLimitsClientSide: boolean;
  sourceNoteId?: string;
  sourceListItemId: string | null;
  visitDate: string;
  visitVisibility: VisitVisibility;
}

export function useCreateVisitSubmission({
  draftItems,
  editVisitId,
  isDisplayFreeUser,
  isEditMode,
  isOnline,
  monthlyUsageSnapshot,
  navigation,
  queryClient,
  queueFeatureApiMutation,
  queueFeatureOutbox,
  queueWrite,
  restaurantId,
  restaurantName,
  setErrorMessage,
  setSourceListItemId,
  shouldEnforceUsageLimitsClientSide,
  sourceNoteId,
  sourceListItemId,
  visitDate,
  visitVisibility,
}: UseCreateVisitSubmissionParams) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const invalidateVisitQueries = useCallback(
    async (options?: { visitId?: string; includeUsage?: boolean; sourceNoteId?: string }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'visits'] }),
        queryClient.invalidateQueries({
          queryKey: ['feature', 'restaurants', 'visitStats'],
        }),
        ...(options?.visitId
          ? [
              queryClient.invalidateQueries({
                queryKey: ['feature', 'visit', options.visitId],
              }),
            ]
          : []),
        ...(options?.includeUsage
          ? [
              queryClient.invalidateQueries({
                queryKey: ['feature', 'usage', 'monthly'],
              }),
            ]
          : []),
        ...(options?.sourceNoteId
          ? [
              queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
              queryClient.invalidateQueries({
                queryKey: ['feature', 'note', options.sourceNoteId],
              }),
            ]
          : []),
      ]);
    },
    [queryClient],
  );

  const navigateAfterEdit = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Home');
  }, [navigation]);

  const submitVisit = useCallback(async () => {
    const trimmedRestaurant = restaurantName.trim();
    const trimmedVisitDate = visitDate.trim();

    if (!trimmedRestaurant) {
      setErrorMessage('Select a restaurant before continuing.');
      return;
    }

    if (draftItems.length === 0) {
      setErrorMessage('Add at least one item.');
      return;
    }

    if (!isValidLocalDate(trimmedVisitDate)) {
      setErrorMessage('Visit date must be in YYYY-MM-DD format.');
      return;
    }

    const parsedItems = draftItems.map((item) => ({
      id: item.id,
      name: item.name,
      rating: item.rating,
      description: item.description.trim() || undefined,
      notes: item.notes.trim() || undefined,
      photos: item.photos,
    }));

    if (parsedItems.some((item) => item.rating < 1 || item.rating > 5)) {
      setErrorMessage('Ratings must be between 1 and 5.');
      return;
    }

    if (
      shouldEnforceUsageLimitsClientSide &&
      isDisplayFreeUser &&
      monthlyUsageSnapshot
    ) {
      const photosInSubmission = parsedItems.reduce(
        (totalCount, item) => totalCount + item.photos.length,
        0,
      );
      const estimatedTotalAfterSubmit =
        monthlyUsageSnapshot.usage.photoUploads + photosInSubmission;
      if (estimatedTotalAfterSubmit > FREE_MONTHLY_PHOTO_LIMIT) {
        const remaining = Math.max(
          FREE_MONTHLY_PHOTO_LIMIT - monthlyUsageSnapshot.usage.photoUploads,
          0,
        );
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'client_estimate',
          limit: FREE_MONTHLY_PHOTO_LIMIT,
          metric: 'photo_uploads',
          remaining,
          source: 'CreateVisitScreen',
          used: monthlyUsageSnapshot.usage.photoUploads,
        });
        setErrorMessage(
          `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`,
        );
        return;
      }
    }

    const visitInput = {
      restaurantId: restaurantId?.trim() || undefined,
      restaurantName: trimmedRestaurant,
      items: parsedItems,
      visitedAt: localDateStringToUTC(trimmedVisitDate),
      visibility: visitVisibility,
      source: 'visit' as const,
      sourceNoteId,
    };
    const hasPhotoUploads = parsedItems.some((item) => item.photos.length > 0);

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (isEditMode && editVisitId) {
        const visitUpdateInput: UpdateVisitInput = {
          restaurantId: restaurantId?.trim() || undefined,
          restaurantName: trimmedRestaurant,
          items: parsedItems.map((item) => ({
            id: item.id,
            name: item.name,
            rating: item.rating,
            description: item.description,
            notes: item.notes,
          })),
          visitedAt: localDateStringToUTC(trimmedVisitDate),
          visibility: visitVisibility,
        };

        if (!isOnline) {
          await queueFeatureApiMutation(
            updateVisitApiMutationInput(editVisitId, visitUpdateInput),
          );
          await invalidateVisitQueries({ visitId: editVisitId });
          showQueuedOfflineAlert('Visit update');
          navigateAfterEdit();
          return;
        }

        await queueWrite('visit.update');
        await updateVisit(editVisitId, visitUpdateInput);
        await invalidateVisitQueries({ visitId: editVisitId });
        navigateAfterEdit();
        return;
      }

      if (!isOnline) {
        if (hasPhotoUploads || sourceNoteId) {
          await queueFeatureOutbox('visit.create', visitInput);
        } else {
          await queueFeatureApiMutation(createVisitApiMutationInput(visitInput));
        }
        setSourceListItemId(null);
        await invalidateVisitQueries({ sourceNoteId });
        showQueuedOfflineAlert('Visit');
        navigation.navigate('Home');
        return;
      }

      await queueWrite('visit.create');
      const createdVisit = await createVisit(visitInput);

      if (sourceListItemId && createdVisit.items.length > 0) {
        const createdItemId = createdVisit.items[0]?.id;
        if (createdItemId) {
          try {
            await queueWrite('list.bookmark.link-visit');
            await linkVisitToListBookmark({
              listItemId: sourceListItemId,
              userFoodItemId: createdItemId,
            });
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: restaurantListQueryKeys.itemsRoot,
              }),
              queryClient.invalidateQueries({
                queryKey: restaurantListQueryKeys.detailRoot,
              }),
            ]);
          } catch {
            // Keep visit creation successful even when link-back fails.
          }
        }
      }
      setSourceListItemId(null);

      trackObservabilityEvent('Visit Creation Completed', {
        creationMethod: 'manual',
        hasNotes: parsedItems.some((item) => Boolean(item.notes)),
        hasPhotos: parsedItems.some((item) => item.photos.length > 0),
        itemCount: parsedItems.length,
        source: 'CreateVisitScreen',
        visitVisibility,
      });

      await invalidateVisitQueries({ includeUsage: true, sourceNoteId });
      navigation.navigate('Home');
    } catch (error) {
      const limitPayload = parseLimitExceededError(error);
      if (limitPayload) {
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'server',
          limit: limitPayload.limit,
          metric: limitPayload.metric,
          monthKey: limitPayload.monthKey,
          remaining: limitPayload.remaining,
          source: 'CreateVisitScreen',
          used: limitPayload.used,
          userTier: limitPayload.userTier ?? null,
        });
      }
      const message = limitPayload
        ? formatLimitExceededMessage(limitPayload)
        : error instanceof Error
          ? error.message
          : 'Could not save visit.';
      setErrorMessage(message);
      trackObservabilityEvent('Visit Creation Failed', {
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        source: 'CreateVisitScreen',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    draftItems,
    editVisitId,
    invalidateVisitQueries,
    isDisplayFreeUser,
    isEditMode,
    isOnline,
    monthlyUsageSnapshot,
    navigation,
    navigateAfterEdit,
    queryClient,
    queueFeatureApiMutation,
    queueFeatureOutbox,
    queueWrite,
    restaurantId,
    restaurantName,
    setErrorMessage,
    setSourceListItemId,
    shouldEnforceUsageLimitsClientSide,
    sourceNoteId,
    sourceListItemId,
    visitDate,
    visitVisibility,
  ]);

  return {
    isSubmitting,
    submitVisit,
  };
}
