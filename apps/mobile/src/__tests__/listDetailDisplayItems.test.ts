import { buildOwnerDisplayItems, type GroupedBookmarkedItem } from '../features';

function buildItem(overrides: Partial<GroupedBookmarkedItem> = {}): GroupedBookmarkedItem {
  return {
    key: 'list_item_1:food_item_1',
    bookmarkLookupIds: ['food_item_1'],
    foodItemId: 'food_item_1',
    listItemId: 'list_item_1',
    name: 'Noodles',
    rating: 4,
    visitedAt: '2026-01-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildOwnerDisplayItems', () => {
  it('collapses a source bookmark and linked user rating into one owner row', () => {
    const rows = buildOwnerDisplayItems([
      buildItem({
        foodItemId: 'friend_food_item',
        listItemId: 'source_list_item',
        sourceUserId: 'friend_1',
        sourceUserName: 'Friend',
      }),
      buildItem({
        foodItemId: 'friend_food_item',
        listItemId: 'linked_list_item',
        userFoodItemId: 'user_food_item',
        userFoodItemRating: 5,
        userFoodItemVisitedAt: '2026-02-03T00:00:00.000Z',
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'noodles',
      name: 'Noodles',
      source: {
        foodItemId: 'friend_food_item',
        listItemId: 'source_list_item',
        sourceUserName: 'Friend',
      },
      user: {
        kind: 'linked',
        listItemId: 'linked_list_item',
        rating: 5,
        userFoodItemId: 'user_food_item',
      },
    });
  });

  it('keeps a standalone owner rating visible when there is no source bookmark', () => {
    const rows = buildOwnerDisplayItems([
      buildItem({
        sourceUserId: undefined,
        sourceUserName: undefined,
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBeUndefined();
    expect(rows[0]?.user).toMatchObject({
      kind: 'standalone',
      foodItemId: 'food_item_1',
      listItemId: 'list_item_1',
      rating: 4,
    });
  });

  it('replaces a standalone rating with a linked user rating for the same item name', () => {
    const rows = buildOwnerDisplayItems([
      buildItem({
        listItemId: 'standalone_list_item',
        rating: 3,
        sourceUserId: undefined,
        sourceUserName: undefined,
      }),
      buildItem({
        listItemId: 'linked_list_item',
        rating: 4,
        userFoodItemId: 'user_food_item',
        userFoodItemRating: 5,
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.user).toMatchObject({
      kind: 'linked',
      listItemId: 'linked_list_item',
      rating: 5,
      userFoodItemId: 'user_food_item',
    });
  });

  it('preserves stable fallback keys for blank duplicate names', () => {
    const rows = buildOwnerDisplayItems([
      buildItem({
        foodItemId: 'food_item_blank_1',
        listItemId: 'list_item_blank_1',
        name: '',
      }),
      buildItem({
        foodItemId: 'food_item_blank_2',
        listItemId: 'list_item_blank_2',
        name: '',
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe('list_item_blank_1:food_item_blank_1');
    expect(rows[0]?.orderIndex).toBe(0);
  });
});
