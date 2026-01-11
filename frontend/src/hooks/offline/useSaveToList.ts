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
  foodItemId: string; // Single food item being bookmarked
  note?: string;
  sourceUserId?: string; // ID of the friend whose list items are being saved from
}

/**
 * Hook for saving a single food item bookmark to a list
 * Each call creates one list_item record for one food item
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

      if (isOnline) {
        // Check if this specific food item is already bookmarked in this list
        const existingItems = await repositories.listItems.getByList(data.listId, {
          sort: '-position',
        });

        const existingItem = existingItems.find(item =>
          item.foodItem === data.foodItemId
        );

        if (existingItem) {
          // Already bookmarked, return existing
          logger.log('[SaveToList] Food item already bookmarked, skipping');
          return existingItem;
        }

        // Create new bookmark for this food item
        const maxPosition = existingItems.length > 0 ? existingItems[0].position : 0;
        const itemData = {
          list: data.listId,
          restaurant: data.restaurantId,
          addedBy: user.id,
          sourceUser: data.sourceUserId || null,
          foodItem: data.foodItemId,
          position: maxPosition + 1,
          note: data.note,
        };

        const result = await repositories.listItems.create(itemData);
        logger.log('[SaveToList] Food item bookmarked:', result.id);
        return result;
      } else {
        // Offline: Queue the operation
        logger.log('[SaveToList] Queueing bookmark for offline sync');

        const itemData = {
          list: data.listId,
          restaurant: data.restaurantId,
          addedBy: user.id,
          sourceUser: data.sourceUserId || null,
          foodItem: data.foodItemId,
          position: 1, // Will be recalculated on sync
          note: data.note,
        };

        await syncQueue.enqueue({
          type: 'create',
          collection: COLLECTIONS.LIST_ITEMS,
          data: itemData,
        });

        // Return optimistic data
        const optimisticItem = {
          id: `temp_bookmark_${Date.now()}`,
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
        hasFoodItem: !!variables.foodItemId,
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

        // Also invalidate the user_list_items query used in ListDetailPage for bookmark status
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return key[0] === 'user_list_items' && key[1] === user.id;
          },
        });
      }

      // Call the passed onSuccess callback if provided
      // @ts-expect-error - TanStack Query types are complex here
      options?.onSuccess?.(result, variables, context);
    },
  });
}
