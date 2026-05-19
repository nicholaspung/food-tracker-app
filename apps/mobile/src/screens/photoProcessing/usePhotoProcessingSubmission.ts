import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import {
  formatLimitExceededMessage,
  homeFeedMapQueryKeys,
  homeFeedQueryKeys,
  parseLimitExceededError,
  restaurantsQueryKeys,
  type MonthlyUsageSnapshot,
} from '../../features';
import type { OfflineAwareFeatureWrite } from '../../features/store/useOfflineAwareFeatureWrite';
import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import { cleanupStagedPhotoFiles } from '../../lib/photoStaging';
import {
  buildDefaultFoodProductForm,
  validateFoodProductForm,
  type FoodProductFormValues,
} from '../../lib/foodProductForm';
import { buildFoodProductCreatedHomeParams } from '../../navigation/homeRouteParams';
import { trackObservabilityEvent } from '../../observability';
import {
  trackFirstFoodLogged,
  trackProductEvent,
  type TrackingEntryProperties,
} from '../../observability/productAnalytics';
import {
  buildDefaultRestaurantForm,
  resolveDraftPhotoDetectedDateValue,
  type DraftPhotoAsset,
  type GeneralPhotoStep,
  type PhotoProcessingScreenProps,
  type ProcessType,
  type RestaurantPhotoForm,
} from './shared';
import { FREE_MONTHLY_PHOTO_LIMIT } from './shared';
import {
  submitFoodProductPhotoEntries,
  submitRestaurantPhotoEntries,
  validateRestaurantPhotoSubmissionForm,
} from '../../features/photoProcessing/photoSubmission';

interface UsePhotoProcessingSubmissionParams {
  currentPhoto: DraftPhotoAsset | null;
  currentPhotoIndex: number;
  currentFoodProductForm: FoodProductFormValues | undefined;
  currentRestaurantForm: RestaurantPhotoForm | undefined;
  goToProcessPhoto: (nextIndex: number) => void;
  isDisplayFreeUser: boolean;
  isOnline: boolean;
  monthlyUsageSnapshot: MonthlyUsageSnapshot | null;
  navigation: PhotoProcessingScreenProps['navigation'];
  photos: DraftPhotoAsset[];
  processType: ProcessType | null;
  queryClient: QueryClient;
  foodProductForms: Record<string, FoodProductFormValues>;
  onSubmitSucceeded?: () => void;
  restaurantForms: Record<string, RestaurantPhotoForm>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setStep: Dispatch<SetStateAction<GeneralPhotoStep>>;
  sourceNoteId?: string;
  shouldEnforceUsageLimitsClientSide: boolean;
  visitVisibility: 'friends' | 'private';
  writeFeature: OfflineAwareFeatureWrite;
}

interface PhotoProcessingSubmitResult {
  queued: boolean;
}

