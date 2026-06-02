import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import type { RestaurantListItemRecord, RestaurantListRecord } from '../models';
import {
  addRestaurantVisitRatingsToList,
  createDefaultRestaurantList,
  createRestaurantList,
  deleteRestaurantList,
  moveRestaurantListRestaurant,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  saveRestaurantFoodItemToList,
  saveRestaurantToDefaultList,
  updateRestaurantList,
  type AddRestaurantVisitRatingsToListInput,
  type CreateRestaurantListInput,
  type MoveRestaurantListRestaurantInput,
  type RemoveRestaurantListSourceRatingInput,
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
  upsertRestaurantListInCollectionCaches,
} from './restaurantListQuery';
import {
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';
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
}

interface SaveBookmarkToDefaultListWriteInput {
  defaultListId?: string;
  sourceListId: string;
  bookmark: Omit<SaveRestaurantFoodItemToListInput, 'listId'>;
}

interface SaveRestaurantToDefaultListWriteInput {
  sourceListId: string;
  restaurant: SaveRestaurantToDefaultListInput;
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

async function syncRestaurantListSaveTargetCaches(
  queryClient: QueryClient,
  sourceListId: string,
): Promise<void> {
  await invalidateRestaurantListSaveTargetQueries(queryClient, sourceListId);
}

export function useRestaurantListWrites() {
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();
  const {
    errorMessage,
    isSubmitting,
    setErrorMessage,
    submitFeatureWrite,
  } = useFeatureWriteSubmit();

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

  // TODO: Migrate the remaining Restaurant List write paths to useFeatureWriteSubmit
  // after create proves the shared lifecycle preserves their existing cache and queue behavior.
  const updateListWrite = useCallback(
    async ({
      currentList,
      listId,
      updates,
    }: UpdateRestaurantListWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListRecord>> => {
      const result = await writeFeature({
        operationName: 'list.update',
        offline: {
          strategy: 'outbox',
          payload: {
            listId,
            updates,
          },
        },
        execute: () => updateRestaurantList(listId, updates, currentList),
      });

      await syncUpdatedRestaurantListCaches(queryClient, listId);

      if (result.status === 'queued') {
        showQueuedOfflineAlert('List update');
      }

      return result;
    },
    [queryClient, writeFeature],
  );

  const createDefaultListWrite = useCallback(
    async (): Promise<OfflineAwareFeatureWriteResult<RestaurantListRecord>> => {
      const result = await writeFeature({
        operationName: 'list.default.create',
        offline: {
          strategy: 'outbox',
          payload: {},
        },
        execute: () => createDefaultRestaurantList(),
      });

      await invalidateRestaurantListCollectionQueries(queryClient, 'my');

      return result;
    },
    [queryClient, writeFeature],
  );

  const deleteListWrite = useCallback(
    async ({
      listId,
    }: DeleteRestaurantListWriteInput): Promise<OfflineAwareFeatureWriteResult<void>> => {
      const result = await writeFeature({
        operationName: 'list.delete',
        offline: {
          strategy: 'outbox',
          payload: { listId },
        },
        execute: () => deleteRestaurantList(listId),
      });

      await syncDeletedRestaurantListCaches(queryClient, listId);

      if (result.status === 'queued') {
        showQueuedOfflineAlert('List delete');
      }

      return result;
    },
    [queryClient, writeFeature],
  );

  const reorderRestaurantWrite = useCallback(
    async (
      input: MoveRestaurantListRestaurantInput,
    ): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      const result = await writeFeature({
        operationName: 'list.restaurant.reorder',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: () => moveRestaurantListRestaurant(input),
      });

      await syncRestaurantListMembershipCaches(queryClient, input.listId);

      if (result.status === 'queued') {
        showQueuedOfflineAlert('List reorder');
      }

      return result;
    },
    [queryClient, writeFeature],
  );

  const removeSourceRatingWrite = useCallback(
    async (
      input: RemoveRestaurantListSourceRatingInput,
    ): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      const result = await writeFeature({
        operationName: 'list.restaurant.remove.source',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: () => removeRestaurantListSourceRating(input),
      });

      await syncRestaurantListMembershipCaches(queryClient, input.listId);

      if (result.status === 'queued') {
        showQueuedOfflineAlert('List update');
      }

      return result;
    },
    [queryClient, writeFeature],
  );

