import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { MenuItem } from "@/lib/pocketbase";
import { menuItemKeys } from '@/constants/queryKeys';
import { repositories } from '@/repositories';

// Re-export MenuItem type for convenience
export type { MenuItem };

/**
 * Hook to fetch menu items for a specific restaurant
 * @param restaurantId - The ID of the restaurant
 * @param options - Query options
 * @returns Query result with menu items array
 */
export function useMenuItems(
  restaurantId: string | undefined | null,
  options?: { enabled?: boolean; sort?: string }
): UseQueryResult<MenuItem[], Error> {
  return useQuery<MenuItem[], Error>({
    queryKey: restaurantId ? menuItemKeys.byRestaurant(restaurantId) : menuItemKeys.all,
    queryFn: async () => {
      if (!restaurantId) return [];
      return await repositories.menuItems.getByRestaurant(restaurantId, {
        sort: options?.sort || '-created',
      });
    },
    enabled: options?.enabled !== undefined ? options.enabled : !!restaurantId,
  });
}

/**
 * Hook to fetch a single menu item by ID
 * @param menuItemId - The ID of the menu item
 * @param enabled - Whether the query should run
 * @returns Query result with menu item data
 */
export function useMenuItem(
  menuItemId: string | undefined | null,
  enabled?: boolean
): UseQueryResult<MenuItem | null, Error> {
  return useQuery<MenuItem | null, Error>({
    queryKey: menuItemId ? menuItemKeys.detail(menuItemId) : menuItemKeys.all,
    queryFn: async () => {
      if (!menuItemId) return null;
      return await repositories.menuItems.getOne(menuItemId);
    },
    enabled: enabled !== undefined ? enabled : !!menuItemId,
  });
}

/**
 * Hook to fetch all menu items (optionally filtered)
 * @param filter - Optional PocketBase filter string
 * @returns Query result with menu items array
 */
export function useAllMenuItems(filter?: string): UseQueryResult<MenuItem[], Error> {
  return useQuery<MenuItem[], Error>({
    queryKey: menuItemKeys.filtered(filter),
    queryFn: async () => {
      return await repositories.menuItems.getFullList({
        filter,
        sort: '-created',
      });
    },
  });
}
