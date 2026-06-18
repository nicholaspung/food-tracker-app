import type { QueryClient } from '@tanstack/react-query';

import type { RestaurantListRecord, restaurantListQueryKeys, useRestaurantListWrites } from '../../features';
import type { trackObservabilityEvent } from '../../observability';
import type { trackProductEvent } from '../../observability/productAnalytics';
import type { SaveBookmarkTarget, SaveBookmarkTrackingContext } from './listDetailTypes';

type RestaurantListWrites = ReturnType<typeof useRestaurantListWrites>;
type ObservabilityTracker = typeof trackObservabilityEvent;
type ProductTracker = typeof trackProductEvent;
type RestaurantListQueryKeys = typeof restaurantListQueryKeys;

export interface ListDetailAnalyticsContext {
  isDefaultList: boolean;
  restaurantCount: number;
  source: 'ListDetailScreen';
}

export interface ListDetailActionDependencies {
  analyticsContext: ListDetailAnalyticsContext;
  isOnline: boolean;
  listId: string;
  queryClient: QueryClient;
  queryKeys: RestaurantListQueryKeys;
  refetchDetail: () => Promise<unknown>;
  restaurantListWrites: RestaurantListWrites;
  share: (content: { message: string }) => Promise<unknown>;
  shareLinkService: {
    disable: (listId: string) => Promise<unknown>;
    getOrCreate: (listId: string) => Promise<{ path?: string; url?: string }>;
    regenerate: (listId: string) => Promise<{ path?: string; url?: string }>;
  };
  shareUrlBase: string;
  trackObservabilityEvent: ObservabilityTracker;
  trackProductEvent: ProductTracker;
}

interface ListDetailActionInput {
  deps: ListDetailActionDependencies;
  isOwner: boolean;
}

interface ListDetailActionResult {
  queued: boolean;
}

export interface SaveBookmarkActionResult extends ListDetailActionResult {
  saved: boolean;
  errorMessage?: string;
}

export function resolveListDetailShareUrl(
  shareLink: { path?: string; url?: string },
  shareUrlBase: string,
): string {
  const path = shareLink.path?.trim();
  if (path) {
    return `${shareUrlBase.replace(/\/$/, '')}${path}`;
  }

  return shareLink.url?.trim() ?? '';
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function shareListLinkAction({
  deps,
  isOwner,
  list,
  mode = 'create',
}: ListDetailActionInput & {
  list: RestaurantListRecord | null;
  mode?: 'create' | 'regenerate';
}): Promise<void> {
  if (!list || !isOwner) {
    return;
  }

  const shareLink =
    mode === 'regenerate'
      ? await deps.shareLinkService.regenerate(list.id)
      : await deps.shareLinkService.getOrCreate(list.id);
  const shareUrl = resolveListDetailShareUrl(shareLink, deps.shareUrlBase);
  if (!shareUrl) {
    throw new Error('Could not create a share link.');
  }

  await deps.share({
    message: `View my Yummy Recs list "${list.name}": ${shareUrl}`,
  });
  await deps.refetchDetail();
  await deps.queryClient.invalidateQueries({ queryKey: deps.queryKeys.root });
  deps.trackProductEvent('social.invite_shared', {
    source: 'ListDetailScreen',
    shareMethod: 'restaurant_list_link',
  });
}

export async function disableShareLinkAction({
  deps,
  isOwner,
  list,
}: ListDetailActionInput & {
  list: RestaurantListRecord | null;
}): Promise<void> {
  if (!list || !isOwner) {
    return;
  }

  await deps.shareLinkService.disable(list.id);
  await deps.refetchDetail();
  await deps.queryClient.invalidateQueries({ queryKey: deps.queryKeys.root });
}

export async function reorderRestaurantAction({
  deps,
  direction,
  isOwner,
  restaurantId,
}: ListDetailActionInput & {
  direction: 'up' | 'down';
  restaurantId: string;
}): Promise<ListDetailActionResult | null> {
  if (!isOwner) {
    return null;
  }

  deps.trackObservabilityEvent('LIST_DETAIL_REORDER_TAPPED', {
    ...deps.analyticsContext,
    direction,
    isOnline: deps.isOnline,
  });
  deps.trackObservabilityEvent('LIST_DETAIL_REORDER_STARTED', {
    ...deps.analyticsContext,
    direction,
    isOnline: deps.isOnline,
  });

  try {
    const result = await deps.restaurantListWrites.reorderRestaurant({
      listId: deps.listId,
      restaurantId,
      direction,
    });
    const queued = result.status === 'queued';
    deps.trackObservabilityEvent('LIST_DETAIL_REORDER_SUCCEEDED', {
      ...deps.analyticsContext,
      direction,
      queued,
    });
    return { queued };
  } catch (error) {
    const message = getErrorMessage(error, 'Could not reorder restaurant.');
    deps.trackObservabilityEvent('LIST_DETAIL_REORDER_FAILED', {
      ...deps.analyticsContext,
      direction,
      errorMessage: message,
      errorType: error instanceof Error ? error.name : 'unknown_error',
      isOnline: deps.isOnline,
    });
    throw new Error(message);
  }
}

export async function removeSourceRatingAction({
  deps,
  foodItemId,
  isOwner,
  itemKind = 'source',
  listItemId,
}: ListDetailActionInput & {
  foodItemId: string;
  itemKind?: 'source' | 'user_standalone';
  listItemId: string;
}): Promise<ListDetailActionResult | null> {
  if (!isOwner) {
    return null;
  }

  deps.trackObservabilityEvent(
    itemKind === 'source' ? 'LIST_DETAIL_SOURCE_RATING_REMOVE_TAPPED' : 'LIST_DETAIL_USER_RATING_REMOVE_TAPPED',
    {
      ...deps.analyticsContext,
      isOnline: deps.isOnline,
    },
  );
  deps.trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_STARTED', {
    ...deps.analyticsContext,
    isOnline: deps.isOnline,
    itemKind,
  });

  try {
    const result = await deps.restaurantListWrites.removeRestaurantListSourceRating({
      listId: deps.listId,
      listItemId,
      foodItemId,
    });
    const queued = result.status === 'queued';
    deps.trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_SUCCEEDED', {
      ...deps.analyticsContext,
      itemKind,
      queued,
    });
    return { queued };
  } catch (error) {
    const message = getErrorMessage(error, 'Could not remove rating.');
    deps.trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_FAILED', {
      ...deps.analyticsContext,
      errorMessage: message,
      errorType: error instanceof Error ? error.name : 'unknown_error',
      isOnline: deps.isOnline,
      itemKind,
    });
    throw new Error(message);
  }
}

