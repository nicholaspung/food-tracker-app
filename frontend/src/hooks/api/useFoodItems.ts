import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { FoodItem } from "@/lib/pocketbase";
import { foodItemKeys } from "@/constants/queryKeys";
import { repositories } from '@/repositories';

// Re-export FoodItem type for convenience
export type { FoodItem };

// Re-export query keys for backward compatibility
export { foodItemKeys };

/**
 * Hook to fetch all food items
 * @returns Query result with food items array, loading state, error, and refetch function
 */
export function useFoodItems(): UseQueryResult<FoodItem[], Error> {
  return useQuery<FoodItem[], Error>({
    queryKey: foodItemKeys.all,
    queryFn: async () => {
      return await repositories.foodItems.getFullList({
        sort: "-created",
        expand: "user",
      });
    },
  });
}

/**
 * Hook to fetch food items for a specific visit
 * @param visitId - The ID of the visit to fetch food items for
 * @param enabled - Whether the query should run (default: true if visitId is provided)
 * @returns Query result with food items array, loading state, error, and refetch function
 */
export function useFoodItemsByVisit(
  visitId: string | undefined | null,
  enabled?: boolean
): UseQueryResult<FoodItem[], Error> {
  return useQuery<FoodItem[], Error>({
    queryKey: visitId ? foodItemKeys.byVisit(visitId) : ["foodItems", "null"],
    queryFn: async () => {
      if (!visitId) return [];
      return await repositories.foodItems.getByVisit(visitId);
    },
    enabled: enabled !== undefined ? enabled : !!visitId,
  });
}

/**
 * Hook to fetch a single food item by ID
 * @param foodItemId - The ID of the food item to fetch
 * @param enabled - Whether the query should run (default: true if foodItemId is provided)
 * @returns Query result with food item data, loading state, error, and refetch function
 */
export function useFoodItem(
  foodItemId: string | undefined | null,
  enabled?: boolean
): UseQueryResult<FoodItem | null, Error> {
  return useQuery<FoodItem | null, Error>({
    queryKey: foodItemId ? foodItemKeys.detail(foodItemId) : ["foodItem", "null"],
    queryFn: async () => {
      if (!foodItemId) return null;
      return await repositories.foodItems.getOne(foodItemId);
    },
    enabled: enabled !== undefined ? enabled : !!foodItemId,
  });
}
