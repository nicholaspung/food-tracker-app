import {
  buildCreateVisitRecommendationSourceParams,
  buildRecommendationBookmarkSourceFields,
  createRecommendationSourceHandoff,
  resolveSharedRecommendationSourceListItemId,
} from '../features/recommendationSourceHandoff';

describe('recommendationSourceHandoff', () => {
  it('normalizes list detail source context for bookmark saves and create visit routes', () => {
    const handoff = createRecommendationSourceHandoff({
      discoverySurface: 'list_detail',
      sourceFoodItemId: ' food-1 ',
      sourceListId: ' list-1 ',
      sourceListItemId: ' list-item-1 ',
      sourceUserId: ' user-1 ',
    });

    expect(handoff).toEqual({
      discoverySurface: 'list_detail',
      sourceFoodItemId: 'food-1',
      sourceListId: 'list-1',
      sourceListItemId: 'list-item-1',
      sourceUserId: 'user-1',
    });
    expect(buildRecommendationBookmarkSourceFields(handoff)).toEqual({
      foodItemId: 'food-1',
      sourceListId: 'list-1',
      sourceListItemId: 'list-item-1',
      sourceUserId: 'user-1',
    });
    expect(buildCreateVisitRecommendationSourceParams(handoff)).toEqual({
      recommendationSource: handoff,
      sourceListId: 'list-1',
      sourceListItemId: 'list-item-1',
    });
  });

  it('uses menu item source over food item source for home friend feed bookmarks', () => {
    const handoff = createRecommendationSourceHandoff({
      discoverySurface: 'home_friend_feed',
      sourceFoodItemId: 'food-1',
      sourceMenuItemId: 'menu-1',
      sourceUserId: 'friend-1',
    });

    expect(buildRecommendationBookmarkSourceFields(handoff)).toEqual({
      menuItemId: 'menu-1',
      sourceUserId: 'friend-1',
    });
  });

  it('requires a source list item for shared restaurant list saves', () => {
    expect(
      resolveSharedRecommendationSourceListItemId(
        createRecommendationSourceHandoff({
          discoverySurface: 'shared_restaurant_list',
          sourceListItemId: ' source-list-item-1 ',
        }),
      ),
    ).toBe('source-list-item-1');

    expect(() =>
      resolveSharedRecommendationSourceListItemId(
        createRecommendationSourceHandoff({
          discoverySurface: 'shared_restaurant_list',
          sourceListItemId: ' ',
        }),
      ),
    ).toThrow('Recommendation source list item is required.');
  });
});
