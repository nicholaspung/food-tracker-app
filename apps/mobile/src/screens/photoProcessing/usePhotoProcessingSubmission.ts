import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import {
  createQuickTrack,
  createVisit,
  formatLimitExceededMessage,
  homeFeedQueryKeys,
  markNoteUsed,
  parseLimitExceededError,
  promoteCachedNoteToUsed,
  type MonthlyUsageSnapshot,
} from '../../features';
import { notesQueryKeys } from '../../features/store/notesQuery';
import type { OfflineAwareFeatureWrite } from '../../features/store/useOfflineAwareFeatureWrite';
import { isValidLocalDate, localDateStringToUTC } from '../../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import {
  buildCreateQuickTrackInput,
  buildDefaultQuickTrackForm,
  validateQuickTrackForm,
  type QuickTrackFormValues,
} from '../../lib/quickTrackForm';
import { trackObservabilityEvent } from '../../observability';
import {
  buildDefaultRestaurantForm,
  buildPhotoUploadInput,
  resolveDraftPhotoDetectedDateValue,
  type DraftPhotoAsset,
  type GeneralPhotoStep,
  type PhotoProcessingScreenProps,
  type ProcessType,
  type RestaurantPhotoForm,
} from './shared';
import { FREE_MONTHLY_PHOTO_LIMIT } from './shared';

interface UsePhotoProcessingSubmissionParams {
  currentPhoto: DraftPhotoAsset | null;
  currentPhotoIndex: number;
  currentQuickTrackForm: QuickTrackFormValues | undefined;
  currentRestaurantForm: RestaurantPhotoForm | undefined;
  goToProcessPhoto: (nextIndex: number) => void;
  isDisplayFreeUser: boolean;
  isOnline: boolean;
  monthlyUsageSnapshot: MonthlyUsageSnapshot | null;
  navigation: PhotoProcessingScreenProps['navigation'];
  photos: DraftPhotoAsset[];
  processType: ProcessType | null;
  queryClient: QueryClient;
  quickTrackForms: Record<string, QuickTrackFormValues>;
  restaurantForms: Record<string, RestaurantPhotoForm>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setStep: Dispatch<SetStateAction<GeneralPhotoStep>>;
  sourceNoteId?: string;
  shouldEnforceUsageLimitsClientSide: boolean;
  visitVisibility: 'friends' | 'private';
  writeFeature: OfflineAwareFeatureWrite;
}

