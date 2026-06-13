import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';

import {
  type RestaurantRecord,
} from '../features';
import {
  listMenuItemsForRestaurant,
  listRestaurantSuggestions,
  searchRestaurantsPage,
} from '../features/store/featureStore';
import {
  useRestaurantSelectionFlow,
  useSavedRestaurantSuggestions,
} from '../hooks/useRestaurantSelectionFlow';
import {
  buildRestaurantMenuItemsQueryOptions,
  buildRestaurantSearchQueryOptions,
} from '../features/restaurants/restaurantSelection';
import { restaurantsQueryKeys } from '../features/store/restaurantsQuery';
import { searchAndCacheRestaurantsByText } from '../lib/googlePlaces';

jest.mock('../features', () => ({
  formatLimitExceededMessage: jest.fn(),
  parseLimitExceededError: jest.fn(),
}));

jest.mock('../features/store/featureStore', () => ({
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

const mockCaptureLocation = jest.fn();
const mockResetPermissionNeedsSettings = jest.fn();

jest.mock('../hooks/useForegroundLocationCapture', () => ({
  useForegroundLocationCapture: jest.fn(() => ({
    captureLocation: mockCaptureLocation,
    isCapturing: false,
    permissionNeedsSettings: false,
    resetPermissionNeedsSettings: mockResetPermissionNeedsSettings,
  })),
}));

jest.mock('../lib/googlePlaces', () => ({
  calculateDistance: jest.fn((lat1: number, lng1: number, lat2: number, lng2: number) =>
    Math.hypot(lat2 - lat1, lng2 - lng1),
  ),
  formatDistance: jest.fn((miles: number) => `${miles.toFixed(1)} mi`),
  searchAndCacheNearbyRestaurants: jest.fn(),
  searchAndCacheRestaurantsByText: jest.fn(),
}));

describe('useRestaurantSelectionFlow', () => {
  const mockedSearchRestaurantsPage = searchRestaurantsPage as jest.MockedFunction<
    typeof searchRestaurantsPage
  >;
  const mockedListRestaurantSuggestions = listRestaurantSuggestions as jest.MockedFunction<
    typeof listRestaurantSuggestions
  >;
  const mockedListMenuItemsForRestaurant = listMenuItemsForRestaurant as jest.MockedFunction<
    typeof listMenuItemsForRestaurant
  >;
  const mockedSearchAndCacheRestaurantsByText =
    searchAndCacheRestaurantsByText as jest.MockedFunction<typeof searchAndCacheRestaurantsByText>;

  const restaurants: RestaurantRecord[] = [
    {
      city: 'San Francisco',
      cuisineType: 'Japanese',
      id: 'restaurant-ramen',
      location: 'San Francisco',
      name: 'Ramen House',
    },
    {
      city: 'Oakland',
      cuisineType: 'Bakery',
      id: 'restaurant-bakery',
      location: 'Oakland',
      name: 'Morning Bakery',
    },
  ];

  function createQueryClient() {
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  }

  function renderWithQueryClient(queryClient: QueryClient, children: React.ReactElement) {
    return create(
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  }

    async function flushPromises() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    async function flushDebounce() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
    }

  beforeEach(() => {
    mockedSearchRestaurantsPage.mockReset();
    mockedListRestaurantSuggestions.mockReset();
    mockedListMenuItemsForRestaurant.mockReset();
    mockedSearchAndCacheRestaurantsByText.mockReset();
    mockCaptureLocation.mockReset();
    mockResetPermissionNeedsSettings.mockReset();
  });

  it('passes the React Query AbortSignal through restaurant search requests', async () => {
    const abortController = new AbortController();
    mockedSearchRestaurantsPage.mockResolvedValue({
      hasNextPage: false,
      items: [],
      page: 1,
      pageSize: 12,
      totalItems: 0,
      totalPages: 0,
    });

    const options = buildRestaurantSearchQueryOptions({
      enabled: true,
      pageSize: 12,
      search: 'pizza',
    });

    await options.queryFn({
      signal: abortController.signal,
    } as never);

    expect(mockedSearchRestaurantsPage).toHaveBeenCalledWith(
      {
        page: 1,
        pageSize: 12,
        search: 'pizza',
      },
      {
        signal: abortController.signal,
      },
    );
  });

  it('uses a stable restaurant-scoped menu items query key and cached offline fallback', async () => {
    const cachedMenuItems = [
      {
        friendEatenCount: 1,
        id: 'menu-item-1',
        name: 'Ramen',
        restaurant: 'restaurant-1',
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
      selectedRestaurantId: 'restaurant-1',
    });

    const result = await options.queryFn({
      signal: new AbortController().signal,
    } as never);

    expect(options.queryKey).toEqual(['feature', 'menuItems', 'restaurant-1']);
    expect(result).toBe(cachedMenuItems);
    expect(queryClient.getQueryData).toHaveBeenCalledWith(['feature', 'menuItems', 'restaurant-1']);
    expect(mockedListMenuItemsForRestaurant).not.toHaveBeenCalled();
  });

  it('loads saved restaurant suggestions from the suggestions endpoint', async () => {
    mockedListRestaurantSuggestions.mockResolvedValue(restaurants);
    const queryClient = createQueryClient();
    let latestResult: ReturnType<typeof useSavedRestaurantSuggestions> | null = null;

    function SavedSuggestionsHarness({ searchQuery }: { searchQuery: string }) {
      latestResult = useSavedRestaurantSuggestions({
        enabled: true,
        locationQuery: '',
        searchQuery,
      });
      return null;
    }

    function getLatestResult(): ReturnType<typeof useSavedRestaurantSuggestions> {
      if (!latestResult) {
        throw new Error('Saved restaurant suggestions hook did not render.');
      }

      return latestResult;
    }

    await act(async () => {
      renderWithQueryClient(
        queryClient,
        React.createElement(SavedSuggestionsHarness, { searchQuery: '' }),
      );
    });
    await flushPromises();

    expect(getLatestResult().savedRestaurantRecords.map((restaurant) => restaurant.id)).toEqual([
      'restaurant-ramen',
      'restaurant-bakery',
    ]);
    expect(mockedListRestaurantSuggestions).toHaveBeenCalledWith({
      limit: 50,
      search: undefined,
      signal: expect.any(AbortSignal),
    });
  });

  it('queries saved restaurant suggestions by typed search without live Google Places search', async () => {
    mockedListRestaurantSuggestions.mockResolvedValueOnce(restaurants).mockResolvedValueOnce([
      restaurants[0],
    ]);
    const queryClient = createQueryClient();
    let latestResult: ReturnType<typeof useSavedRestaurantSuggestions> | null = null;

    function SavedSuggestionsHarness({ searchQuery }: { searchQuery: string }) {
      latestResult = useSavedRestaurantSuggestions({
        enabled: true,
        locationQuery: '',
        searchQuery,
      });
      return null;
    }

    function getLatestResult(): ReturnType<typeof useSavedRestaurantSuggestions> {
      if (!latestResult) {
        throw new Error('Saved restaurant suggestions hook did not render.');
      }

      return latestResult;
    }

    let renderer: ReturnType<typeof renderWithQueryClient> | null = null;
    await act(async () => {
      renderer = renderWithQueryClient(
        queryClient,
        React.createElement(SavedSuggestionsHarness, { searchQuery: '' }),
      );
    });
    await flushPromises();

    await act(async () => {
      renderer?.unmount();
      renderer = renderWithQueryClient(
        queryClient,
        React.createElement(SavedSuggestionsHarness, { searchQuery: '  ramen  ' }),
      );
    });
    await flushPromises();

    expect(mockedListRestaurantSuggestions).toHaveBeenLastCalledWith({
      limit: 50,
      search: 'ramen',
      signal: expect.any(AbortSignal),
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: restaurantsQueryKeys.suggestions(50, 'ramen'),
      }),
    ).toBeDefined();
    expect(getLatestResult().savedRestaurantRecords.map((restaurant) => restaurant.id)).toEqual([
      'restaurant-ramen',
    ]);
    expect(getLatestResult().savedRestaurantsTitle).toBe('Matching restaurants');
    expect(getLatestResult().shouldQuerySavedRestaurantsBySearch).toBe(false);
    expect(mockedSearchRestaurantsPage).not.toHaveBeenCalled();
    expect(mockedSearchAndCacheRestaurantsByText).not.toHaveBeenCalled();
  });

  it('labels saved suggestions as nearby when reference coordinates are available', async () => {
    mockedListRestaurantSuggestions.mockResolvedValue(restaurants);
    const queryClient = createQueryClient();
    let latestResult: ReturnType<typeof useSavedRestaurantSuggestions> | null = null;

    function SavedSuggestionsHarness() {
      latestResult = useSavedRestaurantSuggestions({
        enabled: true,
        hasReferenceCoords: true,
        locationQuery: '',
        searchQuery: '',
      });
      return null;
    }

    function getLatestResult(): ReturnType<typeof useSavedRestaurantSuggestions> {
      if (!latestResult) {
        throw new Error('Saved restaurant suggestions hook did not render.');
      }

      return latestResult;
    }

    await act(async () => {
      renderWithQueryClient(
        queryClient,
        React.createElement(SavedSuggestionsHarness),
      );
    });
    await flushPromises();

    expect(getLatestResult().savedRestaurantsTitle).toBe('Nearby restaurants');
  });

    it('runs Google Places text search only from the explicit search action', async () => {
    mockedListRestaurantSuggestions.mockResolvedValue(restaurants);
    mockedSearchAndCacheRestaurantsByText.mockResolvedValue({
      resolvedLocation: null,
      restaurants: [],
      usageSnapshot: null,
    });
    const queryClient = createQueryClient();
    let latestResult: ReturnType<typeof useRestaurantSelectionFlow> | null = null;

    function RestaurantSelectionHarness() {
      latestResult = useRestaurantSelectionFlow({
        isOnline: true,
        menuItemsEnabled: false,
        savedRestaurantsEnabled: true,
        selectedRestaurantId: null,
        usage: {
          enforceQuota: false,
          isFreeTier: false,
          placesQueriesRemaining: null,
        },
      });
      return null;
    }

    function getLatestResult(): ReturnType<typeof useRestaurantSelectionFlow> {
      if (!latestResult) {
        throw new Error('Restaurant selection hook did not render.');
      }

      return latestResult;
    }

    await act(async () => {
      renderWithQueryClient(queryClient, React.createElement(RestaurantSelectionHarness));
    });
    await flushPromises();

      await act(async () => {
        getLatestResult().setSearchQuery('pizza');
      });
      await flushDebounce();

    expect(mockedSearchRestaurantsPage).not.toHaveBeenCalled();
    expect(mockedSearchAndCacheRestaurantsByText).not.toHaveBeenCalled();

    await act(async () => {
      await getLatestResult().searchByText();
    });

    expect(mockedSearchAndCacheRestaurantsByText).toHaveBeenCalledWith({
      locationText: undefined,
      query: 'pizza',
      radius: 5000,
    });
      expect(mockedSearchRestaurantsPage).not.toHaveBeenCalled();
    });

    it('runs current phone location as a coordinate-biased text search', async () => {
      mockedListRestaurantSuggestions.mockResolvedValue(restaurants);
      mockedSearchAndCacheRestaurantsByText.mockResolvedValue({
        resolvedLocation: null,
        restaurants,
        usageSnapshot: null,
      });
      mockCaptureLocation.mockResolvedValue({
        coordinates: {
          latitude: 37.8,
          longitude: -122.4,
        },
        status: 'success',
      });
      const queryClient = createQueryClient();
      let latestResult: ReturnType<typeof useRestaurantSelectionFlow> | null = null;

      function RestaurantSelectionHarness() {
        latestResult = useRestaurantSelectionFlow({
          isOnline: true,
          menuItemsEnabled: false,
          savedRestaurantsEnabled: true,
          selectedRestaurantId: null,
          usage: {
            enforceQuota: false,
            isFreeTier: false,
            placesQueriesRemaining: null,
          },
        });
        return null;
      }

      function getLatestResult(): ReturnType<typeof useRestaurantSelectionFlow> {
        if (!latestResult) {
          throw new Error('Restaurant selection hook did not render.');
        }

        return latestResult;
      }

      await act(async () => {
        renderWithQueryClient(queryClient, React.createElement(RestaurantSelectionHarness));
      });
      await flushPromises();

      await act(async () => {
        getLatestResult().setSearchQuery('ramen');
      });
      await flushDebounce();

      await act(async () => {
        await getLatestResult().searchCurrentLocationByText();
      });

      expect(mockCaptureLocation).toHaveBeenCalledTimes(1);
      expect(mockedSearchAndCacheRestaurantsByText).toHaveBeenCalledWith({
        latitude: 37.8,
        longitude: -122.4,
        locationText: undefined,
        query: 'ramen',
        radius: 5000,
      });
      expect(getLatestResult().manualLocation).toBe('Your location (phone GPS)');
      expect(getLatestResult().isUsingCurrentLocation).toBe(true);
    });

    it('auto-captures reference location once when enabled and sorts saved restaurants by distance', async () => {
    const distantRestaurant = {
      ...restaurants[0],
      latitude: 37.8,
      longitude: -122.4,
    };
    const nearbyRestaurant = {
      ...restaurants[1],
      latitude: 37.0,
      longitude: -122.0,
    };
    mockedListRestaurantSuggestions.mockResolvedValue([
      distantRestaurant,
      nearbyRestaurant,
    ]);
    mockCaptureLocation.mockResolvedValue({
      coordinates: {
        latitude: 37.0,
        longitude: -122.0,
      },
      label: '37.000000, -122.000000',
      status: 'success',
    });
    const queryClient = createQueryClient();
    let latestResult: ReturnType<typeof useRestaurantSelectionFlow> | null = null;

    function RestaurantSelectionHarness() {
      latestResult = useRestaurantSelectionFlow({
        autoCaptureReferenceLocation: true,
        isOnline: true,
        menuItemsEnabled: false,
        savedRestaurantsEnabled: true,
        selectedRestaurantId: null,
        usage: {
          enforceQuota: false,
          isFreeTier: false,
          placesQueriesRemaining: null,
        },
      });
      return null;
    }

    function getLatestResult(): ReturnType<typeof useRestaurantSelectionFlow> {
      if (!latestResult) {
        throw new Error('Restaurant selection hook did not render.');
      }

      return latestResult;
    }

    await act(async () => {
      renderWithQueryClient(queryClient, React.createElement(RestaurantSelectionHarness));
    });
    await flushPromises();
    await flushPromises();

    expect(mockCaptureLocation).toHaveBeenCalledTimes(1);
    expect(getLatestResult().displayedSavedRestaurants.map(({ restaurant }) => restaurant.id)).toEqual([
      'restaurant-bakery',
      'restaurant-ramen',
    ]);
    expect(getLatestResult().savedRestaurantsTitle).toBe('Nearby restaurants');
  });

  it('keeps server suggestion order when automatic location capture is denied', async () => {
    mockedListRestaurantSuggestions.mockResolvedValue(restaurants);
    mockCaptureLocation.mockResolvedValue({
      canAskAgain: true,
      message: 'Location permission is required to find nearby places.',
      status: 'permission_denied',
    });
    const queryClient = createQueryClient();
    let latestResult: ReturnType<typeof useRestaurantSelectionFlow> | null = null;

    function RestaurantSelectionHarness() {
      latestResult = useRestaurantSelectionFlow({
        autoCaptureReferenceLocation: true,
        isOnline: true,
        menuItemsEnabled: false,
        savedRestaurantsEnabled: true,
        selectedRestaurantId: null,
        usage: {
          enforceQuota: false,
          isFreeTier: false,
          placesQueriesRemaining: null,
        },
      });
      return null;
    }

    function getLatestResult(): ReturnType<typeof useRestaurantSelectionFlow> {
      if (!latestResult) {
        throw new Error('Restaurant selection hook did not render.');
      }

      return latestResult;
    }

    await act(async () => {
      renderWithQueryClient(queryClient, React.createElement(RestaurantSelectionHarness));
    });
    await flushPromises();
    await flushPromises();

    expect(mockCaptureLocation).toHaveBeenCalledTimes(1);
    expect(getLatestResult().displayedSavedRestaurants.map(({ restaurant }) => restaurant.id)).toEqual([
      'restaurant-ramen',
      'restaurant-bakery',
    ]);
    expect(getLatestResult().searchErrorMessage).toBeNull();
  });
});
