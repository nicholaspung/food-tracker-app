/**
 * Offline-aware Note update hook
 */

import { logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb, type Note, type NotePhoto } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { repositories } from '@/repositories';
import { noteKeys } from '@/constants/queryKeys';
import { compressDishPhoto } from '@/services/photoService';

export interface NoteUpdateData {
  id: string;
  content?: string;
  restaurant?: string | null;
  location_text?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  newPhotos?: File[];
  deletePhotoIds?: string[];
}

export interface NoteUpdateResult {
  note: Note;
  newPhotos?: NotePhoto[];
  isQueued?: boolean;
}

export function useOfflineNoteUpdate() {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<NoteUpdateResult, Error, NoteUpdateData>({
    networkMode: 'always',
    mutationFn: async (data) => {
      logger.log('[useOfflineNoteUpdate] Mutation called:', data.id);

      const user = pb.authStore.record;
      if (!user) {
        throw new Error('User not authenticated');
      }

      if (isOnline) {
        return await executeNoteUpdate(data, user.id);
      } else {
        await queueNoteUpdate(data, user.id);

        return {
          note: {
            id: data.id,
            user: user.id,
            content: data.content || '',
            restaurant: data.restaurant || undefined,
            location_text: data.location_text || undefined,
            latitude: data.latitude || undefined,
            longitude: data.longitude || undefined,
            status: 'draft',
            updated: new Date().toISOString(),
            isPending: true,
          } as Note & { isPending: boolean },
          isQueued: true,
        };
      }
    },
    onSuccess: async (result, variables) => {
      if (result.isQueued) {
        // Offline: Update optimistic data in cache
        queryClient.setQueryData<Note[]>(noteKeys.all, (old = []) => {
          return old.map((note) =>
            note.id === variables.id ? { ...note, ...result.note } : note
          );
        });
      } else {
        // Online: Invalidate to refetch fresh data
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: noteKeys.all }),
          queryClient.invalidateQueries({ queryKey: noteKeys.detail(variables.id) }),
          queryClient.invalidateQueries({ queryKey: noteKeys.photos(variables.id) }),
        ]);
      }
    },
  });
}

async function executeNoteUpdate(
  data: NoteUpdateData,
  userId: string
): Promise<NoteUpdateResult> {
  logger.log('[executeNoteUpdate] Updating note:', data.id);

  // 1. Delete photos if requested
  if (data.deletePhotoIds && data.deletePhotoIds.length > 0) {
    for (const photoId of data.deletePhotoIds) {
      await repositories.notePhotos.delete(photoId);
    }
    logger.log('[executeNoteUpdate] Deleted', data.deletePhotoIds.length, 'photos');
  }

  // 2. Update note
  const updateData: Record<string, any> = {};
  if (data.content !== undefined) updateData.content = data.content;
  if (data.restaurant !== undefined) updateData.restaurant = data.restaurant;
  if (data.location_text !== undefined) updateData.location_text = data.location_text;
  if (data.latitude !== undefined) updateData.latitude = data.latitude;
  if (data.longitude !== undefined) updateData.longitude = data.longitude;

  const note = await repositories.notes.update(data.id, updateData);
  logger.log('[executeNoteUpdate] Note updated:', note.id);

  // 3. Upload new photos if provided (compress first to fit within 3MB limit)
  const newPhotos: NotePhoto[] = [];
  if (data.newPhotos && data.newPhotos.length > 0) {
    for (const photoFile of data.newPhotos) {
      // Compress photo to fit within 3MB limit
      let compressedPhoto: File;
      try {
        compressedPhoto = await compressDishPhoto(photoFile);
        logger.log('[executeNoteUpdate] Compressed photo from', photoFile.size, 'to', compressedPhoto.size, 'bytes');
      } catch (compressError) {
        logger.error('[executeNoteUpdate] Failed to compress photo:', compressError);
        // Try uploading original if compression fails
        compressedPhoto = photoFile;
      }

      const formData = new FormData();
      formData.append('note', data.id);
      formData.append('user', userId);
      formData.append('photo', compressedPhoto);

      const photo = await repositories.notePhotos.create(formData);
      newPhotos.push(photo);
    }
    logger.log('[executeNoteUpdate] Uploaded', newPhotos.length, 'new photos');
  }

  return { note: note as Note, newPhotos };
}

async function queueNoteUpdate(data: NoteUpdateData, _userId: string): Promise<void> {
  await syncQueue.enqueue({
    type: 'update',
    collection: 'notes',
    recordId: data.id,
    data: {
      content: data.content,
      restaurant: data.restaurant,
      location_text: data.location_text,
      latitude: data.latitude,
      longitude: data.longitude,
      // Note: newPhotos (File objects) may not serialize properly to IndexedDB
      // Photo upload during sync would need special handling
      newPhotos: data.newPhotos,
      deletePhotoIds: data.deletePhotoIds,
    },
  });

  logger.log('[queueNoteUpdate] Queued note update:', data.id);
}
