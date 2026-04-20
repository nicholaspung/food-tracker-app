import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import {
  createVisit,
  formatLimitExceededMessage,
  homeFeedQueryKeys,
  linkVisitToListBookmark,
  markNoteUsed,
  parseLimitExceededError,
  promoteCachedNoteToUsed,
  restaurantListQueryKeys,
  updateVisit,
  type MonthlyUsageSnapshot,
  type UpdateVisitInput,
} from '../../features';
import {
  createVisitApiMutationInput,
} from '../../features/store/featureOutboxOperations';
import { notesQueryKeys } from '../../features/store/notesQuery';
import type { OfflineAwareFeatureWrite } from '../../features/store/useOfflineAwareFeatureWrite';
import { useWriteTelemetry } from '../../features/store/useWriteTelemetry';
import { isValidLocalDate, localDateStringToUTC } from '../../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import { trackObservabilityEvent } from '../../observability';
import {
  FREE_MONTHLY_PHOTO_LIMIT,
  type CreateVisitNavigationProp,
  type DraftVisitItem,
  type VisitVisibility,
} from './shared';

interface UseCreateVisitSubmissionParams {
  draftItems: DraftVisitItem[];
  editVisitId?: string;
  isDisplayFreeUser: boolean;
  isEditMode: boolean;
  monthlyUsageSnapshot: MonthlyUsageSnapshot | null;
  navigation: CreateVisitNavigationProp;
  queryClient: QueryClient;
  restaurantId: string | null;
  restaurantName: string;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setSourceListItemId: Dispatch<SetStateAction<string | null>>;
  shouldEnforceUsageLimitsClientSide: boolean;
  sourceNoteId?: string;
  sourceListItemId: string | null;
  visitDate: string;
  visitVisibility: VisitVisibility;
  writeFeature: OfflineAwareFeatureWrite;
}

