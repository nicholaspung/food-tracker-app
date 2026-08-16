import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { createMenuReviewRequest } from '../features/store/menuParsingGateway';
import {
  menuItemsQueryKeys,
  useRestaurantSelectedMenuItemsQuery,
} from '../features/store/menuItemsQuery';
import { listMenuItemsForRestaurant } from '../features/store/restaurantsStore';
import { useTastingPlanMenuCatalog } from '../features/store/useTastingPlanMenuCatalog';

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/menuParsingGateway', () => ({
  createMenuReviewRequest: jest.fn(),
}));

jest.mock('../features/store/restaurantsStore', () => ({
  listMenuItemsForRestaurant: jest.fn(),
}));

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCreateMenuReviewRequest = createMenuReviewRequest as jest.MockedFunction<
  typeof createMenuReviewRequest
>;
const mockedListMenuItemsForRestaurant = listMenuItemsForRestaurant as jest.MockedFunction<
  typeof listMenuItemsForRestaurant
>;

describe('useTastingPlanMenuCatalog', () => {
  const queryClient = {
    getQueriesData: jest.fn(),
    setQueryData: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    queryClient.getQueriesData.mockReturnValue([
      [menuItemsQueryKeys.paginated('restaurant-1'), [
        { id: 'cached-item', name: 'Cached Ramen', restaurant: 'restaurant-1' },
      ]],
    ] as never);
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedUseInfiniteQuery.mockImplementation((options: any) => ({
      data: { pages: [], pageParams: [] },
      error: null,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isPending: false,
      refetch: jest.fn(),
      options,
    } as never));
    mockedUseQuery.mockImplementation((options: any) => ({ data: undefined, options }) as never);
    mockedCreateMenuReviewRequest.mockResolvedValue({ success: true } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function renderHook(input: {
    activeRestaurantId: string | null;
    enabled: boolean;
    isOnline: boolean;
  }): Promise<{
    hook: ReturnType<typeof useTastingPlanMenuCatalog>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useTastingPlanMenuCatalog> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useTastingPlanMenuCatalog(input);
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!hook || !renderer) {
      throw new Error('Expected hook to render.');
    }

    return { hook, renderer };
  }

  it('loads active restaurant menu items with an offline cache fallback', async () => {
    const cachedItems = Array.from({ length: 21 }, (_, index) => ({
      id: `cached-item-${index + 1}`,
      name: `Cached Ramen ${index + 1}`,
      restaurant: 'restaurant-1',
    }));
    queryClient.getQueriesData.mockReturnValue([
      [menuItemsQueryKeys.paginated('restaurant-1'), cachedItems],
    ] as never);
    await renderHook({
      activeRestaurantId: 'restaurant-1',
      enabled: true,
      isOnline: false,
    });

    const queryOptions = mockedUseInfiniteQuery.mock.calls[0]?.[0] as any;
    await expect(queryOptions.queryFn({ pageParam: 1, signal: undefined })).resolves.toEqual({
      items: cachedItems.slice(0, 20),
      page: 1,
      pageSize: 20,
      totalItems: 21,
      totalPages: 2,
      hasNextPage: true,
    });
    await expect(queryOptions.queryFn({ pageParam: 2, signal: undefined })).resolves.toEqual({
      items: cachedItems.slice(20),
      page: 2,
      pageSize: 20,
      totalItems: 21,
      totalPages: 2,
      hasNextPage: false,
    });
    expect(queryClient.getQueriesData).toHaveBeenCalledWith({
      queryKey: menuItemsQueryKeys.restaurant('restaurant-1'),
    });
    expect(mockedListMenuItemsForRestaurant).not.toHaveBeenCalled();
  });

  it('submits menu review requests and patches pending review cache state', async () => {
    const { hook, renderer } = await renderHook({
      activeRestaurantId: 'restaurant-1',
      enabled: true,
      isOnline: true,
    });

    await act(async () => {
      await hook.requestMenuReview();
    });

    expect(mockedCreateMenuReviewRequest).toHaveBeenCalledWith({
      restaurantId: 'restaurant-1',
      reason: 'User reported incorrect menu items',
    });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      ['feature', 'menuReview', 'pending', 'restaurant-1'],
      true,
    );

    await act(async () => {
      renderer.unmount();
    });
  });

  it('hydrates selected items through bounded id-filtered requests', async () => {
    let selectedQuery: ReturnType<typeof useRestaurantSelectedMenuItemsQuery> | null = null;
    function TestComponent() {
      selectedQuery = useRestaurantSelectedMenuItemsQuery({
        enabled: true,
        isOnline: true,
        itemIds: ['menu-2', 'menu-1', 'menu-2'],
        restaurantId: 'restaurant-1',
      });
      return null;
    }

    await act(async () => {
      create(React.createElement(TestComponent));
    });
    expect(selectedQuery).not.toBeNull();
    const queryOptions = mockedUseQuery.mock.calls[0]?.[0] as any;
    const signal = new AbortController().signal;
    mockedListMenuItemsForRestaurant.mockResolvedValue({
      hasNextPage: false,
      items: [
        { id: 'menu-1', name: 'Ramen', restaurant: 'restaurant-1' },
        { id: 'menu-2', name: 'Gyoza', restaurant: 'restaurant-1' },
      ],
      page: 1,
      pageSize: 2,
      totalItems: 2,
      totalPages: 1,
    });

    await expect(queryOptions.queryFn({ signal })).resolves.toHaveLength(2);
    expect(queryOptions.queryKey).toEqual(
      menuItemsQueryKeys.selected('restaurant-1', ['menu-1', 'menu-2']),
    );
    expect(mockedListMenuItemsForRestaurant).toHaveBeenCalledWith('restaurant-1', {
      ids: ['menu-1', 'menu-2'],
      page: 1,
      pageSize: 2,
      signal,
    });
  });
});
