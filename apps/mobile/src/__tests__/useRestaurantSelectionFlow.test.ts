import { searchRestaurantsPage } from '../features';
import { buildRestaurantSearchQueryOptions } from '../hooks/useRestaurantSelectionFlow';

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

  beforeEach(() => {
    mockedSearchRestaurantsPage.mockReset();
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
});
