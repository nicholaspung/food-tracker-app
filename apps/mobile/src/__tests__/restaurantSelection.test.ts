import {
  buildDisplayedNearbyRestaurants,
  buildDisplayedSavedRestaurants,
  buildLoadedRestaurantRecords,
  buildRecentRestaurantsQueryOptions,
  buildRestaurantMenuItemsQueryOptions,
  resolveSavedRestaurantsUiState,
  syncMonthlyUsageSnapshot,
} from '../features/restaurants/restaurantSelection';
import {
  type RestaurantRecord,
} from '../features';
import {
  listMenuItemsForRestaurant,
  listRestaurantSuggestions,
} from '../features/store/featureStore';
import { restaurantsQueryKeys } from '../features/store/restaurantsQuery';

jest.mock('../features/store/featureStore', () => ({
  listMenuItemsForRestaurant: jest.fn(),
  listRestaurantSuggestions: jest.fn(),
  searchRestaurantsPage: jest.fn(),
}));

jest.mock('../lib/googlePlaces', () => ({
  calculateDistance: jest.fn((lat1: number, lng1: number, lat2: number, lng2: number) =>
    Math.hypot(lat2 - lat1, lng2 - lng1),
  ),
  formatDistance: jest.fn((miles: number) => `${miles.toFixed(1)} mi`),
}));

const mockedListMenuItemsForRestaurant = listMenuItemsForRestaurant as jest.MockedFunction<
  typeof listMenuItemsForRestaurant
>;
const mockedListRestaurantSuggestions = listRestaurantSuggestions as jest.MockedFunction<
  typeof listRestaurantSuggestions
>;

const restaurants: RestaurantRecord[] = [
  {
    city: 'Oakland',
    cuisineType: 'Bakery',
    id: 'restaurant-bakery',
    latitude: 37,
    location: 'Oakland',
    longitude: -122,
    name: 'Morning Bakery',
  },
  {
    city: 'San Francisco',
    cuisineType: 'Japanese',
    id: 'restaurant-ramen',
    latitude: 37.8,
    location: 'San Francisco',
    longitude: -122.4,
    name: 'Ramen House',
  },
];

describe('restaurant selection module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes saved restaurant suggestion query keys and request search text', async () => {
    mockedListRestaurantSuggestions.mockResolvedValue(restaurants);
    const options = buildRecentRestaurantsQueryOptions({
      enabled: true,
      limit: 25,
      search: '  ramen   house  ',
    });

    await options.queryFn({ signal: new AbortController().signal } as never);

    expect(options.queryKey).toEqual(restaurantsQueryKeys.suggestions(25, 'ramen house'));
    expect(mockedListRestaurantSuggestions).toHaveBeenCalledWith({
      limit: 25,
      search: 'ramen house',
      signal: expect.any(AbortSignal),
    });
  });

  it('returns cached menu items while offline without calling the network reader', async () => {
    const cachedMenuItems = [
      {
        friendEatenCount: 1,
        id: 'menu-item-1',
        name: 'Ramen',
        restaurant: 'restaurant-ramen',
        userEatenCount: 2,
      },
    ];
    const queryClient = {
      getQueryData: jest.fn(() => cachedMenuItems),
    };
    const options = buildRestaurantMenuItemsQueryOptions({
      enabled: true,
      isOnline: false,
      queryClient: queryClient as never,
      selectedRestaurantId: 'restaurant-ramen',
    });

    const result = await options.queryFn({ signal: new AbortController().signal } as never);

    expect(options.queryKey).toEqual(['feature', 'menuItems', 'restaurant-ramen']);
    expect(result).toBe(cachedMenuItems);
    expect(queryClient.getQueryData).toHaveBeenCalledWith(['feature', 'menuItems', 'restaurant-ramen']);
    expect(mockedListMenuItemsForRestaurant).not.toHaveBeenCalled();
  });

  it('sorts saved restaurants by distance and keeps the selected restaurant first', () => {
    const displayed = buildDisplayedSavedRestaurants({
      referenceCoords: { lat: 37, lng: -122 },
      savedRestaurantRecords: restaurants,
      selectedRestaurantId: 'restaurant-ramen',
    });

    expect(displayed.map(({ restaurant }) => restaurant.id)).toEqual([
      'restaurant-ramen',
      'restaurant-bakery',
    ]);
  });

  it('dedupes nearby and text results before filtering by search query', () => {
    const displayed = buildDisplayedNearbyRestaurants({
      nearbyResults: [restaurants[0]],
      referenceCoords: null,
      searchQuery: 'ramen',
      searchResults: [restaurants[0], restaurants[1]],
      selectedRestaurantId: null,
    });

    expect(displayed.map(({ restaurant }) => restaurant.id)).toEqual(['restaurant-ramen']);
  });

  it('aggregates loaded restaurants in saved, text, nearby priority order', () => {
    const loaded = buildLoadedRestaurantRecords({
      savedRestaurantRecords: [restaurants[0]],
      searchResults: [restaurants[1]],
      nearbyResults: [restaurants[0]],
    });

    expect(loaded.map((restaurant) => restaurant.id)).toEqual([
      'restaurant-bakery',
      'restaurant-ramen',
    ]);
  });

  it('resolves saved restaurant copy for search, nearby, loading, and error states', () => {
    expect(
      resolveSavedRestaurantsUiState({
        hasReferenceCoords: false,
        hasSearchQuery: true,
        recentRestaurantsIsError: false,
        recentRestaurantsIsLoading: false,
        savedRestaurantsEmptyDescription: 'Search nearby places.',
      }),
    ).toMatchObject({
      savedEmptyDescription: 'Try a different name, location, or cuisine.',
      savedEmptyTitle: 'No matching restaurants',
      savedRestaurantsTitle: 'Matching restaurants',
    });

    expect(
      resolveSavedRestaurantsUiState({
        hasReferenceCoords: true,
        hasSearchQuery: false,
        recentRestaurantsIsError: true,
        recentRestaurantsIsLoading: true,
        savedRestaurantsEmptyDescription: 'Search nearby places.',
      }),
    ).toMatchObject({
      savedRestaurantsErrorMessage: 'Could not load restaurants.',
      savedRestaurantsLoading: true,
      savedRestaurantsTitle: 'Nearby restaurants',
    });
  });

  it('syncs monthly usage snapshots into the shared query cache', () => {
    const queryClient = {
      setQueryData: jest.fn(),
    };
    const snapshot = {
      billingPeriod: '2026-05',
      limits: {},
      usage: {},
    };

    expect(syncMonthlyUsageSnapshot(queryClient as never, snapshot as never)).toBe(true);
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      ['feature', 'usage', 'monthly', 'actual'],
      snapshot,
    );
    expect(syncMonthlyUsageSnapshot(queryClient as never, null)).toBe(false);
  });
});
