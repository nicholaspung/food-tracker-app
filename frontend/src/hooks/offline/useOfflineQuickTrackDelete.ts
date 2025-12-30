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

import { logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { repositories } from '@/repositories';
import { analytics } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/types/posthog';

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
      logger.log('[useOfflineQuickTrackDelete] Deleting item:', data.id);

      if (isOnline) {
        // ONLINE: Execute immediately
        logger.log('[useOfflineQuickTrackDelete] Online - executing immediately');

        // Delete photo first if exists
        if (data.photoId) {
          try {
            await repositories.visitPhotos.delete(data.photoId);
            logger.log('[useOfflineQuickTrackDelete] Photo deleted:', data.photoId);
          } catch (error) {
            logger.log('[useOfflineQuickTrackDelete] Photo deletion failed or not found:', error);
          }
        }

        // Delete food item
        await repositories.foodItems.delete(data.id);
        logger.log('[useOfflineQuickTrackDelete] Food item deleted:', data.id);
      } else {
        // OFFLINE: Queue the operation
        logger.log('[useOfflineQuickTrackDelete] Offline - queueing for sync');
        await syncQueue.enqueue({
          type: 'delete',
          collection: 'quick_track_item_delete',
          data: {
            id: data.id,
            photoId: data.photoId,
          },
          recordId: data.id,
        });

        logger.log('Queued Quick Track item deletion:', data.id);
      }
    },
    onSuccess: async (result, variables) => {
      // Track quick track deleted
      analytics.track(ANALYTICS_EVENTS.QUICK_TRACK_DELETED, {
        source: 'useOfflineQuickTrackDelete',
        hadPhoto: !!variables.photoId,
        isOffline: !isOnline,
      });

      // Invalidate queries to refetch fresh data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['allFoodItems'] }),
        queryClient.invalidateQueries({ queryKey: ['quickTrackItems'] }),
        queryClient.invalidateQueries({ queryKey: ['allVisitPhotos'] }),
      ]);
    },
  });
}