  const removeUserRatingWrite = useCallback(
    async ({
      listId,
      listItemId,
    }: RemoveRestaurantListUserRatingWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      const result = await writeFeature({
        operationName: 'list.restaurant.remove.user',
        offline: {
          strategy: 'outbox',
          payload: { listId, listItemId },
        },
        execute: () => removeRestaurantListUserRating(listId, listItemId),
      });

      await syncRestaurantListMembershipCaches(queryClient, listId);

      if (result.status === 'queued') {
        showQueuedOfflineAlert('List update');
      }

      return result;
    },
    [queryClient, writeFeature],
  );

  const saveBookmarkToListsWrite = useCallback(
    async ({
      bookmark,
      listIds,
      sourceListId,
    }: SaveBookmarkToListsWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[][]>> => {
      const completedResults: RestaurantListItemRecord[][] = [];
      let queued = false;

      for (const listId of listIds) {
        const input: SaveRestaurantFoodItemToListInput = {
          ...bookmark,
          listId,
        };
        const result = await writeFeature({
          operationName: 'list.bookmark.save',
          offline: {
            strategy: 'outbox',
            payload: input,
          },
          execute: () => saveRestaurantFoodItemToList(input),
        });

        if (result.status === 'queued') {
          queued = true;
        } else {
          completedResults.push(result.result);
        }
      }

      await syncRestaurantListSaveTargetCaches(queryClient, sourceListId);

      if (queued) {
        showQueuedOfflineAlert('Bookmark save');
        return { status: 'queued' };
      }

      return {
        status: 'completed',
        result: completedResults,
      };
    },
    [queryClient, writeFeature],
  );

  const saveBookmarkToDefaultListWrite = useCallback(
    async ({
      bookmark,
      defaultListId,
      sourceListId,
    }: SaveBookmarkToDefaultListWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[][]>> => {
      if (defaultListId) {
        return saveBookmarkToListsWrite({
          bookmark,
          listIds: [defaultListId],
          sourceListId,
        });
      }

      const result = await writeFeature({
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
      });

      await syncRestaurantListSaveTargetCaches(queryClient, sourceListId);

      if (result.status === 'queued') {
        showQueuedOfflineAlert('Want to Try bookmark');
      }

      return result;
    },
    [queryClient, saveBookmarkToListsWrite, writeFeature],
  );

  const saveRestaurantToDefaultListWrite = useCallback(
    async ({
      restaurant,
      sourceListId,
    }: SaveRestaurantToDefaultListWriteInput): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      const result = await writeFeature({
        operationName: 'list.default.restaurant.save',
        offline: {
          strategy: 'outbox',
          payload: restaurant,
        },
        execute: () => saveRestaurantToDefaultList(restaurant),
      });

      await syncRestaurantListSaveTargetCaches(queryClient, sourceListId);

      if (result.status === 'queued') {
        showQueuedOfflineAlert('Want to Try restaurant');
      }

      return result;
    },
    [queryClient, writeFeature],
  );

  const addRestaurantWrite = useCallback(
    async (
      input: AddRestaurantVisitRatingsToListInput,
    ): Promise<OfflineAwareFeatureWriteResult<RestaurantListItemRecord[]>> => {
      const result = await writeFeature({
        operationName: 'list.restaurant.add',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: () => addRestaurantVisitRatingsToList(input),
      });

      await syncRestaurantListMembershipCaches(queryClient, input.listId);

      if (result.status === 'queued') {
        showQueuedOfflineAlert('List updates');
      }

      return result;
    },
    [queryClient, writeFeature],
  );

  return {
    addRestaurant: addRestaurantWrite,
    createDefaultRestaurantList: createDefaultListWrite,
    createRestaurantList: createListWrite,
    deleteRestaurantList: deleteListWrite,
    errorMessage,
    isSubmitting,
    reorderRestaurant: reorderRestaurantWrite,
    removeRestaurantListSourceRating: removeSourceRatingWrite,
    removeRestaurantListUserRating: removeUserRatingWrite,
    saveBookmarkToDefaultList: saveBookmarkToDefaultListWrite,
    saveBookmarkToLists: saveBookmarkToListsWrite,
    saveRestaurantToDefaultList: saveRestaurantToDefaultListWrite,
    setErrorMessage,
    updateRestaurantList: updateListWrite,
  };
}
