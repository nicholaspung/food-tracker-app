import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import type { RestaurantListItemRecord, RestaurantListRecord } from '../models';
import {
  addRestaurantVisitRatingsToList,
  createDefaultRestaurantList,
  createRestaurantList,
  deleteRestaurantList,
  moveRestaurantListRestaurant,
  organizeRestaurantListItem,
  removeRestaurantFoodItemBookmarkFromList,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  saveRestaurantFoodItemToList,
  saveRestaurantToDefaultList,
  updateRestaurantList,
  type AddRestaurantVisitRatingsToListInput,
  type CreateRestaurantListInput,
  type MoveRestaurantListRestaurantInput,
  type OrganizeRestaurantListItemInput,
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
import {
  cacheResolvedWantToTryList,
  invalidateWantToTryMembershipTarget,
  projectWantToTryMembership,
  type WantToTryTargetInput,
  wantToTryQueryKeys,
} from './useWantToTryState';

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
  membershipTarget?: WantToTryTargetInput;
  sourceListId: string;
  bookmark: Omit<SaveRestaurantFoodItemToListInput, 'listId'>;
  optimisticDefaultListBookmark?: OptimisticDefaultListBookmark;
}

interface SaveBookmarkToDefaultListWriteInput {
  defaultListId?: string;
  membershipTarget?: WantToTryTargetInput;
  sourceListId: string;
  bookmark: Omit<SaveRestaurantFoodItemToListInput, 'listId'>;
  optimisticDefaultListBookmark?: OptimisticDefaultListBookmark;
}

interface SaveRestaurantToDefaultListWriteInput {
  defaultListId?: string;
  membershipTarget?: WantToTryTargetInput;
  sourceListId: string;
  restaurant: SaveRestaurantToDefaultListInput;
  optimisticRestaurant?: OptimisticRestaurantBookmark;
}

