import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import {
  addRestaurantVisitRatingsToList,
  createDefaultRestaurantList,
  createRestaurantList,
  deleteRestaurantList,
  moveRestaurantListRestaurant,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  saveRestaurantFoodItemToList,
  updateRestaurantList,
} from '../features/store/restaurantListsStore';
import {
  invalidateRestaurantListCollectionQueries,
  invalidateRestaurantListContentQueries,
  invalidateRestaurantListMetadataQueries,
  invalidateRestaurantListSaveTargetQueries,
  removeRestaurantListQueries,
  upsertRestaurantListInCollectionCaches,
} from '../features/store/restaurantListQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useRestaurantListWrites } from '../features/store/useRestaurantListWrites';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/restaurantListsStore', () => ({
  addRestaurantVisitRatingsToList: jest.fn(),
  createDefaultRestaurantList: jest.fn(),
  createRestaurantList: jest.fn(),
  deleteRestaurantList: jest.fn(),
  moveRestaurantListRestaurant: jest.fn(),
  removeRestaurantListSourceRating: jest.fn(),
  removeRestaurantListUserRating: jest.fn(),
  saveRestaurantFoodItemToList: jest.fn(),
  updateRestaurantList: jest.fn(),
}));

jest.mock('../features/store/restaurantListQuery', () => ({
  invalidateRestaurantListCollectionQueries: jest.fn(),
  invalidateRestaurantListContentQueries: jest.fn(),
  invalidateRestaurantListMetadataQueries: jest.fn(),
  invalidateRestaurantListSaveTargetQueries: jest.fn(),
  removeRestaurantListQueries: jest.fn(),
  upsertRestaurantListInCollectionCaches: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedAddRestaurantVisitRatingsToList =
  addRestaurantVisitRatingsToList as jest.MockedFunction<typeof addRestaurantVisitRatingsToList>;
const mockedCreateDefaultRestaurantList =
  createDefaultRestaurantList as jest.MockedFunction<typeof createDefaultRestaurantList>;
const mockedCreateRestaurantList = createRestaurantList as jest.MockedFunction<typeof createRestaurantList>;
const mockedDeleteRestaurantList = deleteRestaurantList as jest.MockedFunction<typeof deleteRestaurantList>;
const mockedMoveRestaurantListRestaurant =
  moveRestaurantListRestaurant as jest.MockedFunction<typeof moveRestaurantListRestaurant>;
const mockedRemoveRestaurantListSourceRating =
  removeRestaurantListSourceRating as jest.MockedFunction<typeof removeRestaurantListSourceRating>;
const mockedRemoveRestaurantListUserRating =
  removeRestaurantListUserRating as jest.MockedFunction<typeof removeRestaurantListUserRating>;
const mockedSaveRestaurantFoodItemToList =
  saveRestaurantFoodItemToList as jest.MockedFunction<typeof saveRestaurantFoodItemToList>;
const mockedUpdateRestaurantList = updateRestaurantList as jest.MockedFunction<typeof updateRestaurantList>;
const mockedInvalidateRestaurantListCollectionQueries =
  invalidateRestaurantListCollectionQueries as jest.MockedFunction<typeof invalidateRestaurantListCollectionQueries>;
const mockedInvalidateRestaurantListContentQueries =
  invalidateRestaurantListContentQueries as jest.MockedFunction<typeof invalidateRestaurantListContentQueries>;
const mockedInvalidateRestaurantListMetadataQueries =
  invalidateRestaurantListMetadataQueries as jest.MockedFunction<typeof invalidateRestaurantListMetadataQueries>;
const mockedInvalidateRestaurantListSaveTargetQueries =
  invalidateRestaurantListSaveTargetQueries as jest.MockedFunction<typeof invalidateRestaurantListSaveTargetQueries>;
const mockedRemoveRestaurantListQueries =
  removeRestaurantListQueries as jest.MockedFunction<typeof removeRestaurantListQueries>;
const mockedUpsertRestaurantListInCollectionCaches =
  upsertRestaurantListInCollectionCaches as jest.MockedFunction<typeof upsertRestaurantListInCollectionCaches>;
const mockedUseOfflineAwareFeatureWrite =
  useOfflineAwareFeatureWrite as jest.MockedFunction<typeof useOfflineAwareFeatureWrite>;
const mockedShowQueuedOfflineAlert = showQueuedOfflineAlert as jest.MockedFunction<
  typeof showQueuedOfflineAlert
>;

describe('useRestaurantListWrites', () => {
  const queryClient = {
    invalidateQueries: jest.fn(),
    removeQueries: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQueryClient.mockReturnValue(queryClient as unknown as ReturnType<typeof useQueryClient>);
    mockedAddRestaurantVisitRatingsToList.mockResolvedValue([]);
    mockedCreateDefaultRestaurantList.mockResolvedValue({ id: 'default_list_1' } as never);
    mockedCreateRestaurantList.mockResolvedValue({ id: 'list_1' } as never);
    mockedDeleteRestaurantList.mockResolvedValue(undefined);
    mockedMoveRestaurantListRestaurant.mockResolvedValue([]);
    mockedRemoveRestaurantListSourceRating.mockResolvedValue([]);
    mockedRemoveRestaurantListUserRating.mockResolvedValue([]);
    mockedSaveRestaurantFoodItemToList.mockResolvedValue([]);
    mockedUpdateRestaurantList.mockResolvedValue({ id: 'list_1' } as never);
    mockedInvalidateRestaurantListCollectionQueries.mockResolvedValue(undefined);
    mockedInvalidateRestaurantListContentQueries.mockResolvedValue(undefined);
    mockedInvalidateRestaurantListMetadataQueries.mockResolvedValue(undefined);
    mockedInvalidateRestaurantListSaveTargetQueries.mockResolvedValue(undefined);
    mockedRemoveRestaurantListQueries.mockImplementation(() => undefined);
    mockedUpsertRestaurantListInCollectionCaches.mockImplementation(() => undefined);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useRestaurantListWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useRestaurantListWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useRestaurantListWrites();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!hook || !renderer) {
      throw new Error('Expected hook to render.');
    }

    return { hook, renderer };
  }

  it('runs list creation online and applies collection cache effects', async () => {
    const createdList = { id: 'list_1', name: 'Pizza' };
    mockedCreateRestaurantList.mockResolvedValue(createdList as never);
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const input = {
      name: 'Pizza',
      description: '',
      visibility: 'friends' as const,
    };

    let result: Awaited<ReturnType<typeof hook.createRestaurantList>> | undefined;
    await act(async () => {
      result = await hook.createRestaurantList({ input });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'list.create',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
      }),
    );
    expect(mockedCreateRestaurantList).toHaveBeenCalledWith(input);
    expect(mockedUpsertRestaurantListInCollectionCaches).toHaveBeenCalledWith(queryClient, createdList, 'my');
    expect(mockedInvalidateRestaurantListCollectionQueries).toHaveBeenCalledWith(queryClient);
    expect(result).toEqual({ status: 'completed', result: createdList });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues list creation with an optimistic collection cache entry', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const input = {
      name: 'Pizza',
      description: '',
      visibility: 'friends' as const,
    };
    const optimisticQueuedList = { id: 'offline-list-1', name: 'Pizza' };

    let result: Awaited<ReturnType<typeof hook.createRestaurantList>> | undefined;
    await act(async () => {
      result = await hook.createRestaurantList({
        input,
        optimisticQueuedList: optimisticQueuedList as never,
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'list.create',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
      }),
    );
    expect(mockedCreateRestaurantList).not.toHaveBeenCalled();
    expect(mockedUpsertRestaurantListInCollectionCaches).toHaveBeenCalledWith(
      queryClient,
      optimisticQueuedList,
      'my',
    );
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('List');
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('runs list deletion online and applies list removal cache effects', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.deleteRestaurantList>> | undefined;
    await act(async () => {
      result = await hook.deleteRestaurantList({ listId: 'list_1' });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'list.delete',
        offline: {
          strategy: 'outbox',
          payload: { listId: 'list_1' },
        },
      }),
    );
    expect(mockedDeleteRestaurantList).toHaveBeenCalledWith('list_1');
    expect(mockedInvalidateRestaurantListCollectionQueries).toHaveBeenCalledWith(queryClient);
    expect(mockedRemoveRestaurantListQueries).toHaveBeenCalledWith(queryClient, 'list_1');
    expect(mockedShowQueuedOfflineAlert).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'completed', result: undefined });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues list deletion through the feature outbox payload and applies removal cache effects', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.deleteRestaurantList>> | undefined;
    await act(async () => {
      result = await hook.deleteRestaurantList({ listId: 'list_1' });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'list.delete',
        offline: {
          strategy: 'outbox',
          payload: { listId: 'list_1' },
        },
      }),
    );
    expect(mockedDeleteRestaurantList).not.toHaveBeenCalled();
    expect(mockedInvalidateRestaurantListCollectionQueries).toHaveBeenCalledWith(queryClient);
    expect(mockedRemoveRestaurantListQueries).toHaveBeenCalledWith(queryClient, 'list_1');
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('List delete');
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('updates list metadata through the feature outbox payload', async () => {
    const updatedList = { id: 'list_1', name: 'Updated' };
    mockedUpdateRestaurantList.mockResolvedValue(updatedList as never);
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const updates = {
      name: 'Updated',
      description: 'New description',
      visibility: 'private' as const,
    };

    let result: Awaited<ReturnType<typeof hook.updateRestaurantList>> | undefined;
    await act(async () => {
      result = await hook.updateRestaurantList({
        currentList: { isDefault: false },
        listId: 'list_1',
        updates,
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'list.update',
        offline: {
          strategy: 'outbox',
          payload: {
            listId: 'list_1',
            updates,
          },
        },
      }),
    );
    expect(mockedUpdateRestaurantList).toHaveBeenCalledWith('list_1', updates, { isDefault: false });
    expect(mockedInvalidateRestaurantListMetadataQueries).toHaveBeenCalledWith(queryClient, 'list_1');
    expect(result).toEqual({ status: 'completed', result: updatedList });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('creates the default list through the write module', async () => {
    const defaultList = { id: 'default_list_1' };
    mockedCreateDefaultRestaurantList.mockResolvedValue(defaultList as never);
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.createDefaultRestaurantList>> | undefined;
    await act(async () => {
      result = await hook.createDefaultRestaurantList();
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'list.default.create',
        offline: {
          strategy: 'outbox',
          payload: {},
        },
      }),
    );
    expect(mockedCreateDefaultRestaurantList).toHaveBeenCalledTimes(1);
    expect(mockedInvalidateRestaurantListCollectionQueries).toHaveBeenCalledWith(queryClient, 'my');
    expect(result).toEqual({ status: 'completed', result: defaultList });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('runs source rating removal online and invalidates membership caches', async () => {
    const updatedItems = [{ id: 'item_1' }];
    mockedRemoveRestaurantListSourceRating.mockResolvedValue(updatedItems as never);
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.removeRestaurantListSourceRating>> | undefined;
    await act(async () => {
      result = await hook.removeRestaurantListSourceRating({
        listId: 'list_1',
        listItemId: 'item_1',
        foodItemId: 'food_item_1',
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'list.restaurant.remove.source',
        offline: {
          strategy: 'outbox',
          payload: {
            listId: 'list_1',
            listItemId: 'item_1',
            foodItemId: 'food_item_1',
          },
        },
      }),
    );
    expect(mockedRemoveRestaurantListSourceRating).toHaveBeenCalledWith({
      listId: 'list_1',
      listItemId: 'item_1',
      foodItemId: 'food_item_1',
    });
    expect(mockedInvalidateRestaurantListContentQueries).toHaveBeenCalledWith(queryClient, 'list_1', {
      includeCandidateRestaurants: true,
    });
    expect(result).toEqual({ status: 'completed', result: updatedItems });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('runs restaurant reorder online and invalidates membership caches', async () => {
    const updatedItems = [{ id: 'item_1' }];
    mockedMoveRestaurantListRestaurant.mockResolvedValue(updatedItems as never);
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.reorderRestaurant>> | undefined;
    await act(async () => {
      result = await hook.reorderRestaurant({
        listId: 'list_1',
        restaurantId: 'restaurant_1',
        direction: 'up',
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'list.restaurant.reorder',
        offline: {
          strategy: 'outbox',
          payload: {
            listId: 'list_1',
            restaurantId: 'restaurant_1',
            direction: 'up',
          },
        },
      }),
    );
    expect(mockedMoveRestaurantListRestaurant).toHaveBeenCalledWith({
      listId: 'list_1',
      restaurantId: 'restaurant_1',
      direction: 'up',
    });
    expect(mockedInvalidateRestaurantListContentQueries).toHaveBeenCalledWith(queryClient, 'list_1', {
      includeCandidateRestaurants: true,
    });
    expect(result).toEqual({ status: 'completed', result: updatedItems });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('adds restaurant visit ratings through the write module and invalidates membership caches', async () => {
    const updatedItems = [{ id: 'item_1' }];
    mockedAddRestaurantVisitRatingsToList.mockResolvedValue(updatedItems as never);
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const input = {
      listId: 'list_1',
      restaurantId: 'restaurant_1',
      foodItemIds: ['food_item_1'],
      note: 'Great fries',
    };

    let result: Awaited<ReturnType<typeof hook.addRestaurant>> | undefined;
    await act(async () => {
      result = await hook.addRestaurant(input);
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'list.restaurant.add',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
      }),
    );
    expect(mockedAddRestaurantVisitRatingsToList).toHaveBeenCalledWith(input);
    expect(mockedInvalidateRestaurantListContentQueries).toHaveBeenCalledWith(queryClient, 'list_1', {
      includeCandidateRestaurants: true,
    });
    expect(result).toEqual({ status: 'completed', result: updatedItems });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues user rating removal through the feature outbox payload', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.removeRestaurantListUserRating>> | undefined;
    await act(async () => {
      result = await hook.removeRestaurantListUserRating({
        listId: 'list_1',
        listItemId: 'item_1',
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'list.restaurant.remove.user',
        offline: {
          strategy: 'outbox',
          payload: {
            listId: 'list_1',
            listItemId: 'item_1',
          },
        },
      }),
    );
    expect(mockedRemoveRestaurantListUserRating).not.toHaveBeenCalled();
    expect(mockedInvalidateRestaurantListContentQueries).toHaveBeenCalledWith(queryClient, 'list_1', {
      includeCandidateRestaurants: true,
    });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('List update');
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues bookmark saves for each target list and invalidates save target caches once', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.saveBookmarkToLists>> | undefined;
    await act(async () => {
      result = await hook.saveBookmarkToLists({
        sourceListId: 'source_list_1',
        listIds: ['target_list_1', 'target_list_2'],
        bookmark: {
          restaurantId: 'restaurant_1',
          foodItemId: 'food_item_1',
          note: 'Try the noodles',
          sourceUserId: 'source_user_1',
        },
      });
    });

    expect(writeFeature).toHaveBeenCalledTimes(2);
    expect(writeFeature).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationName: 'list.bookmark.save',
        offline: {
          strategy: 'outbox',
          payload: {
            listId: 'target_list_1',
            restaurantId: 'restaurant_1',
            foodItemId: 'food_item_1',
            note: 'Try the noodles',
            sourceUserId: 'source_user_1',
          },
        },
      }),
    );
    expect(writeFeature).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        operationName: 'list.bookmark.save',
        offline: {
          strategy: 'outbox',
          payload: {
            listId: 'target_list_2',
            restaurantId: 'restaurant_1',
            foodItemId: 'food_item_1',
            note: 'Try the noodles',
            sourceUserId: 'source_user_1',
          },
        },
      }),
    );
    expect(mockedSaveRestaurantFoodItemToList).not.toHaveBeenCalled();
    expect(mockedInvalidateRestaurantListSaveTargetQueries).toHaveBeenCalledWith(
      queryClient,
      'source_list_1',
    );
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('Bookmark save');
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('creates the default list online before saving a quick bookmark when no default exists', async () => {
    const savedItems = [{ id: 'saved_item_1' }];
    mockedSaveRestaurantFoodItemToList.mockResolvedValue(savedItems as never);
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.saveBookmarkToDefaultList>> | undefined;
    await act(async () => {
      result = await hook.saveBookmarkToDefaultList({
        sourceListId: 'source_list_1',
        bookmark: {
          restaurantId: 'restaurant_1',
          foodItemId: 'food_item_1',
          note: 'Try the noodles',
          sourceUserId: 'source_user_1',
        },
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'list.default.bookmark.save',
        offline: {
          strategy: 'outbox',
          payload: {
            restaurantId: 'restaurant_1',
            foodItemId: 'food_item_1',
            note: 'Try the noodles',
            sourceUserId: 'source_user_1',
          },
        },
      }),
    );
    expect(mockedCreateDefaultRestaurantList).toHaveBeenCalledTimes(1);
    expect(mockedSaveRestaurantFoodItemToList).toHaveBeenCalledWith({
      listId: 'default_list_1',
      restaurantId: 'restaurant_1',
      foodItemId: 'food_item_1',
      note: 'Try the noodles',
      sourceUserId: 'source_user_1',
    });
    expect(mockedInvalidateRestaurantListSaveTargetQueries).toHaveBeenCalledWith(
      queryClient,
      'source_list_1',
    );
    expect(result).toEqual({ status: 'completed', result: [savedItems] });

    await act(async () => {
      renderer.unmount();
    });
  });
});
