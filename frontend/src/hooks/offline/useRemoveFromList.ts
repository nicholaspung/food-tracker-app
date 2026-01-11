import { useMutation, useQueryClient, UseMutationOptions } from '@tanstack/react-query';
import { pb, ListItem } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { logger } from '@/lib/logger';
import { COLLECTIONS } from '@/constants/collections';
import { repositories } from '@/repositories';

interface RemoveFromListData {
  listItemId: string;
  itemIdsToRemove: string[]; // Food item IDs to remove
}

interface RemoveFromListResult {
  deleted: boolean;
  updatedItem?: ListItem;
}

/**
 * Hook for removing food items from a list item.
 * If all items are removed, the list item is deleted.
 * If some items remain, the list item is updated.
 */
export function useRemoveFromList(
  options?: UseMutationOptions<RemoveFromListResult, Error, RemoveFromListData>
) {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<RemoveFromListResult, Error, RemoveFromListData>({
    ...options,
    networkMode: 'always',
    mutationFn: async (data) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      if (isOnline) {
        // Fetch the current list item with its recommended items
        const listItem = await repositories.listItems.getOne(data.listItemId, {
          expand: 'recommendedItems',
        });

        const currentItems = listItem.recommendedItems || [];
        const itemsToRemoveSet = new Set(data.itemIdsToRemove);
        const remainingItems = currentItems.filter((id: string) => !itemsToRemoveSet.has(id));

        if (remainingItems.length === 0) {
          // No items left, delete the list item
          await repositories.listItems.delete(data.listItemId);
          logger.log('[RemoveFromList] List item deleted (no items remaining):', data.listItemId);
          return { deleted: true };
        } else {
          // Some items remain, update the list item
          const result = await repositories.listItems.update(data.listItemId, {
            recommendedItems: remainingItems,
          });
          logger.log('[RemoveFromList] Items removed from list item:', data.listItemId);
          return { deleted: false, updatedItem: result };
        }
      } else {
        // Offline: Queue the operation
        logger.log('[RemoveFromList] Queueing remove from list for offline sync');

        await syncQueue.enqueue({
          type: 'update',
          collection: COLLECTIONS.LIST_ITEMS,
          id: data.listItemId,
          data: {
            _removeItems: data.itemIdsToRemove, // Custom field for offline sync handling
          },
        });

        return { deleted: false };
      }
    },
    onSuccess: (result, variables, context) => {
      const user = pb.authStore.record;

      // Invalidate all list items queries to refresh UI
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === 'list_items' || key[0] === 'user_list_items';
        },
      });

      // Also invalidate user's list items for restaurant checks
      if (user) {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return key[0] === 'list_items' && key[1] === 'user';
          },
        });
      }

      // @ts-expect-error - TanStack Query types are complex here
      options?.onSuccess?.(result, variables, context);
    },
  });
}

/**
 * Helper function to find list items that were saved from a specific source user.
 * Uses the sourceUser field on the list item (not the food item owners).
 * Used to determine which lists to show in the removal confirmation dialog.
 */
export function findListItemsWithSourceUser(
  userListItems: ListItem[],
  restaurantId: string,
  sourceUserId: string
): Array<{
  listItem: ListItem;
  matchingItemIds: string[];
}> {
  const results: Array<{
    listItem: ListItem;
    matchingItemIds: string[];
  }> = [];

  for (const listItem of userListItems) {
    // Check if this list item matches the restaurant AND was saved from this source user
    if (listItem.restaurant !== restaurantId) continue;
    if (listItem.sourceUser !== sourceUserId) continue;

    // All items in this list item came from the source user
    const itemIds = listItem.recommendedItems || [];
    if (itemIds.length === 0) continue;

    results.push({
      listItem,
      matchingItemIds: itemIds,
    });
  }

  return results;
}
