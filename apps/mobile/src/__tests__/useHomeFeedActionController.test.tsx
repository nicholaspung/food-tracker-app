import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  buildPocketBaseFileUrl,
} from '../features';
import { invalidateHomeFeedQueries } from '../features/store/homeFeedQuery';
import { moveVisitItem } from '../features/store/visitsStore';
import { syncVisitMutationCaches } from '../features/store/visitsQuery';
import { moveVisitItemApiMutationInput } from '../features/store/featureOutboxOperations';
import { useFoodProductWrites } from '../features/store/useFoodProductWrites';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import {
  type HomeFeedActionController,
  useHomeFeedActionController,
} from '../screens/home/useHomeFeedActionController';

jest.mock('../features', () => ({
  buildPocketBaseFileUrl: jest.fn(),
  deleteFoodProduct: jest.fn(),
  deleteVisit: jest.fn(),
  homeFeedQueryKeys: {
    root: ['feature', 'homeFeed'],
  },
  invalidateHomeFeedQueries: jest.fn(),
  moveVisitItem: jest.fn(),
  reportContent: jest.fn(),
  syncVisitMutationCaches: jest.fn(),
  visitsQueryKeys: {
    root: ['feature', 'visits'],
  },
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  buildPocketBaseFileUrl: jest.fn(({ recordId, filename, thumb }) =>
    `pb://${recordId}/${filename}${thumb ? `?thumb=${thumb}` : ''}`,
  ),
}));

