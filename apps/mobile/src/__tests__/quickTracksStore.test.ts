import { ClientResponseError } from 'pocketbase';

import { listQuickTrackPhotos, updateQuickTrack } from '../features/store/quickTracksStore';
import { listCollectionRecords } from '../features/store/pocketbaseGateway';
import { uploadVisitPhotos } from '../features/store/visitPhotoUploads';
import { pb } from '../lib/pocketbase';

jest.mock('../features/store/pocketbaseGateway', () => ({
  listCollectionRecords: jest.fn(),
}));

jest.mock('../features/store/visitPhotoUploads', () => ({
  uploadVisitPhotos: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      record: {
        collectionId: 'users',
        collectionName: 'users',
        id: 'user-1',
      },
    },
    collection: jest.fn(),
  },
}));

const mockedListCollectionRecords = listCollectionRecords as jest.MockedFunction<typeof listCollectionRecords>;
const mockedUploadVisitPhotos = uploadVisitPhotos as jest.MockedFunction<typeof uploadVisitPhotos>;
const mockedPocketBase = pb as typeof pb & {
  authStore: {
    record: {
      collectionId: string;
      collectionName: string;
      id: string;
    } | null;
  };
};

function buildClientResponseError(status: number): ClientResponseError {
  return new ClientResponseError({
    response: {
      data: {},
      message: 'not found',
    },
    status,
    url: 'https://app.yummyrecs.com/api/visit_photos/photo-1',
  });
}

describe('quickTracksStore', () => {
  beforeEach(() => {
    mockedListCollectionRecords.mockReset();
    mockedUploadVisitPhotos.mockReset();
    (mockedPocketBase.collection as jest.Mock).mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('lists quick-track photos from visit_photos using the quick-track id', async () => {
    const abortController = new AbortController();
    mockedListCollectionRecords.mockResolvedValue([
      {
        id: 'photo-1',
        food_item: 'quick-track-1',
        user: 'user-1',
        photo: 'iced-coffee.jpg',
        created: '2026-04-12T18:30:00.000Z',
      },
    ]);

    await expect(
      listQuickTrackPhotos('quick-track-1', { signal: abortController.signal }),
    ).resolves.toEqual([
      {
        id: 'photo-1',
        food_item: 'quick-track-1',
        user: 'user-1',
        photo: 'iced-coffee.jpg',
        collectionName: 'visit_photos',
        created: '2026-04-12T18:30:00.000Z',
      },
    ]);

    expect(mockedListCollectionRecords).toHaveBeenCalledWith('visit_photos', {
      fields: 'id,food_item,user,photo,created',
      filter: 'food_item = "quick-track-1"',
      pageSize: 100,
      signal: abortController.signal,
      sort: '-created',
    });
  });

  it('uploads a replacement photo before deleting old primary photo ids', async () => {
    const operationOrder: string[] = [];
    const foodItemsCollection = {
      getOne: jest.fn().mockResolvedValue({
        id: 'quick-track-1',
        isQuickTrack: true,
      }),
      update: jest.fn().mockResolvedValue({
        id: 'quick-track-1',
        name: 'Updated Latte',
        rating: 5,
        notes: 'Keep foam',
        user: 'user-1',
        visibility: 'private',
        itemCategory: 'other',
        itemDate: '2026-04-18T07:00:00.000Z',
        created: '2026-04-12T18:30:00.000Z',
        updated: '2026-04-18T07:00:00.000Z',
        expand: {
          user: {
            id: 'user-1',
            name: 'Taylor',
          },
        },
      }),
    };
    const visitPhotosCollection = {
      delete: jest
        .fn()
        .mockImplementationOnce(async () => {
          operationOrder.push('delete:photo-1');
          throw buildClientResponseError(404);
        })
        .mockImplementationOnce(async () => {
          operationOrder.push('delete:photo-2');
        }),
    };

    (mockedPocketBase.collection as jest.Mock).mockImplementation((collectionName: string) => {
      if (collectionName === 'food_items') {
        return foodItemsCollection;
      }
      if (collectionName === 'visit_photos') {
        return visitPhotosCollection;
      }
      throw new Error(`Unexpected collection: ${collectionName}`);
    });
    mockedUploadVisitPhotos.mockImplementation(async () => {
      operationOrder.push('upload');
    });

    await expect(
      updateQuickTrack('quick-track-1', {
        itemName: '  Updated Latte  ',
        rating: 5,
        notes: ' Keep foam ',
        itemCategory: 'other',
        visibility: 'private',
        itemDate: '2026-04-18T07:00:00.000Z',
        newPhoto: {
          uri: 'file:///latte.jpg',
          name: 'latte.jpg',
          mimeType: 'image/jpeg',
        },
        deletePhotoIds: ['photo-1', 'photo-2'],
      }),
    ).resolves.toMatchObject({
      id: 'quick-track-1',
      itemName: 'Updated Latte',
      rating: 5,
      notes: 'Keep foam',
      itemCategory: 'other',
      visibility: 'private',
      userName: 'Taylor',
    });

    expect(foodItemsCollection.update).toHaveBeenCalledWith(
      'quick-track-1',
      {
        name: 'Updated Latte',
        rating: 5,
        notes: 'Keep foam',
        itemCategory: 'other',
        visibility: 'private',
        itemDate: '2026-04-18T07:00:00.000Z',
        location_text: '',
        latitude: null,
        longitude: null,
      },
      {
        expand: 'user,visit,visit.restaurant',
      },
    );
    expect(mockedUploadVisitPhotos).toHaveBeenCalledWith(undefined, 'quick-track-1', 'user-1', [
      {
        uri: 'file:///latte.jpg',
        name: 'latte.jpg',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(visitPhotosCollection.delete).toHaveBeenCalledTimes(2);
    expect(operationOrder).toEqual(['upload', 'delete:photo-1', 'delete:photo-2']);
  });
});
