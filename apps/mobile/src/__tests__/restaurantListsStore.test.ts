import {
  getRestaurantListCandidateRestaurants,
  updateRestaurantList,
} from '../features/store/restaurantListsStore';
import { listCollectionRecords, sendApiRequest } from '../features/store/pocketbaseGateway';
import { pb } from '../lib/pocketbase';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  listCollectionRecords: jest.fn(),
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
    collection: jest.fn(),
  },
}));

const mockedListCollectionRecords = listCollectionRecords as jest.MockedFunction<typeof listCollectionRecords>;
const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;
const mockedPocketBase = pb as typeof pb & {
  authStore: {
    record: {
      collectionId: string;
      collectionName: string;
      id: string;
    } | null;
  };
  collection: jest.Mock;
};

describe('restaurantListsStore.updateRestaurantList', () => {
  beforeEach(() => {
    mockedListCollectionRecords.mockReset();
    mockedSendApiRequest.mockReset();
    mockedPocketBase.collection.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('uses cached list state to reject default-list edits without prefetching', async () => {
    const restaurantListsCollection = {
      getOne: jest.fn(),
      update: jest.fn(),
    };

    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'restaurant_lists') {
        return restaurantListsCollection;
      }

      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await expect(
      updateRestaurantList(
        'list-1',
        {
          name: 'Saved',
        },
        {
          isDefault: true,
        },
      ),
    ).rejects.toThrow('The Saved list cannot be edited.');

    expect(restaurantListsCollection.getOne).not.toHaveBeenCalled();
    expect(restaurantListsCollection.update).not.toHaveBeenCalled();
  });

  it('updates non-default lists without a read-before-write roundtrip', async () => {
    const restaurantListsCollection = {
      getOne: jest.fn(),
      update: jest.fn().mockResolvedValue({
        id: 'list-1',
        name: 'Favorites',
        description: 'Weeknight picks',
        visibility: 'public',
        user: 'user-1',
        created: '2026-04-20T18:00:00.000Z',
        updated: '2026-04-21T18:00:00.000Z',
        expand: {
          user: {
            id: 'user-1',
            name: 'Taylor',
          },
        },
      }),
    };

    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'restaurant_lists') {
        return restaurantListsCollection;
      }

      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await expect(
      updateRestaurantList(
        'list-1',
        {
          name: '  Favorites  ',
          description: '  Weeknight picks  ',
          visibility: 'friends',
        },
        {
          isDefault: false,
        },
      ),
    ).resolves.toMatchObject({
      id: 'list-1',
      name: 'Favorites',
      description: 'Weeknight picks',
      visibility: 'friends',
      userId: 'user-1',
      ownerName: 'Taylor',
    });

    expect(restaurantListsCollection.getOne).not.toHaveBeenCalled();
    expect(restaurantListsCollection.update).toHaveBeenCalledWith(
      'list-1',
      {
        name: 'Favorites',
        description: 'Weeknight picks',
        visibility: 'friends',
      },
      {
        expand: 'user',
        headers: undefined,
      },
    );
  });
});

describe('restaurantListsStore.getRestaurantListCandidateRestaurants', () => {
  beforeEach(() => {
    mockedListCollectionRecords.mockReset();
    mockedSendApiRequest.mockReset();
    mockedPocketBase.collection.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('maps candidate food item photo preview and count from the api response', async () => {
    const abortController = new AbortController();
    mockedSendApiRequest.mockResolvedValue({
      list: {
        id: 'list-1',
        name: 'Favorites',
        visibility: 'friends',
        userId: 'user-1',
        createdAt: '2026-05-01T18:00:00.000Z',
        updatedAt: '2026-05-02T18:00:00.000Z',
      },
      items: [
        {
          id: 'restaurant-1',
          name: '  Noodle House  ',
          itemCount: 1,
          foodItems: [
            {
              id: 'food-item-1',
              name: '  Ramen  ',
              rating: 5,
              visitedAt: '2026-05-01T18:30:00.000Z',
              photoPreview: {
                id: '  photo-1  ',
                photo: '  ramen.jpg  ',
              },
              photoCount: 3,
            },
          ],
        },
      ],
    });

    await expect(
      getRestaurantListCandidateRestaurants('list-1', ' ramen ', {
        signal: abortController.signal,
      }),
    ).resolves.toMatchObject({
      list: {
        id: 'list-1',
        name: 'Favorites',
      },
      items: [
        {
          id: 'restaurant-1',
          name: 'Noodle House',
          foodItems: [
            {
              id: 'food-item-1',
              name: 'Ramen',
              photoPreview: {
                id: 'photo-1',
                photo: 'ramen.jpg',
              },
              photoCount: 3,
            },
          ],
        },
      ],
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/restaurant-lists/list-1/candidate-restaurants?search=ramen',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
    expect(mockedListCollectionRecords).not.toHaveBeenCalled();
  });

  it('does not backfill missing candidate photo fields with a secondary collection query', async () => {
    mockedSendApiRequest.mockResolvedValue({
      list: {
        id: 'list-1',
        name: 'Favorites',
        visibility: 'friends',
        userId: 'user-1',
        createdAt: '2026-05-01T18:00:00.000Z',
        updatedAt: '2026-05-02T18:00:00.000Z',
      },
      items: [
        {
          id: 'restaurant-1',
          name: 'Noodle House',
          itemCount: 1,
          foodItems: [
            {
              id: 'food-item-1',
              name: 'Ramen',
              rating: 5,
              visitedAt: '2026-05-01T18:30:00.000Z',
            },
          ],
        },
      ],
    });
    mockedListCollectionRecords.mockResolvedValue([
      {
        id: 'photo-1',
        food_item: 'food-item-1',
        photo: 'ramen.jpg',
        created: '2026-05-01T18:45:00.000Z',
      },
    ]);

    await expect(getRestaurantListCandidateRestaurants('list-1')).resolves.toMatchObject({
      items: [
        {
          id: 'restaurant-1',
          foodItems: [
            {
              id: 'food-item-1',
              photoPreview: undefined,
              photoCount: undefined,
            },
          ],
        },
      ],
    });

    expect(mockedListCollectionRecords).not.toHaveBeenCalled();
  });
});
