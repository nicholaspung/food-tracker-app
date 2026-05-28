import type { QueryClient } from '@tanstack/react-query';

import { cleanupStagedPhotoFiles } from '../../lib/photoStaging';
import { isValidLocalDate, localDateStringToUTC } from '../../lib/dateFormatting';
import { buildVisitCreatedHomeParams } from '../../navigation/homeRouteParams';
import { trackObservabilityEvent } from '../../observability';
import {
  trackFirstFoodLogged,
  trackProductEvent,
  type TrackingEntryProperties,
} from '../../observability/productAnalytics';
import {
  formatLimitExceededMessage,
  linkVisitToListBookmark,
  parseLimitExceededError,
  restaurantListQueryKeys,
  type CreateVisitInput,
  type MonthlyUsageSnapshot,
  type UpdateVisitInput,
  type VisitPhotoUploadInput,
} from '../store';
import type { VisitRecord } from '../models';
import type { OfflineAwareFeatureWriteResult } from '../store/useOfflineAwareFeatureWrite';

const FREE_MONTHLY_VISIT_PHOTO_LIMIT = 100;

export type CreateVisitSubmissionDestination = {
  name: 'Home';
  params?: ReturnType<typeof buildVisitCreatedHomeParams>;
};

export type CreateVisitSubmissionResult =
  | {
      clearSourceListItemId: boolean;
      destination: CreateVisitSubmissionDestination;
      status: 'completed' | 'queued';
    }
  | {
      errorMessage: string;
      status: 'blocked' | 'failed';
    };

export type CreateVisitSubmissionVisibility = 'friends' | 'private';

export type EditVisitSubmissionResult =
  | {
      navigationIntent: 'back';
      status: 'completed' | 'queued';
    }
  | {
      errorMessage: string;
      status: 'blocked' | 'failed';
    };

export interface CreateVisitSubmissionDraftPhoto {
  kind: 'existing' | 'new';
  upload?: VisitPhotoUploadInput;
}

export interface CreateVisitSubmissionDraftItem {
  id: string;
  name: string;
  rating: number;
  description: string;
  notes: string;
  photos: CreateVisitSubmissionDraftPhoto[];
}

export interface EditVisitSubmissionDraftItem extends CreateVisitSubmissionDraftItem {
  deletedPhotoIds: string[];
}

export interface CreateVisitSubmissionWriter {
  createVisit(input: {
    hasPhotoUploads: boolean;
    input: CreateVisitInput;
    sourceNote: {
      noteId?: string;
      usedAt: string | null;
    };
    useApiReplay: boolean;
  }): Promise<OfflineAwareFeatureWriteResult<VisitRecord>>;
}

export interface EditVisitSubmissionWriter {
  deleteVisitItem(input: {
    includeUsage: boolean;
    includeVisitPhotos: boolean;
    updates: UpdateVisitInput;
    visitId: string;
  }): Promise<OfflineAwareFeatureWriteResult<VisitRecord>>;
  updateVisit(input: {
    includeUsage: boolean;
    includeVisitPhotos: boolean;
    updates: UpdateVisitInput;
    visitId: string;
  }): Promise<OfflineAwareFeatureWriteResult<VisitRecord>>;
}

export interface SubmitCreateVisitInput {
  draftItems: CreateVisitSubmissionDraftItem[];
  isDisplayFreeUser: boolean;
  isOnline: boolean;
  monthlyUsageSnapshot: MonthlyUsageSnapshot | null;
  queryClient: QueryClient;
  restaurantId: string | null;
  restaurantName: string;
  shouldEnforceUsageLimitsClientSide: boolean;
  sourceListItemId: string | null;
  sourceNoteId?: string;
  trackWriteTelemetry: (operationName: string) => Promise<void>;
  visitDate: string;
  visitVisibility: CreateVisitSubmissionVisibility;
  visitWrites: CreateVisitSubmissionWriter;
}

export interface SubmitEditVisitInput {
  draftItems: EditVisitSubmissionDraftItem[];
  hasDeletedPersistedVisitItem: boolean;
  isOnline: boolean;
  restaurantId: string | null;
  restaurantName: string;
  sourceListItemId: string | null;
  sourceNoteId?: string;
  visitDate: string;
  visitId?: string;
  visitVisibility: CreateVisitSubmissionVisibility;
  visitWrites: EditVisitSubmissionWriter;
}

interface ParsedCreateVisitItem {
  description?: string;
  name: string;
  notes?: string;
  photos: VisitPhotoUploadInput[];
  rating: number;
}

