/**
 * Offline-aware Quick Track Delete hook
 *
 * Handles deleting quick track items including:
 * - Food item record deletion
 * - Associated photo deletion
 *
 * Offline strategy:
 * - Deletion is queued in IndexedDB
 * - Executed when connection returns
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';

export interface QuickTrackDeleteData {
  id: string; // Item ID to delete
  photoId?: string; // Associated photo ID (if exists)
}

/**
 * Hook for deleting Quick Track items with offline support
 */
export function useOfflineQuickTrackDelete() {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<void, Error, QuickTrackDeleteData>({
    networkMode: 'always',
    mutationFn: async (data) => {
      console.log('[useOfflineQuickTrackDelete] Deleting item:', data.id);

      if (isOnline) {
        // ONLINE: Execute immediately
        console.log('[useOfflineQuickTrackDelete] Online - executing immediately');

        // Delete photo first if exists
        if (data.photoId) {
          try {
            await pb.collection('visit_photos').delete(data.photoId);
            console.log('[useOfflineQuickTrackDelete] Photo deleted:', data.photoId);
          } catch (error) {
            console.log('[useOfflineQuickTrackDelete] Photo deletion failed or not found:', error);
          }
        }

        // Delete food item
        await pb.collection('food_items').delete(data.id);
        console.log('[useOfflineQuickTrackDelete] Food item deleted:', data.id);
      } else {
        // OFFLINE: Queue the operation
        console.log('[useOfflineQuickTrackDelete] Offline - queueing for sync');
        await syncQueue.enqueue({
          type: 'delete',
          collection: 'quick_track_item_delete',
          data: {
            id: data.id,
            photoId: data.photoId,
          },
          recordId: data.id,
        });

        console.log('Queued Quick Track item deletion:', data.id);
      }
    },
    onSuccess: async () => {
      // Invalidate queries to refetch fresh data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['allFoodItems'] }),
        queryClient.invalidateQueries({ queryKey: ['quickTrackItems'] }),
        queryClient.invalidateQueries({ queryKey: ['allVisitPhotos'] }),
      ]);
    },
  });
}
