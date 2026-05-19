import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import {
  deleteRestaurantList,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
} from '../features/store/restaurantListsStore';
import {
  invalidateRestaurantListCollectionQueries,
  invalidateRestaurantListContentQueries,
  removeRestaurantListQueries,
} from '../features/store/restaurantListQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useRestaurantListWrites } from '../features/store/useRestaurantListWrites';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/restaurantListsStore', () => ({
  deleteRestaurantList: jest.fn(),
  removeRestaurantListSourceRating: jest.fn(),
  removeRestaurantListUserRating: jest.fn(),
}));

jest.mock('../features/store/restaurantListQuery', () => ({
  invalidateRestaurantListCollectionQueries: jest.fn(),
  invalidateRestaurantListContentQueries: jest.fn(),
  removeRestaurantListQueries: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedDeleteRestaurantList = deleteRestaurantList as jest.MockedFunction<typeof deleteRestaurantList>;
const mockedRemoveRestaurantListSourceRating =
  removeRestaurantListSourceRating as jest.MockedFunction<typeof removeRestaurantListSourceRating>;
const mockedRemoveRestaurantListUserRating =
  removeRestaurantListUserRating as jest.MockedFunction<typeof removeRestaurantListUserRating>;
const mockedInvalidateRestaurantListCollectionQueries =
  invalidateRestaurantListCollectionQueries as jest.MockedFunction<typeof invalidateRestaurantListCollectionQueries>;
const mockedInvalidateRestaurantListContentQueries =
  invalidateRestaurantListContentQueries as jest.MockedFunction<typeof invalidateRestaurantListContentQueries>;
const mockedRemoveRestaurantListQueries =
  removeRestaurantListQueries as jest.MockedFunction<typeof removeRestaurantListQueries>;
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
    mockedDeleteRestaurantList.mockResolvedValue(undefined);
    mockedRemoveRestaurantListSourceRating.mockResolvedValue([]);
    mockedRemoveRestaurantListUserRating.mockResolvedValue([]);
    mockedInvalidateRestaurantListCollectionQueries.mockResolvedValue(undefined);
    mockedInvalidateRestaurantListContentQueries.mockResolvedValue(undefined);
    mockedRemoveRestaurantListQueries.mockImplementation(() => undefined);
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
});
