import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import type { RestaurantListItemRecord } from '../models';
import {
  deleteRestaurantList,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  type RemoveRestaurantListSourceRatingInput,
} from './restaurantListsStore';
import {
  invalidateRestaurantListCollectionQueries,
  invalidateRestaurantListContentQueries,
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

  return {
    deleteRestaurantList: deleteListWrite,
    removeRestaurantListSourceRating: removeSourceRatingWrite,
    removeRestaurantListUserRating: removeUserRatingWrite,
  };
}