interface ParsedEditVisitItem {
  deletePhotoIds: string[];
  description?: string;
  id: string;
  name: string;
  newPhotos: VisitPhotoUploadInput[];
  notes?: string;
  rating: number;
}

function trackSubmitValidationFailed(
  input: SubmitCreateVisitInput,
  reason: string,
): void {
  trackObservabilityEvent('CREATE_VISIT_SUBMIT_VALIDATION_FAILED', {
    source: 'CreateVisitScreen',
    mode: 'create',
    reason,
    itemCount: input.draftItems.length,
    visitVisibility: input.visitVisibility,
    sourceNoteAttached: Boolean(input.sourceNoteId),
    sourceListItemAttached: Boolean(input.sourceListItemId),
  });
}

function trackEditSubmitValidationFailed(
  input: SubmitEditVisitInput,
  reason: string,
): void {
  trackObservabilityEvent('CREATE_VISIT_SUBMIT_VALIDATION_FAILED', {
    source: 'CreateVisitScreen',
    mode: 'edit',
    reason,
    itemCount: input.draftItems.length,
    visitVisibility: input.visitVisibility,
    sourceNoteAttached: Boolean(input.sourceNoteId),
    sourceListItemAttached: Boolean(input.sourceListItemId),
  });
}

function parseDraftItems(
  draftItems: CreateVisitSubmissionDraftItem[],
): ParsedCreateVisitItem[] {
  return draftItems.map((item) => ({
    name: item.name,
    rating: item.rating,
    description: item.description.trim() || undefined,
    notes: item.notes.trim() || undefined,
    photos: item.photos.flatMap((photo) =>
      photo.kind === 'new' && photo.upload ? [photo.upload] : [],
    ),
  }));
}

function parseEditDraftItems(
  draftItems: EditVisitSubmissionDraftItem[],
): ParsedEditVisitItem[] {
  return draftItems.map((item) => ({
    id: item.id,
    name: item.name,
    rating: item.rating,
    description: item.description.trim() || undefined,
    notes: item.notes.trim() || undefined,
    newPhotos: item.photos.flatMap((photo) =>
      photo.kind === 'new' && photo.upload ? [photo.upload] : [],
    ),
    deletePhotoIds: item.deletedPhotoIds,
  }));
}

function buildTrackingProperties(input: SubmitCreateVisitInput, parsedItems: ParsedCreateVisitItem[]): TrackingEntryProperties {
  const sourceNoteAttached = Boolean(input.sourceNoteId);
  const sourceListItemAttached = Boolean(input.sourceListItemId);

  return {
    entryType: 'restaurant_visit',
    source: sourceListItemAttached ? 'list' : sourceNoteAttached ? 'note' : 'add_tab',
    hasPhoto: parsedItems.some((item) => item.photos.length > 0),
    itemCount: parsedItems.length,
    ratingCount: parsedItems.filter((item) => item.rating >= 1 && item.rating <= 5).length,
    visibility: input.visitVisibility,
    completed: false,
  };
}

function buildEditTrackingProperties(
  input: SubmitEditVisitInput,
  parsedItems: ParsedEditVisitItem[],
): TrackingEntryProperties {
  const sourceNoteAttached = Boolean(input.sourceNoteId);
  const sourceListItemAttached = Boolean(input.sourceListItemId);

  return {
    entryType: 'restaurant_visit',
    source: sourceListItemAttached ? 'list' : sourceNoteAttached ? 'note' : 'add_tab',
    hasPhoto: parsedItems.some((item) => item.newPhotos.length > 0),
    itemCount: parsedItems.length,
    ratingCount: parsedItems.filter((item) => item.rating >= 1 && item.rating <= 5).length,
    visibility: input.visitVisibility,
    completed: false,
  };
}

function enforceClientPhotoQuota(
  input: SubmitCreateVisitInput,
  parsedItems: ParsedCreateVisitItem[],
): CreateVisitSubmissionResult | null {
  if (
    !input.shouldEnforceUsageLimitsClientSide ||
    !input.isDisplayFreeUser ||
    !input.monthlyUsageSnapshot
  ) {
    return null;
  }

  const photosInSubmission = parsedItems.reduce(
    (totalCount, item) => totalCount + item.photos.length,
    0,
  );
  const used = input.monthlyUsageSnapshot.usage.photoUploads;
  const estimatedTotalAfterSubmit = used + photosInSubmission;
  if (estimatedTotalAfterSubmit <= FREE_MONTHLY_VISIT_PHOTO_LIMIT) {
    return null;
  }

  const remaining = Math.max(FREE_MONTHLY_VISIT_PHOTO_LIMIT - used, 0);
  trackObservabilityEvent('USAGE_LIMIT_REACHED', {
    enforcement: 'client_estimate',
    limit: FREE_MONTHLY_VISIT_PHOTO_LIMIT,
    metric: 'photo_uploads',
    remaining,
    source: 'CreateVisitScreen',
    used,
  });
  trackProductEvent('quality.usage_limit_reached', {
    enforcement: 'client_estimate',
    limit: FREE_MONTHLY_VISIT_PHOTO_LIMIT,
    metric: 'photo_uploads',
    remaining,
    source: 'CreateVisitScreen',
    used,
  });

  return {
    errorMessage: `Free users can upload up to ${FREE_MONTHLY_VISIT_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`,
    status: 'blocked',
  };
}

