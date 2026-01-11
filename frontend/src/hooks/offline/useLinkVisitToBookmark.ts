import { useMutation, useQueryClient, UseMutationOptions } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { logger } from '@/lib/logger';
import { COLLECTIONS } from '@/constants/collections';
import { repositories } from '@/repositories';

interface LinkVisitToBookmarkData {
  listItemId: string;
  userFoodItemId: string;
}

/**
 * Hook for linking a user's food item to a bookmarked list item
 * Used after the "I went there" flow to connect the user's visit to the bookmark
 */
export function useLinkVisitToBookmark(
  options?: UseMutationOptions<any, Error, LinkVisitToBookmarkData>
) {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<any, Error, LinkVisitToBookmarkData>({
    ...options,
    networkMode: 'always',
    mutationFn: async (data) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      if (isOnline) {
        // Update the list item to set userFoodItem
        const result = await repositories.listItems.update(data.listItemId, {
          userFoodItem: data.userFoodItemId,
        });
        logger.log('[LinkVisitToBookmark] Linked food item to bookmark:', result.id);
        return result;
      } else {
        // Offline: Queue the operation
        logger.log('[LinkVisitToBookmark] Queueing link for offline sync');

        await syncQueue.enqueue({
          type: 'update',
          collection: COLLECTIONS.LIST_ITEMS,
          recordId: data.listItemId,
          data: {
            userFoodItem: data.userFoodItemId,
          },
        });

        // Return optimistic data
        return {
          id: data.listItemId,
          userFoodItem: data.userFoodItemId,
          isPending: true,
        };
      }
    },
    onSuccess: (result, variables, context) => {
      // Invalidate all list items queries to refresh the UI
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === 'list_items';
        },
      });

      // Call the passed onSuccess callback if provided
      // @ts-expect-error - TanStack Query types are complex here
      options?.onSuccess?.(result, variables, context);
    },
  });
}
