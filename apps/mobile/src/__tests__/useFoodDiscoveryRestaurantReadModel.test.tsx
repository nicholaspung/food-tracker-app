import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { AllLocationsHistoryRecord, GroupMenuSuggestionsRecord } from '../features';
import type { RestaurantRecord } from '../features/models';
import { useRestaurantMenuItemsQuery } from '../features/store/menuItemsQuery';
import { restaurantsQueryKeys } from '../features/store/restaurantsQuery';
import { useFoodDiscoveryRestaurantReadModel } from '../features/store/useFoodDiscoveryRestaurantReadModel';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/menuItemsQuery', () => ({
  useRestaurantMenuItemsQuery: jest.fn(),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseRestaurantMenuItemsQuery =
  useRestaurantMenuItemsQuery as jest.MockedFunction<typeof useRestaurantMenuItemsQuery>;

const restaurant: RestaurantRecord = {
  id: 'restaurant-1',
  name: 'Erewhon West Hollywood',
};

const allLocationsHistory: AllLocationsHistoryRecord = {
  anchorRestaurant: restaurant,
  itemCount: 2,
  items: [
    {
      averageRating: 5,
      displayName: 'Granola Bowl',
      latestRating: 5,
      latestRestaurantId: 'restaurant-2',
      latestRestaurantName: 'Erewhon Venice',
      latestVisitedAt: '2026-04-03T18:30:00.000Z',
      normalizedItemName: 'granola bowl',
      orderCount: 1,
      restaurants: [
        {
          orderCount: 1,
          restaurantId: 'restaurant-2',
          restaurantName: 'Erewhon Venice',
        },
      ],
    },
    {
      averageRating: 4,
      displayName: 'Personal History Only',
      latestRating: 4,
      latestRestaurantId: 'restaurant-3',
      latestRestaurantName: 'Erewhon Silver Lake',
      latestVisitedAt: '2026-04-02T18:30:00.000Z',
      normalizedItemName: 'personal history only',
      orderCount: 1,
      restaurants: [],
    },
  ],
  locationCount: 2,
  normalizedName: 'erewhon',
  restaurants: [],
  visitCount: 2,
};

const groupMenuSuggestions: GroupMenuSuggestionsRecord = {
  restaurantGroupId: 'group-1',
  restaurantId: restaurant.id,
  suggestions: [
    {
      displayName: 'Aguachile',
      normalizedItemName: 'aguachile',
      sourceItemCount: 1,
      sourceRestaurantCount: 1,
      sources: [
        {
          menuItemCount: 1,
          menuItemIds: ['menu-related-duplicate'],
          restaurantId: 'restaurant-2',
          restaurantName: 'Erewhon Venice',
        },
      ],
    },
    {
      displayName: 'Granola Bowl',
      normalizedItemName: 'granola bowl',
      sourceItemCount: 1,
      sourceRestaurantCount: 1,
      sources: [
        {
          menuItemCount: 1,
          menuItemIds: ['menu-related'],
          restaurantId: 'restaurant-2',
          restaurantName: 'Erewhon Venice',
        },
      ],
    },
  ],
};

describe('useFoodDiscoveryRestaurantReadModel core policy', () => {
  const queryClient = {
    getQueryData: jest.fn(),
  };
  let model: ReturnType<typeof useFoodDiscoveryRestaurantReadModel> | null;
  let renderer: ReturnType<typeof create> | null;

  beforeEach(() => {
    jest.clearAllMocks();
    model = null;
    renderer = null;
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedUseRestaurantMenuItemsQuery.mockReturnValue({
      data: [{ id: 'menu-exact', name: 'Aguachile', restaurant: restaurant.id }],
      error: new Error('Menu refresh failed'),
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isPending: false,
      refetch: jest.fn(),
      totalItems: 1,
    } as never);
    mockedUseQuery.mockImplementation((options: any) => ({
      data: (options.queryKey as readonly string[]).includes('allLocationsHistory')
        ? allLocationsHistory
        : groupMenuSuggestions,
      error: new Error('Refresh failed'),
      isPending: false,
      refetch: jest.fn(),
    } as never));
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
    }
  });

  async function renderHook(isOnline: boolean) {
    function TestComponent() {
      model = useFoodDiscoveryRestaurantReadModel({ isOnline, restaurant });
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!model) {
      throw new Error('Expected core read model to render.');
    }

    return model;
  }

  it('uses cached offline history and Group Menu Suggestions', async () => {
    queryClient.getQueryData.mockImplementation((queryKey) =>
      (queryKey as readonly string[]).includes('allLocationsHistory')
        ? allLocationsHistory
        : groupMenuSuggestions,
    );

    await renderHook(false);
    const historyQuery = mockedUseQuery.mock.calls.find((call) =>
      ((call[0] as any).queryKey as readonly string[]).includes('allLocationsHistory'),
    )?.[0] as any;
    const groupQuery = mockedUseQuery.mock.calls.find((call) =>
      ((call[0] as any).queryKey as readonly string[]).includes('groupMenuSuggestions'),
    )?.[0] as any;

    await expect(historyQuery.queryFn({ signal: undefined })).resolves.toBe(allLocationsHistory);
    await expect(groupQuery.queryFn({ signal: undefined })).resolves.toBe(groupMenuSuggestions);
    expect(queryClient.getQueryData).toHaveBeenCalledWith(
      restaurantsQueryKeys.allLocationsHistory(restaurant.id),
    );
    expect(queryClient.getQueryData).toHaveBeenCalledWith(
      restaurantsQueryKeys.groupMenuSuggestions(restaurant.id),
    );
  });

  it('keeps refresh errors non-blocking and preserves source boundaries', async () => {
    const readModel = await renderHook(true);

    expect(readModel.menuCatalogErrorMessage).toBeNull();
    expect(readModel.allLocationsHistoryErrorMessage).toBeNull();
    expect(readModel.groupMenuSuggestionsErrorMessage).toBeNull();
    expect(readModel.relatedMenuSuggestions.map((suggestion) => suggestion.name)).toEqual([
      'Granola Bowl',
    ]);
    expect(readModel.menuSelectionSuggestions.map((suggestion) => suggestion.name)).toEqual([
      'Granola Bowl',
      'Personal History Only',
    ]);
    expect(readModel.yourOrderedItems.map((item) => item.name)).toEqual([
      'Granola Bowl',
      'Personal History Only',
    ]);
    expect(readModel.relatedMenuSuggestions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Personal History Only' })]),
    );
  });
});
