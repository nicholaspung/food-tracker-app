import type { RestaurantListVisitedRestaurantFoodItem } from '../features';
import { filterVisibleRestaurantFoodItems } from '../screens/addRestaurantToList/shared';

function createFoodItem(
  overrides: Partial<RestaurantListVisitedRestaurantFoodItem> &
    Pick<RestaurantListVisitedRestaurantFoodItem, 'id' | 'name'>,
): RestaurantListVisitedRestaurantFoodItem {
  return {
    id: overrides.id,
    name: overrides.name,
    rating: overrides.rating ?? 3,
    visitedAt: overrides.visitedAt ?? '2026-04-10 18:30:00.000Z',
    notes: overrides.notes,
    photoCount: overrides.photoCount,
    photoPreview: overrides.photoPreview,
  };
}

describe('filterVisibleRestaurantFoodItems', () => {
  it('returns all food items unchanged when duplicate hiding is off', () => {
    const foodItems = [
      createFoodItem({ id: 'item_1', name: 'Tonkotsu Ramen' }),
      createFoodItem({ id: 'item_2', name: 'Tonkotsu Ramen' }),
    ];

    expect(
      filterVisibleRestaurantFoodItems({
        foodItems,
        selectedFoodItemIds: [],
        hideDuplicateRatings: false,
      }),
    ).toEqual(foodItems);
  });

  it('keeps the newest item for duplicate names when no duplicate is selected', () => {
    const newest = createFoodItem({ id: 'item_1', name: 'Tonkotsu Ramen' });
    const unique = createFoodItem({ id: 'item_2', name: 'Gyoza' });
    const older = createFoodItem({ id: 'item_3', name: 'Tonkotsu Ramen' });

    expect(
      filterVisibleRestaurantFoodItems({
        foodItems: [newest, unique, older],
        selectedFoodItemIds: [],
        hideDuplicateRatings: true,
      }),
    ).toEqual([newest, unique]);
  });

  it('keeps a selected older duplicate visible and hides the unselected newer duplicate', () => {
    const newest = createFoodItem({ id: 'item_1', name: 'Tonkotsu Ramen' });
    const unique = createFoodItem({ id: 'item_2', name: 'Gyoza' });
    const older = createFoodItem({ id: 'item_3', name: 'Tonkotsu Ramen' });

    expect(
      filterVisibleRestaurantFoodItems({
        foodItems: [newest, unique, older],
        selectedFoodItemIds: ['item_3'],
        hideDuplicateRatings: true,
      }),
    ).toEqual([unique, older]);
  });

  it('keeps multiple selected duplicates visible and hides only unselected siblings', () => {
    const newest = createFoodItem({ id: 'item_1', name: 'Tonkotsu Ramen' });
    const unique = createFoodItem({ id: 'item_2', name: 'Gyoza' });
    const older = createFoodItem({ id: 'item_3', name: 'Tonkotsu Ramen' });
    const oldest = createFoodItem({ id: 'item_4', name: 'Tonkotsu Ramen' });

    expect(
      filterVisibleRestaurantFoodItems({
        foodItems: [newest, unique, older, oldest],
        selectedFoodItemIds: ['item_3', 'item_4'],
        hideDuplicateRatings: true,
      }),
    ).toEqual([unique, older, oldest]);
  });

  it('normalizes case, trimming, and repeated whitespace when grouping duplicates', () => {
    const newest = createFoodItem({ id: 'item_1', name: '  Tonkotsu   Ramen ' });
    const older = createFoodItem({ id: 'item_2', name: 'tonkotsu ramen' });
    const unique = createFoodItem({ id: 'item_3', name: 'Spicy Miso Ramen' });

    expect(
      filterVisibleRestaurantFoodItems({
        foodItems: [newest, older, unique],
        selectedFoodItemIds: [],
        hideDuplicateRatings: true,
      }),
    ).toEqual([newest, unique]);
  });

  it('keeps non-duplicate item names visible when duplicate hiding is enabled', () => {
    const first = createFoodItem({ id: 'item_1', name: 'Tonkotsu Ramen' });
    const second = createFoodItem({ id: 'item_2', name: 'Spicy Tuna Roll' });
    const third = createFoodItem({ id: 'item_3', name: 'Gyoza' });

    expect(
      filterVisibleRestaurantFoodItems({
        foodItems: [first, second, third],
        selectedFoodItemIds: [],
        hideDuplicateRatings: true,
      }),
    ).toEqual([first, second, third]);
  });

  it('preserves backend order in the filtered output', () => {
    const newestDuplicate = createFoodItem({ id: 'item_1', name: 'Tonkotsu Ramen' });
    const uniqueA = createFoodItem({ id: 'item_2', name: 'Gyoza' });
    const olderDuplicate = createFoodItem({ id: 'item_3', name: 'Tonkotsu Ramen' });
    const uniqueB = createFoodItem({ id: 'item_4', name: 'Curry Rice' });

    expect(
      filterVisibleRestaurantFoodItems({
        foodItems: [newestDuplicate, uniqueA, olderDuplicate, uniqueB],
        selectedFoodItemIds: ['item_3'],
        hideDuplicateRatings: true,
      }),
    ).toEqual([uniqueA, olderDuplicate, uniqueB]);
  });
});
