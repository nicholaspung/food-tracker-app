import {
  getDefaultRestaurantList,
  getRestaurantListDetail,
  getRestaurantListBookmarkState,
  getRestaurantListCandidateRestaurants,
  organizeRestaurantListItem,
  removeRestaurantFoodItemBookmarkFromList,
  saveSharedRestaurantListRecommendation,
  saveRestaurantToDefaultList,
  updateRestaurantList,
} from '../features/store/restaurantListsStore';
import {
  listCollectionRecords,
  sendApiRequest,
  updateCollectionRecord,
} from '../features/store/pocketbaseGateway';
import { pb } from '../lib/pocketbase';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  listCollectionRecords: jest.fn(),
  sendApiRequest: jest.fn(),
  updateCollectionRecord: jest.fn(),
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
const mockedUpdateCollectionRecord = updateCollectionRecord as jest.MockedFunction<typeof updateCollectionRecord>;
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
    mockedUpdateCollectionRecord.mockReset();
    mockedPocketBase.collection.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('uses cached list state to reject default-list edits without prefetching', async () => {
    await expect(
      updateRestaurantList(
        'list-1',
        {
          name: 'Want to Try',
        },
        {
          isDefault: true,
        },
      ),
    ).rejects.toThrow('The Want to Try list cannot be edited.');

    expect(mockedUpdateCollectionRecord).not.toHaveBeenCalled();
  });

  it('updates non-default lists without a read-before-write roundtrip', async () => {
    mockedUpdateCollectionRecord.mockResolvedValue({
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

    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith(
      'restaurant_lists',
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

describe('restaurantListsStore.getRestaurantListDetail', () => {
  beforeEach(() => {
    mockedListCollectionRecords.mockReset();
    mockedSendApiRequest.mockReset();
    mockedUpdateCollectionRecord.mockReset();
    mockedPocketBase.collection.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('preserves recommendation usage proof rows from the API response', async () => {
    mockedSendApiRequest.mockResolvedValue({
      list: {
        id: 'list-1',
        name: 'Favorites',
        visibility: 'private',
        userId: 'user-1',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      items: [
        {
          id: 'list-item-1',
          listId: 'list-1',
          restaurantId: 'restaurant-1',
          restaurantName: 'Noodle House',
          position: 1,
          bookmarkedItems: [],
          recommendationUsageProofs: [
            {
              actorId: 'friend-1',
              actorName: 'Mina',
              kind: 'saved_recommendation',
              action: 'saved',
              actedAt: '2026-04-02T00:00:00.000Z',
            },
          ],
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      bookmarkState: {
        savedListIdsByBookmarkLookupId: {},
      },
      photoPreviews: [],
      viewerLists: [],
      creatorGuideUsageProof: {
        savedCount: 2,
        triedCount: 1,
        ratedAfterTryCount: 1,
        sourceRecommendationCount: 2,
        totalRecommendationUsageCount: 4,
      },
    });

    await expect(getRestaurantListDetail('list-1')).resolves.toMatchObject({
      creatorGuideUsageProof: {
        savedCount: 2,
        triedCount: 1,
        ratedAfterTryCount: 1,
        sourceRecommendationCount: 2,
        totalRecommendationUsageCount: 4,
      },
      items: [
        {
          id: 'list-item-1',
          recommendationUsageProofs: [
            {
              actorName: 'Mina',
              kind: 'saved_recommendation',
            },
          ],
        },
      ],
    });
  });
});

describe('restaurantListsStore.saveRestaurantToDefaultList', () => {
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

  it('creates the default list and saves a restaurant-only bookmark', async () => {
    mockedSendApiRequest
      .mockResolvedValueOnce({
        id: 'default-list-1',
        name: 'Want to Try',
        visibility: 'private',
        userId: 'user-1',
        isDefault: true,
        createdAt: '2026-05-01T18:00:00.000Z',
        updatedAt: '2026-05-01T18:00:00.000Z',
      })
      .mockResolvedValueOnce({
        listId: 'default-list-1',
        restaurantId: 'restaurant-1',
        items: [
          {
            id: 'list-item-1',
            listId: 'default-list-1',
            restaurantId: 'restaurant-1',
            restaurantName: '  Noodle House  ',
            position: 1,
            bookmarkedItems: [],
            note: '  Try soon  ',
            createdAt: '2026-05-01T18:05:00.000Z',
          },
        ],
      });

    await expect(
      saveRestaurantToDefaultList({
        restaurantId: '  restaurant-1  ',
        note: '  Try soon  ',
      }),
    ).resolves.toMatchObject([
      {
        id: 'list-item-1',
        restaurantId: 'restaurant-1',
        restaurantName: 'Noodle House',
        bookmarkedItems: [],
        note: 'Try soon',
      },
    ]);

    expect(mockedSendApiRequest).toHaveBeenNthCalledWith(1, '/api/restaurant-lists/default', {
      method: 'POST',
      headers: undefined,
    });
    expect(mockedSendApiRequest).toHaveBeenNthCalledWith(
      2,
      '/api/restaurant-lists/default-list-1/bookmarks',
      {
        method: 'POST',
        headers: undefined,
        body: {
          restaurantId: 'restaurant-1',
          note: 'Try soon',
        },
      },
    );
  });
});

describe('restaurantListsStore.saveSharedRestaurantListRecommendation', () => {
  beforeEach(() => {
    mockedSendApiRequest.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('sends source list item attribution with shared-list saves', async () => {
    mockedSendApiRequest.mockResolvedValue({ saved: true });

    await expect(
      saveSharedRestaurantListRecommendation({
        shareToken: ' share-token ',
        restaurantId: ' restaurant-1 ',
        foodItemId: ' food-item-1 ',
        sourceListItemId: ' source-list-item-1 ',
        targetListIds: [' target-list-1 ', ''],
      }),
    ).resolves.toBeUndefined();

    expect(mockedSendApiRequest).toHaveBeenCalledWith('/api/public/restaurant-lists/share-token/bookmarks', {
      method: 'POST',
      headers: undefined,
      body: {
        restaurantId: 'restaurant-1',
        foodItemId: 'food-item-1',
        sourceListItemId: 'source-list-item-1',
        targetListIds: ['target-list-1'],
      },
    });
  });
});

describe('restaurantListsStore.organizeRestaurantListItem', () => {
  beforeEach(() => {
    mockedSendApiRequest.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('posts one normalized organization command with replay headers', async () => {
    mockedSendApiRequest.mockResolvedValue({ listIds: ['current-list', 'target-list'] });

    await expect(
      organizeRestaurantListItem(
        {
          currentListId: ' current-list ',
          destinationListIds: [' target-list ', 'target-list', ''],
          restaurantId: ' restaurant-1 ',
          representations: [
            { foodItemId: ' source-food-1 ', listItemId: ' source-list-item-1 ' },
            { foodItemId: ' user-food-1 ', listItemId: ' source-list-item-1 ' },
          ],
        },
        {
          headers: {
            'X-Idempotency-Key': 'organization-1',
          },
        },
      ),
    ).resolves.toBeUndefined();

    expect(mockedSendApiRequest).toHaveBeenCalledTimes(1);
    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/restaurant-lists/current-list/items/organize',
      {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': 'organization-1',
        },
        body: {
          destinationListIds: ['target-list'],
          restaurantId: 'restaurant-1',
          representations: [
            { foodItemId: 'source-food-1', listItemId: 'source-list-item-1' },
            { foodItemId: 'user-food-1', listItemId: 'source-list-item-1' },
          ],
        },
      },
    );
  });
});

describe('restaurantListsStore.getDefaultRestaurantList', () => {
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

  it('loads the default list through the targeted endpoint', async () => {
    const abortController = new AbortController();
    mockedSendApiRequest.mockResolvedValueOnce({
      id: 'default-list-1',
      name: 'Want to Try',
      visibility: 'private',
      userId: 'user-1',
      isDefault: true,
      restaurantCount: 2,
      menuItemCount: 3,
      createdAt: '2026-05-01T18:00:00.000Z',
      updatedAt: '2026-05-02T18:00:00.000Z',
    });

    await expect(getDefaultRestaurantList({ signal: abortController.signal })).resolves.toMatchObject({
      id: 'default-list-1',
      isDefault: true,
      menuItemCount: 3,
      restaurantCount: 2,
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith('/api/restaurant-lists/default', {
      method: 'GET',
      signal: abortController.signal,
    });
  });
});

describe('restaurantListsStore.getRestaurantListBookmarkState', () => {
  beforeEach(() => {
    mockedListCollectionRecords.mockReset();
    mockedSendApiRequest.mockReset();
    mockedUpdateCollectionRecord.mockReset();
    mockedPocketBase.collection.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('posts only normalized visible bookmark targets to the bounded state endpoint', async () => {
    mockedSendApiRequest.mockResolvedValue({
      savedTargetsByBookmarkKey: {
        'restaurant-item:restaurant-1:friend noodles': {
          bookmarkKey: 'restaurant-item:restaurant-1:friend noodles',
          foodItemId: 'food-item-1',
          restaurantId: 'restaurant-1',
        },
      },
    });

    await expect(
      getRestaurantListBookmarkState(' default-list ', [
        {
          bookmarkKey: ' restaurant-item:restaurant-1:friend noodles ',
          foodItemId: ' food-item-1 ',
          restaurantId: ' restaurant-1 ',
        },
        {
          bookmarkKey: 'menu-item-1',
          menuItemId: ' menu-item-1 ',
          restaurantId: ' restaurant-1 ',
        },
        {
          bookmarkKey: 'missing-target',
          restaurantId: 'restaurant-1',
        },
      ]),
    ).resolves.toEqual({
      savedTargetsByBookmarkKey: {
        'restaurant-item:restaurant-1:friend noodles': {
          bookmarkKey: 'restaurant-item:restaurant-1:friend noodles',
          foodItemId: 'food-item-1',
          restaurantId: 'restaurant-1',
        },
      },
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/restaurant-lists/default-list/bookmark-state',
      {
        method: 'POST',
        signal: undefined,
        body: {
          targets: [
            {
              bookmarkKey: 'restaurant-item:restaurant-1:friend noodles',
              foodItemId: 'food-item-1',
              menuItemId: undefined,
              restaurantId: 'restaurant-1',
            },
            {
              bookmarkKey: 'menu-item-1',
              foodItemId: undefined,
              menuItemId: 'menu-item-1',
              restaurantId: 'restaurant-1',
            },
          ],
        },
      },
    );
  });
});

describe('restaurantListsStore.removeRestaurantFoodItemBookmarkFromList', () => {
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

  it('posts a bookmark removal to the restaurant list remove endpoint', async () => {
    mockedSendApiRequest.mockResolvedValueOnce({
      listId: 'default-list-1',
      restaurantId: 'restaurant-1',
      items: [],
    });

    await expect(
      removeRestaurantFoodItemBookmarkFromList({
        listId: '  default-list-1  ',
        restaurantId: '  restaurant-1  ',
        foodItemId: '  food-item-1  ',
      }),
    ).resolves.toEqual([]);

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/restaurant-lists/default-list-1/bookmarks/remove',
      {
        method: 'POST',
        headers: undefined,
        body: {
          restaurantId: 'restaurant-1',
          foodItemId: 'food-item-1',
        },
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

  it('requests and maps paginated candidate restaurants', async () => {
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
          name: 'Noodle House',
          itemCount: 1,
          foodItems: [],
        },
      ],
      page: 2,
      pageSize: 20,
      totalItems: 41,
      totalPages: 3,
      hasNextPage: true,
    });

    await expect(
      getRestaurantListCandidateRestaurants('list-1', ' ramen ', {
        page: 2,
        pageSize: 20,
        signal: abortController.signal,
      }),
    ).resolves.toMatchObject({
      items: [
        {
          id: 'restaurant-1',
          name: 'Noodle House',
        },
      ],
      page: 2,
      pageSize: 20,
      totalItems: 41,
      totalPages: 3,
      hasNextPage: true,
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/restaurant-lists/list-1/candidate-restaurants?search=ramen&page=2&pageSize=20',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
  });
});
