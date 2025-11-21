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
import { pb } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { usePhotoUpload, type PhotoUploadItem } from './usePhotoUpload';

export interface FoodItemData {
  name: string;
  description: string;
  rating: number;
  notes: string;
}

export interface VisitCreationData {
  restaurant: string;
  visitDate: string;
  visibility: string;
  notes: string;
  foodItems: FoodItemData[];
  itemPhotos: Map<number, File>; // Map of item index to photo file
}

export interface VisitCreationResult {
  visit: any;
  foodItems: any[];
  photoResults?: any[];
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
    mutationFn: async (data) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      if (isOnline) {
        // ONLINE: Execute immediately
        return await executeVisitCreation(data, user.id, uploadPhotos);
      } else {
        // OFFLINE: Queue the operation
        await queueVisitCreation(data, user.id);

        // Return optimistic data
        return {
          visit: {
            id: `temp_visit_${Date.now()}`,
            restaurant: data.restaurant,
            user: user.id,
            visitDate: data.visitDate,
            visibility: data.visibility,
            notes: data.notes,
          },
          foodItems: data.foodItems.map((item, index) => ({
            id: `temp_food_${Date.now()}_${index}`,
            ...item,
            user: user.id,
          })),
        };
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['userVisits'] }),
        queryClient.invalidateQueries({ queryKey: ['allVisits'] }),
        queryClient.invalidateQueries({ queryKey: ['allFoodItems'] }),
      ]);
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
  const foodItems: any[] = [];
  for (const item of data.foodItems) {
    const foodItem = await pb.collection('food_items').create({
      name: item.name,
      description: item.description,
      visit: visit.id,
      rating: item.rating,
      notes: item.notes,
      user: userId,
    });
    foodItems.push(foodItem);
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

  return { visit, foodItems, photoResults };
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
