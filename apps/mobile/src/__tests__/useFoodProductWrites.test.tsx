import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { completeSourceNoteAfterEntryWrite } from '../features/notes/sourceNoteCompletion';
import {
  createFoodProduct,
  deleteFoodProduct,
  updateFoodProduct,
} from '../features/store/foodProductsStore';
import { syncFoodProductMutationCaches } from '../features/store/foodProductsQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useFoodProductWrites } from '../features/store/useFoodProductWrites';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/notes/sourceNoteCompletion', () => ({
  completeSourceNoteAfterEntryWrite: jest.fn(),
}));

jest.mock('../features/store/foodProductsStore', () => ({
  createFoodProduct: jest.fn(),
  deleteFoodProduct: jest.fn(),
  updateFoodProduct: jest.fn(),
}));

jest.mock('../features/store/foodProductsQuery', () => ({
  syncFoodProductMutationCaches: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCompleteSourceNoteAfterEntryWrite =
  completeSourceNoteAfterEntryWrite as jest.MockedFunction<typeof completeSourceNoteAfterEntryWrite>;
const mockedCreateFoodProduct = createFoodProduct as jest.MockedFunction<typeof createFoodProduct>;
const mockedDeleteFoodProduct = deleteFoodProduct as jest.MockedFunction<typeof deleteFoodProduct>;
const mockedUpdateFoodProduct = updateFoodProduct as jest.MockedFunction<typeof updateFoodProduct>;
const mockedSyncFoodProductMutationCaches =
  syncFoodProductMutationCaches as jest.MockedFunction<typeof syncFoodProductMutationCaches>;
const mockedUseOfflineAwareFeatureWrite =
  useOfflineAwareFeatureWrite as jest.MockedFunction<typeof useOfflineAwareFeatureWrite>;
const mockedShowQueuedOfflineAlert = showQueuedOfflineAlert as jest.MockedFunction<
  typeof showQueuedOfflineAlert
>;

describe('useFoodProductWrites', () => {
  const queryClient = {};
  const createInput = {
    itemName: 'Chocolate Bar',
    rating: 4,
    visibility: 'friends' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQueryClient.mockReturnValue(queryClient as ReturnType<typeof useQueryClient>);
    mockedCompleteSourceNoteAfterEntryWrite.mockResolvedValue(undefined);
    mockedCreateFoodProduct.mockResolvedValue({ id: 'food_product_1' } as never);
    mockedDeleteFoodProduct.mockResolvedValue(undefined);
    mockedUpdateFoodProduct.mockResolvedValue({ id: 'food_product_1' } as never);
    mockedSyncFoodProductMutationCaches.mockResolvedValue(undefined);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useFoodProductWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useFoodProductWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useFoodProductWrites();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!hook || !renderer) {
      throw new Error('Expected hook to render.');
    }

    return {
      hook,
      renderer,
    };
  }

  it('creates Food Products through the outbox payload and syncs completed caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.createFoodProduct>> | undefined;
    await act(async () => {
      result = await hook.createFoodProduct({
        input: createInput,
        includeUsage: false,
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'food-product.create',
        offline: {
          strategy: 'outbox',
          payload: createInput,
        },
      }),
    );
    expect(mockedCreateFoodProduct).toHaveBeenCalledWith(createInput);
    expect(mockedSyncFoodProductMutationCaches).toHaveBeenCalledWith(queryClient, {
      foodProduct: expect.objectContaining({ id: 'food_product_1' }),
      includeUsage: false,
      sourceNoteId: undefined,
    });
    expect(result).toEqual({
      status: 'completed',
      result: { id: 'food_product_1' },
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues Food Product creation and persists source Note completion', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.createFoodProduct>> | undefined;
    await act(async () => {
      result = await hook.createFoodProduct({
        input: { ...createInput, sourceNoteId: 'note_1' },
        includeUsage: true,
        sourceNote: {
          noteId: 'note_1',
          usedAt: '2026-05-20T00:00:00.000Z',
        },
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'food-product.create',
        offline: {
          strategy: 'outbox',
          payload: { ...createInput, sourceNoteId: 'note_1' },
        },
      }),
    );
    expect(mockedCreateFoodProduct).not.toHaveBeenCalled();
    expect(mockedCompleteSourceNoteAfterEntryWrite).toHaveBeenCalledWith({
      entryWriteStatus: 'queued',
      noteId: 'note_1',
      queryClient,
      usedAt: '2026-05-20T00:00:00.000Z',
      writeFeature,
    });
    expect(mockedSyncFoodProductMutationCaches).toHaveBeenCalledWith(queryClient, {
      includeUsage: true,
      sourceNoteId: 'note_1',
    });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'useFoodProductWrites',
      subject: 'Food product',
    });
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('updates Food Products through the outbox payload and syncs update caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const updates = {
      itemName: 'Updated Bar',
      rating: 5,
    };

    await act(async () => {
      await hook.updateFoodProduct({
        foodProductId: 'food_product_1',
        updates,
        includeFoodProductPhotos: true,
        includeUsage: true,
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'food-product.update',
        offline: {
          strategy: 'outbox',
          payload: {
            foodProductId: 'food_product_1',
            updates,
          },
        },
      }),
    );
    expect(mockedUpdateFoodProduct).toHaveBeenCalledWith('food_product_1', updates);
    expect(mockedSyncFoodProductMutationCaches).toHaveBeenCalledWith(queryClient, {
      foodProduct: expect.objectContaining({ id: 'food_product_1' }),
      includeFoodProductPhotos: true,
      includeUsage: true,
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues Food Product updates and deletes through domain write actions', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await act(async () => {
      await hook.updateFoodProduct({
        foodProductId: 'food_product_1',
        updates: { rating: 3 },
        includeFoodProductPhotos: false,
        includeUsage: false,
      });
      await hook.deleteFoodProduct({ foodProductId: 'food_product_1' });
    });

    expect(writeFeature).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationName: 'food-product.update',
        offline: {
          strategy: 'outbox',
          payload: {
            foodProductId: 'food_product_1',
            updates: { rating: 3 },
          },
        },
      }),
    );
    expect(writeFeature).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        operationName: 'food-product.delete',
        offline: {
          strategy: 'outbox',
          payload: { foodProductId: 'food_product_1' },
        },
      }),
    );
    expect(mockedSyncFoodProductMutationCaches).toHaveBeenCalledWith(queryClient, {
      foodProductId: 'food_product_1',
      includeFoodProductPhotos: false,
      includeUsage: false,
    });
    expect(mockedSyncFoodProductMutationCaches).toHaveBeenCalledWith(queryClient, {
      foodProductId: 'food_product_1',
    });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'useFoodProductWrites',
      subject: 'Food product update',
    });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('Food product delete');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('deletes Food Products through the shared submit lifecycle and syncs completed caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.deleteFoodProduct>> | undefined;
    await act(async () => {
      result = await hook.deleteFoodProduct({ foodProductId: 'food_product_1' });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'food-product.delete',
        offline: {
          strategy: 'outbox',
          payload: { foodProductId: 'food_product_1' },
        },
      }),
    );
    expect(mockedDeleteFoodProduct).toHaveBeenCalledWith('food_product_1');
    expect(mockedSyncFoodProductMutationCaches).toHaveBeenCalledWith(queryClient, {
      foodProductId: 'food_product_1',
    });
    expect(mockedShowQueuedOfflineAlert).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'completed',
      result: undefined,
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('surfaces failed Food Product writes through the shared submit lifecycle', async () => {
    const writeError = new Error('Network write failed');
    const writeFeature = jest.fn().mockRejectedValue(writeError);
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await act(async () => {
      await expect(
        hook.createFoodProduct({
          input: createInput,
          includeUsage: true,
        }),
      ).rejects.toThrow('Network write failed');
    });

    expect(mockedSyncFoodProductMutationCaches).not.toHaveBeenCalled();
    expect(mockedShowQueuedOfflineAlert).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });
});
