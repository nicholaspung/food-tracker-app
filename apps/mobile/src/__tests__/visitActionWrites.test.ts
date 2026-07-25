import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import {
  createVisitActionWrites,
  type VisitActionWrites,
} from '../features/store/visitActionWrites';
import { moveVisitItemApiMutationInput } from '../features/store/featureOutboxOperations';
import { syncFoodProductMutationCaches } from '../features/store/foodProductsQuery';
import { invalidateHomeFeedQueries } from '../features/store/homeFeedQuery';
import {
  convertVisitItemToFoodProduct,
  deleteVisit,
  moveVisitItem,
  updateVisit,
} from '../features/store/visitsStore';
import { syncVisitMutationCaches, visitsQueryKeys } from '../features/store/visitsQuery';
import { visitPhotosQueryKeys } from '../features/store/visitPhotosQuery';

jest.mock('../features/store/featureOutboxOperations', () => ({
  moveVisitItemApiMutationInput: jest.fn((itemId: string, destinationVisitId: string) => ({
    body: { destinationVisitId },
    method: 'POST',
    url: `/api/visit-items/${itemId}/move`,
  })),
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
    detail: (visitId: string) => ['feature', 'visit', visitId.trim()],
    root: ['feature', 'visits'],
  },
}));

jest.mock('../features/store/visitsStore', () => ({
  convertVisitItemToFoodProduct: jest.fn(),
  deleteVisit: jest.fn(),
  moveVisitItem: jest.fn(),
  updateVisit: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedShowQueuedOfflineAlert = showQueuedOfflineAlert as jest.MockedFunction<
  typeof showQueuedOfflineAlert
>;
const mockedMoveVisitItemApiMutationInput =
  moveVisitItemApiMutationInput as jest.MockedFunction<typeof moveVisitItemApiMutationInput>;
const mockedSyncFoodProductMutationCaches =
  syncFoodProductMutationCaches as jest.MockedFunction<typeof syncFoodProductMutationCaches>;
const mockedInvalidateHomeFeedQueries =
  invalidateHomeFeedQueries as jest.MockedFunction<typeof invalidateHomeFeedQueries>;
const mockedConvertVisitItemToFoodProduct =
  convertVisitItemToFoodProduct as jest.MockedFunction<typeof convertVisitItemToFoodProduct>;
const mockedDeleteVisit = deleteVisit as jest.MockedFunction<typeof deleteVisit>;
const mockedMoveVisitItem = moveVisitItem as jest.MockedFunction<typeof moveVisitItem>;
const mockedUpdateVisit = updateVisit as jest.MockedFunction<typeof updateVisit>;
const mockedSyncVisitMutationCaches =
  syncVisitMutationCaches as jest.MockedFunction<typeof syncVisitMutationCaches>;

function createQueryClient() {
  return {
    getQueriesData: jest.fn(() => []),
    getQueryData: jest.fn(() => undefined),
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
    setQueriesData: jest.fn(),
    setQueryData: jest.fn(),
  };
}

function createActionWrites(
  writeFeature: jest.Mock,
  queryClient = createQueryClient(),
): {
  queryClient: ReturnType<typeof createQueryClient>;
  writes: VisitActionWrites;
} {
  return {
    queryClient,
    writes: createVisitActionWrites({
      queryClient: queryClient as never,
      writeFeature: writeFeature as never,
    }),
  };
}

describe('visitActionWrites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedConvertVisitItemToFoodProduct.mockResolvedValue({
      deletedSourceVisit: false,
      foodProductId: 'food_product_1',
      sourceVisitId: 'visit_1',
    });
    mockedDeleteVisit.mockResolvedValue(undefined);
    mockedMoveVisitItem.mockResolvedValue({
      destinationVisitId: 'visit_2',
      itemId: 'item_1',
    });
    mockedUpdateVisit.mockResolvedValue({
      id: 'visit_1',
      items: [],
    } as never);
    mockedInvalidateHomeFeedQueries.mockResolvedValue(undefined);
    mockedSyncFoodProductMutationCaches.mockResolvedValue(undefined);
    mockedSyncVisitMutationCaches.mockResolvedValue(undefined);
  });

  it('deletes visits through the action write interface', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    const { queryClient, writes } = createActionWrites(writeFeature);

    await writes.deleteVisit({
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
  });

  it('queues visit item deletes as replayable visit updates', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' as const });
    const { queryClient, writes } = createActionWrites(writeFeature);
    const updates = {
      items: [
        {
          id: 'item_2',
          name: 'Noodles',
          rating: 4,
        },
      ],
    };

    await writes.deleteVisitItem({
      includeUsage: false,
      includeVisitPhotos: true,
      updates,
      visitId: 'visit_1',
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
      analyticsSource: 'visitActionWrites',
      subject: 'Visit item delete',
    });
  });

  it('moves visit items through API replay and invalidates affected caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    const { queryClient, writes } = createActionWrites(writeFeature);
    const item = {
      id: 'item_1',
      name: 'Wontons',
      rating: 4,
    };
    const destinationVisit = {
      id: 'visit_2',
      items: [],
    } as never;

    await writes.moveVisitItem({
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
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: visitsQueryKeys.detail('visit_1'),
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: visitsQueryKeys.detail('visit_2'),
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: visitPhotosQueryKeys.root,
    });
  });

  it('queues visit item moves and keeps queued feedback in the action module', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' as const });
    const { writes } = createActionWrites(writeFeature);

    await writes.moveVisitItem({
      destinationVisit: {
        id: 'visit_2',
        items: [],
      } as never,
      item: {
        id: 'item_1',
        name: 'Wontons',
        rating: 4,
      },
      sourceVisitId: 'visit_1',
    });

    expect(mockedMoveVisitItem).not.toHaveBeenCalled();
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('Visit item move');
  });

  it('converts visit items to food products through the action write interface', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    const { queryClient, writes } = createActionWrites(writeFeature);

    await writes.convertVisitItemToFoodProduct({
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
  });

  it('queues visit item conversions and syncs affected roots', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' as const });
    const { queryClient, writes } = createActionWrites(writeFeature);

    await writes.convertVisitItemToFoodProduct({
      itemId: 'item_1',
      sourceVisitId: 'visit_queued',
    });

    expect(mockedConvertVisitItemToFoodProduct).not.toHaveBeenCalled();
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visitId: 'visit_queued',
      includeVisitPhotos: true,
    });
    expect(mockedSyncFoodProductMutationCaches).toHaveBeenCalledWith(queryClient);
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'CreateVisitScreen',
      subject: 'Food product conversion',
    });
  });
});
