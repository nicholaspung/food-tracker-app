/**
 * Offline-aware Note deletion hook
 */

import { logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb, type Note } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { repositories } from '@/repositories';
import { noteKeys } from '@/constants/queryKeys';

export function useOfflineNoteDelete() {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<{ success: boolean; isQueued?: boolean }, Error, string>({
    networkMode: 'always',
    mutationFn: async (noteId) => {
      logger.log('[useOfflineNoteDelete] Deleting note:', noteId);

      const user = pb.authStore.record;
      if (!user) {
        throw new Error('User not authenticated');
      }

      if (isOnline) {
        // Note photos are cascade deleted by PocketBase
        await repositories.notes.delete(noteId);
        logger.log('[useOfflineNoteDelete] Note deleted:', noteId);
        return { success: true };
      } else {
        await syncQueue.enqueue({
          type: 'delete',
          collection: 'notes',
          recordId: noteId,
          data: undefined,
        });
        logger.log('[useOfflineNoteDelete] Queued note deletion:', noteId);
        return { success: true, isQueued: true };
      }
    },
    onSuccess: async (result, noteId) => {
      // Remove from cache immediately
      queryClient.setQueryData<Note[]>(noteKeys.all, (old = []) => {
        return old.filter((note) => note.id !== noteId);
      });

      const userId = pb.authStore.record?.id;
      if (userId) {
        queryClient.setQueryData<Note[]>(noteKeys.unused(userId), (old = []) => {
          return old.filter((note) => note.id !== noteId);
        });
      }

      if (!result.isQueued) {
        await queryClient.invalidateQueries({ queryKey: noteKeys.all });
      }
    },
  });
}
