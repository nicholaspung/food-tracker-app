import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { RestaurantMapSheetTabId } from '../components/maps';
import type { AllLocationsHistoryRecord, GroupMenuSuggestionsRecord, MenuItemRecord } from '../features';
import { menuItemsQueryKeys } from '../features/store/menuItemsQuery';
import { restaurantsQueryKeys } from '../features/store/restaurantsQuery';
import {
  getAllLocationsHistory,
  listMenuItemsForRestaurant,
} from '../features/store/restaurantsStore';
import {
  canShowFoodDiscoveryAllLocationsHistory,
  useFoodDiscoveryMapReadModel,
  useFoodDiscoveryRestaurantDetailReadModel,
} from '../features/store/useFoodDiscoveryMapReadModel';
import type { RestaurantRecord } from '../features/models';
import type { VisitRestaurantWithDistance } from '../lib/visitRestaurantSearch';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/restaurantsStore', () => ({
  getAllLocationsHistory: jest.fn(),
  listMenuItemsForRestaurant: jest.fn(),
}));

jest.mock('../lib/googlePlaces', () => ({
  formatDistance: jest.fn((miles: number) => `${miles.toFixed(1)} mi`),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedGetAllLocationsHistory = getAllLocationsHistory as jest.MockedFunction<
  typeof getAllLocationsHistory
>;
const mockedListMenuItemsForRestaurant = listMenuItemsForRestaurant as jest.MockedFunction<
  typeof listMenuItemsForRestaurant
>;

const restaurantOne: RestaurantRecord = {
  city: 'Los Angeles',
  cuisineType: 'Grocery',
  friendCount: 2,
  id: 'restaurant-1',
  isGooglePlace: false,
  latitude: 34.09,
  location: '7660 Beverly Blvd',
  longitude: -118.36,
  name: 'Erewhon West Hollywood',
  userVisitCount: 1,
};

const restaurantTwo: RestaurantRecord = {
  city: 'Culver City',
  cuisineType: 'Burgers',
  friendCount: 0,
  id: 'restaurant-2',
  isGooglePlace: true,
  latitude: 34.02,
  location: '333 Jefferson St',
  longitude: -118.39,
  name: 'In-N-Out Burger',
  userVisitCount: 3,
};

const restaurants: VisitRestaurantWithDistance[] = [
  { distance: 1.2, restaurant: restaurantOne },
  { distance: null, restaurant: restaurantTwo },
  {
    distance: null,
    restaurant: {
      id: 'no-coordinates',
      name: 'No Coordinates',
    },
  },
];

const menuItemsByRestaurant: Record<string, MenuItemRecord[]> = {
  'restaurant-1': [
    { id: 'menu-b', name: 'Ziti', restaurant: 'restaurant-1' },
    { id: 'menu-a', name: 'Aguachile', restaurant: 'restaurant-1' },
  ],
  'restaurant-2': [
    { id: 'menu-c', name: 'Animal Style Fries', restaurant: 'restaurant-2' },
  ],
};

const historyByRestaurant: Record<string, AllLocationsHistoryRecord> = {
  'restaurant-1': {
    anchorRestaurant: { id: 'restaurant-1', name: 'Erewhon West Hollywood' },
    itemCount: 1,
    items: [
      {
        averageRating: 4.5,
        displayName: 'Double Double',
        latestRating: 5,
        latestRestaurantId: 'restaurant-2',
        latestRestaurantLocation: '333 Jefferson St',
        latestRestaurantName: 'In-N-Out Burger',
        latestVisitedAt: '2026-04-03T18:30:00.000Z',
        normalizedItemName: 'double double',
        orderCount: 2,
        restaurants: [],
      },
    ],
    locationCount: 2,
    normalizedName: 'in n out burger',
    restaurants: [],
    visitCount: 2,
  },
  'restaurant-2': {
    anchorRestaurant: { id: 'restaurant-2', name: 'In-N-Out Burger' },
    itemCount: 0,
    items: [],
    locationCount: 1,
    normalizedName: 'in n out burger',
    restaurants: [],
    visitCount: 0,
  },
};

describe('useFoodDiscoveryMapReadModel', () => {
  const queryClient = {
    getQueryData: jest.fn(),
  };
  let activeSheetTab: RestaurantMapSheetTabId;
  let currentRestaurants: VisitRestaurantWithDistance[];
  let isOnline: boolean;
  let selectedGroupId: string | null;
  let hook: ReturnType<typeof useFoodDiscoveryMapReadModel> | null;
  let renderer: ReturnType<typeof create> | null;

  beforeEach(() => {
    jest.clearAllMocks();
    activeSheetTab = 'location';
    currentRestaurants = restaurants;
    isOnline = true;
    selectedGroupId = 'restaurant-1';
    hook = null;
    renderer = null;
    queryClient.getQueryData.mockReturnValue(undefined);
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedListMenuItemsForRestaurant.mockResolvedValue(menuItemsByRestaurant['restaurant-1']);
    mockedGetAllLocationsHistory.mockResolvedValue(historyByRestaurant['restaurant-1']);
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly string[];
      const restaurantId = queryKey[queryKey.length - 1];

      if (queryKey.includes('menuItems')) {
        return {
          data: menuItemsByRestaurant[restaurantId] ?? [],
          error: null,
          isPending: false,
        } as never;
      }

      return {
        data: historyByRestaurant[restaurantId],
        error: null,
        isPending: false,
      } as never;
    });
  });

  afterEach(() => {
    if (!renderer) {
      return;
    }

    act(() => {
      renderer?.unmount();
    });
  });

  async function renderHook() {
    function TestComponent() {
      hook = useFoodDiscoveryMapReadModel({
        activeSheetTab,
        currentRestaurants,
        displayedSavedRestaurantsCount: 0,
        isGettingLocation: false,
        isMapMode: true,
        isOnline,
        isSearchingNearbyRestaurants: false,
        onSheetTabChange: (tabId) => {
          activeSheetTab = tabId;
        },
        searchErrorMessage: null,
        selectedGroupId,
        showNearbyPlaces: true,
      });
      return null;
    }

    await act(async () => {
      if (renderer) {
        renderer.unmount();
        renderer = create(React.createElement(TestComponent));
      } else {
        renderer = create(React.createElement(TestComponent));
      }
    });

    if (!hook) {
      throw new Error('Expected hook to render.');
    }

    return hook;
  }

  it('normalizes online map groups, menu catalog rows, and your ordered items rows', async () => {
    const model = await renderHook();

    expect(model.groups).toHaveLength(2);
    expect(model.omittedWithoutCoordinates).toBe(1);
    expect(model.groups[0]).toMatchObject({
      id: 'restaurant-1',
      restaurantName: 'Erewhon West Hollywood',
      summary: 'Grocery • 1.2 mi • 1 visit • 2 friends',
    });
    expect(model.mapStatusLabel).toBe('Showing search results');
    expect(model.selectedGroupTabs?.location.items.map((item) => item.name)).toEqual([
      'Aguachile',
      'Ziti',
    ]);
    expect(model.selectedGroupTabs?.allLocations.items[0]).toMatchObject({
      meta: [
        {
          dateLabel: 'Latest at In-N-Out Burger • 333 Jefferson St',
          label: '2 orders',
          rating: 5,
        },
      ],
      name: 'Double Double',
    });
  });

  it('uses cached offline data for selected restaurant sheet queries', async () => {
    isOnline = false;
    queryClient.getQueryData.mockImplementation((queryKey) => {
      const key = queryKey as readonly string[];
      if (key.includes('menuItems')) {
        return menuItemsByRestaurant['restaurant-1'];
      }
      if (key.includes('allLocationsHistory')) {
        return historyByRestaurant['restaurant-1'];
      }
      return undefined;
    });
    mockedUseQuery.mockImplementation((options: any) => ({
      data: undefined,
      error: null,
      isPending: false,
      options,
    } as never));

    await renderHook();
    const menuQuery = mockedUseQuery.mock.calls.find((call) =>
      ((call[0] as any).queryKey as readonly string[]).includes('menuItems'),
    )?.[0] as any;
    const historyQuery = mockedUseQuery.mock.calls.find((call) =>
      ((call[0] as any).queryKey as readonly string[]).includes('allLocationsHistory'),
    )?.[0] as any;

    await expect(menuQuery.queryFn({ signal: undefined })).resolves.toEqual(
      menuItemsByRestaurant['restaurant-1'],
    );
    await expect(historyQuery.queryFn({ signal: undefined })).resolves.toEqual(
      historyByRestaurant['restaurant-1'],
    );
    expect(queryClient.getQueryData).toHaveBeenCalledWith(menuItemsQueryKeys.restaurant('restaurant-1'));
    expect(queryClient.getQueryData).toHaveBeenCalledWith(
      restaurantsQueryKeys.allLocationsHistory('restaurant-1'),
    );
    expect(mockedListMenuItemsForRestaurant).not.toHaveBeenCalled();
    expect(mockedGetAllLocationsHistory).not.toHaveBeenCalled();
  });

  it('owns the empty all-locations history fallback state', async () => {
    selectedGroupId = 'restaurant-2';

    const model = await renderHook();

    expect(model.selectedGroupTabs?.allLocations).toMatchObject({
      emptyDescription: 'Track a visit at this restaurant name to build your history.',
      emptyTitle: 'No orders across locations yet',
      errorMessage: null,
      items: [],
      title: 'All Locations',
    });
  });

  it('keeps cached rows visible when a refresh error is present', async () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly string[];
      if (queryKey.includes('menuItems')) {
        return {
          data: menuItemsByRestaurant['restaurant-1'],
          error: new Error('Refresh failed'),
          isPending: false,
        } as never;
      }

      return {
        data: historyByRestaurant['restaurant-1'],
        error: new Error('History refresh failed'),
        isPending: false,
      } as never;
    });

    const model = await renderHook();

    expect(model.selectedGroupTabs?.location.items).toHaveLength(2);
    expect(model.selectedGroupTabs?.location.errorMessage).toBeNull();
    expect(model.selectedGroupTabs?.allLocations.items).toHaveLength(1);
    expect(model.selectedGroupTabs?.allLocations.errorMessage).toBeNull();
  });

  it('updates selected sheet data when the selected marker changes', async () => {
    let model = await renderHook();
    expect(model.selectedRestaurantId).toBe('restaurant-1');
    expect(model.selectedGroupTabs?.location.items.map((item) => item.name)).toEqual([
      'Aguachile',
      'Ziti',
    ]);

    selectedGroupId = 'restaurant-2';
    model = await renderHook();

    expect(model.selectedRestaurantId).toBe('restaurant-2');
    expect(model.selectedRestaurant?.name).toBe('In-N-Out Burger');
    expect(model.selectedGroupTabs?.location.items.map((item) => item.name)).toEqual([
      'Animal Style Fries',
    ]);
    expect(model.selectedGroupTabs?.allLocations.items).toEqual([]);
  });
});

