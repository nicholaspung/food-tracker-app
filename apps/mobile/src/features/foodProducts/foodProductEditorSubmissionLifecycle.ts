import { cleanupStagedPhotoFiles } from '../../lib/photoStaging';
import {
  buildCreateFoodProductInput,
  buildUpdateFoodProductInput,
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
import type { FoodProductRecord } from '../models';
import {
  formatLimitExceededMessage,
  parseLimitExceededError,
  type CreateFoodProductInput,
  type UpdateFoodProductInput,
  type VisitPhotoUploadInput,
} from '../store';
import type { OfflineAwareFeatureWriteResult } from '../store/useOfflineAwareFeatureWrite';
import { formatFreeMonthlyPhotoLimitStatus } from './useFoodProductEditorPhotoDraft';

const FREE_MONTHLY_PHOTO_LIMIT = 100;

export type FoodProductEditorSubmissionDestination =
  | {
      name: 'Home';
      params?: ReturnType<typeof buildFoodProductCreatedHomeParams>;
    }
  | {
      name: 'Previous';
    };

export type FoodProductEditorSubmissionResult =
  | {
      errorMessage: string;
      status: 'blocked' | 'failed';
    }
  | {
      destination: FoodProductEditorSubmissionDestination;
      status: 'completed' | 'queued';
    };

export interface FoodProductEditorDraftPhoto {
  label: string;
  upload: VisitPhotoUploadInput;
}

export type FoodProductEditorSubmissionPhotoMode = 'keep' | 'replace' | 'remove';

export interface FoodProductEditorWrites {
  createFoodProduct: (input: {
    includeUsage: boolean;
    input: CreateFoodProductInput;
    queuedAlert?: false | {
      analyticsSource: string;
      subject: string;
    };
    sourceNote?: {
      noteId?: string;
      usedAt: string | null;
    };
  }) => Promise<OfflineAwareFeatureWriteResult<FoodProductRecord>>;
  updateFoodProduct: (input: {
    foodProductId: string;
    includeFoodProductPhotos: boolean;
    includeUsage: boolean;
    queuedAlert?: false | {
      analyticsSource: string;
      subject: string;
    };
    updates: UpdateFoodProductInput;
  }) => Promise<OfflineAwareFeatureWriteResult<FoodProductRecord>>;
}

interface FoodProductEditorSubmissionUsageSnapshot {
  usage: {
    photoUploads: number;
  };
}

export interface SubmitCreateFoodProductEditorInput {
  foodProductWrites: Pick<FoodProductEditorWrites, 'createFoodProduct'>;
  form: FoodProductFormValues;
  isDisplayFreeUser: boolean;
  isOnline: boolean;
  markRatedBefore: () => Promise<void>;
  monthlyUsageSnapshot: FoodProductEditorSubmissionUsageSnapshot | null;
  photo: FoodProductEditorDraftPhoto | null;
  shouldEnforceUsageLimitsClientSide: boolean;
  source?: 'FoodProductScreen';
  sourceNoteId?: string;
}

export interface SubmitEditFoodProductEditorInput {
  extraLegacyPhotoCount: number;
  foodProductId: string;
  foodProductWrites: Pick<FoodProductEditorWrites, 'updateFoodProduct'>;
  form: FoodProductFormValues;
  isDisplayFreeUser: boolean;
  isOnline: boolean;
  monthlyUsageSnapshot: FoodProductEditorSubmissionUsageSnapshot | null;
  photoMode: FoodProductEditorSubmissionPhotoMode;
  primaryExistingPhotoId?: string | null;
  replacementPhoto: FoodProductEditorDraftPhoto | null;
  shouldEnforceUsageLimitsClientSide: boolean;
  source?: 'EditFoodProductScreen';
}

function buildTrackingProperties({
  form,
  hasPhoto,
  sourceNoteId,
}: Pick<SubmitCreateFoodProductEditorInput, 'form' | 'sourceNoteId'> & {
  hasPhoto: boolean;
}): TrackingEntryProperties {
  return {
    entryType: 'food_product',
    source: sourceNoteId ? 'note' : 'add_tab',
    hasPhoto,
    itemCount: 1,
    ratingCount: form.rating > 0 ? 1 : 0,
    visibility: form.visibility,
    completed: false,
  };
}

function enforceCreateClientPhotoQuota(
  input: SubmitCreateFoodProductEditorInput,
): FoodProductEditorSubmissionResult | null {
  if (
    !input.shouldEnforceUsageLimitsClientSide ||
    !input.isDisplayFreeUser ||
    !input.photo ||
    !input.monthlyUsageSnapshot
  ) {
    return null;
  }

  const used = input.monthlyUsageSnapshot.usage.photoUploads;
  const estimatedTotalAfterSubmit = used + 1;
  if (estimatedTotalAfterSubmit <= FREE_MONTHLY_PHOTO_LIMIT) {
    return null;
  }

  const remaining = Math.max(FREE_MONTHLY_PHOTO_LIMIT - used, 0);
  trackObservabilityEvent('USAGE_LIMIT_REACHED', {
    enforcement: 'client_estimate',
    limit: FREE_MONTHLY_PHOTO_LIMIT,
    metric: 'photo_uploads',
    remaining,
    source: input.source ?? 'FoodProductScreen',
    used,
  });
  trackProductEvent('quality.usage_limit_reached', {
    enforcement: 'client_estimate',
    limit: FREE_MONTHLY_PHOTO_LIMIT,
    metric: 'photo_uploads',
    remaining,
    source: input.source ?? 'FoodProductScreen',
    used,
  });

  return {
    errorMessage: formatFreeMonthlyPhotoLimitStatus(remaining),
    status: 'blocked',
  };
}

function enforceEditClientPhotoQuota(
  input: SubmitEditFoodProductEditorInput,
): FoodProductEditorSubmissionResult | null {
  if (
    !input.shouldEnforceUsageLimitsClientSide ||
    !input.isDisplayFreeUser ||
    !input.replacementPhoto ||
    !input.monthlyUsageSnapshot
  ) {
    return null;
  }

  const used = input.monthlyUsageSnapshot.usage.photoUploads;
  const estimatedTotalAfterSubmit = used + 1;
  if (estimatedTotalAfterSubmit <= FREE_MONTHLY_PHOTO_LIMIT) {
    return null;
  }

  const remaining = Math.max(FREE_MONTHLY_PHOTO_LIMIT - used, 0);
  trackObservabilityEvent('USAGE_LIMIT_REACHED', {
    enforcement: 'client_estimate',
    limit: FREE_MONTHLY_PHOTO_LIMIT,
    metric: 'photo_uploads',
    remaining,
    source: input.source ?? 'EditFoodProductScreen',
    used,
  });

  return {
    errorMessage: formatFreeMonthlyPhotoLimitStatus(remaining),
    status: 'blocked',
  };
}

export async function submitCreateFoodProductEditor(
  input: SubmitCreateFoodProductEditorInput,
): Promise<FoodProductEditorSubmissionResult> {
  const source = input.source ?? 'FoodProductScreen';
  const validationMessage = validateFoodProductForm(input.form);
  if (validationMessage) {
    trackObservabilityEvent('FOOD_PRODUCT_SUBMIT_VALIDATION_FAILED', {
      source,
      validationMessage,
      visibility: input.form.visibility,
      hasPhoto: Boolean(input.photo),
      sourceNoteAttached: Boolean(input.sourceNoteId),
    });
    return {
      errorMessage: validationMessage,
      status: 'blocked',
    };
  }

  const quotaResult = enforceCreateClientPhotoQuota(input);
  if (quotaResult) {
    return quotaResult;
  }

  const trackingProperties = buildTrackingProperties({
    form: input.form,
    hasPhoto: Boolean(input.photo),
    sourceNoteId: input.sourceNoteId,
  });
  trackProductEvent('tracking.rating_added', trackingProperties);
  trackProductEvent('tracking.visibility_selected', trackingProperties);
  trackObservabilityEvent('FOOD_PRODUCT_SUBMIT_STARTED', {
    source,
    isOnline: input.isOnline,
    hasPhoto: Boolean(input.photo),
    hasNotes: input.form.notes.trim().length > 0,
    rating: input.form.rating,
    sourceNoteAttached: Boolean(input.sourceNoteId),
    visibility: input.form.visibility,
  });

  try {
    const noteUsedAt = input.sourceNoteId ? new Date().toISOString() : null;
    const foodProductInput = buildCreateFoodProductInput(input.form, {
      photo: input.photo?.upload,
      sourceNoteId: input.sourceNoteId,
    });
    const createResult = await input.foodProductWrites.createFoodProduct({
      input: foodProductInput,
      includeUsage: Boolean(input.photo),
      sourceNote: {
        noteId: input.sourceNoteId,
        usedAt: noteUsedAt,
      },
      queuedAlert: {
        analyticsSource: source,
        subject: 'Food product',
      },
    });
    const queued = createResult.status === 'queued';

    if (!queued) {
      await cleanupStagedPhotoFiles(input.photo ? [input.photo.upload] : []);
      await input.markRatedBefore();
    }

    trackObservabilityEvent('FOOD_PRODUCT_SUBMIT_SUCCEEDED', {
      source,
      queued,
      hasPhoto: Boolean(input.photo),
      sourceNoteAttached: Boolean(input.sourceNoteId),
      visibility: input.form.visibility,
    });
    trackProductEvent('tracking.entry_completed', {
      ...trackingProperties,
      completed: true,
      queued,
    });
    trackFirstFoodLogged({
      ...trackingProperties,
      completed: true,
    });

    return {
      destination: {
        name: 'Home',
        params: buildFoodProductCreatedHomeParams(),
      },
      status: queued ? 'queued' : 'completed',
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
        source,
        used: limitPayload.used,
        userTier: limitPayload.userTier ?? null,
      });
      trackProductEvent('quality.usage_limit_reached', {
        enforcement: 'server',
        limit: limitPayload.limit,
        metric: limitPayload.metric,
        monthKey: limitPayload.monthKey,
        remaining: limitPayload.remaining,
        source,
        used: limitPayload.used,
        userTier: limitPayload.userTier ?? null,
      });
    }

    const errorMessage = limitPayload
      ? formatLimitExceededMessage(limitPayload)
      : error instanceof Error
        ? error.message
        : 'Could not save food product.';
    trackObservabilityEvent('FOOD_PRODUCT_SUBMIT_FAILED', {
      source,
      errorMessage,
      errorType: error instanceof Error ? error.name : 'unknown_error',
      hasPhoto: Boolean(input.photo),
      isOnline: input.isOnline,
      sourceNoteAttached: Boolean(input.sourceNoteId),
      visibility: input.form.visibility,
    });
    trackProductEvent('tracking.entry_failed', {
      ...trackingProperties,
      completed: false,
      errorType: error instanceof Error ? error.name : 'unknown_error',
    });

    return {
      errorMessage,
      status: 'failed',
    };
  }
}

