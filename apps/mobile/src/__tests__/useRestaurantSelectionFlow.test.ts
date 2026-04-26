import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';

import {
  listMenuItemsForRestaurant,
  listRecentRestaurants,
  searchRestaurantsPage,
  type RestaurantRecord,
} from '../features';
import {
  buildRestaurantMenuItemsQueryOptions,
  buildRestaurantSearchQueryOptions,
  useRestaurantSelectionFlow,
  useSavedRestaurantSuggestions,
} from '../hooks/useRestaurantSelectionFlow';
import { searchAndCacheRestaurantsByText } from '../lib/googlePlaces';

jest.mock('../features', () => ({
  formatLimitExceededMessage: jest.fn(),
  listMenuItemsForRestaurant: jest.fn(),
  listRecentRestaurants: jest.fn(),
  parseLimitExceededError: jest.fn(),
  searchRestaurantsPage: jest.fn(),
}));

jest.mock('../hooks/useForegroundLocationCapture', () => ({
  useForegroundLocationCapture: jest.fn(() => ({
    captureLocation: jest.fn(),
    isCapturing: false,
    permissionNeedsSettings: false,
    resetPermissionNeedsSettings: jest.fn(),
  })),
}));

jest.mock('../lib/googlePlaces', () => ({
  searchAndCacheNearbyRestaurants: jest.fn(),
  searchAndCacheRestaurantsByText: jest.fn(),
}));

describe('useRestaurantSelectionFlow', () => {
  const mockedSearchRestaurantsPage = searchRestaurantsPage as jest.MockedFunction<
    typeof searchRestaurantsPage
  >;
  const mockedListRecentRestaurants = listRecentRestaurants as jest.MockedFunction<
    typeof listRecentRestaurants
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

  beforeEach(() => {
    mockedSearchRestaurantsPage.mockReset();
    mockedListRecentRestaurants.mockReset();
    mockedListMenuItemsForRestaurant.mockReset();
    mockedSearchAndCacheRestaurantsByText.mockReset();
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

  it('filters saved restaurant suggestions locally without fetching server search results while typing', async () => {
    mockedListRecentRestaurants.mockResolvedValue(restaurants);
    const queryClient = createQueryClient();
    let latestResult: ReturnType<typeof useSavedRestaurantSuggestions> | null = null;

    function SavedSuggestionsHarness({ searchQuery }: { searchQuery: string }) {
      latestResult = useSavedRestaurantSuggestions({
        enabled: true,
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

    expect(getLatestResult().savedRestaurantRecords.map((restaurant) => restaurant.id)).toEqual([
      'restaurant-ramen',
      'restaurant-bakery',
    ]);

    await act(async () => {
      if (!renderer) {
        throw new Error('Saved restaurant suggestions renderer did not initialize.');
      }

      renderer.unmount();
      renderer = renderWithQueryClient(
        queryClient,
        React.createElement(SavedSuggestionsHarness, { searchQuery: 'ramen' }),
      );
    });
    await flushPromises();

    expect(getLatestResult().savedRestaurantRecords.map((restaurant) => restaurant.id)).toEqual([
      'restaurant-ramen',
    ]);
    expect(getLatestResult().savedRestaurantsTitle).toBe('Matching restaurants');
    expect(getLatestResult().shouldQuerySavedRestaurantsBySearch).toBe(false);
    expect(mockedSearchRestaurantsPage).not.toHaveBeenCalled();
  });

  it('runs Google Places text search only from the explicit search action', async () => {
    mockedListRecentRestaurants.mockResolvedValue(restaurants);
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
});
