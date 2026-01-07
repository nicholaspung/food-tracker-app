import { useMutation, useQueryClient, UseMutationOptions } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { logger } from '@/lib/logger';
import { COLLECTIONS } from '@/constants/collections';
import { restaurantListKeys } from '@/constants/queryKeys';
import { repositories } from '@/repositories';
import { analytics } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/types/posthog';

interface SaveToListData {
  listId: string;
  restaurantId: string;
  recommendedItemIds?: string[];
  note?: string;
}

/**
 * Hook for saving a restaurant item from another user's list to your own list
 * This copies the restaurant + recommended items + note to the target list
 */
export function useSaveToList(
  options?: UseMutationOptions<any, Error, SaveToListData>
) {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<any, Error, SaveToListData>({
    ...options,
    networkMode: 'always',
    mutationFn: async (data) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      // Get the max position in the target list to append at the end
      let maxPosition = 0;
      if (isOnline) {
        const existingItems = await repositories.listItems.getByList(data.listId, {
          sort: '-position',
        });
        if (existingItems.length > 0) {
          maxPosition = existingItems[0].position;
        }
      }

      const itemData = {
        list: data.listId,
        restaurant: data.restaurantId,
        addedBy: user.id,
        position: maxPosition + 1,
        note: data.note,
        recommendedItems: data.recommendedItemIds || [],
      };

      if (isOnline) {
        // Online: Execute immediately
        const result = await repositories.listItems.create(itemData);
        logger.log('[SaveToList] Item saved to list online:', result.id);
        return result;
      } else {
        // Offline: Queue the operation
        logger.log('[SaveToList] Queueing save to list for offline sync');

        await syncQueue.enqueue({
          type: 'create',
          collection: COLLECTIONS.LIST_ITEMS,
          data: itemData,
        });

        // Return optimistic data
        const optimisticItem = {
          id: `temp_saved_item_${Date.now()}`,
          ...itemData,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          isPending: true,
        };

        return optimisticItem;
      }
    },
    onSuccess: (result, variables, context) => {
      const user = pb.authStore.record;

      // Track item saved to list
      analytics.track(ANALYTICS_EVENTS.LIST_ITEM_ADDED, {
        source: 'useSaveToList',
        hasNote: !!variables.note,
        hasRecommendedItems: (variables.recommendedItemIds?.length || 0) > 0,
        recommendedItemsCount: variables.recommendedItemIds?.length || 0,
        isOffline: !isOnline,
      });

      // Invalidate list items query for the target list
      queryClient.invalidateQueries({
        queryKey: restaurantListKeys.items(variables.listId)
      });

      // Invalidate user's list items for this restaurant (to update bookmark icon)
      if (user) {
        queryClient.invalidateQueries({
          queryKey: restaurantListKeys.userItemsForRestaurant(user.id, variables.restaurantId)
        });
      }

      // Call the passed onSuccess callback if provided
      // @ts-expect-error - TanStack Query types are complex here
      options?.onSuccess?.(result, variables, context);
    },
  });
}