export async function removeUserRatingAction({
  deps,
  isOwner,
  listItemId,
}: ListDetailActionInput & {
  listItemId: string;
}): Promise<ListDetailActionResult | null> {
  if (!isOwner) {
    return null;
  }

  deps.trackObservabilityEvent('LIST_DETAIL_USER_RATING_REMOVE_TAPPED', {
    ...deps.analyticsContext,
    isOnline: deps.isOnline,
  });
  deps.trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_STARTED', {
    ...deps.analyticsContext,
    isOnline: deps.isOnline,
    itemKind: 'user_linked',
  });

  try {
    const result = await deps.restaurantListWrites.removeRestaurantListUserRating({
      listId: deps.listId,
      listItemId,
    });
    const queued = result.status === 'queued';
    deps.trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_SUCCEEDED', {
      ...deps.analyticsContext,
      itemKind: 'user_linked',
      queued,
    });
    return { queued };
  } catch (error) {
    const message = getErrorMessage(error, 'Could not remove rating.');
    deps.trackObservabilityEvent('LIST_DETAIL_ITEM_DELETE_FAILED', {
      ...deps.analyticsContext,
      errorMessage: message,
      errorType: error instanceof Error ? error.name : 'unknown_error',
      isOnline: deps.isOnline,
      itemKind: 'user_linked',
    });
    throw new Error(message);
  }
}

