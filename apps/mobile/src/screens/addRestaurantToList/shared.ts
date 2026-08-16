import type { RestaurantListVisitedRestaurantFoodItem } from '../../features';

interface FilterVisibleRestaurantFoodItemsInput {
  foodItems: readonly RestaurantListVisitedRestaurantFoodItem[];
  selectedFoodItemIds: readonly string[];
  hideDuplicateRatings: boolean;
}

function normalizeFoodItemName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function filterVisibleRestaurantFoodItems({
  foodItems,
  selectedFoodItemIds,
  hideDuplicateRatings,
}: FilterVisibleRestaurantFoodItemsInput): readonly RestaurantListVisitedRestaurantFoodItem[] {
  if (!hideDuplicateRatings || foodItems.length < 2) {
    return foodItems;
  }

  const selectedFoodItemIdSet = new Set(
    selectedFoodItemIds.map((foodItemId) => foodItemId.trim()).filter((foodItemId) => foodItemId.length > 0),
  );
  const newestFoodItemIdByName = new Map<string, string>();
  const selectedFoodItemIdsByName = new Map<string, Set<string>>();

  for (const foodItem of foodItems) {
    const normalizedName = normalizeFoodItemName(foodItem.name);
    if (!newestFoodItemIdByName.has(normalizedName)) {
      newestFoodItemIdByName.set(normalizedName, foodItem.id);
    }

    if (!selectedFoodItemIdSet.has(foodItem.id)) {
      continue;
    }

    const selectedIdsForName = selectedFoodItemIdsByName.get(normalizedName);
    if (selectedIdsForName) {
      selectedIdsForName.add(foodItem.id);
      continue;
    }

    selectedFoodItemIdsByName.set(normalizedName, new Set([foodItem.id]));
  }

  return foodItems.filter((foodItem) => {
    const normalizedName = normalizeFoodItemName(foodItem.name);
    const selectedIdsForName = selectedFoodItemIdsByName.get(normalizedName);

    if (selectedIdsForName?.size) {
      return selectedIdsForName.has(foodItem.id);
    }

    return newestFoodItemIdByName.get(normalizedName) === foodItem.id;
  });
}