describe('useFoodDiscoveryRestaurantDetailReadModel', () => {
  const queryClient = {
    getQueryData: jest.fn(),
  };
  let detailHook: ReturnType<typeof useFoodDiscoveryRestaurantDetailReadModel> | null;
  let renderer: ReturnType<typeof create> | null;

  beforeEach(() => {
    jest.clearAllMocks();
    detailHook = null;
    renderer = null;
    queryClient.getQueryData.mockReturnValue(undefined);
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedListMenuItemsForRestaurant.mockResolvedValue(menuItemsByRestaurant['restaurant-1']);
    mockedGetAllLocationsHistory.mockResolvedValue(historyByRestaurant['restaurant-1']);
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly string[];
      const restaurantId = queryKey[queryKey.length - 1];

      if (queryKey.includes('menuItems')) {
        return {
          data: menuItemsByRestaurant[restaurantId] ?? [],
          error: null,
          isPending: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: historyByRestaurant[restaurantId],
        error: null,
        isPending: false,
        refetch: jest.fn(),
      } as never;
    });
  });

  afterEach(() => {
    if (!renderer) {
      return;
    }

    act(() => {
      renderer?.unmount();
    });
  });

  async function renderDetailHook({
    groupMenuSuggestions,
    isOnline = true,
    restaurant = restaurantOne,
  }: {
    groupMenuSuggestions?: GroupMenuSuggestionsRecord;
    isOnline?: boolean;
    restaurant?: RestaurantRecord | null;
  } = {}) {
    function TestComponent() {
      detailHook = useFoodDiscoveryRestaurantDetailReadModel({
        groupMenuSuggestions,
        isOnline,
        restaurant,
      });
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!detailHook) {
      throw new Error('Expected detail hook to render.');
    }

    return detailHook;
  }

  it('normalizes online restaurant detail menu catalog and all-locations rows', async () => {
    const model = await renderDetailHook();

    expect(model.menuCatalogRows.map((item) => item.name)).toEqual(['Aguachile', 'Ziti']);
    expect(model.yourOrderedItemsRows).toEqual([
      expect.objectContaining({
        name: 'Double Double',
        meta: [
          {
            dateLabel: 'Latest at In-N-Out Burger • 333 Jefferson St',
            label: '2 orders',
            rating: 5,
          },
        ],
      }),
    ]);
    expect(model.canShowAllLocations).toBe(true);
  });

  it('labels exact-location menu rows when the item has been ordered at this restaurant', async () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly string[];
      if (queryKey.includes('menuItems')) {
        return {
          data: [
            { id: 'menu-a', name: 'Aguachile', restaurant: 'restaurant-1' },
            { id: 'menu-b', name: 'Ziti', restaurant: 'restaurant-1' },
          ],
          error: null,
          isPending: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: {
          ...historyByRestaurant['restaurant-1'],
          items: [
            {
              averageRating: 5,
              displayName: 'Aguachile',
              latestRating: 5,
              latestRestaurantId: 'restaurant-1',
              latestRestaurantName: 'Erewhon West Hollywood',
              latestVisitedAt: '2026-04-03T18:30:00.000Z',
              normalizedItemName: 'aguachile',
              orderCount: 1,
              restaurants: [
                {
                  orderCount: 1,
                  restaurantId: 'restaurant-1',
                  restaurantName: 'Erewhon West Hollywood',
                },
              ],
            },
          ],
        },
        error: null,
        isPending: false,
        refetch: jest.fn(),
      } as never;
    });

    const model = await renderDetailHook();

    expect(model.menuCatalogRows).toEqual([
      expect.objectContaining({
        name: 'Aguachile',
        meta: [{ label: 'Had here' }],
      }),
      expect.objectContaining({
        name: 'Ziti',
        meta: [],
      }),
    ]);
  });

  it('labels related-location menu rows without implying exact-location history', async () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly string[];
      if (queryKey.includes('menuItems')) {
        return {
          data: [{ id: 'menu-a', name: 'Coconut Yogurt', restaurant: 'restaurant-1' }],
          error: null,
          isPending: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: {
          ...historyByRestaurant['restaurant-1'],
          items: [
            {
              averageRating: 4,
              displayName: 'Coconut Yogurt',
              latestRating: 4,
              latestRestaurantId: 'restaurant-2',
              latestRestaurantName: 'Erewhon Venice',
              latestVisitedAt: '2026-04-03T18:30:00.000Z',
              normalizedItemName: 'coconut yogurt',
              orderCount: 2,
              restaurants: [
                {
                  orderCount: 2,
                  restaurantId: 'restaurant-2',
                  restaurantName: 'Erewhon Venice',
                },
              ],
            },
          ],
        },
        error: null,
        isPending: false,
        refetch: jest.fn(),
      } as never;
    });

    const model = await renderDetailHook();

    expect(model.menuCatalogRows[0]).toMatchObject({
      name: 'Coconut Yogurt',
      meta: [{ label: 'Had at related locations' }],
    });
    expect(model.menuCatalogRows[0]?.meta).not.toEqual([{ label: 'Had here' }]);
  });

  it('uses linked catalog contribution counts for approved menu item history labels', async () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly string[];
      if (queryKey.includes('menuItems')) {
        return {
          data: [
            {
              id: 'approved-menu-item',
              name: 'Spicy Miso Ramen',
              restaurant: 'restaurant-1',
              userEatenCount: 1,
            },
          ],
          error: null,
          isPending: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: {
          ...historyByRestaurant['restaurant-1'],
          items: [
            {
              averageRating: 4,
              displayName: 'User typed ramen text',
              latestRating: 4,
              latestRestaurantId: 'restaurant-1',
              latestRestaurantName: 'Erewhon West Hollywood',
              latestVisitedAt: '2026-04-03T18:30:00.000Z',
              normalizedItemName: 'user typed ramen text',
              orderCount: 1,
              restaurants: [
                {
                  orderCount: 1,
                  restaurantId: 'restaurant-1',
                  restaurantName: 'Erewhon West Hollywood',
                },
              ],
            },
          ],
        },
        error: null,
        isPending: false,
        refetch: jest.fn(),
      } as never;
    });

    const model = await renderDetailHook();

    expect(model.menuCatalogRows[0]).toMatchObject({
      name: 'Spicy Miso Ramen',
      meta: [{ label: 'Had here' }],
    });
    expect(model.menuCatalogRows[0]?.name).not.toBe('User typed ramen text');
  });

  it('labels related-location suggestions when matching user history is from grouped restaurants', async () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly string[];
      if (queryKey.includes('menuItems')) {
        return {
          data: [],
          error: null,
          isPending: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: {
          ...historyByRestaurant['restaurant-1'],
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
          ],
        },
        error: null,
        isPending: false,
        refetch: jest.fn(),
      } as never;
    });

    const model = await renderDetailHook({
      groupMenuSuggestions: {
        restaurantId: 'restaurant-1',
        restaurantGroupId: 'group-1',
        suggestions: [
          {
            displayName: 'Granola Bowl',
            normalizedItemName: 'granola bowl',
            sourceItemCount: 1,
            sourceRestaurantCount: 1,
            sources: [
              {
                menuItemCount: 1,
                menuItemIds: ['menu-2'],
                restaurantId: 'restaurant-2',
                restaurantName: 'Erewhon Venice',
              },
            ],
          },
        ],
      },
    });

    expect(model.relatedMenuSuggestions).toEqual([
      expect.objectContaining({
        name: 'Granola Bowl',
        orderedHistory: {
          kind: 'relatedLocation',
          label: 'Had at related locations',
          orderCount: 1,
        },
      }),
    ]);
  });

  it('uses cached offline restaurant detail data when available', async () => {
    queryClient.getQueryData.mockImplementation((queryKey) => {
      const key = queryKey as readonly string[];
      if (key.includes('menuItems')) {
        return menuItemsByRestaurant['restaurant-1'];
      }
      if (key.includes('allLocationsHistory')) {
        return historyByRestaurant['restaurant-1'];
      }
      return undefined;
    });
    mockedUseQuery.mockImplementation((options: any) => ({
      data: undefined,
      error: null,
      isPending: false,
      options,
      refetch: jest.fn(),
    } as never));

    await renderDetailHook({ isOnline: false });
    const menuQuery = mockedUseQuery.mock.calls.find((call) =>
      ((call[0] as any).queryKey as readonly string[]).includes('menuItems'),
    )?.[0] as any;
    const historyQuery = mockedUseQuery.mock.calls.find((call) =>
      ((call[0] as any).queryKey as readonly string[]).includes('allLocationsHistory'),
    )?.[0] as any;

    await expect(menuQuery.queryFn({ signal: undefined })).resolves.toEqual(
      menuItemsByRestaurant['restaurant-1'],
    );
    await expect(historyQuery.queryFn({ signal: undefined })).resolves.toEqual(
      historyByRestaurant['restaurant-1'],
    );
    expect(queryClient.getQueryData).toHaveBeenCalledWith(menuItemsQueryKeys.restaurant('restaurant-1'));
    expect(queryClient.getQueryData).toHaveBeenCalledWith(
      restaurantsQueryKeys.allLocationsHistory('restaurant-1'),
    );
  });

  it('keeps refresh errors non-blocking when cached detail rows are present', async () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly string[];
      if (queryKey.includes('menuItems')) {
        return {
          data: menuItemsByRestaurant['restaurant-1'],
          error: new Error('Refresh failed'),
          isPending: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: historyByRestaurant['restaurant-1'],
        error: new Error('History refresh failed'),
        isPending: false,
        refetch: jest.fn(),
      } as never;
    });

    const model = await renderDetailHook();

    expect(model.menuCatalogRows).toHaveLength(2);
    expect(model.menuCatalogErrorMessage).toBeNull();
    expect(model.yourOrderedItemsRows).toHaveLength(1);
    expect(model.allLocationsHistoryErrorMessage).toBeNull();
  });
});

