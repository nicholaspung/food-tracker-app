import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb, type Restaurant, type MenuItem } from '@/lib/pocketbase';
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';
import { logger } from '@/lib/logger';
import { repositories } from '@/repositories';

interface RestaurantCreationData {
  name: string;
  address: string; // Required - backend location field is required
  cuisineType?: string;
  visibility: 'private' | 'friends' | 'public';
  googlePlacesId?: string;
  latitude?: number;
  longitude?: number;
  menuItems?: string[]; // Initial menu item names
}

interface RestaurantCreationResult {
  restaurant: Restaurant;
  menuItems: MenuItem[];
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
    mutationFn: async (data) => {
      try {
        const user = pb.authStore.record;

        if (!user) {
          throw new Error('User not authenticated');
        }

        if (isOnline) {
          // Online: Execute immediately
          const result = await executeRestaurantCreation(data, user.id);
          return result;
        } else {
          // Offline: Queue the complex operation
          logger.log('[OfflineRestaurant] Queueing restaurant creation for offline sync:', data.name);

          const tempRestaurantId = `temp_restaurant_${Date.now()}`;

          try {
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
                  createdBy: user.id,
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

            logger.log('[OfflineRestaurant] Successfully queued restaurant creation');
          } catch (error) {
            logger.error('[OfflineRestaurant] Failed to queue operation:', error);
            throw error;
          }

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
            createdBy: user.id,
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

          const result = {
            restaurant: optimisticRestaurant,
            menuItems: optimisticMenuItems,
            isQueued: true,
          };

          return result;
        }
      } catch (error) {
        logger.error('[OfflineRestaurant] Mutation error:', error);
        throw error;
      }
    },
    onSuccess: (result) => {
      // Add optimistic restaurant to cache immediately
      if (result.isQueued) {
        queryClient.setQueryData<Restaurant[]>(['restaurants'], (old = []) => {
          return [result.restaurant, ...old];
        });

        // IMPORTANT: Also cache the menu items so they appear in AddItemsToVisit
        if (result.menuItems && result.menuItems.length > 0) {
          queryClient.setQueryData(['menu_items', result.restaurant.id], result.menuItems);
        }

        logger.log('[OfflineRestaurant] Restaurant queued successfully, added to cache');
      } else {
        // Invalidate queries for online creation
        queryClient.invalidateQueries({ queryKey: ['restaurants'] });
        queryClient.invalidateQueries({ queryKey: ['menu_items', result.restaurant.id] });
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
  const restaurant = await repositories.restaurants.create({
    name: data.name,
    location: data.address,
    cuisineType: data.cuisineType,
    googlePlacesId: data.googlePlacesId,
    latitude: data.latitude,
    longitude: data.longitude,
    createdBy: userId,
    visibility: data.visibility,
  });

  logger.log('[OfflineRestaurant] Restaurant created:', restaurant.id);

  // 2. Create initial menu items if provided
  const createdMenuItems: MenuItem[] = [];
  if (data.menuItems && data.menuItems.length > 0) {
    for (const itemName of data.menuItems) {
      try {
        const menuItem = await repositories.menuItems.create({
          name: itemName,
          restaurant: restaurant.id,
          createdBy: userId,
          visibility: data.visibility, // Match restaurant visibility
        });
        createdMenuItems.push(menuItem as unknown as MenuItem);
        logger.log('[OfflineRestaurant] Menu item created:', menuItem.id, itemName);
      } catch (error) {
        logger.error('[OfflineRestaurant] Failed to create menu item:', itemName, error);
        // Continue with other items even if one fails
      }
    }
  }

  return {
    restaurant: restaurant as unknown as Restaurant,
    menuItems: createdMenuItems,
  };
}
