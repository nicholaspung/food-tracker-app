import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { pb, type RestaurantList, type ListItem } from "@/lib/pocketbase";
import { restaurantListKeys } from '@/constants/queryKeys';
import { repositories } from '@/repositories';
import { useFriendships, type Friendship } from './useFriendships';

// Re-export types for convenience
export type { RestaurantList, ListItem };

/**
 * Hook to fetch all restaurant lists for the current user
 * @param options - Query options
 * @returns Query result with restaurant lists array
 */
export function useRestaurantLists(options?: {
  visibility?: 'private' | 'friends' | 'public';
}): UseQueryResult<RestaurantList[], Error> {
  const userId = pb.authStore.record?.id;

  return useQuery<RestaurantList[], Error>({
    queryKey: userId ? restaurantListKeys.all(userId, options?.visibility) : ['restaurant_lists'],
    queryFn: async () => {
      if (!userId) return [];

      const filters: string[] = [`user = "${userId}"`];
      if (options?.visibility) {
        filters.push(`visibility = "${options.visibility}"`);
      }

      return await repositories.restaurantLists.getFullList({
        filter: filters.join(' && '),
        sort: '-created',
      });
    },
    enabled: !!userId,
  });
}

/**
 * Hook to fetch a single restaurant list by ID
 * @param listId - The ID of the list
 * @param enabled - Whether the query should run
 * @returns Query result with list data
 */
export function useRestaurantList(
  listId: string | undefined | null,
  enabled?: boolean
): UseQueryResult<RestaurantList | null, Error> {
  return useQuery<RestaurantList | null, Error>({
    queryKey: listId ? restaurantListKeys.detail(listId) : ['restaurant_lists'],
    queryFn: async () => {
      if (!listId) return null;
      return await repositories.restaurantLists.getOne(listId);
    },
    enabled: enabled !== undefined ? enabled : !!listId,
  });
}

/**
 * Hook to fetch list items for a specific list
 * @param listId - The ID of the list
 * @param options - Query options
 * @returns Query result with list items array
 */
export function useListItems(
  listId: string | undefined | null,
  options?: { enabled?: boolean; expand?: string }
): UseQueryResult<ListItem[], Error> {
  return useQuery<ListItem[], Error>({
    queryKey: listId ? restaurantListKeys.items(listId) : ['list_items'],
    queryFn: async () => {
      if (!listId) return [];
      return await repositories.listItems.getByList(listId, {
        expand: options?.expand || 'restaurant',
        sort: '-created',
      });
    },
    enabled: options?.enabled !== undefined ? options.enabled : !!listId,
  });
}

/**
 * Hook to fetch friends' lists (visibility = 'friends' or 'public')
 * Uses useFriendships internally to get friend IDs
 * @returns Query result with friends' restaurant lists array
 */
export function useFriendsLists(): UseQueryResult<RestaurantList[], Error> {
  const userId = pb.authStore.record?.id;

  // Get accepted friendships to extract friend IDs
  const { data: friendships = [] } = useFriendships({ status: 'accepted' });

  // Extract friend IDs from friendships
  const friendIds = friendships.map((f: Friendship) =>
    f.user === userId ? f.friend : f.user
  );

  return useQuery<RestaurantList[], Error>({
    queryKey: userId ? restaurantListKeys.friendsLists(userId) : ['restaurant_lists', 'friends'],
    queryFn: async () => {
      if (!userId || friendIds.length === 0) return [];
      return await repositories.restaurantLists.getFriendsLists(friendIds);
    },
    enabled: !!userId && friendIds.length > 0,
  });
}

/**
 * Hook to fetch public lists from all users (excluding current user)
 * @returns Query result with public restaurant lists array
 */
export function usePublicLists(): UseQueryResult<RestaurantList[], Error> {
  const userId = pb.authStore.record?.id;

  return useQuery<RestaurantList[], Error>({
    queryKey: restaurantListKeys.publicLists(),
    queryFn: async () => {
      if (!userId) return [];
      return await repositories.restaurantLists.getPublicLists(userId);
    },
    enabled: !!userId,
  });
}
