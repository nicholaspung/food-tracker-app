/**
 * Offline-aware Quick Track hook
 *
 * Handles standalone food item creation (without visit) including:
 * - Food item record creation
 * - Optional photo upload (when online)
 *
 * Offline strategy:
 * - Food item: Queued in IndexedDB
 * - Photo: Stored as File object, uploaded when synced
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { usePhotoUpload, type PhotoUploadItem } from './usePhotoUpload';

export interface QuickTrackData {
  name: string;
  rating: number;
  notes?: string;
  itemCategory?: string;
  location_text?: string;
  latitude?: number;
  longitude?: number;
  photo?: File; // Optional photo
}

export interface QuickTrackResult {
  foodItem: any;
  photoResult?: any;
  isQueued?: boolean; // Flag to indicate if offline and queued for sync
}

/**
 * Hook for Quick Track with offline support
 *
 * When online:
 * - Creates food item and uploads photo
 *
 * When offline:
 * - Queues food item creation
 * - Stores photo in IndexedDB for later upload
 * - Auto-syncs when connection returns
 */
export function useOfflineQuickTrack() {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();
  const { uploadPhotos } = usePhotoUpload();

  return useMutation<QuickTrackResult, Error, QuickTrackData>({
    // CRITICAL: Allow mutation to run even when browser is offline
    networkMode: 'always',
    mutationFn: async (data) => {
      console.log('[useOfflineQuickTrack] Mutation function called with data:', {
        name: data.name,
        rating: data.rating,
        hasPhoto: !!data.photo,
        isOnline,
      });

      const user = pb.authStore.record;
      if (!user) {
        console.error('[useOfflineQuickTrack] User not authenticated!');
        throw new Error('User not authenticated');
      }

      console.log('[useOfflineQuickTrack] User authenticated:', user.id);

      if (isOnline) {
        // ONLINE: Execute immediately
        console.log('[useOfflineQuickTrack] Online - executing immediately');
        return await executeQuickTrack(data, user.id, uploadPhotos);
      } else {
        // OFFLINE: Queue the operation
        console.log('[useOfflineQuickTrack] Offline - queueing for sync');
        await queueQuickTrack(data, user.id);

        // Create preview URL for photo (for offline display)
        let photoPreviewUrl: string | undefined;
        if (data.photo) {
          photoPreviewUrl = URL.createObjectURL(data.photo);
        }

        // Return optimistic data
        return {
          foodItem: {
            id: `temp_quick_track_${Date.now()}`,
            name: data.name,
            rating: data.rating,
            notes: data.notes,
            itemCategory: data.itemCategory,
            location_text: data.location_text,
            latitude: data.latitude,
            longitude: data.longitude,
            user: user.id,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            isPending: true, // Flag to indicate this is pending sync
            photoPreviewUrl, // Add preview URL if photo exists
          },
          isQueued: true,
        };
      }
    },
    onSuccess: async (result) => {
      if (result.isQueued) {
        // Offline: Add optimistic data to cache
        queryClient.setQueryData(['allFoodItems'], (old: any[] = []) => {
          return [result.foodItem, ...old];
        });
        queryClient.setQueryData(['quickTrackItems'], (old: any[] = []) => {
          return [result.foodItem, ...old];
        });

        // Also cache the photo if exists
        if (result.foodItem.photoPreviewUrl) {
          const optimisticPhoto = {
            id: `temp_photo_${result.foodItem.id}`,
            food_item: result.foodItem.id,
            user: result.foodItem.user,
            photo: result.foodItem.photoPreviewUrl, // Use preview URL as photo
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            isPending: true,
          };

          queryClient.setQueryData(['allVisitPhotos'], (old: any[] = []) => {
            return [optimisticPhoto, ...old];
          });
        }
      } else {
        // Online: Invalidate to refetch fresh data
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['allFoodItems'] }),
          queryClient.invalidateQueries({ queryKey: ['quickTrackItems'] }),
          queryClient.invalidateQueries({ queryKey: ['allVisitPhotos'] }),
        ]);
      }
    },
  });
}

/**
 * Execute Quick Track when online
 */
async function executeQuickTrack(
  data: QuickTrackData,
  userId: string,
  uploadPhotos: (items: PhotoUploadItem[]) => Promise<void>
): Promise<QuickTrackResult> {
  console.log('[executeQuickTrack] Creating food item with data:', {
    name: data.name,
    rating: data.rating,
    notes: data.notes,
    itemCategory: data.itemCategory,
    location_text: data.location_text,
    latitude: data.latitude,
    longitude: data.longitude,
    userId,
  });

  // 1. Create food item (no visit)
  const foodItem = await pb.collection('food_items').create({
    name: data.name,
    rating: data.rating,
    notes: data.notes || undefined,
    itemCategory: data.itemCategory || undefined,
    location_text: data.location_text || undefined,
    latitude: data.latitude,
    longitude: data.longitude,
    user: userId,
    // visit field is intentionally omitted (Quick Track mode)
  });

  console.log('[executeQuickTrack] Food item created:', foodItem.id);

  // 2. Upload photo if provided
  let photoResult: any | undefined;
  if (data.photo) {
    console.log('[executeQuickTrack] Uploading photo...');
    const photoUpload: PhotoUploadItem = {
      photo: data.photo,
      foodItemId: foodItem.id,
      userId,
      // visitId is intentionally omitted (Quick Track mode)
    };

    await uploadPhotos([photoUpload]);
    photoResult = { foodItemId: foodItem.id };
    console.log('[executeQuickTrack] Photo uploaded successfully');
  }

  console.log('[executeQuickTrack] Returning result');
  return { foodItem, photoResult };
}

/**
 * Queue Quick Track for offline sync
 */
async function queueQuickTrack(data: QuickTrackData, userId: string): Promise<void> {
  // Queue as a quick track operation
  await syncQueue.enqueue({
    type: 'create',
    collection: 'quick_track_item', // Special collection marker
    data: {
      foodItem: {
        name: data.name,
        rating: data.rating,
        notes: data.notes,
        itemCategory: data.itemCategory,
        location_text: data.location_text,
        latitude: data.latitude,
        longitude: data.longitude,
        user: userId,
      },
      photo: data.photo, // IndexedDB can store File objects
    },
  });

  console.log('Queued Quick Track item:', data.name, 'with photo:', !!data.photo);
}
