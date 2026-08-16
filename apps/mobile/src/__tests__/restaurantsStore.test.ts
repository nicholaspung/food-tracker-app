import {
  getAllLocationsHistory,
  getGroupMenuSuggestionsForRestaurant,
  listMenuItemsForRestaurant,
} from '../features/store/restaurantsStore';
import { sendApiRequest } from '../features/store/pocketbaseGateway';
import { pb } from '../lib/pocketbase';

jest.mock('../features/store/pocketbaseGateway', () => ({
  sendApiRequest: jest.fn(),
}));

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      record: {
        collectionId: 'users',
        collectionName: 'users',
        id: 'user-1',
      },
    },
  },
}));

const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;
const mockedPocketBase = pb as typeof pb & {
  authStore: {
    record: {
      collectionId: string;
      collectionName: string;
      id: string;
    } | null;
  };
};

describe('restaurantsStore', () => {
  beforeEach(() => {
    mockedSendApiRequest.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('loads all locations history from the feature endpoint', async () => {
    const abortController = new AbortController();
    mockedSendApiRequest.mockResolvedValue({
      anchorRestaurant: {
        id: 'restaurant-1',
        name: 'Noodle House',
      },
      itemCount: 0,
      items: [],
      locationCount: 1,
      normalizedName: 'noodle house',
      restaurants: [],
      visitCount: 0,
    });

    await expect(
      getAllLocationsHistory(' restaurant-1 ', { signal: abortController.signal }),
    ).resolves.toEqual(
      expect.objectContaining({
        normalizedName: 'noodle house',
      }),
    );

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/restaurants/restaurant-1/same-name-history',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
  });

  it('loads group menu suggestions from the feature endpoint', async () => {
    const abortController = new AbortController();
    mockedSendApiRequest.mockResolvedValue({
      restaurantId: 'restaurant-1',
      restaurantGroupId: 'group-1',
      suggestions: [
        {
          normalizedItemName: 'tonkotsu ramen',
          displayName: 'Tonkotsu Ramen',
          sourceRestaurantCount: 2,
          sourceItemCount: 2,
          sources: [],
        },
      ],
    });

    await expect(
      getGroupMenuSuggestionsForRestaurant(' restaurant-1 ', {
        signal: abortController.signal,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        restaurantGroupId: 'group-1',
        suggestions: expect.arrayContaining([
          expect.objectContaining({ normalizedItemName: 'tonkotsu ramen' }),
        ]),
      }),
    );

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/restaurants/restaurant-1/group-menu-suggestions',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
  });

  it('loads one searchable menu item page and forwards cancellation', async () => {
    const abortController = new AbortController();
    mockedSendApiRequest.mockResolvedValue({
      items: [{ id: 'menu-1', name: 'Spicy Ramen', restaurant: 'restaurant-1' }],
      page: 2,
      pageSize: 20,
      totalItems: 21,
      totalPages: 2,
      hasNextPage: false,
    });

    await expect(
      listMenuItemsForRestaurant(' restaurant-1 ', {
        ids: [' menu-1 ', 'menu-2', 'menu-1'],
        page: 2,
        pageSize: 20,
        search: '  spicy   ramen ',
        signal: abortController.signal,
      }),
    ).resolves.toEqual(expect.objectContaining({
      page: 2,
      totalItems: 21,
      items: [expect.objectContaining({ id: 'menu-1' })],
    }));

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/restaurants/restaurant-1/menu-items?page=2&pageSize=20&search=spicy+ramen&ids=menu-1%2Cmenu-2',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
  });

  it('returns empty group menu suggestions when unauthenticated', async () => {
    mockedPocketBase.authStore.record = null;

    await expect(getGroupMenuSuggestionsForRestaurant(' restaurant-1 ')).resolves.toEqual({
      restaurantId: 'restaurant-1',
      suggestions: [],
    });

    expect(mockedSendApiRequest).not.toHaveBeenCalled();
  });
});
