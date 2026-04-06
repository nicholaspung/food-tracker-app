import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import {
  createQuickTrack,
  createVisit,
  formatLimitExceededMessage,
  parseLimitExceededError,
  type MonthlyUsageSnapshot,
} from '../../features';
import type {
  FeatureOutboxOperationName,
  FeatureOutboxOperationPayload,
} from '../../features/store/featureOutboxOperations';
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
  type DraftPhotoAsset,
  type GeneralPhotoStep,
  type PhotoProcessingScreenProps,
  type ProcessType,
  type RestaurantPhotoForm,
} from './shared';
import { FREE_MONTHLY_PHOTO_LIMIT } from './shared';

type QueueFeatureOutbox = <TName extends FeatureOutboxOperationName>(
  operationName: TName,
  payload: FeatureOutboxOperationPayload<TName>,
) => Promise<void>;

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
  queueFeatureOutbox: QueueFeatureOutbox;
  queueWrite: (operationName: string) => Promise<void>;
  quickTrackForms: Record<string, QuickTrackFormValues>;
  restaurantForms: Record<string, RestaurantPhotoForm>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setStep: Dispatch<SetStateAction<GeneralPhotoStep>>;
  shouldEnforceUsageLimitsClientSide: boolean;
  visitVisibility: 'friends' | 'private';
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
  queueFeatureOutbox,
  queueWrite,
  quickTrackForms,
  restaurantForms,
  setErrorMessage,
  setStep,
  shouldEnforceUsageLimitsClientSide,
  visitVisibility,
}: UsePhotoProcessingSubmissionParams) {
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        items: visitGroup.items.map((entry) => ({
          name: entry.form.menuItemName.trim(),
          rating: entry.form.rating,
          description: entry.form.description.trim() || undefined,
          notes: entry.form.notes.trim() || undefined,
          photos: [buildPhotoUploadInput(entry.photo)],
        })),
      };

      if (!isOnline) {
        await queueFeatureOutbox('visit.create', visitInput);
        continue;
      }

      await queueWrite('visit.create');
      await createVisit(visitInput);
    }

    trackObservabilityEvent('Photo Processing Completed', {
      processType: 'restaurant',
      source: 'PhotoProcessingScreen',
      photoCount: photos.length,
      visitCount: groupedVisits.size,
    });
  }, [
    isOnline,
    photos,
    queueFeatureOutbox,
    queueWrite,
    restaurantForms,
    validateRestaurantForm,
    visitVisibility,
  ]);

  const submitQuickTrackItems = useCallback(async () => {
    for (const [index, photo] of photos.entries()) {
      const form = quickTrackForms[photo.id];
      if (!form) {
        throw new Error(`Photo ${index + 1} is missing quick track details.`);
      }

      const validationMessage = validateQuickTrackForm(form);
      if (validationMessage) {
        throw new Error(`Photo ${index + 1}: ${validationMessage}`);
      }

      const quickTrackInput = buildCreateQuickTrackInput(form, {
        photo: buildPhotoUploadInput(photo),
      });

      if (!isOnline) {
        await queueFeatureOutbox('quick-track.create', quickTrackInput);
        continue;
      }

      await queueWrite('quick-track.create');
      await createQuickTrack(quickTrackInput);
    }

    trackObservabilityEvent('Photo Processing Completed', {
      processType: 'quickTrack',
      source: 'PhotoProcessingScreen',
      itemCount: photos.length,
    });
  }, [isOnline, photos, queueFeatureOutbox, queueWrite, quickTrackForms]);

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
        queryClient.invalidateQueries({ queryKey: ['feature', 'visits'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
        queryClient.invalidateQueries({
          queryKey: ['feature', 'usage', 'monthly'],
        }),
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
    submitQuickTrackItems,
    submitRestaurantVisits,
  ]);

  return {
    handleProcessNext,
    handleSubmitAll,
    isSubmitting,
  };
}
