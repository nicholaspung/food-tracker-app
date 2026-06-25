import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import type { RestaurantListItemRecord, RestaurantListRecord } from '../models';
import {
  addRestaurantVisitRatingsToList,
  createDefaultRestaurantList,
  createRestaurantList,
  deleteRestaurantList,
  moveRestaurantListRestaurant,
  removeRestaurantFoodItemBookmarkFromList,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  saveRestaurantFoodItemToList,
  saveRestaurantToDefaultList,
  updateRestaurantList,
  type AddRestaurantVisitRatingsToListInput,
  type CreateRestaurantListInput,
  type MoveRestaurantListRestaurantInput,
  type RemoveRestaurantFoodItemBookmarkFromListInput,
  type RemoveRestaurantListSourceRatingInput,
  type RestaurantListDetailRecord,
  type SaveRestaurantFoodItemToListInput,
  type SaveRestaurantToDefaultListInput,
  type UpdateRestaurantListInput,
} from './restaurantListsStore';
import {
  invalidateRestaurantListCollectionQueries,
  invalidateRestaurantListContentQueries,
  invalidateRestaurantListMetadataQueries,
  invalidateRestaurantListSaveTargetQueries,
  removeRestaurantListQueries,
  restaurantListQueryKeys,
  upsertRestaurantListInCollectionCaches,
} from './restaurantListQuery';
import type { OfflineAwareFeatureWriteResult } from './useOfflineAwareFeatureWrite';
import { useFeatureWriteSubmit } from './useFeatureWriteSubmit';

interface DeleteRestaurantListWriteInput {
  listId: string;
}

interface CreateRestaurantListWriteInput {
  input: CreateRestaurantListInput;
  optimisticQueuedList?: RestaurantListRecord;
}

interface UpdateRestaurantListWriteInput {
  currentList?: Pick<RestaurantListRecord, 'isDefault'> | null;
  listId: string;
  updates: UpdateRestaurantListInput;
}

interface RemoveRestaurantListUserRatingWriteInput {
  listId: string;
  listItemId: string;
}

interface SaveBookmarkToListsWriteInput {
  listIds: string[];
  sourceListId: string;
  bookmark: Omit<SaveRestaurantFoodItemToListInput, 'listId'>;
  optimisticDefaultListBookmark?: OptimisticDefaultListBookmark;
}

interface SaveBookmarkToDefaultListWriteInput {
  defaultListId?: string;
  sourceListId: string;
  bookmark: Omit<SaveRestaurantFoodItemToListInput, 'listId'>;
  optimisticDefaultListBookmark?: OptimisticDefaultListBookmark;
}

interface SaveRestaurantToDefaultListWriteInput {
  sourceListId: string;
  restaurant: SaveRestaurantToDefaultListInput;
  optimisticRestaurant?: OptimisticRestaurantBookmark;
}

interface RemoveBookmarkFromDefaultListWriteInput {
  defaultListId: string;
  sourceListId: string;
  bookmark: Omit<RemoveRestaurantFoodItemBookmarkFromListInput, 'listId'>;
}

export interface OptimisticRestaurantBookmark {
  city?: string;
  cuisineType?: string;
  id: string;
  latitude?: number;
  location?: string;
  longitude?: number;
  name: string;
  visibility?: 'private' | 'friends' | 'public';
}

export interface OptimisticMenuItemBookmark {
  id: string;
  name: string;
}

type OptimisticDefaultListBookmark =
  | {
      restaurant: OptimisticRestaurantBookmark;
      type: 'restaurant';
    }
  | {
      menuItem: OptimisticMenuItemBookmark;
      restaurant: OptimisticRestaurantBookmark;
      type: 'menuItem';
    };

function createEmptyRestaurantListDetail(
  items: RestaurantListDetailRecord['items'] = [],
): RestaurantListDetailRecord {
  return {
    list: null,
    items,
    bookmarkState: { savedListIdsByBookmarkLookupId: {} },
    photoPreviews: [],
    viewerLists: [],
  };
}

