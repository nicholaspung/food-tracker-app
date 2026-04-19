import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { buildPocketBaseFileUrl } from '../features';
import {
  type HomeFeedActionController,
  useHomeFeedActionController,
} from '../screens/home/useHomeFeedActionController';

jest.mock('../features', () => ({
  buildPocketBaseFileUrl: jest.fn(),
  deleteQuickTrack: jest.fn(),
  deleteVisit: jest.fn(),
  invalidateHomeFeedQueries: jest.fn(),
  reportContent: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedBuildPocketBaseFileUrl = buildPocketBaseFileUrl as jest.MockedFunction<typeof buildPocketBaseFileUrl>;

describe('useHomeFeedActionController', () => {
  beforeEach(() => {
    mockedBuildPocketBaseFileUrl.mockImplementation(({ recordId, filename, thumb }) =>
      `pb://${recordId}/${filename}${thumb ? `?thumb=${thumb}` : ''}`,
    );
  });

  it('stores aligned full and preview urls and bounds the initial photo index', async () => {
    let controller: HomeFeedActionController | null = null;
    let renderer: ReactTestRenderer | null = null;

    const getController = (): HomeFeedActionController => {
      if (!controller) {
        throw new Error('Expected controller to be initialized.');
      }

      return controller;
    };

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
      getController().openPhotoViewer(
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

    expect(getController().photoViewerUrls).toEqual([
      'pb://photo-1/first.jpg',
      'pb://photo-2/second.jpg',
    ]);
    expect(getController().photoViewerPreviewUrls).toEqual([
      'file:///cached-preview.jpg',
      'pb://photo-2/second.jpg?thumb=100x100',
    ]);
    expect(getController().photoViewerInitialIndex).toBe(1);
    expect(getController().isPhotoViewerVisible).toBe(true);

    await act(async () => {
      renderer?.unmount();
    });
  });
});
