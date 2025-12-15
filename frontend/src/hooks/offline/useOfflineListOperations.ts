import { useMutation, useQueryClient, UseMutationOptions } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { logger } from '@/lib/logger';
import { COLLECTIONS } from '@/constants/collections';
import { restaurantListKeys } from '@/constants/queryKeys';

interface CreateListData {
  name: string;
  description?: string;
  visibility: 'private' | 'friends' | 'public';
}

interface AddToListData {
  listId: string;
  restaurantId: string;
  notes?: string;
}

/**
 * Hook for creating restaurant lists with offline support
 */
export function useOfflineCreateList(
  options?: UseMutationOptions<any, Error, CreateListData>
) {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<any, Error, CreateListData>({
    ...options,
    networkMode: 'always',
    mutationFn: async (data) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      const listData = {
        ...data,
        user: user.id,
      };

      if (isOnline) {
        // Online: Execute immediately
        const result = await pb.collection(COLLECTIONS.RESTAURANT_LISTS).create(listData);
        logger.log('[OfflineList] List created online:', result.id);
        return result;
      } else {
        // Offline: Queue the operation
        logger.log('[OfflineList] Queueing list creation for offline sync');

        await syncQueue.enqueue({
          type: 'create',
          collection: COLLECTIONS.RESTAURANT_LISTS,
          data: listData,
        });

        // Return optimistic data
        const optimisticList = {
          id: `temp_list_${Date.now()}`,
          ...listData,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          isPending: true,
        };

        return optimisticList;
      }
    },
    onSuccess: (result, variables, context) => {
      // Invalidate lists query
      queryClient.invalidateQueries({
        queryKey: restaurantListKeys.all(pb.authStore.record?.id || '', undefined)
      });

      options?.onSuccess?.(result, variables, context);
    },
  });
}

/**
 * Hook for adding restaurant to list with offline support
 */
export function useOfflineAddToList(
  options?: UseMutationOptions<any, Error, AddToListData>
) {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<any, Error, AddToListData>({
    ...options,
    networkMode: 'always',
    mutationFn: async (data) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      const itemData = {
        list: data.listId,
        restaurant: data.restaurantId,
        notes: data.notes,
        user: user.id,
      };

      if (isOnline) {
        // Online: Execute immediately
        const result = await pb.collection(COLLECTIONS.LIST_ITEMS).create(itemData);
        logger.log('[OfflineList] Item added to list online:', result.id);
        return result;
      } else {
        // Offline: Queue the operation
        logger.log('[OfflineList] Queueing add to list for offline sync');

        await syncQueue.enqueue({
          type: 'create',
          collection: COLLECTIONS.LIST_ITEMS,
          data: itemData,
        });

        // Return optimistic data
        const optimisticItem = {
          id: `temp_list_item_${Date.now()}`,
          ...itemData,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          isPending: true,
        };

        return optimisticItem;
      }
    },
    onSuccess: (result, variables, context) => {
      // Invalidate list items query
      queryClient.invalidateQueries({
        queryKey: restaurantListKeys.items(variables.listId)
      });

      options?.onSuccess?.(result, variables, context);
    },
  });
}

/**
 * Hook for deleting list item with offline support
 */
export function useOfflineDeleteListItem(
  options?: UseMutationOptions<void, Error, { itemId: string; listId: string }>
) {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<void, Error, { itemId: string; listId: string }>({
    ...options,
    networkMode: 'always',
    mutationFn: async ({ itemId }) => {
      if (isOnline) {
        // Online: Execute immediately
        await pb.collection(COLLECTIONS.LIST_ITEMS).delete(itemId);
        logger.log('[OfflineList] Item deleted online:', itemId);
      } else {
        // Offline: Queue the operation
        logger.log('[OfflineList] Queueing item deletion for offline sync');

        await syncQueue.enqueue({
          type: 'delete',
          collection: COLLECTIONS.LIST_ITEMS,
          recordId: itemId,
          data: undefined,
        });
      }
    },
    onSuccess: (result, variables, context) => {
      // Invalidate list items query
      queryClient.invalidateQueries({
        queryKey: restaurantListKeys.items(variables.listId)
      });

      options?.onSuccess?.(result, variables, context);
    },
  });
}

/**
 * Hook for deleting entire list with offline support
 */
export function useOfflineDeleteList(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<void, Error, string>({
    ...options,
    networkMode: 'always',
    mutationFn: async (listId) => {
      if (isOnline) {
        // Online: Execute immediately
        await pb.collection(COLLECTIONS.RESTAURANT_LISTS).delete(listId);
        logger.log('[OfflineList] List deleted online:', listId);
      } else {
        // Offline: Queue the operation
        logger.log('[OfflineList] Queueing list deletion for offline sync');

        await syncQueue.enqueue({
          type: 'delete',
          collection: COLLECTIONS.RESTAURANT_LISTS,
          recordId: listId,
          data: undefined,
        });
      }
    },
    onSuccess: (result, variables, context) => {
      // Invalidate lists query
      queryClient.invalidateQueries({
        queryKey: restaurantListKeys.all(pb.authStore.record?.id || '', undefined)
      });

      options?.onSuccess?.(result, variables, context);
    },
  });
}