function patchQueuedRestaurantBookmarkToDefaultListDetail(
  currentDetail: RestaurantListDetailRecord | null | undefined,
  restaurant: OptimisticRestaurantBookmark,
  listId: string,
): RestaurantListDetailRecord {
  const currentItems = currentDetail?.items ?? [];
  if (currentItems.some((item) => item.restaurantId === restaurant.id)) {
    return currentDetail ?? createEmptyRestaurantListDetail(currentItems);
  }

  const createdAt = new Date().toISOString();
  return {
    list: currentDetail?.list ?? null,
    items: [
      {
        id: `queued:want-to-try-restaurant:${restaurant.id}`,
        listId,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        restaurantLocation: restaurant.location,
        restaurantCity: restaurant.city,
        restaurantCuisineType: restaurant.cuisineType,
        restaurantVisibility: restaurant.visibility,
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        position: currentItems.length,
        bookmarkedItems: [],
        createdAt,
      },
      ...currentItems,
    ],
    bookmarkState: currentDetail?.bookmarkState ?? { savedListIdsByBookmarkLookupId: {} },
    photoPreviews: currentDetail?.photoPreviews ?? [],
    viewerLists: currentDetail?.viewerLists ?? [],
  };
}

function patchQueuedMenuItemBookmarkToDefaultListDetail(
  currentDetail: RestaurantListDetailRecord | null | undefined,
  input: {
    listId: string;
    menuItem: OptimisticMenuItemBookmark;
    restaurant: OptimisticRestaurantBookmark;
  },
): RestaurantListDetailRecord {
  const currentItems = currentDetail?.items ?? [];
  const existingRestaurantItem = currentItems.find((item) => item.restaurantId === input.restaurant.id);
  if (
    existingRestaurantItem?.bookmarkedItems.some(
      (bookmarkedItem) => bookmarkedItem.userFoodItemId === input.menuItem.id,
    )
  ) {
    return currentDetail ?? createEmptyRestaurantListDetail(currentItems);
  }

  const createdAt = new Date().toISOString();
  const listItemId = existingRestaurantItem?.id ?? `queued:want-to-try-restaurant:${input.restaurant.id}`;
  const queuedBookmarkedItem = {
    id: `queued:want-to-try-menu-item:${input.menuItem.id}`,
    listItemId,
    menuItemId: input.menuItem.id,
    name: input.menuItem.name,
    rating: 0,
  };
  const nextItems = existingRestaurantItem
    ? currentItems.map((item) =>
        item.id === existingRestaurantItem.id
          ? {
              ...item,
              bookmarkedItems: [queuedBookmarkedItem, ...item.bookmarkedItems],
            }
          : item,
      )
    : [
        {
          id: listItemId,
          listId: input.listId,
          restaurantId: input.restaurant.id,
          restaurantName: input.restaurant.name,
          restaurantLocation: input.restaurant.location,
          restaurantCity: input.restaurant.city,
          restaurantCuisineType: input.restaurant.cuisineType,
          restaurantVisibility: input.restaurant.visibility,
          latitude: input.restaurant.latitude,
          longitude: input.restaurant.longitude,
          position: currentItems.length,
          bookmarkedItems: [queuedBookmarkedItem],
          createdAt,
        },
        ...currentItems,
      ];

  return {
    list: currentDetail?.list ?? null,
    items: nextItems,
    bookmarkState: currentDetail?.bookmarkState ?? { savedListIdsByBookmarkLookupId: {} },
    photoPreviews: currentDetail?.photoPreviews ?? [],
    viewerLists: currentDetail?.viewerLists ?? [],
  };
}

function patchQueuedDefaultListBookmark(
  queryClient: QueryClient,
  listId: string | undefined,
  bookmark: OptimisticDefaultListBookmark | undefined,
): void {
  if (!listId || !bookmark) {
    return;
  }

  queryClient.setQueryData<RestaurantListDetailRecord | null | undefined>(
    restaurantListQueryKeys.detail(listId),
    (currentDetail) =>
      bookmark.type === 'restaurant'
        ? patchQueuedRestaurantBookmarkToDefaultListDetail(currentDetail, bookmark.restaurant, listId)
        : patchQueuedMenuItemBookmarkToDefaultListDetail(currentDetail, {
            listId,
            menuItem: bookmark.menuItem,
            restaurant: bookmark.restaurant,
          }),
  );
}