async function linkCreatedVisitToSourceListItem(
  input: SubmitCreateVisitInput,
  createdVisit: VisitRecord,
): Promise<void> {
  if (!input.sourceListItemId || createdVisit.items.length === 0) {
    return;
  }

  const createdItemId = createdVisit.items[0]?.id;
  if (!createdItemId) {
    return;
  }

  try {
    await input.trackWriteTelemetry('list.bookmark.link-visit');
    await linkVisitToListBookmark({
      listItemId: input.sourceListItemId,
      userFoodItemId: createdItemId,
    });
    await Promise.all([
      input.queryClient.invalidateQueries({
        queryKey: restaurantListQueryKeys.itemsRoot,
      }),
      input.queryClient.invalidateQueries({
        queryKey: restaurantListQueryKeys.detailRoot,
      }),
    ]);
  } catch {
    // Keep visit creation successful even when list link-back fails.
  }
}

function trackCreateSucceeded(input: SubmitCreateVisitInput, parsedItems: ParsedCreateVisitItem[], queued: boolean): void {
  const hasPhotos = parsedItems.some((item) => item.photos.length > 0);
  const hasNotes = parsedItems.some((item) => Boolean(item.notes));
  const sourceNoteAttached = Boolean(input.sourceNoteId);
  const sourceListItemAttached = Boolean(input.sourceListItemId);
  const trackingProperties = buildTrackingProperties(input, parsedItems);

  trackObservabilityEvent('CREATE_VISIT_SUBMIT_SUCCEEDED', {
    source: 'CreateVisitScreen',
    mode: 'create',
    queued,
    itemCount: parsedItems.length,
    hasNotes,
    hasPhotos,
    visitVisibility: input.visitVisibility,
    sourceNoteAttached,
    sourceListItemAttached,
  });
  trackProductEvent('tracking.entry_completed', {
    ...trackingProperties,
    completed: true,
    queued,
  });
  if (sourceListItemAttached) {
    trackProductEvent('social.i_went_there_completed', {
      source: 'CreateVisitScreen',
      queued,
    });
  }
  trackFirstFoodLogged({
    ...trackingProperties,
    completed: true,
  });
}

