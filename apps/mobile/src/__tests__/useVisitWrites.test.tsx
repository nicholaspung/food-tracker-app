import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { completeSourceNoteAfterEntryWrite } from '../features/notes/sourceNoteCompletion';
import {
  createVisitApiMutationInput,
  moveVisitItemApiMutationInput,
} from '../features/store/featureOutboxOperations';
import { syncFoodProductMutationCaches } from '../features/store/foodProductsQuery';
import { invalidateHomeFeedQueries } from '../features/store/homeFeedQuery';
import {
  convertVisitItemToFoodProduct,
  createVisit,
  deleteVisit,
  moveVisitItem,
  updateVisit,
} from '../features/store/visitsStore';
import { syncVisitMutationCaches, visitsQueryKeys } from '../features/store/visitsQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useVisitWrites } from '../features/store/useVisitWrites';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/notes/sourceNoteCompletion', () => ({
  completeSourceNoteAfterEntryWrite: jest.fn(),
}));

jest.mock('../features/store/featureOutboxOperations', () => ({
  createVisitApiMutationInput: jest.fn((input: unknown) => ({
    body: input,
    method: 'POST',
    url: '/api/visits',
  })),
  moveVisitItemApiMutationInput: jest.fn((itemId: string, destinationVisitId: string) => ({
    body: { destinationVisitId },
    method: 'POST',
    url: `/api/visit-items/${itemId}/move`,
  })),
}));

jest.mock('../features/store/visitsStore', () => ({
  convertVisitItemToFoodProduct: jest.fn(),
  createVisit: jest.fn(),
  deleteVisit: jest.fn(),
  moveVisitItem: jest.fn(),
  updateVisit: jest.fn(),
}));

jest.mock('../features/store/foodProductsQuery', () => ({
  syncFoodProductMutationCaches: jest.fn(),
}));

jest.mock('../features/store/homeFeedQuery', () => ({
  homeFeedQueryKeys: {
    root: ['feature', 'homeFeed'],
  },
  invalidateHomeFeedQueries: jest.fn(),
}));

