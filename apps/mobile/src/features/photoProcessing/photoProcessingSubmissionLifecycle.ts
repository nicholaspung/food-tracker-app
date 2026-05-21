import type { QueryClient } from '@tanstack/react-query';

import { cleanupStagedPhotoFiles } from '../../lib/photoStaging';
import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import { buildFoodProductCreatedHomeParams } from '../../navigation/homeRouteParams';
import { trackObservabilityEvent } from '../../observability';
import {
  trackFirstFoodLogged,
  trackProductEvent,
  type TrackingEntryProperties,
} from '../../observability/productAnalytics';
import type { FoodProductFormValues } from '../../lib/foodProductForm';
import type {
  DraftPhotoAsset,
  ProcessType,
  RestaurantPhotoForm,
} from './photoProcessingTypes';
import { FREE_MONTHLY_PHOTO_LIMIT } from './photoProcessingTypes';
import {
  formatLimitExceededMessage,
  homeFeedMapQueryKeys,
  homeFeedQueryKeys,
  parseLimitExceededError,
  restaurantsQueryKeys,
  type MonthlyUsageSnapshot,
} from '../store';
import type { OfflineAwareFeatureWrite } from '../store/useOfflineAwareFeatureWrite';
import {
  submitFoodProductPhotoEntries,
  submitRestaurantPhotoEntries,
} from './photoSubmission';

export type PhotoProcessingSubmissionDestination =
  | {
      name: 'Home';
      params?: ReturnType<typeof buildFoodProductCreatedHomeParams>;
    };

export type PhotoProcessingSubmissionResult =
  | {
      destination: PhotoProcessingSubmissionDestination;
      status: 'completed' | 'queued';
    }
  | {
      errorMessage: string;
      status: 'blocked' | 'failed';
    };

export interface SubmitProcessedPhotosInput {
  foodProductForms: Record<string, FoodProductFormValues>;
  isDisplayFreeUser: boolean;
  isOnline: boolean;
  monthlyUsageSnapshot: MonthlyUsageSnapshot | null;
  photos: DraftPhotoAsset[];
  processType: NonNullable<ProcessType>;
  queryClient: QueryClient;
  restaurantForms: Record<string, RestaurantPhotoForm>;
  shouldEnforceUsageLimitsClientSide: boolean;
  sourceNoteId?: string;
  visitVisibility: 'friends' | 'private';
  writeFeature: OfflineAwareFeatureWrite;
}

function buildTrackingProperties(input: SubmitProcessedPhotosInput): TrackingEntryProperties {
  return {
    entryType: input.processType === 'restaurant' ? 'restaurant_visit' : 'food_product',
    source: input.sourceNoteId ? 'note' : 'photo_processing',
    hasPhoto: input.photos.length > 0,
    itemCount: input.photos.length,
    ratingCount: input.photos.length,
    visibility: input.processType === 'restaurant' ? input.visitVisibility : undefined,
    completed: false,
  };
}

function enforceClientPhotoQuota(input: SubmitProcessedPhotosInput): PhotoProcessingSubmissionResult | null {
  if (
    !input.shouldEnforceUsageLimitsClientSide ||
    !input.isDisplayFreeUser ||
    !input.monthlyUsageSnapshot
  ) {
    return null;
  }

  const used = input.monthlyUsageSnapshot.usage.photoUploads;
  const estimatedTotalAfterSubmit = used + input.photos.length;
  if (estimatedTotalAfterSubmit <= FREE_MONTHLY_PHOTO_LIMIT) {
    return null;
  }

  const remaining = Math.max(FREE_MONTHLY_PHOTO_LIMIT - used, 0);
  trackObservabilityEvent('USAGE_LIMIT_REACHED', {
    enforcement: 'client_estimate',
    limit: FREE_MONTHLY_PHOTO_LIMIT,
    metric: 'photo_uploads',
    remaining,
    source: 'PhotoProcessingScreen',
    used,
  });
  trackProductEvent('quality.usage_limit_reached', {
    enforcement: 'client_estimate',
    limit: FREE_MONTHLY_PHOTO_LIMIT,
    metric: 'photo_uploads',
    remaining,
    source: 'PhotoProcessingScreen',
    used,
  });

  return {
    errorMessage: `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`,
    status: 'blocked',
  };
}

