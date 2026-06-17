import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import {
  buildPocketBaseFileUrl,
} from '../features';
import { useFoodProductWrites } from '../features/store/useFoodProductWrites';
import { useVisitWrites } from '../features/store/useVisitWrites';
import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import {
  type HomeFeedActionController,
  useHomeFeedActionController,
} from '../screens/home/useHomeFeedActionController';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features', () => ({
  buildPocketBaseFileUrl: jest.fn(),
  invalidateHomeFeedQueries: jest.fn(),
  reportContent: jest.fn(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  buildPocketBaseFileUrl: jest.fn(({ recordId, filename, thumb }) =>
    `pb://${recordId}/${filename}${thumb ? `?thumb=${thumb}` : ''}`,
  ),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../features/store/useFoodProductWrites', () => ({
  useFoodProductWrites: jest.fn(),
}));

jest.mock('../features/store/useVisitWrites', () => ({
  useVisitWrites: jest.fn(),
}));

jest.mock('../features/store/useWriteTelemetry', () => ({
  useWriteTelemetry: jest.fn(),
}));

const mockedBuildPocketBaseFileUrl = buildPocketBaseFileUrl as jest.MockedFunction<typeof buildPocketBaseFileUrl>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseFoodProductWrites = useFoodProductWrites as jest.MockedFunction<typeof useFoodProductWrites>;
const mockedUseVisitWrites = useVisitWrites as jest.MockedFunction<typeof useVisitWrites>;
const mockedUseWriteTelemetry = useWriteTelemetry as jest.MockedFunction<typeof useWriteTelemetry>;

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
  const queryClient = {
    invalidateQueries: jest.fn(),
  };
  const visitWrites = {
    convertVisitItemToFoodProduct: jest.fn(),
    createVisit: jest.fn(),
    deleteVisit: jest.fn(),
    deleteVisitItem: jest.fn(),
    moveVisitItem: jest.fn(),
    updateVisit: jest.fn(),
  };

  beforeEach(() => {
    mockedBuildPocketBaseFileUrl.mockReset();
    mockedUseQueryClient.mockReset();
    mockedUseFoodProductWrites.mockReset();
    mockedUseVisitWrites.mockReset();
    mockedUseWriteTelemetry.mockReset();
    queryClient.invalidateQueries.mockReset();
    Object.values(visitWrites).forEach((mock) => mock.mockReset());
    mockedBuildPocketBaseFileUrl.mockImplementation(({ recordId, filename, thumb }) =>
      `pb://${recordId}/${filename}${thumb ? `?thumb=${thumb}` : ''}`,
    );
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedUseWriteTelemetry.mockReturnValue(jest.fn().mockResolvedValue(undefined));
    visitWrites.deleteVisit.mockResolvedValue({ status: 'completed' });
    visitWrites.moveVisitItem.mockResolvedValue({ status: 'completed' });
    mockedUseFoodProductWrites.mockReturnValue({
      createFoodProduct: jest.fn(),
      deleteFoodProduct: jest.fn().mockResolvedValue({ status: 'completed' }),
      updateFoodProduct: jest.fn(),
    } as unknown as ReturnType<typeof useFoodProductWrites>);
    mockedUseVisitWrites.mockReturnValue(
      visitWrites as unknown as ReturnType<typeof useVisitWrites>,
    );
  });

  it('stores aligned full and preview urls and bounds the initial photo index', async () => {
    let controller: HomeFeedActionController | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      controller = useHomeFeedActionController({
        isOnline: true,
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

  it('deletes a visit through visit writes after confirmation', async () => {
    let controller: HomeFeedActionController | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      controller = useHomeFeedActionController({
        isOnline: true,
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

    expect(visitWrites.deleteVisit).toHaveBeenCalledWith({
      visitId: 'visit-1',
      includeVisitPhotos: true,
    });
    expect(getControllerOrThrow(controller).pendingDeleteTarget).toBeNull();
    expect(getControllerOrThrow(controller).deleteErrorMessage).toBeNull();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it('clears the delete modal after queueing a visit delete', async () => {
    let controller: HomeFeedActionController | null = null;
    let renderer: ReactTestRenderer | null = null;
    visitWrites.deleteVisit.mockResolvedValue({ status: 'queued' });

    function TestComponent() {
      controller = useHomeFeedActionController({
        isOnline: false,
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

    expect(visitWrites.deleteVisit).toHaveBeenCalledWith({
      visitId: 'visit-queued',
      includeVisitPhotos: true,
    });
    expect(getControllerOrThrow(controller).pendingDeleteTarget).toBeNull();
    expect(getControllerOrThrow(controller).deleteErrorMessage).toBeNull();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it('moves a visit item through visit writes', async () => {
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

    function TestComponent() {
      controller = useHomeFeedActionController({
        isOnline: true,
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

    expect(visitWrites.moveVisitItem).toHaveBeenCalledWith({
      destinationVisit,
      item: movedItem,
      sourceVisitId: sourceVisit.id,
    });
    expect(getControllerOrThrow(controller).pendingMoveItem).toBeNull();
    expect(getControllerOrThrow(controller).moveErrorMessage).toBeNull();
  });

  it('clears move state after queueing a visit item move', async () => {
    let controller: HomeFeedActionController | null = null;
    visitWrites.moveVisitItem.mockResolvedValue({ status: 'queued' });

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

    function TestComponent() {
      controller = useHomeFeedActionController({
        isOnline: false,
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

    expect(visitWrites.moveVisitItem).toHaveBeenCalledWith({
      destinationVisit,
      item: movedItem,
      sourceVisitId: sourceVisit.id,
    });
    expect(getControllerOrThrow(controller).pendingMoveItem).toBeNull();
    expect(getControllerOrThrow(controller).moveErrorMessage).toBeNull();
  });
});
