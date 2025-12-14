import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { pb } from "@/lib/pocketbase";
import { COLLECTIONS } from '@/constants/collections';

export interface RestaurantList {
  id: string;
  name: string;
  description?: string;
  user: string;
  visibility: 'private' | 'friends' | 'public';
  created: string;
  updated: string;
}

export interface ListItem {
  id: string;
  list: string;
  restaurant: string;
  notes?: string;
  user: string;
  created: string;
  updated: string;
  expand?: {
    restaurant?: {
      id: string;
      name: string;
      location: string;
      cuisineType?: string;
    };
  };
}

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
    queryKey: ['restaurant_lists', userId, options?.visibility],
    queryFn: async () => {
      if (!userId) return [];

      const filters: string[] = [`user = "${userId}"`];
      if (options?.visibility) {
        filters.push(`visibility = "${options.visibility}"`);
      }

      return await pb.collection(COLLECTIONS.RESTAURANT_LISTS).getFullList<RestaurantList>({
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
    queryKey: ['restaurant_list', listId],
    queryFn: async () => {
      if (!listId) return null;
      return await pb.collection(COLLECTIONS.RESTAURANT_LISTS).getOne<RestaurantList>(listId);
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
    queryKey: ['list_items', listId],
    queryFn: async () => {
      if (!listId) return [];
      return await pb.collection(COLLECTIONS.LIST_ITEMS).getFullList<ListItem>({
        filter: `list = "${listId}"`,
        expand: options?.expand || 'restaurant',
        sort: '-created',
      });
    },
    enabled: options?.enabled !== undefined ? options.enabled : !!listId,
  });
}
