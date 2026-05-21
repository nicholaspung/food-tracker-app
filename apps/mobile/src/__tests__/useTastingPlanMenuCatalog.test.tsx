import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { createMenuReviewRequest } from '../features/store/menuParsingGateway';
import { menuItemsQueryKeys } from '../features/store/menuItemsQuery';
import { listMenuItemsForRestaurant } from '../features/store/restaurantsStore';
import { useTastingPlanMenuCatalog } from '../features/store/useTastingPlanMenuCatalog';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/menuParsingGateway', () => ({
  createMenuReviewRequest: jest.fn(),
}));

jest.mock('../features/store/restaurantsStore', () => ({
  listMenuItemsForRestaurant: jest.fn(),
}));

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
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    queryClient.getQueryData.mockReturnValue([{ id: 'cached-item', name: 'Cached Ramen' }]);
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedUseQuery.mockImplementation((options: any) => ({
      data: [],
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
      options,
    } as never));
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
    await renderHook({
      activeRestaurantId: 'restaurant-1',
      enabled: true,
      isOnline: false,
    });

    const queryOptions = mockedUseQuery.mock.calls[0]?.[0] as any;
    await expect(queryOptions.queryFn({ signal: undefined })).resolves.toEqual([
      { id: 'cached-item', name: 'Cached Ramen' },
    ]);
    expect(queryClient.getQueryData).toHaveBeenCalledWith(
      menuItemsQueryKeys.restaurant('restaurant-1'),
    );
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
});
