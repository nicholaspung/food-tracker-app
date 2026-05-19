import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import type { RestaurantListItemRecord } from '../models';
import {
  createDefaultRestaurantList,
  deleteRestaurantList,
  moveRestaurantListRestaurant,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  saveRestaurantFoodItemToList,
  type MoveRestaurantListRestaurantInput,
  type RemoveRestaurantListSourceRatingInput,
  type SaveRestaurantFoodItemToListInput,
} from './restaurantListsStore';
import {
  invalidateRestaurantListCollectionQueries,
  invalidateRestaurantListContentQueries,
  invalidateRestaurantListSaveTargetQueries,
  removeRestaurantListQueries,
} from './restaurantListQuery';
import {
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';

interface DeleteRestaurantListWriteInput {
  listId: string;
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

async function syncDeletedRestaurantListCaches(
  queryClient: QueryClient,
  listId: string,
): Promise<void> {
  await invalidateRestaurantListCollectionQueries(queryClient);
  removeRestaurantListQueries(queryClient, listId);
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
        showQueuedOfflineAlert('Saved list + bookmark');
      }

      return result;
    },
    [queryClient, saveBookmarkToListsWrite, writeFeature],
  );

  return {
    deleteRestaurantList: deleteListWrite,
    reorderRestaurant: reorderRestaurantWrite,
    removeRestaurantListSourceRating: removeSourceRatingWrite,
    removeRestaurantListUserRating: removeUserRatingWrite,
    saveBookmarkToDefaultList: saveBookmarkToDefaultListWrite,
    saveBookmarkToLists: saveBookmarkToListsWrite,
  };
}
