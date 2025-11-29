import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { pb, Restaurant } from "@/lib/pocketbase";

// Re-export Restaurant type for convenience
export type { Restaurant };

// Query key factory for consistent query keys across the app
export const restaurantKeys = {
  all: ["restaurants"] as const,
  detail: (id: string) => ["restaurant", id] as const,
};

/**
 * Hook to fetch all restaurants for the current user
 * @returns Query result with restaurants array, loading state, error, and refetch function
 */
export function useRestaurants(): UseQueryResult<Restaurant[], Error> {
  return useQuery<Restaurant[], Error>({
    queryKey: restaurantKeys.all,
    queryFn: async () => {
      return await pb.collection("restaurants").getFullList<Restaurant>({
        sort: "-created",
      });
    },
  });
}

/**
 * Hook to fetch a single restaurant by ID
 * @param restaurantId - The ID of the restaurant to fetch
 * @param enabled - Whether the query should run (default: true if restaurantId is provided)
 * @returns Query result with restaurant data, loading state, error, and refetch function
 */
export function useRestaurant(
  restaurantId: string | undefined | null,
  enabled?: boolean
): UseQueryResult<Restaurant | null, Error> {
  return useQuery<Restaurant | null, Error>({
    queryKey: restaurantId ? restaurantKeys.detail(restaurantId) : ["restaurant", "null"],
    queryFn: async () => {
      if (!restaurantId) return null;
      return await pb.collection("restaurants").getOne<Restaurant>(restaurantId);
    },
    enabled: enabled !== undefined ? enabled : !!restaurantId,
  });
}
