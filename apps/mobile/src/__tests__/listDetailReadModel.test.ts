import {
  buildRestaurantListDetailMapProjection,
  buildRestaurantListDetailReadModel,
  type AuthenticatedListDetailReadModelInput,
  type RestaurantListDetailRecord,
  type RestaurantListRecord,
  type SharedRestaurantListDetailRecord,
} from '../features';

function buildList(overrides: Partial<RestaurantListRecord> = {}): RestaurantListRecord {
  return {
    id: 'list_1',
    name: 'Dinner Ideas',
    description: 'Places to try',
    visibility: 'friends',
    userId: 'owner_1',
    ownerName: 'Nina',
    isDefault: false,
    shareEnabled: false,
    restaurantCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function buildDetail(overrides: Partial<RestaurantListDetailRecord> = {}): RestaurantListDetailRecord {
  return {
    list: buildList(),
    items: [
      {
        id: 'list_item_2',
        listId: 'list_1',
        restaurantId: 'restaurant_2',
        restaurantName: 'Beta Grill',
        restaurantLocation: '200 Oak St',
        restaurantCity: 'Oakland',
        restaurantCuisineType: 'Barbecue',
        restaurantVisibility: 'friends',
        latitude: 37.8044,
        longitude: -122.2712,
        position: 2,
        note: 'Order extra sauce',
        sourceUserId: 'friend_1',
        sourceUserName: 'Maya',
        bookmarkedItems: [
          {
            id: 'food_2',
            listItemId: 'list_item_2',
            name: 'Ribs',
            rating: 8,
            visitedAt: '2025-03-01T00:00:00.000Z',
            sourceUserId: 'friend_1',
            sourceUserName: 'Maya',
          },
        ],
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'list_item_1',
        listId: 'list_1',
        restaurantId: 'restaurant_1',
        restaurantName: 'Alpha Cafe',
        restaurantLocation: '100 Main St',
        restaurantCity: 'Berkeley',
        restaurantCuisineType: 'Cafe',
        restaurantVisibility: 'private',
        latitude: 37.8715,
        longitude: -122.273,
        position: 1,
        note: 'Great patio',
        sourceUserId: 'friend_2',
        sourceUserName: 'Ari',
        recommendationUsageProofs: [
          {
            actorId: 'friend_3',
            actorName: 'Mina',
            kind: 'saved_recommendation',
            action: 'saved',
            actedAt: '2026-03-01T00:00:00.000Z',
          },
        ],
        bookmarkedItems: [
          {
            id: 'food_1',
            listItemId: 'list_item_1',
            name: 'Pancakes',
            rating: 9,
            visitedAt: '2025-02-01T00:00:00.000Z',
            sourceUserId: 'friend_2',
            sourceUserName: 'Ari',
            userFoodItemId: 'user_food_1',
            userFoodItemRating: 10,
            userFoodItemVisitedAt: '2025-04-05T00:00:00.000Z',
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    bookmarkState: {
      savedListIdsByBookmarkLookupId: {
        food_1: ['saved_list', ''],
        user_food_1: ['personal_list'],
      },
    },
    photoPreviews: [
      {
        id: 'photo_1',
        food_item: 'food_1',
        photo: 'photo-one.jpg',
        collectionId: 'visit_photos',
        collectionName: 'visit_photos',
        created: '2025-02-01T00:00:00.000Z',
        ownerName: 'Ari',
      },
      {
        id: 'photo_2',
        food_item: 'user_food_1',
        photo: 'photo-two.jpg',
        collectionId: 'visit_photos',
        collectionName: 'visit_photos',
        created: '2025-04-05T00:00:00.000Z',
      },
    ],
    viewerLists: [
      buildList({
        id: 'saved_list',
        name: 'Saved',
        userId: 'viewer_1',
        isDefault: true,
      }),
      buildList({
        id: 'personal_list',
        name: 'Weekend',
        userId: 'viewer_1',
        isDefault: false,
      }),
    ],
    ...overrides,
  };
}

function buildModel(overrides: Partial<AuthenticatedListDetailReadModelInput> = {}) {
  return buildRestaurantListDetailReadModel({
    variant: 'authenticated',
    detail: buildDetail(),
    userId: 'owner_1',
    saveBookmarkTarget: null,
    isError: false,
    isLoading: false,
    ...overrides,
  });
}

function buildMapProjection(model = buildModel()) {
  return buildRestaurantListDetailMapProjection(
    model.restaurantRows,
    model.isOwner,
    model.isDefaultList,
  );
}

describe('buildRestaurantListDetailReadModel', () => {
  it('builds owner rows with grouped restaurants, owner display rows, and photo entries', () => {
    const model = buildModel();
    const mapGroups = buildMapProjection(model);

    expect(model.isOwner).toBe(true);
    expect(model.groupedRestaurants.map((group) => group.restaurantId)).toEqual(['restaurant_1', 'restaurant_2']);
    expect(model.restaurantRows[0]?.primaryMetaLabel).toBe('Berkeley');
    expect(model.restaurantRows[0]?.secondaryMetaLabel).toBe('Cafe');
    expect(model.restaurantRows[0]?.isRestaurantLocked).toBe(true);
    expect(model.restaurantRows[0]?.ownerItems).toMatchObject([
      {
        name: 'Pancakes',
        source: { sourceUserName: 'Ari', rating: 9 },
        user: { kind: 'linked', rating: 10 },
        photoEntries: [
          { id: 'photo_1', ownerLabel: 'Ari' },
          { id: 'photo_2', ownerLabel: 'You' },
        ],
      },
    ]);
    expect(model.restaurantRows[0]?.group.recommendationUsageProofs).toMatchObject([
      {
        actorName: 'Mina',
        kind: 'saved_recommendation',
      },
    ]);
    expect(mapGroups[0]).toMatchObject({
      id: 'restaurant_1',
      restaurantName: 'Alpha Cafe',
      summary: '1. 1 bookmarked item',
      items: [
        {
          name: 'Pancakes',
          photoCount: 2,
          photoThumbnailUrl: expect.stringContaining('photo-one.jpg'),
        },
      ],
    });
  });

  it('keeps authenticated owner actions tied to the containing list item', () => {
    const detail = buildDetail();
    const parentItem = detail.items[0];
    const bookmarkedItem = parentItem?.bookmarkedItems[0];
    if (!parentItem || !bookmarkedItem) {
      throw new Error('Expected an authenticated bookmark fixture.');
    }
    bookmarkedItem.listItemId = 'source_list_item_from_friend';

    const model = buildModel({ detail });
    const item = model.groupedRestaurants
      .find((group) => group.restaurantId === parentItem.restaurantId)
      ?.items[0];

    expect(item?.listItemId).toBe(parentItem.id);
    expect(item?.key).toBe(`${parentItem.id}:${bookmarkedItem.id}`);
  });

  it('builds viewer rows with saved bookmark facts and save-target state', () => {
    const model = buildModel({
      userId: 'viewer_1',
      saveBookmarkTarget: {
        bookmarkLookupIds: ['food_1', 'user_food_1'],
      },
    });
    const mapGroups = buildMapProjection(model);

    expect(model.isOwner).toBe(false);
    expect(model.subtitle).toBe("Nina's list · 2 restaurants\nPlaces to try");
    expect(model.defaultList?.id).toBe('saved_list');
    expect(model.nonDefaultLists.map((list) => list.id)).toEqual(['personal_list']);
    expect(Array.from(model.alreadySavedListIdsForTarget).sort()).toEqual(['personal_list', 'saved_list']);
    expect(model.restaurantRows[0]?.bookmarkedItems).toMatchObject([
      {
        name: 'Pancakes',
        isSaved: true,
        photoEntries: [
          { id: 'photo_1', ownerLabel: 'Ari' },
          { id: 'photo_2', ownerLabel: 'Ari' },
        ],
      },
    ]);
    expect(mapGroups[0]?.summary).toBe('1. 1 recommended item');
    expect(mapGroups[0]?.items[0]).toMatchObject({
      name: 'Pancakes',
      notes: 'Great patio',
      photoCount: 2,
    });
  });

  it('deduplicates viewer rows by normalized menu item name', () => {
    const detail = buildDetail();
    const alphaItem = detail.items.find((item) => item.restaurantId === 'restaurant_1');

    if (!alphaItem) {
      throw new Error('Expected Alpha Cafe fixture row');
    }

    alphaItem.bookmarkedItems = [
      ...alphaItem.bookmarkedItems,
      {
        id: 'food_1_repeat',
        listItemId: 'list_item_1',
        name: ' pancakes ',
        rating: 8,
        visitedAt: '2025-05-01T00:00:00.000Z',
        sourceUserId: 'friend_2',
        sourceUserName: 'Ari',
        userFoodItemId: 'user_food_1_repeat',
        userFoodItemRating: 9,
      },
    ];
    detail.bookmarkState.savedListIdsByBookmarkLookupId.food_1_repeat = ['saved_list'];
    detail.bookmarkState.savedListIdsByBookmarkLookupId.user_food_1_repeat = ['personal_list'];

    const model = buildModel({
      detail,
      userId: 'viewer_1',
    });
    const mapGroups = buildMapProjection(model);

    expect(model.restaurantRows[0]?.bookmarkedItems).toHaveLength(1);
    expect(model.restaurantRows[0]?.bookmarkedItems[0]).toMatchObject({
      name: 'Pancakes',
      isSaved: true,
    });
    expect(model.restaurantRows[0]?.bookmarkedItems[0]?.bookmarkLookupIds.sort()).toEqual([
      'food_1',
      'food_1_repeat',
      'user_food_1',
      'user_food_1_repeat',
    ]);
    expect(mapGroups[0]?.summary).toBe('1. 1 recommended item');
  });

  it('surfaces empty-list facts', () => {
    const model = buildModel({
      detail: buildDetail({
        list: buildList({ restaurantCount: 0 }),
        items: [],
        photoPreviews: [],
      }),
    });

    expect(model.groupedRestaurants).toEqual([]);
    expect(model.restaurantRows).toEqual([]);
    expect(buildMapProjection(model)).toEqual([]);
    expect(model.emptyRestaurantsDescription).toBe('Use Add Visit Ratings to List to save your first restaurant.');
    expect(model.subtitle).toBe('0 restaurants\nPlaces to try');
  });

  it('uses bookmark-oriented empty copy and map summary for the default list', () => {
    const model = buildModel({
      detail: buildDetail({
        list: buildList({
          isDefault: true,
          name: 'Want to Try',
          restaurantCount: 1,
        }),
        items: [
          {
            id: 'restaurant_bookmark_1',
            listId: 'list_1',
            restaurantId: 'restaurant_1',
            restaurantName: 'Alpha Cafe',
            restaurantLocation: '100 Main St',
            restaurantCity: 'Berkeley',
            restaurantCuisineType: 'Cafe',
            restaurantVisibility: 'friends',
            latitude: 37.8715,
            longitude: -122.273,
            position: 1,
            bookmarkedItems: [],
            friendOverlapCount: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    });
    const mapGroups = buildMapProjection(model);

    expect(model.isDefaultList).toBe(true);
    expect(model.groupedRestaurants[0]?.restaurantBookmarkListItemId).toBe('restaurant_bookmark_1');
    expect(model.groupedRestaurants[0]?.friendOverlapCount).toBe(2);
    expect(model.restaurantRows[0]?.ownerItems).toEqual([]);
    expect(mapGroups[0]?.summary).toBe('1. bookmarked restaurant');
    expect(
      buildModel({
        detail: buildDetail({
          list: buildList({ isDefault: true, name: 'Want to Try', restaurantCount: 0 }),
          items: [],
        }),
      }).emptyRestaurantsDescription,
    ).toBe('Bookmark restaurants and recommendations from Food Discovery or your feed to save them here.');
  });

  it('does not copy friend overlap onto menu-item-only bookmark rows', () => {
    const model = buildModel({
      detail: buildDetail({
        list: buildList({
          isDefault: true,
          name: 'Want to Try',
          restaurantCount: 1,
        }),
        items: [
          {
            id: 'menu_item_bookmark_1',
            listId: 'list_1',
            restaurantId: 'restaurant_1',
            restaurantName: 'Alpha Cafe',
            restaurantCity: 'Berkeley',
            restaurantCuisineType: 'Cafe',
            restaurantVisibility: 'friends',
            position: 1,
            bookmarkedItems: [
              {
                id: 'food_1',
                listItemId: 'menu_item_bookmark_1',
                name: 'Pancakes',
                rating: 9,
              },
            ],
            friendOverlapCount: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    });

    expect(model.groupedRestaurants[0]?.restaurantBookmarkListItemId).toBeUndefined();
    expect(model.groupedRestaurants[0]?.friendOverlapCount).toBeUndefined();
    expect(model.restaurantRows[0]?.ownerItems).toHaveLength(1);
  });

  it('keeps cached rows renderable on refresh errors', () => {
    const model = buildModel({ isError: true });

    expect(model.hasBlockingListItemsError).toBe(false);
    expect(model.hasListItemsRefreshError).toBe(true);
    expect(model.restaurantRows).toHaveLength(2);
  });

  it('treats an error without cached detail as blocking', () => {
    const model = buildModel({
      detail: undefined,
      isError: true,
      isLoading: false,
    });

    expect(model.hasBlockingListItemsError).toBe(true);
    expect(model.hasListItemsRefreshError).toBe(false);
    expect(model.list).toBeNull();
  });

  it('builds unauthenticated shared-link rows without authenticated viewer fields', () => {
    const detail: SharedRestaurantListDetailRecord = {
      list: {
        id: 'shared_list',
        name: 'Nina Picks',
        description: 'Neighborhood favorites',
        ownerName: 'Nina',
        restaurantCount: 1,
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      items: [
        {
          id: 'shared_item',
          listId: 'shared_list',
          restaurantId: 'restaurant_1',
          restaurantName: 'Alpha Cafe',
          restaurantCity: 'Berkeley',
          restaurantCuisineType: 'Cafe',
          restaurantVisibility: 'private',
          position: 1,
          note: 'Great patio',
          bookmarkedItems: [
            {
              id: 'food_1',
              listItemId: 'source_shared_item',
              name: 'Pancakes',
              rating: 9,
              sourceUserId: 'friend_1',
              sourceUserName: 'Ari',
              userFoodItemId: 'user_food_1',
            },
            {
              id: 'food_2',
              listItemId: 'shared_item',
              name: ' pancakes ',
              rating: 8,
            },
          ],
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      bookmarkState: {
        savedListIdsByBookmarkLookupId: {
          food_2: ['saved_elsewhere'],
        },
      },
      photoPreviews: [
        {
          id: 'shared_photo',
          food_item: 'user_food_1',
          photo: 'shared-photo.jpg',
          created: '2026-04-01T00:00:00.000Z',
        },
      ],
      viewerLists: [],
    };

    const model = buildRestaurantListDetailReadModel({
      variant: 'shared',
      detail,
      locallySavedDefaultBookmarkLookupIds: new Set<string>(),
    });

    expect(model.subtitle).toBe("Nina's list · 1 restaurant\nNeighborhood favorites");
    expect(model.restaurantRows).toHaveLength(1);
    expect(model.restaurantRows[0]).toMatchObject({
      isRestaurantLocked: true,
      primaryMetaLabel: 'Berkeley',
      secondaryMetaLabel: 'Cafe',
      group: {
        notes: ['Great patio'],
      },
      bookmarkedItems: [
        {
          name: 'Pancakes',
          listItemId: 'source_shared_item',
          isSaved: true,
          bookmarkLookupIds: ['food_1', 'user_food_1', 'food_2'],
          photoEntries: [
            {
              id: 'shared_photo',
              ownerLabel: 'Shared list',
            },
          ],
        },
      ],
    });
  });

  it('derives shared Want to Try state from the viewer default list and local saves', () => {
    const detail: SharedRestaurantListDetailRecord = {
      list: {
        id: 'shared_list',
        name: 'Nina Picks',
        restaurantCount: 1,
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      items: [
        {
          id: 'shared_item',
          listId: 'shared_list',
          restaurantId: 'restaurant_1',
          restaurantName: 'Alpha Cafe',
          position: 1,
          bookmarkedItems: [
            {
              id: 'food_saved',
              listItemId: 'shared_item',
              name: 'Pancakes',
              rating: 9,
            },
            {
              id: 'food_local',
              listItemId: 'shared_item',
              name: 'Waffles',
              rating: 8,
            },
          ],
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      bookmarkState: {
        savedListIdsByBookmarkLookupId: {
          food_saved: ['want_to_try'],
        },
      },
      photoPreviews: [],
      viewerLists: [
        buildList({
          id: 'want_to_try',
          isDefault: true,
          userId: 'viewer_1',
        }),
      ],
    };

    const model = buildRestaurantListDetailReadModel({
      variant: 'shared',
      detail,
      locallySavedDefaultBookmarkLookupIds: new Set(['food_local']),
    });

    expect(model.defaultList?.id).toBe('want_to_try');
    expect(model.restaurantRows[0]?.bookmarkedItems.map((item) => item.isSaved)).toEqual([
      true,
      true,
    ]);
  });
});