export async function saveBookmarkToDefaultListAction({
  alreadySavedListIdsForTarget,
  defaultList,
  deps,
  isOwner,
  list,
  saveBookmarkTarget,
}: ListDetailActionInput & {
  alreadySavedListIdsForTarget: Set<string>;
  defaultList: RestaurantListRecord | undefined;
  list: RestaurantListRecord | null;
  saveBookmarkTarget: SaveBookmarkTarget | null;
}): Promise<SaveBookmarkActionResult> {
  if (isOwner || !saveBookmarkTarget) {
    return { saved: false, queued: false };
  }

  deps.trackObservabilityEvent('LIST_DETAIL_SAVE_QUICK_DEFAULT_TAPPED', {
    source: 'ListDetailScreen',
    isOnline: deps.isOnline,
    hasDefaultList: Boolean(defaultList?.id),
  });
  const targetDefaultListId = defaultList?.id;

  if (!targetDefaultListId && !list?.userId) {
    trackSaveBookmarkValidationFailed(deps, {
      entryMethod: 'quick_default',
      reason: 'default_list_unavailable',
      targetListCount: 1,
      hasDefaultList: Boolean(defaultList?.id),
    });
    return { saved: false, queued: false, errorMessage: 'Want to Try list is not available.' };
  }

  if (targetDefaultListId && alreadySavedListIdsForTarget.has(targetDefaultListId)) {
    trackSaveBookmarkValidationFailed(deps, {
      entryMethod: 'quick_default',
      reason: 'already_saved_in_default_list',
      targetListCount: 1,
      hasDefaultList: Boolean(defaultList?.id),
    });
    return { saved: false, queued: false, errorMessage: 'This item is already in your Want to Try list.' };
  }

  deps.trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_STARTED', {
    source: 'ListDetailScreen',
    targetListCount: 1,
    isOnline: deps.isOnline,
  });

  try {
    const result = await deps.restaurantListWrites.saveBookmarkToDefaultList({
      defaultListId: targetDefaultListId,
      sourceListId: deps.listId,
      bookmark: {
        restaurantId: saveBookmarkTarget.restaurantId,
        foodItemId: saveBookmarkTarget.foodItemId,
        ...(saveBookmarkTarget.sourceNote ? { note: saveBookmarkTarget.sourceNote } : {}),
        sourceListId: deps.listId,
        sourceListItemId: saveBookmarkTarget.sourceListItemId,
        sourceUserId: list?.userId,
      },
    });
    const queued = result.status === 'queued';
    trackSaveBookmarkSucceeded(
      deps,
      {
        entryMethod: 'quick_default',
        createdDefaultList: !defaultList?.id,
      },
      1,
      queued,
    );
    return { saved: true, queued };
  } catch (error) {
    const message = getErrorMessage(error, 'Could not save this bookmark.');
    trackSaveBookmarkFailed(
      deps,
      {
        entryMethod: 'quick_default',
        createdDefaultList: !defaultList?.id,
      },
      {
        createdDefaultList: !defaultList?.id,
        error,
        message,
        stage: targetDefaultListId ? 'bookmark_save' : 'default_list_create',
        targetListCount: 1,
      },
    );
    return { saved: false, queued: false, errorMessage: message };
  }
}

function trackSaveBookmarkSucceeded(
  deps: ListDetailActionDependencies,
  trackingContext: SaveBookmarkTrackingContext,
  targetListCount: number,
  queued: boolean,
): void {
  deps.trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_SUCCEEDED', {
    source: 'ListDetailScreen',
    entryMethod: trackingContext.entryMethod,
    queued,
    targetListCount,
    createdDefaultList: trackingContext.createdDefaultList,
    isOnline: deps.isOnline,
  });
  deps.trackProductEvent('social.recommendation_saved', {
    source: 'ListDetailScreen',
    entryMethod: trackingContext.entryMethod,
    queued,
    targetListCount,
    createdDefaultList: trackingContext.createdDefaultList,
  });
}

function trackSaveBookmarkFailed(
  deps: ListDetailActionDependencies,
  trackingContext: SaveBookmarkTrackingContext,
  options: {
    createdDefaultList: boolean;
    error: unknown;
    message: string;
    stage: 'bookmark_save' | 'default_list_create';
    targetListCount: number;
  },
): void {
  deps.trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_FAILED', {
    source: 'ListDetailScreen',
    entryMethod: trackingContext.entryMethod,
    stage: options.stage,
    errorMessage: options.message,
    errorType: options.error instanceof Error ? options.error.name : 'unknown_error',
    targetListCount: options.targetListCount,
    createdDefaultList: options.createdDefaultList,
    isOnline: deps.isOnline,
  });
}

function trackSaveBookmarkValidationFailed(
  deps: ListDetailActionDependencies,
  options: {
    entryMethod: SaveBookmarkTrackingContext['entryMethod'];
    hasDefaultList: boolean;
    reason: string;
    targetListCount: number;
  },
): void {
  deps.trackObservabilityEvent('LIST_DETAIL_SAVE_TO_LISTS_VALIDATION_FAILED', {
    source: 'ListDetailScreen',
    entryMethod: options.entryMethod,
    reason: options.reason,
    targetListCount: options.targetListCount,
    hasDefaultList: options.hasDefaultList,
    isOnline: deps.isOnline,
  });
}