jest.mock('../features/store/featureOutboxOperations', () => ({
  moveVisitItemApiMutationInput: jest.fn(),
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

jest.mock('../features/store/visitsStore', () => ({
  deleteVisit: jest.fn(),
  moveVisitItem: jest.fn(),
}));

jest.mock('../features/store/useFoodProductWrites', () => ({
  useFoodProductWrites: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedBuildPocketBaseFileUrl = buildPocketBaseFileUrl as jest.MockedFunction<typeof buildPocketBaseFileUrl>;
const mockedInvalidateHomeFeedQueries = invalidateHomeFeedQueries as jest.MockedFunction<
  typeof invalidateHomeFeedQueries
>;
const mockedMoveVisitItem = moveVisitItem as jest.MockedFunction<typeof moveVisitItem>;
const mockedSyncVisitMutationCaches = syncVisitMutationCaches as jest.MockedFunction<
  typeof syncVisitMutationCaches
>;
const mockedMoveVisitItemApiMutationInput =
  moveVisitItemApiMutationInput as jest.MockedFunction<
    typeof moveVisitItemApiMutationInput
  >;
const mockedUseFoodProductWrites = useFoodProductWrites as jest.MockedFunction<typeof useFoodProductWrites>;
const mockedShowQueuedOfflineAlert =
  showQueuedOfflineAlert as jest.MockedFunction<typeof showQueuedOfflineAlert>;

function getControllerOrThrow(
  controller: HomeFeedActionController | null,
): HomeFeedActionController {
  if (!controller) {
    throw new Error('Expected controller to be initialized.');
  }

  return controller;
}

function createVisitRecord(
  overrides: Partial<{
    id: string;
    restaurantName: string;
    items: {
      id: string;
      name: string;
      rating: number;
      description?: string;
      notes?: string;
    }[];
    userId: string;
    visitedAt: string;
    createdAt: string;
    updatedAt: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 'visit-1',
    restaurantName: overrides.restaurantName ?? 'Noodle House',
    visitedAt: overrides.visitedAt ?? '2026-04-18T08:00:00.000Z',
    items: overrides.items ?? [],
    source: 'visit' as const,
    userId: overrides.userId ?? 'user-1',
    createdAt: overrides.createdAt ?? '2026-04-18T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-18T08:05:00.000Z',
  };
}

describe('useHomeFeedActionController', () => {
  beforeEach(() => {
    mockedBuildPocketBaseFileUrl.mockReset();
    mockedInvalidateHomeFeedQueries.mockReset();
    mockedMoveVisitItem.mockReset();
    mockedSyncVisitMutationCaches.mockReset();
    mockedMoveVisitItemApiMutationInput.mockReset();
    mockedUseFoodProductWrites.mockReset();
    mockedShowQueuedOfflineAlert.mockReset();
    mockedBuildPocketBaseFileUrl.mockImplementation(({ recordId, filename, thumb }) =>
      `pb://${recordId}/${filename}${thumb ? `?thumb=${thumb}` : ''}`,
    );
    mockedInvalidateHomeFeedQueries.mockResolvedValue();
    mockedSyncVisitMutationCaches.mockResolvedValue();
    mockedMoveVisitItemApiMutationInput.mockReturnValue({
      body: {
        destinationVisitId: 'visit-destination',
      },
      headers: {
        'X-Mobile-Write-Operation': 'visit.item.move',
      },
      method: 'POST',
      url: 'https://example.com/api/visit-items/item-1/move',
    });
    mockedUseFoodProductWrites.mockReturnValue({
      createFoodProduct: jest.fn(),
      deleteFoodProduct: jest.fn().mockResolvedValue({ status: 'completed' }),
      updateFoodProduct: jest.fn(),
    } as unknown as ReturnType<typeof useFoodProductWrites>);
  });

  it('stores aligned full and preview urls and bounds the initial photo index', async () => {
    let controller: HomeFeedActionController | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      controller = useHomeFeedActionController({
        isOnline: true,
        queryClient: {} as never,
        trackWriteTelemetry: jest.fn().mockResolvedValue(undefined),
        writeFeature: jest.fn() as never,
      });
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    await act(async () => {
      getControllerOrThrow(controller).openPhotoViewer(
        [
          {
            collectionName: 'visit_photos',
            created: '2026-04-18T08:00:00.000Z',
            id: 'photo-1',
            photo: 'first.jpg',
            uri: 'file:///cached-preview.jpg',
          },
          {
            collectionId: 'collection-2',
            collectionName: 'visit_photos',
            created: '2026-04-18T08:01:00.000Z',
            id: 'photo-2',
            photo: 'second.jpg',
          },
        ],
        99,
      );
    });

    expect(getControllerOrThrow(controller).photoViewerUrls).toEqual([
      'pb://photo-1/first.jpg',
      'pb://photo-2/second.jpg',
    ]);
    expect(getControllerOrThrow(controller).photoViewerPreviewUrls).toEqual([
      'file:///cached-preview.jpg',
      'pb://photo-2/second.jpg?thumb=100x100',
    ]);
    expect(getControllerOrThrow(controller).photoViewerInitialIndex).toBe(1);
    expect(getControllerOrThrow(controller).isPhotoViewerVisible).toBe(true);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it('syncs visit mutation caches after deleting a visit', async () => {
    let controller: HomeFeedActionController | null = null;
    let renderer: ReactTestRenderer | null = null;
    const writeFeature = jest.fn().mockResolvedValue({
      status: 'completed' as const,
    });
    const queryClient = {} as never;

    function TestComponent() {
      controller = useHomeFeedActionController({
        isOnline: true,
        queryClient,
        trackWriteTelemetry: jest.fn().mockResolvedValue(undefined),
        writeFeature: writeFeature as never,
      });
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    await act(async () => {
      getControllerOrThrow(controller).promptDeleteVisit('visit-1', 'Noodle House');
    });

    await act(async () => {
      await getControllerOrThrow(controller).confirmDeleteTarget();
    });

    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visitId: 'visit-1',
      includeVisitPhotos: true,
    });
    expect(mockedInvalidateHomeFeedQueries).not.toHaveBeenCalled();
    expect(mockedShowQueuedOfflineAlert).not.toHaveBeenCalledWith('Visit delete');

    await act(async () => {
      renderer?.unmount();
    });
  });

  it('syncs visit mutation caches after queueing a visit delete', async () => {
    let controller: HomeFeedActionController | null = null;
    let renderer: ReactTestRenderer | null = null;
    const writeFeature = jest.fn().mockResolvedValue({
      status: 'queued' as const,
    });
    const queryClient = {} as never;

    function TestComponent() {
      controller = useHomeFeedActionController({
        isOnline: false,
        queryClient,
        trackWriteTelemetry: jest.fn().mockResolvedValue(undefined),
        writeFeature: writeFeature as never,
      });
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    await act(async () => {
      getControllerOrThrow(controller).promptDeleteVisit('visit-queued', 'Noodle House');
    });

    await act(async () => {
      await getControllerOrThrow(controller).confirmDeleteTarget();
    });

    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visitId: 'visit-queued',
      includeVisitPhotos: true,
    });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('Visit delete');

    await act(async () => {
      renderer?.unmount();
    });
  });

  it('moves a visit item with optimistic cache patching and related invalidation', async () => {
    let controller: HomeFeedActionController | null = null;

    const movedItem = {
      id: 'item-1',
      name: 'Spicy Wontons',
      rating: 4,
      notes: 'Shareable',
    };
    const sourceVisit = createVisitRecord({
      id: 'visit-source',
      restaurantName: 'Source Bistro',
      items: [movedItem],
    });
    const destinationVisit = createVisitRecord({
      id: 'visit-destination',
      restaurantName: 'Destination Bistro',
      items: [],
    });

    const homeFeedQueryKey = [
      'feature',
      'homeFeed',
      'paginated',
      'mine',
      'all',
      'created',
      '',
    ] as const;
    let homeFeedData = {
      pageParams: [undefined],
      pages: [
        {
          hasNextPage: false,
          items: [
            {
              eventAt: sourceVisit.visitedAt,
              source: 'visit' as const,
              visit: sourceVisit,
            },
            {
              eventAt: destinationVisit.visitedAt,
              source: 'visit' as const,
              visit: destinationVisit,
            },
          ],
        },
      ],
    };

    const visitDetails = new Map<string, ReturnType<typeof createVisitRecord>>([
      [JSON.stringify(['feature', 'visit', sourceVisit.id]), sourceVisit],
      [JSON.stringify(['feature', 'visit', destinationVisit.id]), destinationVisit],
    ]);
    const queryClient = {
      getQueriesData: jest.fn(() => [[homeFeedQueryKey, homeFeedData]]),
      getQueryData: jest.fn((queryKey: readonly unknown[]) =>
        visitDetails.get(JSON.stringify(queryKey)),
      ),
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
      setQueriesData: jest.fn(
        (
          _filters: unknown,
          updater: (
            value: typeof homeFeedData | undefined,
          ) => typeof homeFeedData | undefined,
        ) => {
          homeFeedData = updater(homeFeedData) ?? homeFeedData;
        },
      ),
      setQueryData: jest.fn((queryKey: readonly unknown[], value: unknown) => {
        visitDetails.set(
          JSON.stringify(queryKey),
          value as ReturnType<typeof createVisitRecord>,
        );
      }),
    };
    const writeFeature = jest.fn(async (options: {
      execute: () => Promise<unknown>;
      offline: {
        input: unknown;
        strategy: 'api';
      };
      operationName: string;
    }) => {
      expect(options.operationName).toBe('visit.item.move');
      expect(options.offline).toEqual({
        input: {
          body: {
            destinationVisitId: 'visit-destination',
          },
          headers: {
            'X-Mobile-Write-Operation': 'visit.item.move',
          },
          method: 'POST',
          url: 'https://example.com/api/visit-items/item-1/move',
        },
        strategy: 'api',
      });

      const result = await options.execute();
      return {
        result,
        status: 'completed' as const,
      };
    });

    mockedMoveVisitItem.mockResolvedValue({
      destinationVisitId: destinationVisit.id,
      itemId: movedItem.id,
    });

    function TestComponent() {
      controller = useHomeFeedActionController({
        isOnline: true,
        queryClient: queryClient as never,
        trackWriteTelemetry: jest.fn().mockResolvedValue(undefined),
        writeFeature: writeFeature as never,
      });
      return null;
    }

    await act(async () => {
      create(React.createElement(TestComponent));
    });

    await act(async () => {
      getControllerOrThrow(controller).promptMoveVisitItem({
        item: movedItem,
        sourceVisitId: sourceVisit.id,
        sourceVisitName: sourceVisit.restaurantName,
      });
    });

    await act(async () => {
      await getControllerOrThrow(controller).confirmMoveVisitItem(destinationVisit);
    });

    expect(mockedMoveVisitItemApiMutationInput).toHaveBeenCalledWith(
      movedItem.id,
      destinationVisit.id,
    );
    expect(mockedMoveVisitItem).toHaveBeenCalledWith({
      destinationVisitId: destinationVisit.id,
      itemId: movedItem.id,
    });
    expect(homeFeedData.pages[0]?.items[0]?.visit.items).toEqual([]);
    expect(homeFeedData.pages[0]?.items[1]?.visit.items).toEqual([movedItem]);
    expect(
      visitDetails.get(JSON.stringify(['feature', 'visit', sourceVisit.id]))?.items,
    ).toEqual([]);
    expect(
      visitDetails.get(JSON.stringify(['feature', 'visit', destinationVisit.id]))?.items,
    ).toEqual([movedItem]);
    expect(mockedInvalidateHomeFeedQueries).toHaveBeenCalledWith(queryClient);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'visits'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'visit', sourceVisit.id],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'visit', destinationVisit.id],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'visitPhotos'],
    });
    expect(getControllerOrThrow(controller).pendingMoveItem).toBeNull();
    expect(getControllerOrThrow(controller).moveErrorMessage).toBeNull();
    expect(mockedShowQueuedOfflineAlert).not.toHaveBeenCalled();
  });

  it('shows the queued offline alert after queueing a visit item move', async () => {
    let controller: HomeFeedActionController | null = null;

    const movedItem = {
      id: 'item-1',
      name: 'Soup Dumplings',
      rating: 5,
    };
    const sourceVisit = createVisitRecord({
      id: 'visit-source',
      restaurantName: 'Source Bistro',
      items: [movedItem],
    });
    const destinationVisit = createVisitRecord({
      id: 'visit-destination',
      restaurantName: 'Destination Bistro',
      items: [],
    });

    const queryClient = {
      getQueriesData: jest.fn(() => []),
      getQueryData: jest.fn(() => undefined),
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
      setQueriesData: jest.fn(),
      setQueryData: jest.fn(),
    };
    const writeFeature = jest.fn().mockResolvedValue({
      status: 'queued' as const,
    });

    function TestComponent() {
      controller = useHomeFeedActionController({
        isOnline: false,
        queryClient: queryClient as never,
        trackWriteTelemetry: jest.fn().mockResolvedValue(undefined),
        writeFeature: writeFeature as never,
      });
      return null;
    }

    await act(async () => {
      create(React.createElement(TestComponent));
    });

    await act(async () => {
      getControllerOrThrow(controller).promptMoveVisitItem({
        item: movedItem,
        sourceVisitId: sourceVisit.id,
        sourceVisitName: sourceVisit.restaurantName,
      });
    });

    await act(async () => {
      await getControllerOrThrow(controller).confirmMoveVisitItem(destinationVisit);
    });

    expect(mockedMoveVisitItemApiMutationInput).toHaveBeenCalledWith(
      movedItem.id,
      destinationVisit.id,
    );
    expect(mockedMoveVisitItem).not.toHaveBeenCalled();
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('Visit item move');
    expect(getControllerOrThrow(controller).pendingMoveItem).toBeNull();
  });
});
