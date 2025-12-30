/**
 * Offline-aware hook for moving a food item to a different visit
 */

import { repositories } from '@/repositories';
import { useOfflineUpdate } from '@/hooks/offline/useOfflineMutation';
import { foodItemKeys, visitKeys } from '@/constants/queryKeys';
import { COLLECTIONS } from '@/constants/collections';

interface MoveFoodItemVariables {
  foodItemId: string;
  targetVisitId: string;
}

/**
 * Hook to move a food item from one visit to another.
 *
 * @example
 * const moveFoodItem = useOfflineFoodItemMove();
 *
 * await moveFoodItem.mutateAsync({
 *   foodItemId: 'item123',
 *   targetVisitId: 'visit456',
 * });
 */
export function useOfflineFoodItemMove() {
  return useOfflineUpdate<unknown, MoveFoodItemVariables>(COLLECTIONS.FOOD_ITEMS, {
    mutationFn: async ({ foodItemId, targetVisitId }) => {
      return repositories.foodItems.update(foodItemId, {
        visit: targetVisitId,
      });
    },
    getRecordId: (variables) => variables.foodItemId,
    invalidateQueries: [
      [...foodItemKeys.all],
      [...visitKeys.all],
    ],
  });
}