export function useCreateVisitSubmission({
  draftItems,
  editVisitId,
  isDisplayFreeUser,
  isEditMode,
  monthlyUsageSnapshot,
  navigation,
  queryClient,
  restaurantId,
  restaurantName,
  setErrorMessage,
  setSourceListItemId,
  shouldEnforceUsageLimitsClientSide,
  sourceNoteId,
  sourceListItemId,
  visitDate,
  visitVisibility,
  writeFeature,
}: UseCreateVisitSubmissionParams) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trackWriteTelemetry = useWriteTelemetry();

  const invalidateVisitQueries = useCallback(
    async (options?: {
      visitId?: string;
      includeUsage?: boolean;
      includeVisitPhotos?: boolean;
      sourceNoteId?: string;
    }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: homeFeedQueryKeys.root }),
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
        ...(options?.includeVisitPhotos
          ? [
              queryClient.invalidateQueries({
                queryKey: ['feature', 'visitPhotos'],
              }),
              ...(options.visitId
                ? [
                    queryClient.invalidateQueries({
                      queryKey: ['feature', 'visitPhotos', 'visit', options.visitId],
                    }),
                  ]
                : []),
            ]
          : []),
        ...(options?.sourceNoteId
          ? [
              queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
              queryClient.invalidateQueries({
                queryKey: ['feature', 'note', options.sourceNoteId],
              }),
              queryClient.invalidateQueries({
                queryKey: notesQueryKeys.detail(options.sourceNoteId),
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
      newPhotos: item.photos.flatMap((photo) =>
        photo.kind === 'new' ? [photo.upload] : [],
      ),
      deletePhotoIds: item.deletedPhotoIds,
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
        (totalCount, item) => totalCount + item.newPhotos.length,
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
      items: parsedItems.map((item) => ({
        name: item.name,
        rating: item.rating,
        description: item.description,
        notes: item.notes,
        photos: item.newPhotos,
      })),
      visitedAt: localDateStringToUTC(trimmedVisitDate),
      visibility: visitVisibility,
      source: 'visit' as const,
      sourceNoteId,
    };
    const hasPhotoUploads = parsedItems.some((item) => item.newPhotos.length > 0);

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const noteUsedAt = sourceNoteId ? new Date().toISOString() : null;
      if (isEditMode && editVisitId) {
        const hasNewPhotoUploads = parsedItems.some(
          (item) => item.newPhotos.length > 0,
        );
        const hasPhotoChanges =
          hasNewPhotoUploads ||
          parsedItems.some((item) => item.deletePhotoIds.length > 0);
        const visitUpdateInput: UpdateVisitInput = {
          restaurantId: restaurantId?.trim() || undefined,
          restaurantName: trimmedRestaurant,
          items: parsedItems.map((item) => ({
            id: item.id,
            name: item.name,
            rating: item.rating,
            description: item.description,
            notes: item.notes,
            newPhotos: item.newPhotos,
            deletePhotoIds: item.deletePhotoIds,
          })),
          visitedAt: localDateStringToUTC(trimmedVisitDate),
          visibility: visitVisibility,
        };

        const updateResult = await writeFeature({
          operationName: 'visit.update',
          offline: {
            strategy: 'outbox',
            payload: {
              visitId: editVisitId,
              updates: visitUpdateInput,
            },
          },
          execute: () => updateVisit(editVisitId, visitUpdateInput),
        });

        if (updateResult.status === 'queued') {
          await invalidateVisitQueries({
            visitId: editVisitId,
            includeUsage: hasNewPhotoUploads,
            includeVisitPhotos: hasPhotoChanges,
          });
          showQueuedOfflineAlert('Visit update');
          navigateAfterEdit();
          return;
        }

        await invalidateVisitQueries({
          visitId: editVisitId,
          includeUsage: hasNewPhotoUploads,
          includeVisitPhotos: hasPhotoChanges,
        });
        navigateAfterEdit();
        return;
      }

      const createResult = hasPhotoUploads || sourceNoteId
        ? await writeFeature({
            operationName: 'visit.create',
            offline: {
              strategy: 'outbox',
              payload: visitInput,
            },
            execute: () => createVisit(visitInput),
          })
        : await writeFeature({
            operationName: 'visit.create',
            offline: {
              strategy: 'api',
              input: createVisitApiMutationInput(visitInput),
            },
            execute: () => createVisit(visitInput),
          });

      if (createResult.status === 'queued') {
        if (sourceNoteId && noteUsedAt) {
          await writeFeature({
            operationName: 'note.mark-used',
            trackOnlineWrite: false,
            offline: {
              strategy: 'outbox',
              payload: {
                noteId: sourceNoteId,
                usedAt: noteUsedAt,
              },
            },
            execute: () =>
              markNoteUsed({
                noteId: sourceNoteId,
                usedAt: noteUsedAt,
              }),
          });
          promoteCachedNoteToUsed(queryClient, {
            noteId: sourceNoteId,
            usedAt: noteUsedAt,
          });
        }

        setSourceListItemId(null);
        await invalidateVisitQueries({ sourceNoteId });
        showQueuedOfflineAlert('Visit');
        navigation.navigate('Home');
        return;
      }

      const createdVisit = createResult.result;

      if (sourceListItemId && createdVisit.items.length > 0) {
        const createdItemId = createdVisit.items[0]?.id;
        if (createdItemId) {
          try {
            await trackWriteTelemetry('list.bookmark.link-visit');
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
        hasPhotos: parsedItems.some((item) => item.newPhotos.length > 0),
        itemCount: parsedItems.length,
        source: 'CreateVisitScreen',
        visitVisibility,
      });

      if (sourceNoteId && noteUsedAt) {
        promoteCachedNoteToUsed(queryClient, {
          noteId: sourceNoteId,
          usedAt: noteUsedAt,
        });
      }

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
    monthlyUsageSnapshot,
    navigation,
    navigateAfterEdit,
    queryClient,
    restaurantId,
    restaurantName,
    setErrorMessage,
    setSourceListItemId,
    shouldEnforceUsageLimitsClientSide,
    sourceNoteId,
    sourceListItemId,
    trackWriteTelemetry,
    visitDate,
    visitVisibility,
    writeFeature,
  ]);

  return {
    isSubmitting,
    submitVisit,
  };
}
