import { buildMenuSelectionSuggestions } from '../features/restaurants/menuSelectionSuggestions';
import type {
  AllLocationsHistoryRecord,
  GroupMenuSuggestionsRecord,
  MenuItemRecord,
} from '../features';

const exactMenuItems = [
  {
    id: 'menu-item-1',
    name: 'Burger',
    restaurant: 'restaurant-1',
  },
] as MenuItemRecord[];

function buildGroupSuggestions(
  suggestions: GroupMenuSuggestionsRecord['suggestions'],
): GroupMenuSuggestionsRecord {
  return {
    restaurantId: 'restaurant-1',
    restaurantGroupId: 'group-1',
    suggestions,
  };
}

function buildHistory(items: AllLocationsHistoryRecord['items']): AllLocationsHistoryRecord {
  return {
    anchorRestaurant: {
      id: 'restaurant-1',
      name: 'Fire',
    },
    itemCount: items.length,
    items,
    locationCount: 2,
    normalizedName: 'fire',
    restaurants: [],
    visitCount: items.length,
  };
}

describe('buildMenuSelectionSuggestions', () => {
  it('orders exact-location deduped related-location suggestions before all-locations history', () => {
    const suggestions = buildMenuSelectionSuggestions({
      allLocationsHistory: buildHistory([
        {
          averageRating: 5,
          displayName: 'Coconut Yogurt',
          latestRating: 5,
          latestRestaurantId: 'restaurant-2',
          latestRestaurantName: 'Fire',
          latestVisitedAt: '2026-04-05T18:30:00.000Z',
          normalizedItemName: 'coconut yogurt',
          orderCount: 1,
          restaurants: [],
        },
        {
          averageRating: 4,
          displayName: 'Noodle Soup',
          latestRating: 4,
          latestRestaurantId: 'restaurant-3',
          latestRestaurantName: 'Fire',
          latestVisitedAt: '2026-04-06T18:30:00.000Z',
          normalizedItemName: 'noodle soup',
          orderCount: 2,
          restaurants: [],
        },
      ]),
      exactLocationMenuItems: exactMenuItems,
      groupMenuSuggestions: buildGroupSuggestions([
        {
          displayName: 'Burger',
          normalizedItemName: 'burger',
          sourceItemCount: 2,
          sourceRestaurantCount: 2,
          sources: [],
        },
        {
          displayName: 'Coconut Yogurt',
          normalizedItemName: 'coconut yogurt',
          sourceItemCount: 3,
          sourceRestaurantCount: 2,
          sources: [
            {
              menuItemCount: 2,
              menuItemIds: ['menu-item-2', 'menu-item-3'],
              restaurantId: 'restaurant-2',
              restaurantLocation: 'Venice, CA',
              restaurantName: 'Fire',
            },
          ],
        },
      ]),
    });

    expect(suggestions).toEqual([
      expect.objectContaining({
        name: 'Coconut Yogurt',
        source: 'relatedLocationSuggestion',
        suggestionSource: {
          normalizedItemName: 'coconut yogurt',
          restaurantGroupId: 'group-1',
          sourceMenuItemId: 'menu-item-2',
          sourceRestaurantId: 'restaurant-2',
          type: 'groupMenuSuggestion',
        },
        sourceItemCount: 3,
        sourceRestaurantCount: 2,
      }),
      expect.objectContaining({
        name: 'Noodle Soup',
        source: 'allLocationsHistory',
      }),
    ]);
  });

  it('keeps all-locations history available when trusted suggestions are unavailable', () => {
    expect(
      buildMenuSelectionSuggestions({
        allLocationsHistory: buildHistory([
          {
            averageRating: 4,
            displayName: 'Noodle Soup',
            latestRating: 4,
            latestRestaurantId: 'restaurant-3',
            latestRestaurantName: 'Fire',
            latestVisitedAt: '2026-04-06T18:30:00.000Z',
            normalizedItemName: 'noodle soup',
            orderCount: 2,
            restaurants: [],
          },
        ]),
        exactLocationMenuItems: exactMenuItems,
      }),
    ).toEqual([
      expect.objectContaining({
        name: 'Noodle Soup',
        source: 'allLocationsHistory',
      }),
    ]);
  });

  it('filters both optional sources by the search query', () => {
    expect(
      buildMenuSelectionSuggestions({
        allLocationsHistory: buildHistory([
          {
            averageRating: 4,
            displayName: 'Noodle Soup',
            latestRating: 4,
            latestRestaurantId: 'restaurant-3',
            latestRestaurantName: 'Fire',
            latestVisitedAt: '2026-04-06T18:30:00.000Z',
            normalizedItemName: 'noodle soup',
            orderCount: 2,
            restaurants: [],
          },
        ]),
        groupMenuSuggestions: buildGroupSuggestions([
          {
            displayName: 'Coconut Yogurt',
            normalizedItemName: 'coconut yogurt',
            sourceItemCount: 3,
            sourceRestaurantCount: 2,
            sources: [],
          },
        ]),
        searchQuery: 'coconut',
      }),
    ).toEqual([
      expect.objectContaining({
        name: 'Coconut Yogurt',
        source: 'relatedLocationSuggestion',
      }),
    ]);
  });
});
