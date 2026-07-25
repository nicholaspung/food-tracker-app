import {
  buildDisplayedNearbyRestaurants,
  buildDisplayedSavedRestaurants,
  buildLoadedRestaurantRecords,
  buildRecentRestaurantsQueryOptions,
  buildRestaurantMenuItemsQueryOptions,
  buildRestaurantSuggestionSearchText,
  isCurrentLocationSearchSelection,
  isUserAddedRestaurantOption,
  resolveSavedRestaurantsUiState,
  runRestaurantNearbyCoordinateSearch,
  runRestaurantNearbySearch,
  runRestaurantTextSearch,
  syncMonthlyUsageSnapshot,
} from '../features/restaurants/restaurantSelection';
import {
  type RestaurantRecord,
} from '../features';
import {
  listMenuItemsForRestaurant,
  listRestaurantSuggestions,
} from '../features/store/restaurantsStore';
import { restaurantsQueryKeys } from '../features/store/restaurantsQuery';

jest.mock('../features/store/restaurantsStore', () => ({
  listMenuItemsForRestaurant: jest.fn(),
  listRestaurantSuggestions: jest.fn(),
  searchRestaurantsPage: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../observability/telemetryError', () => ({
  buildSafeTelemetryErrorProperties: jest.fn(() => ({})),
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

  it('recognizes current-location labels without treating manual locations as GPS', () => {
    expect(
      isCurrentLocationSearchSelection({
        isUsingCurrentLocation: true,
        manualLocation: 'Oakland',
      }),
    ).toBe(true);
    expect(
      isCurrentLocationSearchSelection({
        isUsingCurrentLocation: false,
        manualLocation: 'Current location',
      }),
    ).toBe(true);
    expect(
      isCurrentLocationSearchSelection({
        isUsingCurrentLocation: false,
        manualLocation: 'Your location (phone GPS)',
      }),
    ).toBe(true);
    expect(
      isCurrentLocationSearchSelection({
        isUsingCurrentLocation: false,
        manualLocation: 'Your location (phone GPS unavailable)',
      }),
    ).toBe(true);
    expect(
      isCurrentLocationSearchSelection({
        isUsingCurrentLocation: false,
        manualLocation: 'Oakland',
      }),
    ).toBe(false);
  });

  it('distinguishes user-added restaurants from Google Places restaurants', () => {
    expect(isUserAddedRestaurantOption({ restaurant: {} })).toBe(true);
    expect(isUserAddedRestaurantOption({ restaurant: { isGooglePlace: false } })).toBe(true);
    expect(isUserAddedRestaurantOption({ restaurant: { isGooglePlace: true } })).toBe(false);
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

  it('uses place query before location query for saved suggestion fetches', () => {
    expect(buildRestaurantSuggestionSearchText({
      locationQuery: '  San   Francisco  ',
      searchQuery: ' ramen ',
    })).toBe('ramen');
    expect(buildRestaurantSuggestionSearchText({
      locationQuery: '  San   Francisco  ',
      searchQuery: ' ',
    })).toBe('San Francisco');
  });

  it('filters saved restaurants by place and typed location locally', () => {
    const displayed = buildDisplayedSavedRestaurants({
      locationQuery: 'San Francisco',
      referenceCoords: null,
      savedRestaurantRecords: restaurants,
      searchQuery: 'Japanese',
      selectedRestaurantId: null,
    });

    expect(displayed.map(({ restaurant }) => restaurant.id)).toEqual(['restaurant-ramen']);
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

  it('returns text search precondition outcomes without calling Places', async () => {
    const queryClient = {
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    };
    const searchByText = jest.fn();

    await expect(
      runRestaurantTextSearch({
        effectiveReferenceCoords: null,
        isOnline: false,
        isQuotaReached: false,
        locationText: '',
        query: 'pizza',
        queryClient: queryClient as never,
        searchByText,
        shouldEnforceUsageLimitsClientSide: false,
      }),
    ).resolves.toEqual({
      message: 'Google Places search requires internet connection.',
      status: 'offline',
    });

    await expect(
      runRestaurantTextSearch({
        effectiveReferenceCoords: null,
        isOnline: true,
        isQuotaReached: true,
        locationText: '',
        query: 'pizza',
        queryClient: queryClient as never,
        searchByText,
        shouldEnforceUsageLimitsClientSide: true,
      }),
    ).resolves.toEqual({
      message: 'Monthly food place search limit reached.',
      status: 'quota_reached',
    });

    await expect(
      runRestaurantTextSearch({
        effectiveReferenceCoords: null,
        isOnline: true,
        isQuotaReached: false,
        locationText: '  ',
        query: '  ',
        queryClient: queryClient as never,
        searchByText,
        shouldEnforceUsageLimitsClientSide: true,
      }),
    ).resolves.toEqual({
      message: 'Enter a place name/type or a location to search.',
      status: 'validation_error',
    });

    expect(searchByText).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('runs text search, syncs usage snapshots, and resolves reference coordinates', async () => {
    const queryClient = {
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    };
    const usageSnapshot = {
      monthKey: '2026-05',
      userTier: 'free',
      limits: {},
      usage: {},
      remaining: {},
    };
    const searchByText = jest.fn().mockResolvedValue({
      resolvedLocation: { lat: 37.8, lng: -122.4 },
      restaurants,
      usageSnapshot,
    });

    const result = await runRestaurantTextSearch({
      effectiveReferenceCoords: { lat: 37, lng: -122 },
      isOnline: true,
      isQuotaReached: false,
      locationText: 'San Francisco',
      query: '',
      queryClient: queryClient as never,
      searchByText,
      shouldEnforceUsageLimitsClientSide: true,
    });

    expect(result).toEqual({
      referenceCoords: { lat: 37.8, lng: -122.4 },
      results: restaurants,
      status: 'success',
    });
    expect(searchByText).toHaveBeenCalledWith({
      locationText: 'San Francisco',
      query: 'food',
      radius: 5000,
    });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      ['feature', 'usage', 'monthly', 'actual'],
      usageSnapshot,
    );
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('runs text search with coordinate bias for phone location', async () => {
    const queryClient = {
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    };
    const searchByText = jest.fn().mockResolvedValue({
      resolvedLocation: { lat: 10, lng: 20 },
      restaurants,
      usageSnapshot: null,
    });

    const result = await runRestaurantTextSearch({
      coordinateBias: { lat: 37.8, lng: -122.4 },
      effectiveReferenceCoords: null,
      isOnline: true,
      isQuotaReached: false,
      locationText: '',
      query: '',
      queryClient: queryClient as never,
      searchByText,
      shouldEnforceUsageLimitsClientSide: true,
    });

    expect(result).toEqual({
      referenceCoords: { lat: 37.8, lng: -122.4 },
      results: restaurants,
      status: 'success',
    });
    expect(searchByText).toHaveBeenCalledWith({
      latitude: 37.8,
      longitude: -122.4,
      locationText: undefined,
      query: 'food',
      radius: 5000,
    });
  });

  it('normalizes text search limit errors and invalidates monthly usage when no snapshot is synced', async () => {
    const queryClient = {
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    };
    const error = {
      data: {
        code: 'LIMIT_EXCEEDED',
        limit: 10,
        message: 'Monthly places query limit reached.',
        metric: 'places_queries',
        monthKey: '2026-05',
        remaining: 0,
        used: 10,
      },
    };
    const searchByText = jest.fn().mockRejectedValue(error);

    const result = await runRestaurantTextSearch({
      effectiveReferenceCoords: null,
      isOnline: true,
      isQuotaReached: false,
      locationText: '',
      query: 'ramen',
      queryClient: queryClient as never,
      searchByText,
      shouldEnforceUsageLimitsClientSide: true,
    });

    expect(result).toMatchObject({
      error,
      limitPayload: expect.objectContaining({
        code: 'LIMIT_EXCEEDED',
        metric: 'places_queries',
      }),
      message: 'Search limit reached for this month (10).',
      status: 'error',
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'usage', 'monthly'],
    });
  });

  it('returns nearby search precondition and location outcomes without calling Places', async () => {
    const queryClient = {
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    };
    const captureLocation = jest.fn();
    const searchNearby = jest.fn();

    await expect(
      runRestaurantNearbySearch({
        captureLocation,
        isOnline: false,
        isQuotaReached: false,
        queryClient: queryClient as never,
        searchNearby,
        shouldEnforceUsageLimitsClientSide: true,
      }),
    ).resolves.toEqual({
      message: 'Nearby search requires internet connection.',
      status: 'offline',
    });

    await expect(
      runRestaurantNearbySearch({
        captureLocation,
        isOnline: true,
        isQuotaReached: true,
        queryClient: queryClient as never,
        searchNearby,
        shouldEnforceUsageLimitsClientSide: true,
      }),
    ).resolves.toEqual({
      message: 'Monthly food place search limit reached.',
      status: 'quota_reached',
    });

    captureLocation.mockResolvedValueOnce({
      canAskAgain: false,
      message: 'Location permission is blocked. Enable it in device settings.',
      status: 'permission_denied',
    });
    await expect(
      runRestaurantNearbySearch({
        captureLocation,
        isOnline: true,
        isQuotaReached: false,
        queryClient: queryClient as never,
        searchNearby,
        shouldEnforceUsageLimitsClientSide: true,
      }),
    ).resolves.toEqual({
      canAskAgain: false,
      message: 'Location permission is blocked. Enable it in device settings.',
      status: 'permission_denied',
    });

    captureLocation.mockResolvedValueOnce({
      error: new Error('GPS unavailable'),
      message: 'GPS unavailable',
      status: 'error',
    });
    await expect(
      runRestaurantNearbySearch({
        captureLocation,
        isOnline: true,
        isQuotaReached: false,
        queryClient: queryClient as never,
        searchNearby,
        shouldEnforceUsageLimitsClientSide: true,
      }),
    ).resolves.toMatchObject({
      message: 'GPS unavailable',
      status: 'location_error',
    });

    expect(searchNearby).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('runs nearby search from captured coordinates and invalidates usage when no snapshot is synced', async () => {
    const queryClient = {
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    };
    const captureLocation = jest.fn().mockResolvedValue({
      coordinates: {
        latitude: 37.8,
        longitude: -122.4,
      },
      status: 'success',
    });
    const searchNearby = jest.fn().mockResolvedValue({
      restaurants,
      usageSnapshot: null,
    });

    const result = await runRestaurantNearbySearch({
      captureLocation,
      isOnline: true,
      isQuotaReached: false,
      queryClient: queryClient as never,
      searchNearby,
      shouldEnforceUsageLimitsClientSide: true,
    });

    expect(result).toEqual({
      referenceCoords: { lat: 37.8, lng: -122.4 },
      results: restaurants,
      status: 'success',
    });
    expect(searchNearby).toHaveBeenCalledWith({
      latitude: 37.8,
      longitude: -122.4,
      radius: 5000,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'usage', 'monthly'],
    });
  });

  it('runs coordinate nearby search without capturing GPS', async () => {
    const queryClient = {
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    };
    const usageSnapshot = {
      monthKey: '2026-05',
      userTier: 'free',
      limits: {},
      usage: {},
      remaining: {},
    };
    const searchNearby = jest.fn().mockResolvedValue({
      restaurants,
      usageSnapshot,
    });

    const result = await runRestaurantNearbyCoordinateSearch({
      coords: { lat: 34.05, lng: -118.24 },
      isOnline: true,
      isQuotaReached: false,
      queryClient: queryClient as never,
      searchNearby,
      shouldEnforceUsageLimitsClientSide: true,
    });

    expect(result).toEqual({
      referenceCoords: { lat: 34.05, lng: -118.24 },
      results: restaurants,
      status: 'success',
    });
    expect(searchNearby).toHaveBeenCalledWith({
      latitude: 34.05,
      longitude: -118.24,
      radius: 5000,
    });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      ['feature', 'usage', 'monthly', 'actual'],
      usageSnapshot,
    );
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('uses nearby preflight for coordinate nearby search', async () => {
    const queryClient = {
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    };
    const searchNearby = jest.fn();

    await expect(
      runRestaurantNearbyCoordinateSearch({
        coords: { lat: 34.05, lng: -118.24 },
        isOnline: false,
        isQuotaReached: false,
        queryClient: queryClient as never,
        searchNearby,
        shouldEnforceUsageLimitsClientSide: true,
      }),
    ).resolves.toEqual({
      message: 'Nearby search requires internet connection.',
      status: 'offline',
    });

    expect(searchNearby).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });
});
