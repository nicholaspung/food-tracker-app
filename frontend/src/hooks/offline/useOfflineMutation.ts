/**
 * Offline-aware mutation hook
 *
 * Wraps TanStack Query's useMutation to support offline operations.
 * When offline, mutations are queued and executed when connection returns.
 * When online, mutations execute immediately.
 */

import { COLLECTIONS } from '@/constants/collections';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { syncQueue, type OperationType } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';

export interface OfflineMutationConfig<TData = unknown, TVariables = unknown> {
  collection: string;
  type: OperationType;
  mutationFn?: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  onError?: (error: Error, variables: TVariables) => void;
  invalidateQueries?: string[] | string[][];
  optimisticUpdate?: (variables: TVariables) => TData;
  getRecordId?: (variables: TVariables) => string | undefined;
}

/**
 * Create an offline-aware mutation
 *
 * Usage examples:
 *
 * // Create operation
 * const createMutation = useOfflineMutation({
 *   collection: 'restaurants',
 *   type: 'create',
 *   mutationFn: async (data) => pb.collection(COLLECTIONS.RESTAURANTS).create(data),
 *   invalidateQueries: ['restaurants'],
 * });
 *
 * // Update operation
 * const updateMutation = useOfflineMutation({
 *   collection: 'food_items',
 *   type: 'update',
 *   mutationFn: async ({ id, data }) => pb.collection(COLLECTIONS.FOOD_ITEMS).update(id, data),
 *   getRecordId: (variables) => variables.id,
 *   invalidateQueries: ['food_items'],
 * });
 *
 * // Delete operation
 * const deleteMutation = useOfflineMutation({
 *   collection: 'visits',
 *   type: 'delete',
 *   mutationFn: async (id) => pb.collection(COLLECTIONS.VISITS).delete(id),
 *   getRecordId: (variables) => variables,
 *   invalidateQueries: ['visits'],
 * });
 */
export function useOfflineMutation<TData = unknown, TVariables = unknown>({
  collection,
  type,
  mutationFn,
  onSuccess,
  onError,
  invalidateQueries = [],
  optimisticUpdate,
  getRecordId,
}: OfflineMutationConfig<TData, TVariables>) {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<TData, Error, TVariables>({
    // CRITICAL: Allow mutation to run even when browser is offline
    // We handle online/offline logic inside mutationFn
    networkMode: 'always',
    mutationFn: async (variables: TVariables) => {
      if (isOnline && mutationFn) {
        // Online: Execute immediately
        try {
          return await mutationFn(variables);
        } catch (error: unknown) {
          // If network error, queue the operation
          const isNetworkError =
            (error && typeof error === 'object' && 'isAbort' in error && error.isAbort) ||
            (error && typeof error === 'object' && 'status' in error && (error.status === 0 || !error.status));

          if (isNetworkError) {
            console.log('Network error detected, queueing operation:', type, collection);
            await queueOperation(variables);
            throw new Error('Operation queued for later sync (offline)');
          }
          throw error;
        }
      } else {
        // Offline: Queue the operation
        await queueOperation(variables);

        // Return optimistic data if available
        if (optimisticUpdate) {
          return optimisticUpdate(variables);
        }

        // Return a placeholder response
        return { id: `temp_${Date.now()}` } as TData;
      }
    },
    onSuccess: async (data, variables) => {
      // Invalidate queries
      if (invalidateQueries.length > 0) {
        const invalidations = invalidateQueries.map(query =>
          Array.isArray(query)
            ? queryClient.invalidateQueries({ queryKey: query })
            : queryClient.invalidateQueries({ queryKey: [query] })
        );
        await Promise.all(invalidations);
      }

      // Call custom onSuccess handler
      if (onSuccess) {
        await onSuccess(data, variables);
      }
    },
    onError: (error, variables) => {
      console.error('Mutation error:', error);
      if (onError) {
        onError(error, variables);
      }
    },
  });

  /**
   * Queue an operation for later sync
   */
  async function queueOperation(variables: TVariables) {
    const recordId = getRecordId ? getRecordId(variables) : undefined;

    await syncQueue.enqueue({
      type,
      collection,
      data: variables,
      recordId,
      localId: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    });

    console.log(`Queued ${type} operation for ${collection}`, { recordId, data: variables });
  }
}

/**
 * Simplified hooks for common operations
 */

export function useOfflineCreate<TData = unknown, TVariables = unknown>(
  collection: string,
  options?: Omit<OfflineMutationConfig<TData, TVariables>, 'type' | 'collection'>
) {
  return useOfflineMutation<TData, TVariables>({
    collection,
    type: 'create',
    ...options,
  });
}

export function useOfflineUpdate<TData = unknown, TVariables = unknown>(
  collection: string,
  options?: Omit<OfflineMutationConfig<TData, TVariables>, 'type' | 'collection'>
) {
  return useOfflineMutation<TData, TVariables>({
    collection,
    type: 'update',
    ...options,
  });
}

export function useOfflineDelete<TData = unknown, TVariables = unknown>(
  collection: string,
  options?: Omit<OfflineMutationConfig<TData, TVariables>, 'type' | 'collection'>
) {
  return useOfflineMutation<TData, TVariables>({
    collection,
    type: 'delete',
    ...options,
  });
}
