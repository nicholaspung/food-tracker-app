import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { logger } from '@/lib/logger';

interface RestaurantCreationData {
  name: string;
  address?: string;
  cuisineType?: string;
  visibility: 'private' | 'friends' | 'public';
  googlePlacesId?: string;
  latitude?: number;
  longitude?: number;
  menuItems?: string[]; // Initial menu item names
}

interface RestaurantCreationResult {
  restaurant: any;
  menuItems: any[];
  isQueued?: boolean;
}

/**
 * Hook for creating restaurants with initial menu items, with offline support.
 *
 * When online: Creates restaurant and menu items immediately
 * When offline: Queues operation with optimistic data, syncs when connection restored
 */
export function useOfflineRestaurantCreation() {
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  return useMutation<RestaurantCreationResult, Error, RestaurantCreationData>({
    mutationFn: async (data) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      if (isOnline) {
        // Online: Execute immediately
        return await executeRestaurantCreation(data, user.id);
      } else {
        // Offline: Queue the complex operation
        logger.log('[OfflineRestaurant] Queueing restaurant creation for offline sync:', data.name);

        const tempRestaurantId = `temp_restaurant_${Date.now()}`;

        await syncQueue.enqueue({
          type: 'create',
          collection: 'restaurants_with_menu_items',
          data: {
            restaurant: {
              name: data.name,
              location: data.address, // PocketBase uses 'location' field
              cuisineType: data.cuisineType,
              googlePlacesId: data.googlePlacesId,
              latitude: data.latitude,
              longitude: data.longitude,
              user: user.id,
              visibility: data.visibility,
            },
            menuItems: (data.menuItems || []).map(itemName => ({
              name: itemName,
              user: user.id,
            })),
          },
          localId: tempRestaurantId,
        });

        // Return optimistic data
        const optimisticRestaurant = {
          id: tempRestaurantId,
          name: data.name,
          address: data.address,
          cuisineType: data.cuisineType,
          location: data.address, // For compatibility with Restaurant type
          googlePlacesId: data.googlePlacesId,
          latitude: data.latitude,
          longitude: data.longitude,
          user: user.id,
          visibility: data.visibility,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          isPending: true, // Flag to indicate this is pending sync
        };

        const optimisticMenuItems = (data.menuItems || []).map((itemName, index) => ({
          id: `temp_menu_item_${Date.now()}_${index}`,
          name: itemName,
          restaurant: tempRestaurantId,
          user: user.id,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          isPending: true,
        }));

        logger.log('[OfflineRestaurant] Created optimistic restaurant:', optimisticRestaurant);

        return {
          restaurant: optimisticRestaurant,
          menuItems: optimisticMenuItems,
          isQueued: true,
        };
      }
    },
    onSuccess: (result) => {
      // Invalidate relevant queries to show the new restaurant
      queryClient.invalidateQueries({ queryKey: ['restaurants'] });

      if (result.isQueued) {
        logger.log('[OfflineRestaurant] Restaurant queued successfully, will sync when online');
      } else {
        logger.log('[OfflineRestaurant] Restaurant created successfully:', result.restaurant.id);
      }
    },
    onError: (error) => {
      logger.error('[OfflineRestaurant] Failed to create restaurant:', error);
    },
  });
}

/**
 * Execute the actual restaurant creation (used when online)
 */
async function executeRestaurantCreation(
  data: RestaurantCreationData,
  userId: string
): Promise<RestaurantCreationResult> {
  logger.log('[OfflineRestaurant] Creating restaurant immediately (online):', data.name);

  // 1. Create the restaurant
  const restaurant = await pb.collection('restaurants').create({
    name: data.name,
    location: data.address,
    cuisineType: data.cuisineType,
    googlePlacesId: data.googlePlacesId,
    latitude: data.latitude,
    longitude: data.longitude,
    user: userId,
    visibility: data.visibility,
  });

  logger.log('[OfflineRestaurant] Restaurant created:', restaurant.id);

  // 2. Create initial menu items if provided
  const createdMenuItems: any[] = [];
  if (data.menuItems && data.menuItems.length > 0) {
    for (const itemName of data.menuItems) {
      try {
        const menuItem = await pb.collection('menu_items').create({
          name: itemName,
          restaurant: restaurant.id,
          user: userId,
        });
        createdMenuItems.push(menuItem);
        logger.log('[OfflineRestaurant] Menu item created:', menuItem.id, itemName);
      } catch (error) {
        logger.error('[OfflineRestaurant] Failed to create menu item:', itemName, error);
        // Continue with other items even if one fails
      }
    }
  }

  return {
    restaurant,
    menuItems: createdMenuItems,
  };
}
