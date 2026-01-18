/**
 * Offline-aware Note creation hook
 *
 * Handles note creation including:
 * - Note record creation
 * - Optional photo uploads (when online)
 *
 * Offline strategy:
 * - Note: Queued in IndexedDB
 * - Photos: Stored as File objects, uploaded when synced
 */

import { logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb, type Note, type NotePhoto } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { blobUrlManager } from '@/lib/blobUrlManager';
import { repositories } from '@/repositories';
import { noteKeys } from '@/constants/queryKeys';
import { compressDishPhoto } from '@/services/photoService';

export interface NoteCreationData {
  content: string;
  restaurant?: string;
  location_text?: string;
  latitude?: number;
  longitude?: number;
  photos?: File[];
}

export interface NoteCreationResult {
  note: Note;
  photos?: NotePhoto[];
  isQueued?: boolean;
}

/**
 * Hook for Note creation with offline support
 */
export function useOfflineNoteCreation() {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<NoteCreationResult, Error, NoteCreationData>({
    networkMode: 'always',
    mutationFn: async (data) => {
      logger.log('[useOfflineNoteCreation] Mutation called with data:', {
        contentLength: data.content.length,
        hasPhotos: !!data.photos?.length,
        isOnline,
      });

      const user = pb.authStore.record;
      if (!user) {
        throw new Error('User not authenticated');
      }

      if (isOnline) {
        return await executeNoteCreation(data, user.id);
      } else {
        await queueNoteCreation(data, user.id);

        const timestamp = Date.now();

        // Create preview URLs for photos
        const photoPreviewUrls: string[] = [];
        if (data.photos) {
          data.photos.forEach((photo, index) => {
            const tempPhotoId = `temp_note_photo_${timestamp}_${index}`;
            photoPreviewUrls.push(blobUrlManager.create(tempPhotoId, photo));
          });
        }

        return {
          note: {
            id: `temp_note_${timestamp}`,
            user: user.id,
            content: data.content,
            restaurant: data.restaurant,
            location_text: data.location_text,
            latitude: data.latitude,
            longitude: data.longitude,
            status: 'draft',
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            isPending: true,
            photoPreviewUrls,
          } as Note & { isPending: boolean; photoPreviewUrls: string[] },
          isQueued: true,
        };
      }
    },
    onSuccess: async (result) => {
      if (result.isQueued) {
        // Offline: Add optimistic data to cache
        queryClient.setQueryData<Note[]>(noteKeys.all, (old = []) => {
          return [result.note, ...old];
        });

        const userId = pb.authStore.record?.id;
        if (userId) {
          queryClient.setQueryData<Note[]>(noteKeys.unused(userId), (old = []) => {
            return [result.note, ...old];
          });
        }
      } else {
        // Online: Invalidate to refetch fresh data
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: noteKeys.all }),
        ]);
      }
    },
  });
}

async function executeNoteCreation(
  data: NoteCreationData,
  userId: string
): Promise<NoteCreationResult> {
  logger.log('[executeNoteCreation] Creating note');

  // 1. Create note
  const note = await repositories.notes.create({
    user: userId,
    content: data.content,
    restaurant: data.restaurant || undefined,
    location_text: data.location_text || undefined,
    latitude: data.latitude,
    longitude: data.longitude,
    status: 'draft',
  });

  logger.log('[executeNoteCreation] Note created:', note.id);

  // 2. Upload photos if provided (compress first to fit within 3MB limit)
  const photos: NotePhoto[] = [];
  if (data.photos && data.photos.length > 0) {
    for (const photoFile of data.photos) {
      // Compress photo to fit within 3MB limit
      let compressedPhoto: File;
      try {
        compressedPhoto = await compressDishPhoto(photoFile);
        logger.log('[executeNoteCreation] Compressed photo from', photoFile.size, 'to', compressedPhoto.size, 'bytes');
      } catch (compressError) {
        logger.error('[executeNoteCreation] Failed to compress photo:', compressError);
        // Try uploading original if compression fails
        compressedPhoto = photoFile;
      }

      const formData = new FormData();
      formData.append('note', note.id);
      formData.append('user', userId);
      formData.append('photo', compressedPhoto);

      const photo = await repositories.notePhotos.create(formData);
      photos.push(photo);
    }
    logger.log('[executeNoteCreation] Uploaded', photos.length, 'photos');
  }

  return { note: note as Note, photos };
}

async function queueNoteCreation(data: NoteCreationData, userId: string): Promise<void> {
  await syncQueue.enqueue({
    type: 'create',
    collection: 'note',
    data: {
      note: {
        user: userId,
        content: data.content,
        restaurant: data.restaurant,
        location_text: data.location_text,
        latitude: data.latitude,
        longitude: data.longitude,
        status: 'draft',
      },
      photos: data.photos,
    },
  });

  logger.log('[queueNoteCreation] Queued note with', data.photos?.length || 0, 'photos');
}