export function usePhotoProcessingSubmission({
  currentPhoto,
  currentPhotoIndex,
  currentFoodProductForm,
  currentRestaurantForm,
  goToProcessPhoto,
  isDisplayFreeUser,
  isOnline,
  monthlyUsageSnapshot,
  navigation,
  photos,
  processType,
  queryClient,
  foodProductForms,
  onSubmitSucceeded,
  restaurantForms,
  setErrorMessage,
  setStep,
  sourceNoteId,
  shouldEnforceUsageLimitsClientSide,
  visitVisibility,
  writeFeature,
}: UsePhotoProcessingSubmissionParams) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateRestaurantForm = useCallback(
    (form: RestaurantPhotoForm): string | null =>
      validateRestaurantPhotoSubmissionForm(form),
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
        : validateFoodProductForm(
            currentFoodProductForm ??
              buildDefaultFoodProductForm({
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
    currentFoodProductForm,
    currentRestaurantForm,
    goToProcessPhoto,
    photos.length,
    processType,
    setErrorMessage,
    setStep,
    validateRestaurantForm,
  ]);

  const submitRestaurantVisits = useCallback(async (): Promise<PhotoProcessingSubmitResult> => {
    const result = await submitRestaurantPhotoEntries({
      noteId: sourceNoteId,
      photos,
      queryClient,
      restaurantForms,
      visitVisibility,
      writeFeature,
    });

    trackObservabilityEvent('Photo Processing Completed', {
      processType: 'restaurant',
      source: 'PhotoProcessingScreen',
      photoCount: photos.length,
      visitCount: result.visitCount ?? 0,
    });
    trackProductEvent('tracking.entry_completed', {
      entryType: 'restaurant_visit',
      source: sourceNoteId ? 'note' : 'photo_processing',
      hasPhoto: true,
      itemCount: photos.length,
      ratingCount: photos.length,
      visibility: visitVisibility,
      completed: true,
      queued: result.queued,
      visitCount: result.visitCount ?? 0,
    });
    trackFirstFoodLogged({
      entryType: 'restaurant_visit',
      source: sourceNoteId ? 'note' : 'photo_processing',
      hasPhoto: true,
      itemCount: photos.length,
      ratingCount: photos.length,
      visibility: visitVisibility,
      completed: true,
    });
    return { queued: result.queued };
  }, [
    photos,
    queryClient,
    restaurantForms,
    sourceNoteId,
    visitVisibility,
    writeFeature,
  ]);

  const submitFoodProductItems = useCallback(async (): Promise<PhotoProcessingSubmitResult> => {
    const result = await submitFoodProductPhotoEntries({
      foodProductForms,
      noteId: sourceNoteId,
      photos,
      queryClient,
      writeFeature,
    });

    trackObservabilityEvent('Photo Processing Completed', {
      processType: 'foodProduct',
      source: 'PhotoProcessingScreen',
      itemCount: photos.length,
    });
    trackProductEvent('tracking.entry_completed', {
      entryType: 'food_product',
      source: sourceNoteId ? 'note' : 'photo_processing',
      hasPhoto: true,
      itemCount: photos.length,
      ratingCount: photos.length,
      completed: true,
      queued: result.queued,
    });
    trackFirstFoodLogged({
      entryType: 'food_product',
      source: sourceNoteId ? 'note' : 'photo_processing',
      hasPhoto: true,
      itemCount: photos.length,
      ratingCount: photos.length,
      completed: true,
    });
    return { queued: result.queued };
  }, [photos, foodProductForms, queryClient, sourceNoteId, writeFeature]);

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
        trackProductEvent('quality.usage_limit_reached', {
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
    const trackingProperties: TrackingEntryProperties = {
      entryType: processType === 'restaurant' ? 'restaurant_visit' : 'food_product',
      source: sourceNoteId ? 'note' : 'photo_processing',
      hasPhoto: photos.length > 0,
      itemCount: photos.length,
      ratingCount: photos.length,
      visibility: processType === 'restaurant' ? visitVisibility : undefined,
      completed: false,
    };
    trackProductEvent('tracking.rating_added', trackingProperties);
    trackProductEvent('tracking.photo_added', trackingProperties);
    if (processType === 'restaurant') {
      trackProductEvent('tracking.visibility_selected', trackingProperties);
    }
    trackObservabilityEvent('PHOTO_PROCESSING_SUBMIT_STARTED', {
      source: 'PhotoProcessingScreen',
      processType,
      isOnline,
      photoCount: photos.length,
      sourceNoteAttached: Boolean(sourceNoteId),
    });
    setIsSubmitting(true);

    try {
      const submitResult =
        processType === 'restaurant'
          ? await submitRestaurantVisits()
          : await submitFoodProductItems();

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: homeFeedQueryKeys.root }),
        queryClient.invalidateQueries({ queryKey: homeFeedMapQueryKeys.root }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visits'] }),
        ...(processType === 'restaurant'
          ? [
              queryClient.invalidateQueries({
                queryKey: restaurantsQueryKeys.root,
              }),
            ]
          : []),
        queryClient.invalidateQueries({ queryKey: ['feature', 'foodProducts'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
        queryClient.invalidateQueries({
          queryKey: ['feature', 'usage', 'monthly'],
        }),
        ...(sourceNoteId
          ? [
              queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
            ]
          : []),
      ]);
      trackObservabilityEvent('PHOTO_PROCESSING_SUBMIT_SUCCEEDED', {
        source: 'PhotoProcessingScreen',
        processType,
        queued: submitResult.queued,
        photoCount: photos.length,
        sourceNoteAttached: Boolean(sourceNoteId),
      });

      if (!isOnline) {
        showQueuedOfflineAlert({
          analyticsSource: 'PhotoProcessingScreen',
          subject: 'Photo entries',
        });
      }

      if (!submitResult.queued) {
        await cleanupStagedPhotoFiles(photos);
      }

      onSubmitSucceeded?.();
      if (processType === 'foodProduct') {
        navigation.navigate('Home', buildFoodProductCreatedHomeParams());
      } else {
        navigation.navigate('Home');
      }
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
        trackProductEvent('quality.usage_limit_reached', {
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
      trackObservabilityEvent('PHOTO_PROCESSING_SUBMIT_FAILED', {
        source: 'PhotoProcessingScreen',
        processType: processType ?? 'unknown',
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        photoCount: photos.length,
        sourceNoteAttached: Boolean(sourceNoteId),
      });
      trackProductEvent('tracking.entry_failed', {
        ...trackingProperties,
        completed: false,
        errorType: error instanceof Error ? error.name : 'unknown_error',
      });
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
    photos,
    processType,
    queryClient,
    setErrorMessage,
    shouldEnforceUsageLimitsClientSide,
    sourceNoteId,
    onSubmitSucceeded,
    submitFoodProductItems,
    submitRestaurantVisits,
    visitVisibility,
  ]);

  return {
    handleProcessNext,
    handleSubmitAll,
    isSubmitting,
  };
}
