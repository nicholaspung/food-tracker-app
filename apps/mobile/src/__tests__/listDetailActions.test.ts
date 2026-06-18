import {
  disableShareLinkAction,
  removeSourceRatingAction,
  removeUserRatingAction,
  reorderRestaurantAction,
  resolveListDetailShareUrl,
  saveBookmarkToDefaultListAction,
  shareListLinkAction,
  type ListDetailActionDependencies,
} from '../screens/listDetail/listDetailActions';
import type { RestaurantListRecord } from '../features';
import { createRecommendationSourceHandoff } from '../features/recommendationSourceHandoff';
import type { SaveBookmarkTarget } from '../screens/listDetail/listDetailTypes';

function buildList(overrides: Partial<RestaurantListRecord> = {}): RestaurantListRecord {
  return {
    id: 'list_1',
    name: 'Favorites',
    visibility: 'friends',
    userId: 'owner_1',
    ownerName: 'Owner',
    isDefault: false,
    restaurantCount: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function buildSaveBookmarkTarget(
  overrides: Partial<SaveBookmarkTarget> = {},
): SaveBookmarkTarget {
  return {
    bookmarkLookupIds: ['food_1'],
    restaurantId: 'restaurant_1',
    restaurantName: 'Test Restaurant',
    foodItemId: 'food_1',
    foodItemName: 'Noodles',
    foodItemRating: 8,
    recommendationSource: createRecommendationSourceHandoff({
      discoverySurface: 'list_detail',
      sourceFoodItemId: 'food_1',
      sourceListId: 'list_1',
      sourceListItemId: 'list_item_1',
      sourceUserId: 'owner_1',
    }),
    sourceListItemId: 'list_item_1',
    visitedAt: '2026-01-03T00:00:00.000Z',
    sourceNote: 'Try the broth',
    ...overrides,
  };
}

function createDeps(
  overrides: Partial<ListDetailActionDependencies> = {},
): ListDetailActionDependencies {
  const restaurantListWrites = {
    addRestaurant: jest.fn(),
    createDefaultRestaurantList: jest.fn(),
    createRestaurantList: jest.fn(),
    deleteRestaurantList: jest.fn(),
    reorderRestaurant: jest.fn().mockResolvedValue({ result: [], status: 'completed' }),
    removeBookmarkFromDefaultList: jest.fn().mockResolvedValue({ result: [], status: 'completed' }),
    removeRestaurantListSourceRating: jest.fn().mockResolvedValue({ result: [], status: 'completed' }),
    removeRestaurantListUserRating: jest.fn().mockResolvedValue({ result: [], status: 'completed' }),
    saveBookmarkToDefaultList: jest.fn().mockResolvedValue({ result: [], status: 'completed' }),
    saveBookmarkToLists: jest.fn().mockResolvedValue({ result: [], status: 'completed' }),
    updateRestaurantList: jest.fn(),
  };

  return {
    analyticsContext: {
      source: 'ListDetailScreen',
      isDefaultList: false,
      restaurantCount: 3,
    },
    isOnline: true,
    listId: 'list_1',
    queryClient: {
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
    } as never,
    queryKeys: {
      root: ['feature', 'restaurantLists'],
      detail: (listId: string) => ['feature', 'restaurantListDetail', listId],
    } as never,
    refetchDetail: jest.fn().mockResolvedValue(undefined),
    restaurantListWrites: restaurantListWrites as never,
    share: jest.fn().mockResolvedValue({ action: 'sharedAction' }),
    shareLinkService: {
      disable: jest.fn().mockResolvedValue(undefined),
      getOrCreate: jest.fn().mockResolvedValue({
        path: '/lists/shared/token_1',
      }),
      regenerate: jest.fn().mockResolvedValue({
        url: 'https://example.com/lists/shared/token_2',
      }),
    },
    shareUrlBase: 'https://app.example',
    trackObservabilityEvent: jest.fn(),
    trackProductEvent: jest.fn(),
    ...overrides,
  };
}

describe('listDetailActions', () => {
  it('resolves app-relative share links against the configured web base', () => {
    expect(resolveListDetailShareUrl({ path: '/lists/shared/token_1' }, 'https://app.example/')).toBe(
      'https://app.example/lists/shared/token_1',
    );
    expect(resolveListDetailShareUrl({ url: 'https://server.example/shared/token_1' }, 'https://app.example')).toBe(
      'https://server.example/shared/token_1',
    );
  });

  it('shares list links and refreshes list targets after a completed create action', async () => {
    const deps = createDeps();

    await shareListLinkAction({
      deps,
      isOwner: true,
      list: buildList({ name: 'Random' }),
    });

    expect(deps.shareLinkService.getOrCreate).toHaveBeenCalledWith('list_1');
    expect(deps.share).toHaveBeenCalledWith({
      message: 'View my Yummy Recs list "Random": https://app.example/lists/shared/token_1',
    });
    expect(deps.refetchDetail).toHaveBeenCalled();
    expect(deps.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: deps.queryKeys.root,
    });
    expect(deps.trackProductEvent).toHaveBeenCalledWith('social.invite_shared', {
      source: 'ListDetailScreen',
      shareMethod: 'restaurant_list_link',
    });
  });

  it('reorders restaurants through Restaurant List writes and reports completed outcomes', async () => {
    const deps = createDeps();

    await expect(
      reorderRestaurantAction({
        deps,
        direction: 'up',
        isOwner: true,
        restaurantId: 'restaurant_1',
      }),
    ).resolves.toEqual({ queued: false });

    expect(deps.restaurantListWrites.reorderRestaurant).toHaveBeenCalledWith({
      listId: 'list_1',
      restaurantId: 'restaurant_1',
      direction: 'up',
    });
    expect(deps.trackObservabilityEvent).toHaveBeenCalledWith(
      'LIST_DETAIL_REORDER_SUCCEEDED',
      expect.objectContaining({ queued: false }),
    );
  });

  it('routes source and user rating removals through Restaurant List writes', async () => {
    const deps = createDeps();

    await removeSourceRatingAction({
      deps,
      foodItemId: 'food_1',
      isOwner: true,
      listItemId: 'item_1',
    });
    await removeUserRatingAction({
      deps,
      isOwner: true,
      listItemId: 'item_1',
    });

    expect(deps.restaurantListWrites.removeRestaurantListSourceRating).toHaveBeenCalledWith({
      listId: 'list_1',
      listItemId: 'item_1',
      foodItemId: 'food_1',
    });
    expect(deps.restaurantListWrites.removeRestaurantListUserRating).toHaveBeenCalledWith({
      listId: 'list_1',
      listItemId: 'item_1',
    });
  });

  it('preserves queued bookmark feedback interpretation for default-list saves', async () => {
    const deps = createDeps();
    jest.mocked(deps.restaurantListWrites.saveBookmarkToDefaultList).mockResolvedValue({ status: 'queued' });

    await expect(
      saveBookmarkToDefaultListAction({
        alreadySavedListIdsForTarget: new Set(),
        defaultList: buildList({ id: 'default_list', isDefault: true }),
        deps,
        isOwner: false,
        list: buildList(),
        saveBookmarkTarget: buildSaveBookmarkTarget(),
      }),
    ).resolves.toEqual({ saved: true, queued: true });

    expect(deps.restaurantListWrites.saveBookmarkToDefaultList).toHaveBeenCalledWith({
      defaultListId: 'default_list',
      sourceListId: 'list_1',
      bookmark: {
        restaurantId: 'restaurant_1',
        foodItemId: 'food_1',
        note: 'Try the broth',
        sourceListId: 'list_1',
        sourceListItemId: 'list_item_1',
        sourceUserId: 'owner_1',
      },
    });
    expect(deps.trackProductEvent).toHaveBeenCalledWith(
      'social.recommendation_saved',
      expect.objectContaining({ queued: true, entryMethod: 'quick_default' }),
    );
  });

  it('throws normalized failed remove messages for screen error presentation', async () => {
    const deps = createDeps();
    jest.mocked(deps.restaurantListWrites.removeRestaurantListSourceRating).mockRejectedValue(
      new Error('Cannot remove rating'),
    );

    await expect(
      removeSourceRatingAction({
        deps,
        foodItemId: 'food_1',
        isOwner: true,
        listItemId: 'item_1',
      }),
    ).rejects.toThrow('Cannot remove rating');

    expect(deps.trackObservabilityEvent).toHaveBeenCalledWith(
      'LIST_DETAIL_ITEM_DELETE_FAILED',
      expect.objectContaining({ errorMessage: 'Cannot remove rating' }),
    );
  });

  it('disables share links without mounting the screen', async () => {
    const deps = createDeps();

    await disableShareLinkAction({
      deps,
      isOwner: true,
      list: buildList(),
    });

    expect(deps.shareLinkService.disable).toHaveBeenCalledWith('list_1');
    expect(deps.refetchDetail).toHaveBeenCalled();
  });
});