interface RemoveBookmarkFromDefaultListWriteInput {
  defaultListId: string;
  membershipTarget?: WantToTryTargetInput;
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

function projectWantToTryMembershipTarget(
  queryClient: QueryClient,
  input: {
    listId: string;
    saved: boolean;
    target?: WantToTryTargetInput;
  },
): void {
  if (!input.target) {
    return;
  }

  projectWantToTryMembership(queryClient, {
    listId: input.listId,
    saved: input.saved,
    target: input.target,
  });
}

async function syncWantToTryMembershipTarget(
  queryClient: QueryClient,
  input: {
    listId: string;
    saved: boolean;
    target?: WantToTryTargetInput;
  },
): Promise<void> {
  projectWantToTryMembershipTarget(queryClient, input);
  if (!input.target) {
    return;
  }
  await invalidateWantToTryMembershipTarget(queryClient, input.listId, input.target);
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
        execute: createRestaurantList.bind(null, input),
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
        execute: updateRestaurantList.bind(null, listId, updates, currentList),
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
        execute: createDefaultRestaurantList,
        fallbackErrorMessage: 'Could not create Want to Try list.',
        onSuccess: (createdList) => cacheResolvedWantToTryList(queryClient, createdList),
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
        execute: deleteRestaurantList.bind(null, listId),
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
        execute: moveRestaurantListRestaurant.bind(null, input),
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
        execute: removeRestaurantListSourceRating.bind(null, input),
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
        execute: removeRestaurantListUserRating.bind(null, listId, listItemId),
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
      membershipTarget,
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
          execute: saveRestaurantFoodItemToList.bind(null, input),
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
        listIds.forEach((listId) =>
          projectWantToTryMembershipTarget(queryClient, {
            listId,
            saved: true,
            target: membershipTarget,
          }),
        );
      } else {
        await Promise.all(
          listIds.map((listId) =>
            syncWantToTryMembershipTarget(queryClient, {
              listId,
              saved: true,
              target: membershipTarget,
            }),
          ),
        );
      }

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
      membershipTarget,
      optimisticDefaultListBookmark,
      sourceListId,
    }: SaveBookmarkToDefaultListWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[][]>> => {
      if (defaultListId) {
        return saveBookmarkToListsWrite({
          bookmark,
          listIds: [defaultListId],
          membershipTarget,
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
        execute: async (requestOptions) => {
          const defaultList = requestOptions
            ? await createDefaultRestaurantList(requestOptions)
            : await createDefaultRestaurantList();
          const savedItemsInput = {
            ...bookmark,
            listId: defaultList.id,
          };
          const savedItems = requestOptions
            ? await saveRestaurantFoodItemToList(savedItemsInput, requestOptions)
            : await saveRestaurantFoodItemToList(savedItemsInput);
          return [savedItems];
        },
        fallbackErrorMessage: 'Could not save bookmark to Want to Try.',
        onQueued: () => {
          patchQueuedDefaultListBookmark(queryClient, defaultListId, optimisticDefaultListBookmark);
          if (defaultListId) {
            projectWantToTryMembershipTarget(queryClient, {
              listId: defaultListId,
              saved: true,
              target: membershipTarget,
            });
          }
        },
        onSuccess: async (savedItemsByList) => {
          const savedListIds = savedItemsByList
            .flatMap((savedItems) => savedItems.map((savedItem) => savedItem.listId))
            .filter((savedListId) => savedListId.length > 0);
          await Promise.all([
            syncRestaurantListTargetContentCaches(queryClient, savedListIds),
            ...savedListIds.map((listId) =>
              syncWantToTryMembershipTarget(queryClient, {
                listId,
                saved: true,
                target: membershipTarget,
              }),
            ),
          ]);
          await queryClient.invalidateQueries({ queryKey: wantToTryQueryKeys.resolverRoot });
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
      defaultListId,
      membershipTarget,
      optimisticRestaurant,
      sourceListId,
    }: SaveRestaurantToDefaultListWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      return submitFeatureWrite({
        operationName: 'list.default.restaurant.save',
        offline: {
          strategy: 'outbox',
          payload: restaurant,
        },
        execute: saveRestaurantToDefaultList.bind(null, restaurant),
        fallbackErrorMessage: 'Could not save restaurant to Want to Try.',
        onQueued: () => {
          patchQueuedDefaultListBookmark(
            queryClient,
            defaultListId,
            optimisticRestaurant
              ? {
                  restaurant: optimisticRestaurant,
                  type: 'restaurant',
                }
              : undefined,
          );
          if (defaultListId) {
            projectWantToTryMembershipTarget(queryClient, {
              listId: defaultListId,
              saved: true,
              target: membershipTarget,
            });
          }
        },
        onSuccess: async (savedItems) => {
          const savedListIds = savedItems.map((savedItem) => savedItem.listId).filter((listId) => listId.length > 0);
          await Promise.all([
            syncRestaurantListTargetContentCaches(queryClient, savedListIds),
            ...savedListIds.map((listId) =>
              syncWantToTryMembershipTarget(queryClient, {
                listId,
                saved: true,
                target: membershipTarget,
              }),
            ),
          ]);
          await queryClient.invalidateQueries({ queryKey: wantToTryQueryKeys.resolverRoot });
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
      membershipTarget,
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
        execute: removeRestaurantFoodItemBookmarkFromList.bind(null, input),
        fallbackErrorMessage: 'Could not remove bookmark.',
        onQueued: () =>
          projectWantToTryMembershipTarget(queryClient, {
            listId: defaultListId,
            saved: false,
            target: membershipTarget,
          }),
        onSuccess: () =>
          syncWantToTryMembershipTarget(queryClient, {
            listId: defaultListId,
            saved: false,
            target: membershipTarget,
          }),
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
        execute: addRestaurantVisitRatingsToList.bind(null, input),
        fallbackErrorMessage: 'Could not add restaurant to list.',
        onSettledInvalidate: () => syncRestaurantListMembershipCaches(queryClient, input.listId),
        queuedToast: 'List updates',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const organizeRestaurantListItemWrite = useCallback(
    async (
      input: OrganizeRestaurantListItemInput,
    ): Promise<OfflineAwareFeatureWriteResult<void>> => {
      const affectedListIds = Array.from(
        new Set([input.currentListId, ...input.destinationListIds].filter(Boolean)),
      );

      return submitFeatureWrite({
        operationName: 'list.item.organize',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: organizeRestaurantListItem.bind(null, input),
        fallbackErrorMessage: 'Could not organize this item.',
        onSettledInvalidate: async () => {
          await Promise.all(
            affectedListIds.map((listId) =>
              syncRestaurantListMembershipCaches(queryClient, listId),
            ),
          );
        },
        queuedToast: 'List organization',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  return {
    addRestaurant: addRestaurantWrite,
    createDefaultRestaurantList: createDefaultListWrite,
    createRestaurantList: createListWrite,
    deleteRestaurantList: deleteListWrite,
    organizeRestaurantListItem: organizeRestaurantListItemWrite,
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