async function submitPhotoEntries(input: SubmitProcessedPhotosInput): Promise<{
  queued: boolean;
  visitCount?: number;
}> {
  if (input.processType === 'restaurant') {
    const result = await submitRestaurantPhotoEntries({
      noteId: input.sourceNoteId,
      photos: input.photos,
      queryClient: input.queryClient,
      restaurantForms: input.restaurantForms,
      visitVisibility: input.visitVisibility,
      writeFeature: input.writeFeature,
    });

    trackObservabilityEvent('Photo Processing Completed', {
      processType: 'restaurant',
      source: 'PhotoProcessingScreen',
      photoCount: input.photos.length,
      visitCount: result.visitCount ?? 0,
    });
    trackProductEvent('tracking.entry_completed', {
      entryType: 'restaurant_visit',
      source: input.sourceNoteId ? 'note' : 'photo_processing',
      hasPhoto: true,
      itemCount: input.photos.length,
      ratingCount: input.photos.length,
      visibility: input.visitVisibility,
      completed: true,
      queued: result.queued,
      visitCount: result.visitCount ?? 0,
    });
    trackFirstFoodLogged({
      entryType: 'restaurant_visit',
      source: input.sourceNoteId ? 'note' : 'photo_processing',
      hasPhoto: true,
      itemCount: input.photos.length,
      ratingCount: input.photos.length,
      visibility: input.visitVisibility,
      completed: true,
    });

    return {
      queued: result.queued,
      visitCount: result.visitCount,
    };
  }

  const result = await submitFoodProductPhotoEntries({
    foodProductForms: input.foodProductForms,
    noteId: input.sourceNoteId,
    photos: input.photos,
    queryClient: input.queryClient,
    writeFeature: input.writeFeature,
  });

  trackObservabilityEvent('Photo Processing Completed', {
    processType: 'foodProduct',
    source: 'PhotoProcessingScreen',
    itemCount: input.photos.length,
  });
  trackProductEvent('tracking.entry_completed', {
    entryType: 'food_product',
    source: input.sourceNoteId ? 'note' : 'photo_processing',
    hasPhoto: true,
    itemCount: input.photos.length,
    ratingCount: input.photos.length,
    completed: true,
    queued: result.queued,
  });
  trackFirstFoodLogged({
    entryType: 'food_product',
    source: input.sourceNoteId ? 'note' : 'photo_processing',
    hasPhoto: true,
    itemCount: input.photos.length,
    ratingCount: input.photos.length,
    completed: true,
  });

  return { queued: result.queued };
}

async function refreshAffectedPhotoSubmissionQueries(input: SubmitProcessedPhotosInput): Promise<void> {
  await Promise.all([
    input.queryClient.invalidateQueries({ queryKey: homeFeedQueryKeys.root }),
    input.queryClient.invalidateQueries({ queryKey: homeFeedMapQueryKeys.root }),
    input.queryClient.invalidateQueries({ queryKey: ['feature', 'visits'] }),
    ...(input.processType === 'restaurant'
      ? [
          input.queryClient.invalidateQueries({
            queryKey: restaurantsQueryKeys.root,
          }),
        ]
      : []),
    input.queryClient.invalidateQueries({ queryKey: ['feature', 'foodProducts'] }),
    input.queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
    input.queryClient.invalidateQueries({
      queryKey: ['feature', 'usage', 'monthly'],
    }),
    ...(input.sourceNoteId
      ? [
          input.queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
        ]
      : []),
  ]);
}

function resolvePhotoSubmissionDestination(
  processType: NonNullable<ProcessType>,
): PhotoProcessingSubmissionDestination {
  if (processType === 'foodProduct') {
    return {
      name: 'Home',
      params: buildFoodProductCreatedHomeParams(),
    };
  }

  return { name: 'Home' };
}

export async function submitProcessedPhotos(
  input: SubmitProcessedPhotosInput,
): Promise<PhotoProcessingSubmissionResult> {
  const quotaResult = enforceClientPhotoQuota(input);
  if (quotaResult) {
    return quotaResult;
  }

  const trackingProperties = buildTrackingProperties(input);
  trackProductEvent('tracking.rating_added', trackingProperties);
  trackProductEvent('tracking.photo_added', trackingProperties);
  if (input.processType === 'restaurant') {
    trackProductEvent('tracking.visibility_selected', trackingProperties);
  }
  trackObservabilityEvent('PHOTO_PROCESSING_SUBMIT_STARTED', {
    source: 'PhotoProcessingScreen',
    processType: input.processType,
    isOnline: input.isOnline,
    photoCount: input.photos.length,
    sourceNoteAttached: Boolean(input.sourceNoteId),
  });

  try {
    const submitResult = await submitPhotoEntries(input);
    await refreshAffectedPhotoSubmissionQueries(input);

    trackObservabilityEvent('PHOTO_PROCESSING_SUBMIT_SUCCEEDED', {
      source: 'PhotoProcessingScreen',
      processType: input.processType,
      queued: submitResult.queued,
      photoCount: input.photos.length,
      sourceNoteAttached: Boolean(input.sourceNoteId),
    });

    if (!input.isOnline) {
      showQueuedOfflineAlert({
        analyticsSource: 'PhotoProcessingScreen',
        subject: 'Photo entries',
      });
    }

    if (!submitResult.queued) {
      await cleanupStagedPhotoFiles(input.photos);
    }

    return {
      destination: resolvePhotoSubmissionDestination(input.processType),
      status: submitResult.queued ? 'queued' : 'completed',
    };
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

    const errorMessage = limitPayload
      ? formatLimitExceededMessage(limitPayload)
      : error instanceof Error
        ? error.message
        : 'Could not process photos.';
    trackObservabilityEvent('PHOTO_PROCESSING_SUBMIT_FAILED', {
      source: 'PhotoProcessingScreen',
      processType: input.processType,
      errorMessage,
      errorType: error instanceof Error ? error.name : 'unknown_error',
      photoCount: input.photos.length,
      sourceNoteAttached: Boolean(input.sourceNoteId),
    });
    trackProductEvent('tracking.entry_failed', {
      ...trackingProperties,
      completed: false,
      errorType: error instanceof Error ? error.name : 'unknown_error',
    });
    trackObservabilityEvent('Photo Processing Failed', {
      errorMessage,
      processType: input.processType,
      source: 'PhotoProcessingScreen',
    });

    return {
      errorMessage,
      status: 'failed',
    };
  }
}
