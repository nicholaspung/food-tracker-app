import { listMenuItemsForRestaurant, searchRestaurantsPage } from '../features';
import {
  buildRestaurantMenuItemsQueryOptions,
  buildRestaurantSearchQueryOptions,
} from '../hooks/useRestaurantSelectionFlow';

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
  const mockedListMenuItemsForRestaurant = listMenuItemsForRestaurant as jest.MockedFunction<
    typeof listMenuItemsForRestaurant
  >;

  beforeEach(() => {
    mockedSearchRestaurantsPage.mockReset();
    mockedListMenuItemsForRestaurant.mockReset();
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
});
