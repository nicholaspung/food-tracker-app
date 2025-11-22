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
    // CRITICAL: Allow mutation to run even when browser is offline
    // We handle online/offline logic inside mutationFn
    networkMode: 'always',
    onMutate: async (variables) => {
      try {
        console.log('[useOfflineRestaurantCreation] onMutate called with:', variables);
        console.log('[useOfflineRestaurantCreation] onMutate completing...');
        return undefined;
      } catch (error) {
        console.error('[useOfflineRestaurantCreation] ERROR IN onMutate:', error);
        throw error;
      }
    },
    mutationFn: async (data) => {
      try {
        console.log('[useOfflineRestaurantCreation] ========== mutationFn STARTED ==========');
        console.log('[useOfflineRestaurantCreation] mutationFn called with data:', data);
        const user = pb.authStore.record;
        console.log('[useOfflineRestaurantCreation] User:', user?.id);

        if (!user) {
          console.error('[useOfflineRestaurantCreation] No user authenticated');
          throw new Error('User not authenticated');
        }

        console.log('[useOfflineRestaurantCreation] isOnline:', isOnline);

        if (isOnline) {
          // Online: Execute immediately
          console.log('[useOfflineRestaurantCreation] Going online path');
          const result = await executeRestaurantCreation(data, user.id);
          console.log('[useOfflineRestaurantCreation] Online creation complete:', result);
          return result;
        } else {
          // Offline: Queue the complex operation
          console.log('[useOfflineRestaurantCreation] Going offline path');
          logger.log('[OfflineRestaurant] Queueing restaurant creation for offline sync:', data.name);

          const tempRestaurantId = `temp_restaurant_${Date.now()}`;
          console.log('[useOfflineRestaurantCreation] Generated temp ID:', tempRestaurantId);

          try {
            console.log('[useOfflineRestaurantCreation] About to enqueue operation');
            const queueId = await syncQueue.enqueue({
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
                  createdBy: user.id,
                  visibility: data.visibility, // Match restaurant visibility
                })),
              },
              localId: tempRestaurantId,
            });

            console.log('[useOfflineRestaurantCreation] Successfully enqueued with ID:', queueId);
            logger.log('[OfflineRestaurant] Successfully queued restaurant creation');
          } catch (error) {
            console.error('[useOfflineRestaurantCreation] Error enqueueing:', error);
            logger.error('[OfflineRestaurant] Failed to queue operation:', error);
            throw error;
          }

          // Return optimistic data
          console.log('[useOfflineRestaurantCreation] Creating optimistic data');
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

          console.log('[useOfflineRestaurantCreation] Optimistic restaurant:', optimisticRestaurant);
          logger.log('[OfflineRestaurant] Created optimistic restaurant:', optimisticRestaurant);

          const result = {
            restaurant: optimisticRestaurant,
            menuItems: optimisticMenuItems,
            isQueued: true,
          };

          console.log('[useOfflineRestaurantCreation] Returning result:', result);
          return result;
        }
      } catch (error) {
        console.error('[useOfflineRestaurantCreation] MUTATION ERROR:', error);
        throw error;
      }
    },
    onSuccess: (result) => {
      console.log('[useOfflineRestaurantCreation] onSuccess called with:', result);
      // Add optimistic restaurant to cache immediately
      if (result.isQueued) {
        queryClient.setQueryData(['restaurants'], (old: any[] = []) => {
          return [result.restaurant, ...old];
        });
        logger.log('[OfflineRestaurant] Restaurant queued successfully, added to cache');
      } else {
        // Invalidate queries for online creation
        queryClient.invalidateQueries({ queryKey: ['restaurants'] });
        logger.log('[OfflineRestaurant] Restaurant created successfully:', result.restaurant.id);
      }
    },
    onError: (error) => {
      console.error('[useOfflineRestaurantCreation] onError called with:', error);
      logger.error('[OfflineRestaurant] Failed to create restaurant:', error);
    },
    onSettled: (data, error, variables) => {
      console.log('[useOfflineRestaurantCreation] onSettled called:', { data, error, variables });
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
          createdBy: userId,
          visibility: data.visibility, // Match restaurant visibility
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