export async function submitEditFoodProductEditor(
  input: SubmitEditFoodProductEditorInput,
): Promise<FoodProductEditorSubmissionResult> {
  const source = input.source ?? 'EditFoodProductScreen';
  const validationMessage = validateFoodProductForm(input.form);
  if (validationMessage) {
    trackObservabilityEvent('EDIT_FOOD_PRODUCT_SUBMIT_VALIDATION_FAILED', {
      source,
      foodProductId: input.foodProductId,
      reason:
        validationMessage === 'Food product name is required.'
          ? 'missing_item'
          : validationMessage === 'Please choose a valid date.'
            ? 'invalid_item_date'
            : 'invalid_form',
    });
    return {
      errorMessage: validationMessage,
      status: 'blocked',
    };
  }

  const quotaResult = enforceEditClientPhotoQuota(input);
  if (quotaResult) {
    return quotaResult;
  }

  const deletePhotoIds =
    input.primaryExistingPhotoId && (input.photoMode === 'replace' || input.photoMode === 'remove')
      ? [input.primaryExistingPhotoId]
      : [];
  const hasPhotoChanges = deletePhotoIds.length > 0 || input.photoMode === 'replace';
  const foodProductUpdateInput = buildUpdateFoodProductInput(input.form, {
    newPhoto: input.photoMode === 'replace' ? input.replacementPhoto?.upload : undefined,
    deletePhotoIds,
  });

  trackObservabilityEvent('EDIT_FOOD_PRODUCT_SUBMIT_STARTED', {
    source,
    foodProductId: input.foodProductId,
    isOnline: input.isOnline,
    hasNotes: input.form.notes.trim().length > 0,
    visibility: input.form.visibility,
    photoMode: input.photoMode,
    hasPrimaryPhoto: Boolean(input.primaryExistingPhotoId),
    extraLegacyPhotoCount: input.extraLegacyPhotoCount,
  });

  try {
    const updateResult = await input.foodProductWrites.updateFoodProduct({
      foodProductId: input.foodProductId,
      updates: foodProductUpdateInput,
      includeFoodProductPhotos: hasPhotoChanges,
      includeUsage: Boolean(input.replacementPhoto),
      queuedAlert: {
        analyticsSource: source,
        subject: 'Food product update',
      },
    });
    const queued = updateResult.status === 'queued';

    if (!queued) {
      await cleanupStagedPhotoFiles(input.replacementPhoto ? [input.replacementPhoto.upload] : []);
    }

    trackObservabilityEvent('EDIT_FOOD_PRODUCT_SUBMIT_SUCCEEDED', {
      source,
      foodProductId: input.foodProductId,
      queued,
      visibility: input.form.visibility,
      photoMode: input.photoMode,
    });

    return {
      destination: { name: 'Previous' },
      status: queued ? 'queued' : 'completed',
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
        source,
        used: limitPayload.used,
        userTier: limitPayload.userTier ?? null,
      });
    }

    const errorMessage = limitPayload
      ? formatLimitExceededMessage(limitPayload)
      : error instanceof Error
        ? error.message
        : 'Could not update food product.';
    trackObservabilityEvent('EDIT_FOOD_PRODUCT_SUBMIT_FAILED', {
      source,
      foodProductId: input.foodProductId,
      error: errorMessage,
    });

    return {
      errorMessage,
      status: 'failed',
    };
  }
}
