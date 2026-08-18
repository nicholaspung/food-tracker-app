import {
  buildFoodDiscoveryMapGroups,
  buildFoodDiscoveryMapReadModel,
} from '../components/maps/foodDiscoveryMapAdapter';
import type { RestaurantRecord } from '../features/models';
import type { FoodDiscoveryRestaurantReadModel } from '../features/store/useFoodDiscoveryRestaurantReadModel';
import type { VisitRestaurantWithDistance } from '../lib/visitRestaurantSearch';

const selectedRestaurant: RestaurantRecord = {
  city: 'Los Angeles',
  cuisineType: 'Grocery',
  friendCount: 2,
  id: 'restaurant-1',
  latitude: 34.09,
  location: '7660 Beverly Blvd',
  longitude: -118.36,
  name: 'Erewhon West Hollywood',
  userVisitCount: 1,
};

function buildRestaurantReadModel(): FoodDiscoveryRestaurantReadModel {
  return {
    allLocationsHistory: {
      anchorRestaurant: { id: selectedRestaurant.id, name: selectedRestaurant.name },
      itemCount: 1,
      items: [
        {
          averageRating: 4.5,
          displayName: 'Personal History Only',
          latestRating: 5,
          latestRestaurantId: 'restaurant-2',
          latestRestaurantLocation: '333 Jefferson St',
          latestRestaurantName: 'Erewhon Venice',
          latestVisitedAt: '2026-04-03T18:30:00.000Z',
          normalizedItemName: 'personal history only',
          orderCount: 2,
          restaurants: [],
        },
      ],
      locationCount: 2,
      normalizedName: 'erewhon',
      restaurants: [],
      visitCount: 2,
    },
    allLocationsHistoryErrorMessage: null,
    allLocationsHistoryLoading: false,
    canShowAllLocations: true,
    fetchNextMenuCatalogPage: jest.fn(),
    groupMenuSuggestions: {
      restaurantId: selectedRestaurant.id,
      suggestions: [],
    },
    groupMenuSuggestionsErrorMessage: null,
    groupMenuSuggestionsLoading: false,
    menuCatalogErrorMessage: null,
    menuCatalogHasNextPage: false,
    menuCatalogIsFetchingNextPage: false,
    menuCatalogItems: [
      {
        id: 'menu-exact',
        name: 'Exact Location Item',
        orderedHistory: { kind: 'exactLocation', orderCount: 1 },
      },
      {
        id: 'menu-related-history',
        name: 'Related History Item',
        orderedHistory: { kind: 'relatedLocation', orderCount: 2 },
      },
    ],
    menuCatalogLoading: false,
    menuCatalogTotalItems: 2,
    menuItems: [],
    menuSelectionSuggestions: [],
    refetchAllLocationsHistory: jest.fn(),
    refetchGroupMenuSuggestions: jest.fn(),
    refetchMenuCatalog: jest.fn(),
    relatedMenuSuggestions: [],
    yourOrderedItems: [
      {
        id: 'personal history only',
        latestRating: 5,
        latestRestaurantLocation: '333 Jefferson St',
        latestRestaurantName: 'Erewhon Venice',
        name: 'Personal History Only',
        orderCount: 2,
      },
    ],
  };
}

describe('buildFoodDiscoveryMapReadModel', () => {
  const currentRestaurants: VisitRestaurantWithDistance[] = [
    { distance: 1.2, restaurant: selectedRestaurant },
    { distance: null, restaurant: { id: 'without-coordinates', name: 'No Coordinates' } },
  ];

  it('preserves map groups, tabs, labels, and selected Restaurant behavior', () => {
    const model = buildFoodDiscoveryMapReadModel({
      activeSheetTab: 'location',
      displayedSavedRestaurantsCount: 0,
      groups: buildFoodDiscoveryMapGroups(currentRestaurants),
      isGettingLocation: false,
      isSearchingNearbyRestaurants: false,
      onSheetTabChange: jest.fn(),
      searchErrorMessage: null,
      selectedRestaurant,
      selectedRestaurantReadModel: buildRestaurantReadModel(),
      showNearbyPlaces: true,
      totalRestaurantCount: currentRestaurants.length,
    });

    expect(model).toMatchObject({
      mapStatusLabel: 'Showing search results',
      omittedWithoutCoordinates: 1,
      selectedRestaurant,
      selectedRestaurantId: selectedRestaurant.id,
    });
    expect(model.groups).toEqual([
      expect.objectContaining({
        id: selectedRestaurant.id,
        restaurantName: selectedRestaurant.name,
        summary: 'Grocery • 1.2 mi • 1 visit • 2 friends',
      }),
    ]);
    expect(model.selectedGroupTabs?.location).toMatchObject({
      emptyTitle: 'No menu items yet',
      title: 'This Location',
    });
    expect(model.selectedGroupTabs?.location.items).toEqual([
      expect.objectContaining({ meta: [{ label: 'Had here' }], name: 'Exact Location Item' }),
      expect.objectContaining({
        meta: [{ label: 'Had at related locations' }],
        name: 'Related History Item',
      }),
    ]);
    expect(model.selectedGroupTabs?.allLocations).toMatchObject({
      emptyTitle: 'No orders across locations yet',
      title: 'All Locations',
    });
  });

  it('keeps All Locations History confined to the personal-history tab', () => {
    const model = buildFoodDiscoveryMapReadModel({
      activeSheetTab: 'allLocations',
      displayedSavedRestaurantsCount: 1,
      groups: buildFoodDiscoveryMapGroups(currentRestaurants),
      isGettingLocation: false,
      isSearchingNearbyRestaurants: false,
      onSheetTabChange: jest.fn(),
      searchErrorMessage: null,
      selectedRestaurant,
      selectedRestaurantReadModel: buildRestaurantReadModel(),
      showNearbyPlaces: false,
      totalRestaurantCount: currentRestaurants.length,
    });

    expect(model.selectedGroupTabs?.allLocations.items).toEqual([
      expect.objectContaining({
        meta: [
          {
            dateLabel: 'Latest at Erewhon Venice • 333 Jefferson St',
            label: '2 orders',
            rating: 5,
          },
        ],
        name: 'Personal History Only',
      }),
    ]);
    expect(model.selectedGroupTabs?.location.items.map((item) => item.name)).toEqual([
      'Exact Location Item',
      'Related History Item',
    ]);
  });
});