async function syncDeletedRestaurantListCaches(
  queryClient: QueryClient,
  listId: string,
): Promise<void> {
  await invalidateRestaurantListCollectionQueries(queryClient);
  removeRestaurantListQueries(queryClient, listId);
}

async function syncCreatedRestaurantListCaches(
  queryClient: QueryClient,
  options: {
    createdList?: RestaurantListRecord;
    optimisticQueuedList?: RestaurantListRecord;
  } = {},
): Promise<void> {
  const list = options.createdList ?? options.optimisticQueuedList;
  if (list) {
    upsertRestaurantListInCollectionCaches(queryClient, list, 'my');
  }

  await invalidateRestaurantListCollectionQueries(queryClient);
}

async function syncUpdatedRestaurantListCaches(
  queryClient: QueryClient,
  listId: string,
): Promise<void> {
  await invalidateRestaurantListMetadataQueries(queryClient, listId);
}

async function syncRestaurantListMembershipCaches(
  queryClient: QueryClient,
  listId: string,
): Promise<void> {
  await invalidateRestaurantListContentQueries(queryClient, listId, {
    includeCandidateRestaurants: true,
  });
}

async function syncRestaurantListTargetContentCaches(
  queryClient: QueryClient,
  targetListIds: string[],
): Promise<void> {
  await Promise.all(
    Array.from(new Set(targetListIds))
      .filter((listId) => listId.length > 0)
      .map((listId) => invalidateRestaurantListContentQueries(queryClient, listId)),
  );
}

async function syncRestaurantListSaveTargetCaches(
  queryClient: QueryClient,
  sourceListId: string,
  targetListIds: string[] = [],
): Promise<void> {
  await Promise.all([
    invalidateRestaurantListSaveTargetQueries(queryClient, sourceListId),
    syncRestaurantListTargetContentCaches(queryClient, targetListIds),
  ]);
}

