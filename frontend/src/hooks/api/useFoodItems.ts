import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { pb, FoodItem } from "@/lib/pocketbase";

// Re-export FoodItem type for convenience
export type { FoodItem };

// Query key factory for consistent query keys across the app
export const foodItemKeys = {
  all: ["allFoodItems"] as const,
  byVisit: (visitId: string) => ["foodItems", visitId] as const,
  detail: (id: string) => ["foodItem", id] as const,
};

/**
 * Hook to fetch all food items
 * @returns Query result with food items array, loading state, error, and refetch function
 */
export function useFoodItems(): UseQueryResult<FoodItem[], Error> {
  return useQuery<FoodItem[], Error>({
    queryKey: foodItemKeys.all,
    queryFn: async () => {
      return await pb.collection("food_items").getFullList<FoodItem>({
        sort: "-created",
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
      return await pb.collection("food_items").getFullList<FoodItem>({
        filter: `visit = "${visitId}"`,
        sort: "created",
      });
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
      return await pb.collection("food_items").getOne<FoodItem>(foodItemId);
    },
    enabled: enabled !== undefined ? enabled : !!foodItemId,
  });
}