export function usePhotoProcessingSubmission({
  currentPhoto,
  currentPhotoIndex,
  currentQuickTrackForm,
  currentRestaurantForm,
  goToProcessPhoto,
  isDisplayFreeUser,
  isOnline,
  monthlyUsageSnapshot,
  navigation,
  photos,
  processType,
  queryClient,
  quickTrackForms,
  restaurantForms,
  setErrorMessage,
  setStep,
  sourceNoteId,
  shouldEnforceUsageLimitsClientSide,
  visitVisibility,
  writeFeature,
}: UsePhotoProcessingSubmissionParams) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const syncSourceNoteUsedState = useCallback((usedAt: string) => {
    if (!sourceNoteId) {
      return;
    }

    promoteCachedNoteToUsed(queryClient, {
      noteId: sourceNoteId,
      usedAt,
    });
  }, [queryClient, sourceNoteId]);

  const persistSourceNoteUsed = useCallback(async (usedAt: string) => {
    if (!sourceNoteId) {
      return;
    }

    await writeFeature({
      operationName: 'note.mark-used',
      trackOnlineWrite: false,
      offline: {
        strategy: 'outbox',
        payload: {
          noteId: sourceNoteId,
          usedAt,
        },
      },
      execute: () =>
        markNoteUsed({
          noteId: sourceNoteId,
          usedAt,
        }),
    });

    syncSourceNoteUsedState(usedAt);
  }, [sourceNoteId, syncSourceNoteUsedState, writeFeature]);

  const validateRestaurantForm = useCallback(
    (form: RestaurantPhotoForm): string | null => {
      if (!form.restaurantName.trim()) {
        return 'Select a restaurant before continuing.';
      }

      if (!form.menuItemName.trim()) {
        return 'Select a menu item before continuing.';
      }

      if (form.rating < 1 || form.rating > 5) {
        return 'Rating must be between 1 and 5.';
      }

      if (!isValidLocalDate(form.date.trim())) {
        return 'Date must use YYYY-MM-DD format.';
      }

      return null;
    },
    [],
  );

  const handleProcessNext = useCallback(() => {
    if (!currentPhoto || !processType) {
      return;
    }

    const validationMessage =
      processType === 'restaurant'
        ? validateRestaurantForm(
            currentRestaurantForm ??
              buildDefaultRestaurantForm(currentPhoto, undefined),
          )
        : validateQuickTrackForm(
            currentQuickTrackForm ??
              buildDefaultQuickTrackForm({
                captureDate: currentPhoto.captureDate,
                detectedDateValue: resolveDraftPhotoDetectedDateValue(currentPhoto),
              }),
          );

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage(null);
    if (currentPhotoIndex < photos.length - 1) {
      goToProcessPhoto(currentPhotoIndex + 1);
      return;
    }

    setStep('review');
  }, [
    currentPhoto,
    currentPhotoIndex,
    currentQuickTrackForm,
    currentRestaurantForm,
    goToProcessPhoto,
    photos.length,
    processType,
    setErrorMessage,
    setStep,
    validateRestaurantForm,
  ]);

  const submitRestaurantVisits = useCallback(async () => {
    const noteUsedAt = sourceNoteId ? new Date().toISOString() : null;
    const groupedVisits = new Map<
      string,
      {
        restaurantId: string;
        restaurantName: string;
        date: string;
        items: { photo: DraftPhotoAsset; form: RestaurantPhotoForm }[];
      }
    >();

    for (const [index, photo] of photos.entries()) {
      const form = restaurantForms[photo.id];
      if (!form) {
        throw new Error(`Photo ${index + 1} is missing restaurant details.`);
      }

      const validationMessage = validateRestaurantForm(form);
      if (validationMessage) {
        throw new Error(`Photo ${index + 1}: ${validationMessage}`);
      }

      const key = `${form.restaurantId.trim()}__${form.date}`;
      const existingVisit =
        groupedVisits.get(key) ?? {
          restaurantId: form.restaurantId.trim(),
          restaurantName: form.restaurantName.trim(),
          date: form.date,
          items: [],
        };

      groupedVisits.set(key, {
        ...existingVisit,
        items: [...existingVisit.items, { photo, form }],
      });
    }

    for (const visitGroup of groupedVisits.values()) {
      const visitInput = {
        restaurantId: visitGroup.restaurantId,
        restaurantName: visitGroup.restaurantName,
        visitedAt: localDateStringToUTC(visitGroup.date),
        visibility: visitVisibility,
        source: 'visit' as const,
        ...(sourceNoteId && groupedVisits.size === 1
          ? { sourceNoteId }
          : {}),
        items: visitGroup.items.map((entry) => ({
          name: entry.form.menuItemName.trim(),
          rating: entry.form.rating,
          description: entry.form.description.trim() || undefined,
          notes: entry.form.notes.trim() || undefined,
          photos: [buildPhotoUploadInput(entry.photo)],
        })),
      };

      const createResult = await writeFeature({
        operationName: 'visit.create',
        offline: {
          strategy: 'outbox',
          payload: visitInput,
        },
        execute: () => createVisit(visitInput),
      });

      if (sourceNoteId && groupedVisits.size === 1 && noteUsedAt) {
        if (createResult.status === 'queued') {
          await persistSourceNoteUsed(noteUsedAt);
        } else {
          syncSourceNoteUsedState(noteUsedAt);
        }
      }
    }

    if (sourceNoteId && groupedVisits.size > 1 && noteUsedAt) {
      await persistSourceNoteUsed(noteUsedAt);
    }

    trackObservabilityEvent('Photo Processing Completed', {
      processType: 'restaurant',
      source: 'PhotoProcessingScreen',
      photoCount: photos.length,
      visitCount: groupedVisits.size,
    });
  }, [
    photos,
    restaurantForms,
    sourceNoteId,
    persistSourceNoteUsed,
    syncSourceNoteUsedState,
    validateRestaurantForm,
    visitVisibility,
    writeFeature,
  ]);

  const submitQuickTrackItems = useCallback(async () => {
    const noteUsedAt = sourceNoteId ? new Date().toISOString() : null;
    for (const [index, photo] of photos.entries()) {
      const form = quickTrackForms[photo.id];
      if (!form) {
        throw new Error(`Photo ${index + 1} is missing food product details.`);
      }

      const validationMessage = validateQuickTrackForm(form);
      if (validationMessage) {
        throw new Error(`Photo ${index + 1}: ${validationMessage}`);
      }

      const quickTrackInput = buildCreateQuickTrackInput(form, {
        photo: buildPhotoUploadInput(photo),
        sourceNoteId: sourceNoteId && photos.length === 1 ? sourceNoteId : undefined,
      });

      const createResult = await writeFeature({
        operationName: 'quick-track.create',
        offline: {
          strategy: 'outbox',
          payload: quickTrackInput,
        },
        execute: () => createQuickTrack(quickTrackInput),
      });

      if (sourceNoteId && photos.length === 1 && noteUsedAt) {
        if (createResult.status === 'queued') {
          await persistSourceNoteUsed(noteUsedAt);
        } else {
          syncSourceNoteUsedState(noteUsedAt);
        }
      }
    }

    if (sourceNoteId && photos.length > 1 && noteUsedAt) {
      await persistSourceNoteUsed(noteUsedAt);
    }

    trackObservabilityEvent('Photo Processing Completed', {
      processType: 'quickTrack',
      source: 'PhotoProcessingScreen',
      itemCount: photos.length,
    });
  }, [photos, quickTrackForms, persistSourceNoteUsed, sourceNoteId, syncSourceNoteUsedState, writeFeature]);

  const handleSubmitAll = useCallback(async () => {
    if (!processType) {
      return;
    }

    if (
      shouldEnforceUsageLimitsClientSide &&
      isDisplayFreeUser &&
      monthlyUsageSnapshot
    ) {
      const estimatedTotalAfterSubmit =
        monthlyUsageSnapshot.usage.photoUploads + photos.length;
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
          source: 'PhotoProcessingScreen',
          used: monthlyUsageSnapshot.usage.photoUploads,
        });
        setErrorMessage(
          `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`,
        );
        return;
      }
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (processType === 'restaurant') {
        await submitRestaurantVisits();
      } else {
        await submitQuickTrackItems();
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: homeFeedQueryKeys.root }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visits'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'foodProducts'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
        queryClient.invalidateQueries({
          queryKey: ['feature', 'usage', 'monthly'],
        }),
        ...(sourceNoteId
          ? [
              queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
              queryClient.invalidateQueries({
                queryKey: ['feature', 'note', sourceNoteId],
              }),
              queryClient.invalidateQueries({
                queryKey: notesQueryKeys.detail(sourceNoteId),
              }),
            ]
          : []),
      ]);

      if (!isOnline) {
        showQueuedOfflineAlert('Photo entries');
      }

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
          source: 'PhotoProcessingScreen',
          used: limitPayload.used,
          userTier: limitPayload.userTier ?? null,
        });
      }
      const message = limitPayload
        ? formatLimitExceededMessage(limitPayload)
        : error instanceof Error
          ? error.message
          : 'Could not process photos.';
      setErrorMessage(message);
      trackObservabilityEvent('Photo Processing Failed', {
        errorMessage: message,
        processType: processType ?? 'unknown',
        source: 'PhotoProcessingScreen',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isDisplayFreeUser,
    isOnline,
    monthlyUsageSnapshot,
    navigation,
    photos.length,
    processType,
    queryClient,
    setErrorMessage,
    shouldEnforceUsageLimitsClientSide,
    sourceNoteId,
    submitQuickTrackItems,
    submitRestaurantVisits,
  ]);

  return {
    handleProcessNext,
    handleSubmitAll,
    isSubmitting,
  };
}