jest.mock('../features/store/visitsQuery', () => ({
  syncVisitMutationCaches: jest.fn(),
  visitsQueryKeys: {
    root: ['feature', 'visits'],
  },
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
const mockedCreateVisitApiMutationInput =
  createVisitApiMutationInput as jest.MockedFunction<typeof createVisitApiMutationInput>;
const mockedMoveVisitItemApiMutationInput =
  moveVisitItemApiMutationInput as jest.MockedFunction<typeof moveVisitItemApiMutationInput>;
const mockedConvertVisitItemToFoodProduct =
  convertVisitItemToFoodProduct as jest.MockedFunction<typeof convertVisitItemToFoodProduct>;
const mockedCreateVisit = createVisit as jest.MockedFunction<typeof createVisit>;
const mockedDeleteVisit = deleteVisit as jest.MockedFunction<typeof deleteVisit>;
const mockedMoveVisitItem = moveVisitItem as jest.MockedFunction<typeof moveVisitItem>;
const mockedUpdateVisit = updateVisit as jest.MockedFunction<typeof updateVisit>;
const mockedSyncFoodProductMutationCaches =
  syncFoodProductMutationCaches as jest.MockedFunction<typeof syncFoodProductMutationCaches>;
const mockedInvalidateHomeFeedQueries =
  invalidateHomeFeedQueries as jest.MockedFunction<typeof invalidateHomeFeedQueries>;
const mockedSyncVisitMutationCaches =
  syncVisitMutationCaches as jest.MockedFunction<typeof syncVisitMutationCaches>;
const mockedUseOfflineAwareFeatureWrite =
  useOfflineAwareFeatureWrite as jest.MockedFunction<typeof useOfflineAwareFeatureWrite>;
const mockedShowQueuedOfflineAlert = showQueuedOfflineAlert as jest.MockedFunction<
  typeof showQueuedOfflineAlert
>;

describe('useVisitWrites', () => {
  const queryClient = {
    getQueriesData: jest.fn(() => []),
    getQueryData: jest.fn(() => undefined),
    invalidateQueries: jest.fn(),
    setQueriesData: jest.fn(),
    setQueryData: jest.fn(),
  };
  const createInput = {
    restaurantName: 'Noodle House',
    items: [{ name: 'Wontons', rating: 4 }],
    visitedAt: '2026-04-20T00:00:00.000Z',
    visitedOn: '2026-04-20',
    visibility: 'friends' as const,
    source: 'visit' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQueryClient.mockReturnValue(queryClient as unknown as ReturnType<typeof useQueryClient>);
    mockedCompleteSourceNoteAfterEntryWrite.mockResolvedValue(undefined);
    mockedConvertVisitItemToFoodProduct.mockResolvedValue({
      deletedSourceVisit: false,
      foodProductId: 'food_product_1',
      sourceVisitId: 'visit_1',
    });
    mockedCreateVisit.mockResolvedValue({ id: 'visit_1', items: [] } as never);
    mockedDeleteVisit.mockResolvedValue(undefined);
    mockedMoveVisitItem.mockResolvedValue({
      destinationVisitId: 'visit_2',
      itemId: 'item_1',
    });
    mockedUpdateVisit.mockResolvedValue({ id: 'visit_1', items: [] } as never);
    mockedInvalidateHomeFeedQueries.mockResolvedValue(undefined);
    mockedSyncFoodProductMutationCaches.mockResolvedValue(undefined);
    mockedSyncVisitMutationCaches.mockResolvedValue(undefined);
    queryClient.invalidateQueries.mockResolvedValue(undefined);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useVisitWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useVisitWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useVisitWrites();
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

  it('creates visits with API replay when requested', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await act(async () => {
      await hook.createVisit({
        input: createInput,
        hasPhotoUploads: false,
        useApiReplay: true,
      });
    });

    expect(mockedCreateVisitApiMutationInput).toHaveBeenCalledWith(createInput);
    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.create',
        offline: {
          strategy: 'api',
          input: {
            body: createInput,
            method: 'POST',
            url: '/api/visits',
          },
        },
      }),
    );
    expect(mockedCreateVisit).toHaveBeenCalledWith(createInput);
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visit: expect.objectContaining({ id: 'visit_1' }),
      includeUsage: false,
      includeVisitPhotos: false,
      sourceNoteId: undefined,
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('invalidates visit photos after completed photo-backed creates', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await act(async () => {
      await hook.createVisit({
        input: createInput,
        hasPhotoUploads: true,
        useApiReplay: false,
      });
    });

    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visit: expect.objectContaining({ id: 'visit_1' }),
      includeUsage: true,
      includeVisitPhotos: true,
      sourceNoteId: undefined,
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues photo or source-note-backed creates through the outbox and completes the source note', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await act(async () => {
      await hook.createVisit({
        input: { ...createInput, sourceNoteId: 'note_1' },
        hasPhotoUploads: true,
        sourceNote: {
          noteId: 'note_1',
          usedAt: '2026-05-20T00:00:00.000Z',
        },
        useApiReplay: false,
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.create',
        offline: {
          strategy: 'outbox',
          payload: { ...createInput, sourceNoteId: 'note_1' },
        },
      }),
    );
    expect(mockedCompleteSourceNoteAfterEntryWrite).toHaveBeenCalledWith({
      entryWriteStatus: 'queued',
      noteId: 'note_1',
      queryClient,
      usedAt: '2026-05-20T00:00:00.000Z',
      writeFeature,
    });
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      includeUsage: true,
      includeVisitPhotos: true,
      sourceNoteId: 'note_1',
    });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'useVisitWrites',
      subject: 'Visit',
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('updates visits through the outbox payload and syncs update caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const updates = {
      restaurantName: 'Updated',
      items: [],
      visitedAt: '2026-04-21T00:00:00.000Z',
      visitedOn: '2026-04-21',
      visibility: 'private' as const,
    };

    await act(async () => {
      await hook.updateVisit({
        visitId: 'visit_1',
        updates,
        includeUsage: true,
        includeVisitPhotos: true,
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.update',
        offline: {
          strategy: 'outbox',
          payload: {
            visitId: 'visit_1',
            updates,
          },
        },
      }),
    );
    expect(mockedUpdateVisit).toHaveBeenCalledWith('visit_1', updates);
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visit: expect.objectContaining({ id: 'visit_1' }),
      includeUsage: true,
      includeVisitPhotos: true,
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues visit updates through the outbox payload and syncs queued update caches', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const updates = {
      restaurantName: 'Queued Update',
      items: [],
      visitedAt: '2026-04-22T00:00:00.000Z',
      visitedOn: '2026-04-22',
      visibility: 'private' as const,
    };

    await act(async () => {
      await hook.updateVisit({
        visitId: 'visit_1',
        updates,
        includeUsage: false,
        includeVisitPhotos: true,
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.update',
        offline: {
          strategy: 'outbox',
          payload: {
            visitId: 'visit_1',
            updates,
          },
        },
      }),
    );
    expect(mockedUpdateVisit).not.toHaveBeenCalled();
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visitId: 'visit_1',
      includeUsage: false,
      includeVisitPhotos: true,
    });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'useVisitWrites',
      subject: 'Visit update',
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('deletes visits through the outbox payload and syncs delete caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.deleteVisit({
      includeVisitPhotos: true,
      visitId: 'visit_1',
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.delete',
        offline: {
          strategy: 'outbox',
          payload: { visitId: 'visit_1' },
        },
      }),
    );
    expect(mockedDeleteVisit).toHaveBeenCalledWith('visit_1');
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visitId: 'visit_1',
      includeVisitPhotos: true,
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues visit deletes and shows queued feedback', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.deleteVisit({
      includeVisitPhotos: true,
      visitId: 'visit_queued',
    });

    expect(mockedDeleteVisit).not.toHaveBeenCalled();
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visitId: 'visit_queued',
      includeVisitPhotos: true,
    });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('Visit delete');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('moves visit items through API replay and invalidates affected visit caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const item = {
      id: 'item_1',
      name: 'Wontons',
      rating: 4,
    };
    const destinationVisit = {
      id: 'visit_2',
      items: [],
    } as never;

    await hook.moveVisitItem({
      destinationVisit,
      item,
      sourceVisitId: 'visit_1',
    });

    expect(mockedMoveVisitItemApiMutationInput).toHaveBeenCalledWith('item_1', 'visit_2');
    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.item.move',
        offline: {
          strategy: 'api',
          input: {
            body: { destinationVisitId: 'visit_2' },
            method: 'POST',
            url: '/api/visit-items/item_1/move',
          },
        },
      }),
    );
    expect(mockedMoveVisitItem).toHaveBeenCalledWith({
      itemId: 'item_1',
      destinationVisitId: 'visit_2',
    });
    expect(mockedInvalidateHomeFeedQueries).toHaveBeenCalledWith(queryClient);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: visitsQueryKeys.root });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'visit', 'visit_1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'visit', 'visit_2'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'visitPhotos'] });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('converts visit items to Food Products through the outbox payload and syncs affected caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.convertVisitItemToFoodProduct({
      itemId: 'item_1',
      sourceVisitId: 'visit_1',
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.item.convert-to-food-product',
        offline: {
          strategy: 'outbox',
          payload: { itemId: 'item_1' },
        },
      }),
    );
    expect(mockedConvertVisitItemToFoodProduct).toHaveBeenCalledWith({ itemId: 'item_1' });
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visitId: 'visit_1',
      includeVisitPhotos: true,
    });
    expect(mockedSyncFoodProductMutationCaches).toHaveBeenCalledWith(queryClient, {
      foodProductId: 'food_product_1',
      includeFoodProductPhotos: true,
    });

    await act(async () => {
      renderer.unmount();
    });
  });
});