describe('canShowFoodDiscoveryAllLocationsHistory', () => {
  it('requires item-backed own history before showing all locations', () => {
    expect(
      canShowFoodDiscoveryAllLocationsHistory(
        {
          ...historyByRestaurant['restaurant-1'],
          itemCount: 0,
          items: [],
          locationCount: 2,
          restaurants: [
            {
              latestVisitedAt: '2026-04-03T18:30:00.000Z',
              restaurantId: 'restaurant-2',
              restaurantLocation: '333 Jefferson St',
              restaurantName: 'In-N-Out Burger',
              visitCount: 1,
            },
          ],
          visitCount: 1,
        },
        'restaurant-1',
      ),
    ).toBe(false);
  });

  it('shows all locations for one matching ordered location different from the current restaurant', () => {
    expect(
      canShowFoodDiscoveryAllLocationsHistory(
        {
          ...historyByRestaurant['restaurant-1'],
          itemCount: 1,
          locationCount: 1,
          restaurants: [
            {
              latestVisitedAt: '2026-04-03T18:30:00.000Z',
              restaurantId: 'restaurant-2',
              restaurantLocation: '333 Jefferson St',
              restaurantName: 'In-N-Out Burger',
              visitCount: 1,
            },
          ],
          visitCount: 1,
        },
        'restaurant-1',
      ),
    ).toBe(true);
  });
});