export async function submitCreateVisit(
  input: SubmitCreateVisitInput,
): Promise<CreateVisitSubmissionResult> {
  const trimmedRestaurant = input.restaurantName.trim();
  const trimmedVisitDate = input.visitDate.trim();

  if (!trimmedRestaurant) {
    trackSubmitValidationFailed(input, 'missing_restaurant');
    return {
      errorMessage: 'Select a restaurant before continuing.',
      status: 'blocked',
    };
  }

  if (input.draftItems.length === 0) {
    trackSubmitValidationFailed(input, 'missing_items');
    return {
      errorMessage: 'Add at least one item.',
      status: 'blocked',
    };
  }

  if (!isValidLocalDate(trimmedVisitDate)) {
    trackSubmitValidationFailed(input, 'invalid_visit_date');
    return {
      errorMessage: 'Visit date must be in YYYY-MM-DD format.',
      status: 'blocked',
    };
  }

  const parsedItems = parseDraftItems(input.draftItems);
  if (parsedItems.some((item) => item.rating < 1 || item.rating > 5)) {
    trackSubmitValidationFailed(input, 'invalid_ratings');
    return {
      errorMessage: 'Ratings must be between 1 and 5.',
      status: 'blocked',
    };
  }

  const quotaResult = enforceClientPhotoQuota(input, parsedItems);
  if (quotaResult) {
    return quotaResult;
  }

  const hasNotes = parsedItems.some((item) => Boolean(item.notes));
  const hasPhotos = parsedItems.some((item) => item.photos.length > 0);
  const sourceNoteAttached = Boolean(input.sourceNoteId);
  const sourceListItemAttached = Boolean(input.sourceListItemId);
  const trackingProperties = buildTrackingProperties(input, parsedItems);

  trackProductEvent('tracking.rating_added', {
    ...trackingProperties,
    completed: false,
  });
  if (hasPhotos) {
    trackProductEvent('tracking.photo_added', {
      ...trackingProperties,
      completed: false,
    });
  }
  trackProductEvent('tracking.visibility_selected', {
    ...trackingProperties,
    completed: false,
  });
  trackObservabilityEvent('CREATE_VISIT_SUBMIT_STARTED', {
    source: 'CreateVisitScreen',
    mode: 'create',
    isOnline: input.isOnline,
    itemCount: parsedItems.length,
    hasNotes,
    hasPhotos,
    visitVisibility: input.visitVisibility,
    sourceNoteAttached,
    sourceListItemAttached,
  });

  const visitInput: CreateVisitInput = {
    restaurantId: input.restaurantId?.trim() || undefined,
    restaurantName: trimmedRestaurant,
    sourceListItemId: input.sourceListItemId?.trim() || undefined,
    items: parsedItems,
    visitedAt: localDateStringToUTC(trimmedVisitDate),
    visitedOn: trimmedVisitDate,
    visibility: input.visitVisibility,
    source: 'visit',
    sourceNoteId: input.sourceNoteId,
  };

  try {
    const noteUsedAt = input.sourceNoteId ? new Date().toISOString() : null;
    const createResult = await input.visitWrites.createVisit({
      input: visitInput,
      hasPhotoUploads: hasPhotos,
      sourceNote: {
        noteId: input.sourceNoteId,
        usedAt: noteUsedAt,
      },
      useApiReplay: !hasPhotos && !input.sourceNoteId,
    });

    if (createResult.status === 'queued') {
      trackCreateSucceeded(input, parsedItems, true);
      return {
        clearSourceListItemId: true,
        destination: {
          name: 'Home',
        },
        status: 'queued',
      };
    }

    const createdVisit = createResult.result;
    await linkCreatedVisitToSourceListItem(input, createdVisit);

    trackObservabilityEvent('Visit Creation Completed', {
      creationMethod: 'manual',
      hasNotes,
      hasPhotos,
      itemCount: parsedItems.length,
      source: 'CreateVisitScreen',
      visitVisibility: input.visitVisibility,
    });
    trackCreateSucceeded(input, parsedItems, false);

    await cleanupStagedPhotoFiles(parsedItems.flatMap((item) => item.photos));

    return {
      clearSourceListItemId: true,
      destination: {
        name: 'Home',
        params: buildVisitCreatedHomeParams(createdVisit.id),
      },
      status: 'completed',
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
        source: 'CreateVisitScreen',
        used: limitPayload.used,
        userTier: limitPayload.userTier ?? null,
      });
      trackProductEvent('quality.usage_limit_reached', {
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
    const errorMessage = limitPayload
      ? formatLimitExceededMessage(limitPayload)
      : error instanceof Error
        ? error.message
        : 'Could not save visit.';

    trackObservabilityEvent('CREATE_VISIT_SUBMIT_FAILED', {
      source: 'CreateVisitScreen',
      mode: 'create',
      errorMessage,
      errorType: error instanceof Error ? error.name : 'unknown_error',
      itemCount: parsedItems.length,
      hasNotes,
      hasPhotos,
      visitVisibility: input.visitVisibility,
      sourceNoteAttached,
      sourceListItemAttached,
    });
    trackProductEvent('tracking.entry_failed', {
      ...trackingProperties,
      completed: false,
      errorType: error instanceof Error ? error.name : 'unknown_error',
    });
    trackObservabilityEvent('Visit Creation Failed', {
      errorMessage,
      errorType: error instanceof Error ? error.name : 'unknown_error',
      source: 'CreateVisitScreen',
    });

    return {
      errorMessage,
      status: 'failed',
    };
  }
}

export async function submitEditVisit(
  input: SubmitEditVisitInput,
): Promise<EditVisitSubmissionResult> {
  const trimmedRestaurant = input.restaurantName.trim();
  const trimmedVisitDate = input.visitDate.trim();

  if (!trimmedRestaurant) {
    trackEditSubmitValidationFailed(input, 'missing_restaurant');
    return {
      errorMessage: 'Select a restaurant before continuing.',
      status: 'blocked',
    };
  }

  if (input.draftItems.length === 0) {
    trackEditSubmitValidationFailed(input, 'missing_items');
    return {
      errorMessage: 'Add at least one item.',
      status: 'blocked',
    };
  }

  if (!isValidLocalDate(trimmedVisitDate)) {
    trackEditSubmitValidationFailed(input, 'invalid_visit_date');
    return {
      errorMessage: 'Visit date must be in YYYY-MM-DD format.',
      status: 'blocked',
    };
  }

  const parsedItems = parseEditDraftItems(input.draftItems);
  if (parsedItems.some((item) => item.rating < 1 || item.rating > 5)) {
    trackEditSubmitValidationFailed(input, 'invalid_ratings');
    return {
      errorMessage: 'Ratings must be between 1 and 5.',
      status: 'blocked',
    };
  }

  if (!input.visitId) {
    trackEditSubmitValidationFailed(input, 'missing_visit_id');
    return {
      errorMessage: 'Could not save visit.',
      status: 'blocked',
    };
  }

  const hasNotes = parsedItems.some((item) => Boolean(item.notes));
  const hasNewPhotoUploads = parsedItems.some((item) => item.newPhotos.length > 0);
  const hasPhotoChanges =
    hasNewPhotoUploads ||
    parsedItems.some((item) => item.deletePhotoIds.length > 0);
  const sourceNoteAttached = Boolean(input.sourceNoteId);
  const sourceListItemAttached = Boolean(input.sourceListItemId);
  const trackingProperties = buildEditTrackingProperties(input, parsedItems);

  trackProductEvent('tracking.rating_added', {
    ...trackingProperties,
    completed: false,
  });
  if (hasNewPhotoUploads) {
    trackProductEvent('tracking.photo_added', {
      ...trackingProperties,
      completed: false,
    });
  }
  trackProductEvent('tracking.visibility_selected', {
    ...trackingProperties,
    completed: false,
  });
  trackObservabilityEvent('CREATE_VISIT_SUBMIT_STARTED', {
    source: 'CreateVisitScreen',
    mode: 'edit',
    isOnline: input.isOnline,
    itemCount: parsedItems.length,
    hasNotes,
    hasPhotos: hasNewPhotoUploads,
    visitVisibility: input.visitVisibility,
    sourceNoteAttached,
    sourceListItemAttached,
  });

  const visitUpdateInput: UpdateVisitInput = {
    restaurantId: input.restaurantId?.trim() || undefined,
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
    visitedOn: trimmedVisitDate,
    visibility: input.visitVisibility,
  };

  try {
    const writeVisitUpdate = input.hasDeletedPersistedVisitItem
      ? input.visitWrites.deleteVisitItem
      : input.visitWrites.updateVisit;
    const updateResult = await writeVisitUpdate({
      visitId: input.visitId,
      updates: visitUpdateInput,
      includeUsage: hasNewPhotoUploads,
      includeVisitPhotos: hasPhotoChanges,
    });

    const queued = updateResult.status === 'queued';
    if (!queued) {
      await cleanupStagedPhotoFiles(parsedItems.flatMap((item) => item.newPhotos));
    }

    trackObservabilityEvent('CREATE_VISIT_SUBMIT_SUCCEEDED', {
      source: 'CreateVisitScreen',
      mode: 'edit',
      queued,
      itemCount: parsedItems.length,
      hasNotes,
      hasPhotos: hasNewPhotoUploads,
      visitVisibility: input.visitVisibility,
      sourceNoteAttached,
      sourceListItemAttached,
    });
    trackProductEvent('tracking.entry_completed', {
      ...trackingProperties,
      completed: true,
      queued,
    });

    return {
      navigationIntent: 'back',
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
        source: 'CreateVisitScreen',
        used: limitPayload.used,
        userTier: limitPayload.userTier ?? null,
      });
      trackProductEvent('quality.usage_limit_reached', {
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
    const errorMessage = limitPayload
      ? formatLimitExceededMessage(limitPayload)
      : error instanceof Error
        ? error.message
        : 'Could not save visit.';

    trackObservabilityEvent('CREATE_VISIT_SUBMIT_FAILED', {
      source: 'CreateVisitScreen',
      mode: 'edit',
      errorMessage,
      errorType: error instanceof Error ? error.name : 'unknown_error',
      itemCount: parsedItems.length,
      hasNotes,
      hasPhotos: hasNewPhotoUploads,
      visitVisibility: input.visitVisibility,
      sourceNoteAttached,
      sourceListItemAttached,
    });
    trackProductEvent('tracking.entry_failed', {
      ...trackingProperties,
      completed: false,
      errorType: error instanceof Error ? error.name : 'unknown_error',
    });
    trackObservabilityEvent('Visit Creation Failed', {
      errorMessage,
      errorType: error instanceof Error ? error.name : 'unknown_error',
      source: 'CreateVisitScreen',
    });

    return {
      errorMessage,
      status: 'failed',
    };
  }
}
