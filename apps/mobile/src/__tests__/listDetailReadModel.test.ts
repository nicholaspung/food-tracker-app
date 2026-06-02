import type { RestaurantListDetailRecord, RestaurantListRecord } from '../features';
import { buildListDetailReadModel } from '../screens/listDetail/listDetailReadModel';

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

function buildModel(overrides: Partial<Parameters<typeof buildListDetailReadModel>[0]> = {}) {
  return buildListDetailReadModel({
    detail: buildDetail(),
    userId: 'owner_1',
    saveBookmarkTarget: null,
    isError: false,
    isLoading: false,
    ...overrides,
  });
}

describe('buildListDetailReadModel', () => {
  it('builds owner rows with grouped restaurants, owner display rows, map rows, and photo entries', () => {
    const model = buildModel();

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
    expect(model.mapGroups[0]).toMatchObject({
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

  it('builds viewer rows with saved bookmark facts and save-target state', () => {
    const model = buildModel({
      userId: 'viewer_1',
      saveBookmarkTarget: {
        bookmarkLookupIds: ['food_1', 'user_food_1'],
        restaurantId: 'restaurant_1',
        restaurantName: 'Alpha Cafe',
        foodItemId: 'food_1',
        foodItemName: 'Pancakes',
        foodItemRating: 9,
        visitedAt: '2025-02-01T00:00:00.000Z',
        sourceNote: 'Great patio',
      },
    });

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
    expect(model.mapGroups[0]?.summary).toBe('1. 1 recommended item');
    expect(model.mapGroups[0]?.items[0]).toMatchObject({
      name: 'Pancakes',
      notes: 'Great patio',
      photoCount: 2,
    });
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
    expect(model.mapGroups).toEqual([]);
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

    expect(model.isDefaultList).toBe(true);
    expect(model.groupedRestaurants[0]?.restaurantBookmarkListItemId).toBe('restaurant_bookmark_1');
    expect(model.groupedRestaurants[0]?.friendOverlapCount).toBe(2);
    expect(model.restaurantRows[0]?.ownerItems).toEqual([]);
    expect(model.mapGroups[0]?.summary).toBe('1. bookmarked restaurant');
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
});