export function useRestaurantListWrites() {
  const queryClient = useQueryClient();
  const { submitFeatureWrite } = useFeatureWriteSubmit();

  const createListWrite = useCallback(
    async ({
      input,
      optimisticQueuedList,
    }: CreateRestaurantListWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListRecord>> =>
      submitFeatureWrite({
        operationName: 'list.create',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: () => createRestaurantList(input),
        fallbackErrorMessage: 'Could not create list.',
        onQueued: () => syncCreatedRestaurantListCaches(queryClient, { optimisticQueuedList }),
        onSuccess: (createdList) => syncCreatedRestaurantListCaches(queryClient, { createdList }),
        queuedToast: 'List',
      }),
    [queryClient, submitFeatureWrite],
  );

  const updateListWrite = useCallback(
    async ({
      currentList,
      listId,
      updates,
    }: UpdateRestaurantListWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListRecord>> =>
      submitFeatureWrite({
        operationName: 'list.update',
        offline: {
          strategy: 'outbox',
          payload: {
            listId,
            updates,
          },
        },
        execute: () => updateRestaurantList(listId, updates, currentList),
        fallbackErrorMessage: 'Could not update list.',
        onSettledInvalidate: () => syncUpdatedRestaurantListCaches(queryClient, listId),
        queuedToast: 'List update',
      }),
    [queryClient, submitFeatureWrite],
  );

  const createDefaultListWrite = useCallback(
    async (): Promise<OfflineAwareFeatureWriteResult<RestaurantListRecord>> =>
      submitFeatureWrite({
        operationName: 'list.default.create',
        offline: {
          strategy: 'outbox',
          payload: {},
        },
        execute: () => createDefaultRestaurantList(),
        fallbackErrorMessage: 'Could not create Want to Try list.',
        onSettledInvalidate: () => invalidateRestaurantListCollectionQueries(queryClient, 'my'),
        queuedToast: 'Want to Try list',
      }),
    [queryClient, submitFeatureWrite],
  );

  const deleteListWrite = useCallback(
    async ({
      listId,
    }: DeleteRestaurantListWriteInput): Promise<OfflineAwareFeatureWriteResult<void>> =>
      submitFeatureWrite({
        operationName: 'list.delete',
        offline: {
          strategy: 'outbox',
          payload: { listId },
        },
        execute: () => deleteRestaurantList(listId),
        fallbackErrorMessage: 'Could not delete list.',
        onSettledInvalidate: () => syncDeletedRestaurantListCaches(queryClient, listId),
        queuedToast: 'List delete',
      }),
    [queryClient, submitFeatureWrite],
  );

  const reorderRestaurantWrite = useCallback(
    async (
      input: MoveRestaurantListRestaurantInput,
    ): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      return submitFeatureWrite({
        operationName: 'list.restaurant.reorder',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: () => moveRestaurantListRestaurant(input),
        fallbackErrorMessage: 'Could not reorder list.',
        onSettledInvalidate: () => syncRestaurantListMembershipCaches(queryClient, input.listId),
        queuedToast: 'List reorder',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const removeSourceRatingWrite = useCallback(
    async (
      input: RemoveRestaurantListSourceRatingInput,
    ): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      return submitFeatureWrite({
        operationName: 'list.restaurant.remove.source',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: () => removeRestaurantListSourceRating(input),
        fallbackErrorMessage: 'Could not remove rating.',
        onSettledInvalidate: () => syncRestaurantListMembershipCaches(queryClient, input.listId),
        queuedToast: 'List update',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const removeUserRatingWrite = useCallback(
    async ({
      listId,
      listItemId,
    }: RemoveRestaurantListUserRatingWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      return submitFeatureWrite({
        operationName: 'list.restaurant.remove.user',
        offline: {
          strategy: 'outbox',
          payload: { listId, listItemId },
        },
        execute: () => removeRestaurantListUserRating(listId, listItemId),
        fallbackErrorMessage: 'Could not remove rating.',
        onSettledInvalidate: () => syncRestaurantListMembershipCaches(queryClient, listId),
        queuedToast: 'List update',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const saveBookmarkToListsWrite = useCallback(
    async ({
      bookmark,
      listIds,
      optimisticDefaultListBookmark,
      sourceListId,
    }: SaveBookmarkToListsWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[][]>> => {
      const completedResults: RestaurantListItemRecord[][] = [];
      let queued = false;

      for (const listId of listIds) {
        const input: SaveRestaurantFoodItemToListInput = {
          ...bookmark,
          listId,
        };
        const result = await submitFeatureWrite({
          operationName: 'list.bookmark.save',
          offline: {
            strategy: 'outbox',
            payload: input,
          },
          execute: () => saveRestaurantFoodItemToList(input),
          fallbackErrorMessage: 'Could not save bookmark.',
          queuedToast: 'Bookmark save',
        });

        if (result.status === 'queued') {
          queued = true;
        } else {
          completedResults.push(result.result);
        }
      }

      await syncRestaurantListSaveTargetCaches(queryClient, sourceListId, listIds);

      if (queued) {
        patchQueuedDefaultListBookmark(
          queryClient,
          listIds.length === 1 ? listIds[0] : undefined,
          optimisticDefaultListBookmark,
        );
        return { status: 'queued' };
      }

      return {
        status: 'completed',
        result: completedResults,
      };
    },
    [queryClient, submitFeatureWrite],
  );

  const saveBookmarkToDefaultListWrite = useCallback(
    async ({
      bookmark,
      defaultListId,
      optimisticDefaultListBookmark,
      sourceListId,
    }: SaveBookmarkToDefaultListWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[][]>> => {
      if (defaultListId) {
        return saveBookmarkToListsWrite({
          bookmark,
          listIds: [defaultListId],
          optimisticDefaultListBookmark,
          sourceListId,
        });
      }

      return submitFeatureWrite({
        operationName: 'list.default.bookmark.save',
        offline: {
          strategy: 'outbox',
          payload: bookmark,
        },
        execute: async () => {
          const defaultList = await createDefaultRestaurantList();
          const savedItems = await saveRestaurantFoodItemToList({
            ...bookmark,
            listId: defaultList.id,
          });
          return [savedItems];
        },
        fallbackErrorMessage: 'Could not save bookmark to Want to Try.',
        onQueued: () => patchQueuedDefaultListBookmark(queryClient, defaultListId, optimisticDefaultListBookmark),
        onSuccess: (savedItemsByList) => {
          const savedListIds = savedItemsByList
            .flatMap((savedItems) => savedItems.map((savedItem) => savedItem.listId))
            .filter((savedListId) => savedListId.length > 0);
          return syncRestaurantListTargetContentCaches(queryClient, savedListIds);
        },
        onSettledInvalidate: () => syncRestaurantListSaveTargetCaches(queryClient, sourceListId),
        queuedToast: 'Want to Try bookmark',
      });
    },
    [queryClient, saveBookmarkToListsWrite, submitFeatureWrite],
  );

  const saveRestaurantToDefaultListWrite = useCallback(
    async ({
      restaurant,
      optimisticRestaurant,
      sourceListId,
    }: SaveRestaurantToDefaultListWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      return submitFeatureWrite({
        operationName: 'list.default.restaurant.save',
        offline: {
          strategy: 'outbox',
          payload: restaurant,
        },
        execute: () => saveRestaurantToDefaultList(restaurant),
        fallbackErrorMessage: 'Could not save restaurant to Want to Try.',
        onQueued: () =>
          patchQueuedDefaultListBookmark(
            queryClient,
            sourceListId === 'default' ? undefined : sourceListId,
            optimisticRestaurant
              ? {
                  restaurant: optimisticRestaurant,
                  type: 'restaurant',
                }
              : undefined,
          ),
        onSuccess: (savedItems) => {
          const savedListIds = savedItems.map((savedItem) => savedItem.listId).filter((listId) => listId.length > 0);
          return syncRestaurantListTargetContentCaches(queryClient, savedListIds);
        },
        onSettledInvalidate: () => syncRestaurantListSaveTargetCaches(queryClient, sourceListId),
        queuedToast: 'Want to Try restaurant',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const removeBookmarkFromDefaultListWrite = useCallback(
    async ({
      bookmark,
      defaultListId,
      sourceListId,
    }: RemoveBookmarkFromDefaultListWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      const input: RemoveRestaurantFoodItemBookmarkFromListInput = {
        ...bookmark,
        listId: defaultListId,
      };
      return submitFeatureWrite({
        operationName: 'list.bookmark.remove',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: () => removeRestaurantFoodItemBookmarkFromList(input),
        fallbackErrorMessage: 'Could not remove bookmark.',
        onSettledInvalidate: async () => {
          await syncRestaurantListMembershipCaches(queryClient, defaultListId);
          await syncRestaurantListSaveTargetCaches(queryClient, sourceListId);
        },
        queuedToast: 'Bookmark remove',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const addRestaurantWrite = useCallback(
    async (
      input: AddRestaurantVisitRatingsToListInput,
    ): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      return submitFeatureWrite({
        operationName: 'list.restaurant.add',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: () => addRestaurantVisitRatingsToList(input),
        fallbackErrorMessage: 'Could not add restaurant to list.',
        onSettledInvalidate: () => syncRestaurantListMembershipCaches(queryClient, input.listId),
        queuedToast: 'List updates',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  return {
    addRestaurant: addRestaurantWrite,
    createDefaultRestaurantList: createDefaultListWrite,
    createRestaurantList: createListWrite,
    deleteRestaurantList: deleteListWrite,
    reorderRestaurant: reorderRestaurantWrite,
    removeRestaurantListSourceRating: removeSourceRatingWrite,
    removeRestaurantListUserRating: removeUserRatingWrite,
    removeBookmarkFromDefaultList: removeBookmarkFromDefaultListWrite,
    saveBookmarkToDefaultList: saveBookmarkToDefaultListWrite,
    saveBookmarkToLists: saveBookmarkToListsWrite,
    saveRestaurantToDefaultList: saveRestaurantToDefaultListWrite,
    updateRestaurantList: updateListWrite,
  };
}
