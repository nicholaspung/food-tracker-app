import { updateRestaurantList } from '../features/store/restaurantListsStore';
import { pb } from '../lib/pocketbase';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
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
