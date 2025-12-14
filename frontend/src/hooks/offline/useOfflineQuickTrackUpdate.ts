/**
 * Offline-aware Quick Track Update hook
 *
 * Handles updating existing quick track items including:
 * - Food item record updates
 * - Photo management (add/remove/replace)
 *
 * Offline strategy:
 * - Food item update: Queued in IndexedDB
 * - Photo: Stored as File object, uploaded when synced
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb, type FoodItem } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { usePhotoUpload, type PhotoUploadItem } from '@/hooks/photos/usePhotoUpload';
import { blobUrlManager } from '@/lib/blobUrlManager';

export interface QuickTrackUpdateData {
  id: string; // Item ID to update
  name: string;
  rating: number;
  notes?: string;
  itemCategory?: string;
  location_text?: string;
  latitude?: number;
  longitude?: number;
  itemDate?: string; // ISO date string
  photo?: File | null; // New photo, or null to remove existing
  existingPhotoId?: string; // ID of existing photo to remove
  visibility?: 'private' | 'friends';
}

interface QuickTrackUpdatePhotoResult {
  id: string;
  food_item: string;
  user: string;
  photo: string;
  created: string;
  updated: string;
}

export interface QuickTrackUpdateResult {
  foodItem: FoodItem;
  photoResult?: QuickTrackUpdatePhotoResult;
  isQueued?: boolean;
}

/**
 * Hook for updating Quick Track items with offline support
 */
export function useOfflineQuickTrackUpdate() {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();
  const { uploadPhotos } = usePhotoUpload();

  return useMutation<QuickTrackUpdateResult, Error, QuickTrackUpdateData>({
    networkMode: 'always',
    mutationFn: async (data) => {
      console.log('[useOfflineQuickTrackUpdate] Updating item:', data.id);

      const user = pb.authStore.record;
      if (!user) {
        throw new Error('User not authenticated');
      }

      if (isOnline) {
        // ONLINE: Execute immediately
        console.log('[useOfflineQuickTrackUpdate] Online - executing immediately');
        return await executeUpdate(data, user.id, uploadPhotos);
      } else {
        // OFFLINE: Queue the operation
        console.log('[useOfflineQuickTrackUpdate] Offline - queueing for sync');
        await queueUpdate(data, user.id);

        // Create unique timestamp for consistent IDs
        const timestamp = Date.now();

        // Create preview URL for new photo using blobUrlManager (prevents memory leaks)
        let photoPreviewUrl: string | undefined;
        if (data.photo instanceof File) {
          const tempPhotoId = `temp_quick_track_update_photo_${timestamp}`;
          photoPreviewUrl = blobUrlManager.create(tempPhotoId, data.photo);
        }

        // Return optimistic data
        return {
          foodItem: {
            id: data.id,
            name: data.name,
            rating: data.rating,
            notes: data.notes,
            itemCategory: data.itemCategory,
            location_text: data.location_text,
            latitude: data.latitude,
            longitude: data.longitude,
            itemDate: data.itemDate || undefined,
            user: user.id,
            isQuickTrack: true,
            visibility: data.visibility || 'private',
            updated: new Date().toISOString(),
            isPending: true,
            photoPreviewUrl,
          },
          isQueued: true,
          _photoTimestamp: timestamp, // Store timestamp for cleanup
        };
      }
    },
    onSuccess: async (result) => {
      if (result.isQueued) {
        // Offline: Update optimistic data in cache
        queryClient.setQueryData<FoodItem[]>(['allFoodItems'], (old = []) => {
          return old.map(item =>
            item.id === result.foodItem.id ? { ...item, ...result.foodItem } : item
          );
        });
      } else {
        // Online: Invalidate to refetch fresh data
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['allFoodItems'] }),
          queryClient.invalidateQueries({ queryKey: ['quickTrackItems'] }),
          queryClient.invalidateQueries({ queryKey: ['allVisitPhotos'] }),
        ]);

        // Cleanup: Revoke blob URL for photo (if it exists)
        if ((result as any)._photoTimestamp) {
          const timestamp = (result as any)._photoTimestamp;
          blobUrlManager.revoke(`temp_quick_track_update_photo_${timestamp}`);
        }
      }
    },
  });
}

/**
 * Execute update when online
 */
async function executeUpdate(
  data: QuickTrackUpdateData,
  userId: string,
  uploadPhotos: (items: PhotoUploadItem[]) => Promise<void>
): Promise<QuickTrackUpdateResult> {
  console.log('[executeUpdate] Updating food item:', data.id);

  // 1. Update food item
  const foodItem = await pb.collection('food_items').update(data.id, {
    name: data.name,
    rating: data.rating,
    notes: data.notes || undefined,
    itemCategory: data.itemCategory || undefined,
    location_text: data.location_text || undefined,
    latitude: data.latitude,
    longitude: data.longitude,
    visibility: data.visibility || 'private',
    itemDate: data.itemDate || undefined,
  });

  console.log('[executeUpdate] Food item updated:', foodItem.id);

  // 2. Handle photo changes
  let photoResult: QuickTrackUpdatePhotoResult | undefined;

  // Remove existing photo if requested
  if (data.existingPhotoId && data.photo === null) {
    console.log('[executeUpdate] Removing existing photo:', data.existingPhotoId);
    await pb.collection('visit_photos').delete(data.existingPhotoId);
  }

  // Upload new photo if provided
  if (data.photo instanceof File) {
    console.log('[executeUpdate] Uploading new photo...');

    // Remove old photo first if exists
    if (data.existingPhotoId) {
      try {
        await pb.collection('visit_photos').delete(data.existingPhotoId);
      } catch (error) {
        console.log('[executeUpdate] Old photo already removed or not found');
      }
    }

    const photoUpload: PhotoUploadItem = {
      photo: data.photo,
      foodItemId: foodItem.id,
      userId,
    };

    await uploadPhotos([photoUpload]);
    photoResult = { foodItemId: foodItem.id };
    console.log('[executeUpdate] Photo uploaded successfully');
  }

  return { foodItem, photoResult };
}

/**
 * Queue update for offline sync
 */
async function queueUpdate(data: QuickTrackUpdateData, userId: string): Promise<void> {
  await syncQueue.enqueue({
    type: 'update',
    collection: 'quick_track_item_update',
    data: {
      id: data.id,
      foodItem: {
        name: data.name,
        rating: data.rating,
        notes: data.notes,
        itemCategory: data.itemCategory,
        location_text: data.location_text,
        latitude: data.latitude,
        longitude: data.longitude,
        visibility: data.visibility || 'private',
        itemDate: data.itemDate || undefined,
      },
      photo: data.photo instanceof File ? data.photo : undefined,
      removePhoto: data.photo === null,
      existingPhotoId: data.existingPhotoId,
    },
    recordId: data.id,
  });

  console.log('Queued Quick Track item update:', data.name);
}
