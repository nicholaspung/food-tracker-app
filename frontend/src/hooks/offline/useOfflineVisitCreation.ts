/**
 * Offline-aware visit creation hook
 *
 * Handles complex multi-step visit creation including:
 * - Visit record creation
 * - Food item creation (multiple)
 * - Photo uploads (when online)
 *
 * Offline strategy:
 * - Visit + food items: Queued in IndexedDB
 * - Photos: Stored as File objects, uploaded when synced
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb, type Visit, type FoodItem } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { usePhotoUpload, type PhotoUploadItem } from '@/hooks/photos/usePhotoUpload';
import { blobUrlManager } from '@/lib/blobUrlManager';

export interface FoodItemData {
  name: string;
  description: string;
  rating: number;
  notes: string;
}

export interface VisitCreationData {
  restaurant: string;
  visitDate: string;
  visibility: 'friends' | 'private';
  notes: string;
  foodItems: FoodItemData[];
  itemPhotos: Map<number, File>; // Map of item index to photo file
}

interface VisitPhotoRecord {
  id: string;
  visit: string;
  food_item: string;
  user: string;
  photo: string;
  created: string;
  updated: string;
}

export interface VisitCreationResult {
  visit: Visit;
  foodItems: FoodItem[];
  photoResults?: VisitPhotoRecord[];
  isQueued?: boolean; // Flag to indicate if offline and queued for sync
}

/**
 * Hook for creating visits with offline support
 *
 * When online:
 * - Creates visit, food items, and uploads photos
 *
 * When offline:
 * - Queues visit and food item creation
 * - Stores photos in IndexedDB for later upload
 * - Auto-syncs when connection returns
 */
export function useOfflineVisitCreation() {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();
  const { uploadPhotos } = usePhotoUpload();

  return useMutation<VisitCreationResult, Error, VisitCreationData>({
    // CRITICAL: Allow mutation to run even when browser is offline
    // We handle online/offline logic inside mutationFn
    networkMode: 'always',
    mutationFn: async (data) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      if (isOnline) {
        // ONLINE: Execute immediately
        return await executeVisitCreation(data, user.id, uploadPhotos);
      } else {
        // OFFLINE: Queue the operation
        await queueVisitCreation(data, user.id);

        // Create unique timestamp for consistent IDs
        const timestamp = Date.now();

        // Create preview URLs for photos using blobUrlManager (prevents memory leaks)
        const photoPreviewUrls = new Map<number, string>();
        for (const [index, file] of data.itemPhotos.entries()) {
          const tempPhotoId = `temp_photo_${timestamp}_${index}`;
          const previewUrl = blobUrlManager.create(tempPhotoId, file);
          photoPreviewUrls.set(index, previewUrl);
        }

        // Return optimistic data
        return {
          visit: {
            id: `temp_visit_${timestamp}`,
            restaurant: data.restaurant,
            user: user.id,
            visitDate: data.visitDate,
            visibility: data.visibility,
            notes: data.notes,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            isPending: true, // Flag to indicate this is pending sync
          },
          foodItems: data.foodItems.map((item, index) => ({
            id: `temp_food_${timestamp}_${index}`,
            ...item,
            user: user.id,
            visit: `temp_visit_${timestamp}`,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            isPending: true,
            // Add preview URL if this item has a photo
            photoPreviewUrl: photoPreviewUrls.get(index),
          })),
          isQueued: true,
          _photoTimestamp: timestamp, // Store timestamp for cleanup
        };
      }
    },
    onSuccess: async (result) => {
      if (result.isQueued) {
        // Offline: Add optimistic data to cache
        queryClient.setQueryData<Visit[]>(['visits'], (old = []) => {
          return [result.visit, ...old];
        });
        queryClient.setQueryData<Visit[]>(['userVisits'], (old = []) => {
          return [result.visit, ...old];
        });
        queryClient.setQueryData<Visit[]>(['allVisits'], (old = []) => {
          return [result.visit, ...old];
        });

        // Also cache the food items
        if (result.foodItems && result.foodItems.length > 0) {
          queryClient.setQueryData<FoodItem[]>(['allFoodItems'], (old = []) => {
            return [...result.foodItems, ...old];
          });

          // Create optimistic visit_photos for items with photoPreviewUrl
          const optimisticPhotos = result.foodItems
            .filter(item => (item as FoodItem & { photoPreviewUrl?: string }).photoPreviewUrl)
            .map(item => {
              const itemWithPhoto = item as FoodItem & { photoPreviewUrl?: string };
              return {
                id: `temp_photo_${item.id}`,
                visit: result.visit.id,
                food_item: item.id,
                user: item.user,
                photo: itemWithPhoto.photoPreviewUrl!, // Use preview URL as photo
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                isPending: true,
              };
            });

          if (optimisticPhotos.length > 0) {
            queryClient.setQueryData<VisitPhotoRecord[]>(['allVisitPhotos'], (old = []) => {
              return [...optimisticPhotos, ...old];
            });
          }
        }
      } else {
        // Online: Invalidate to refetch fresh data
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['visits'] }),
          queryClient.invalidateQueries({ queryKey: ['userVisits'] }),
          queryClient.invalidateQueries({ queryKey: ['allVisits'] }),
          queryClient.invalidateQueries({ queryKey: ['allFoodItems'] }),
          queryClient.invalidateQueries({ queryKey: ['allVisitPhotos'] }),
        ]);

        // Cleanup: Revoke blob URLs for photos (they're now replaced with real server URLs)
        // Note: This may clean up URLs from other pending operations too, but that's okay
        // since the real data from the server will have proper photo URLs
        if ((result as any)._photoTimestamp) {
          const timestamp = (result as any)._photoTimestamp;
          result.foodItems.forEach((_, index) => {
            blobUrlManager.revoke(`temp_photo_${timestamp}_${index}`);
          });
        }
      }
    },
  });
}

/**
 * Execute visit creation when online
 */
async function executeVisitCreation(
  data: VisitCreationData,
  userId: string,
  uploadPhotos: (items: PhotoUploadItem[]) => Promise<void>
): Promise<VisitCreationResult> {
  // 1. Create visit
  const visit = await pb.collection('visits').create({
    restaurant: data.restaurant,
    user: userId,
    visitDate: data.visitDate,
    visibility: data.visibility,
    notes: data.notes,
  });

  // 2. Create all food items sequentially
  const foodItems: FoodItem[] = [];
  for (const item of data.foodItems) {
    const foodItem = await pb.collection('food_items').create({
      name: item.name,
      description: item.description,
      visit: visit.id,
      rating: item.rating,
      notes: item.notes,
      user: userId,
    });
    foodItems.push(foodItem as unknown as FoodItem);
  }

  // 3. Upload photos in parallel if any
  let photoResults: any[] | undefined;
  if (data.itemPhotos.size > 0) {
    const photoUploads: PhotoUploadItem[] = [];

    for (let i = 0; i < foodItems.length; i++) {
      const photo = data.itemPhotos.get(i);
      if (photo) {
        photoUploads.push({
          photo,
          foodItemId: foodItems[i].id,
          visitId: visit.id,
          userId,
        });
      }
    }

    if (photoUploads.length > 0) {
      await uploadPhotos(photoUploads);
      photoResults = photoUploads.map(p => ({ foodItemId: p.foodItemId }));
    }
  }

  return { visit: visit as unknown as Visit, foodItems, photoResults };
}

/**
 * Queue visit creation for offline sync
 */
async function queueVisitCreation(data: VisitCreationData, userId: string): Promise<void> {
  // Convert photos Map to array of { index, file } for storage
  const photosArray: Array<{ index: number; file: File }> = [];
  for (const [index, file] of data.itemPhotos.entries()) {
    photosArray.push({ index, file });
  }

  // Queue as a complex operation
  await syncQueue.enqueue({
    type: 'create',
    collection: 'visits_with_items', // Special collection marker
    data: {
      visit: {
        restaurant: data.restaurant,
        user: userId,
        visitDate: data.visitDate,
        visibility: data.visibility,
        notes: data.notes,
      },
      foodItems: data.foodItems.map(item => ({
        ...item,
        user: userId,
      })),
      photos: photosArray, // IndexedDB can store File objects
    },
  });

  console.log('Queued visit creation with', data.foodItems.length, 'items and', photosArray.length, 'photos');
}
