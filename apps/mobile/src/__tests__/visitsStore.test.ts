import { ClientResponseError } from 'pocketbase';

import {
  createVisit,
  getVisitById,
  listVisitsPage,
  listVisitItemPhotos,
  moveVisitItem,
  updateVisit,
} from '../features/store/visitsStore';
import {
  listCollectionRecords,
  sendApiRequest,
} from '../features/store/pocketbaseGateway';
import { uploadVisitPhotos } from '../features/store/visitPhotoUploads';
import { pb } from '../lib/pocketbase';

jest.mock('../features/store/pocketbaseGateway', () => ({
  listCollectionRecords: jest.fn(),
  sendApiRequest: jest.fn(),
}));

jest.mock('../features/store/visitPhotoUploads', () => ({
  uploadVisitPhotos: jest.fn(),
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

const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;
const mockedListCollectionRecords = listCollectionRecords as jest.MockedFunction<
  typeof listCollectionRecords
>;
const mockedUploadVisitPhotos = uploadVisitPhotos as jest.MockedFunction<typeof uploadVisitPhotos>;
const mockedPocketBase = pb as typeof pb & {
  authStore: {
    record: {
      collectionId: string;
      collectionName: string;
      id: string;
    } | null;
  };
  collection: jest.Mock;
};

function buildClientResponseError(status: number): ClientResponseError {
  return new ClientResponseError({
    response: {
      data: {},
      message: 'not found',
    },
    status,
    url: 'https://app.yummyrecs.com/api/visits/visit-123',
  });
}

describe('visitsStore.getVisitById', () => {
  beforeEach(() => {
    mockedSendApiRequest.mockReset();
    mockedListCollectionRecords.mockReset();
    mockedUploadVisitPhotos.mockReset();
    mockedPocketBase.collection.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('loads visit detail through the visits api endpoint', async () => {
    const abortController = new AbortController();
    const visit = {
      id: 'visit-123',
      restaurantName: 'Noodle House',
      visitedAt: '2026-04-05T18:00:00Z',
      items: [],
      source: 'visit' as const,
      createdAt: '2026-04-05T18:00:00Z',
      updatedAt: '2026-04-05T18:00:00Z',
    };

    mockedSendApiRequest.mockResolvedValue(visit);

    await expect(getVisitById('visit-123', { signal: abortController.signal })).resolves.toMatchObject({
      ...visit,
      visibility: 'friends',
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith('/api/visits/visit-123', {
      method: 'GET',
      signal: abortController.signal,
    });
  });

  it('returns null when the user is not authenticated', async () => {
    mockedPocketBase.authStore.record = null;

    await expect(getVisitById('visit-123')).resolves.toBeNull();
    expect(mockedSendApiRequest).not.toHaveBeenCalled();
  });

  it('returns null when the api endpoint reports a missing visit', async () => {
    mockedSendApiRequest.mockRejectedValue(buildClientResponseError(404));

    await expect(getVisitById('visit-123')).resolves.toBeNull();
  });

  it('loads visit item photos grouped by visit item id', async () => {
    const abortController = new AbortController();
    mockedListCollectionRecords.mockResolvedValue([
      {
        id: 'photo-1',
        food_item: 'item-1',
        user: 'user-1',
        photo: 'wontons.jpg',
        created: '2026-04-05T18:00:00.000Z',
      },
      {
        id: 'photo-2',
        food_item: 'item-2',
        user: 'user-1',
        photo: 'noodles.jpg',
        created: '2026-04-05T18:05:00.000Z',
      },
    ]);

    await expect(
      listVisitItemPhotos(['item-1', 'item-2'], { signal: abortController.signal }),
    ).resolves.toEqual({
      'item-1': [
        {
          id: 'photo-1',
          food_item: 'item-1',
          user: 'user-1',
          photo: 'wontons.jpg',
          collectionName: 'visit_photos',
          created: '2026-04-05T18:00:00.000Z',
        },
      ],
      'item-2': [
        {
          id: 'photo-2',
          food_item: 'item-2',
          user: 'user-1',
          photo: 'noodles.jpg',
          collectionName: 'visit_photos',
          created: '2026-04-05T18:05:00.000Z',
        },
      ],
    });

    expect(mockedListCollectionRecords).toHaveBeenCalledWith('visit_photos', {
      fields: 'id,food_item,user,photo,created',
      filter: '(food_item = "item-1" || food_item = "item-2")',
      pageSize: 100,
      signal: abortController.signal,
      sort: '-created',
    });
  });

  it('loads paginated visits through the visits page endpoint', async () => {
    const abortController = new AbortController();
    mockedSendApiRequest.mockResolvedValue({
      items: [
        {
          id: 'visit-123',
          restaurantName: 'Noodle House',
          visitedAt: '2026-04-05T18:00:00.000Z',
          items: [],
          moderationStatus: 'active',
          userName: 'Taylor',
          createdAt: '2026-04-05T18:00:00.000Z',
          updatedAt: '2026-04-05T18:10:00.000Z',
        },
      ],
      page: 2,
      pageSize: 15,
      totalItems: 16,
      totalPages: 2,
      hasNextPage: false,
    });

    await expect(
      listVisitsPage({
        page: 2,
        pageSize: 15,
        scope: 'mine',
        search: 'broth',
        signal: abortController.signal,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 'visit-123',
          restaurantId: undefined,
          restaurantName: 'Noodle House',
          restaurantLocation: undefined,
          restaurantCuisineType: undefined,
          visitedAt: '2026-04-05T18:00:00.000Z',
          items: [],
          source: 'visit',
          userId: undefined,
          userName: 'Taylor',
          visibility: 'friends',
          moderationStatus: 'active',
          createdAt: '2026-04-05T18:00:00.000Z',
          updatedAt: '2026-04-05T18:10:00.000Z',
        },
      ],
      page: 2,
      pageSize: 15,
      totalItems: 16,
      totalPages: 2,
      hasNextPage: false,
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/visits?page=2&pageSize=15&scope=mine&search=broth',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
  });

  it('moves a visit item through the visit-item move endpoint', async () => {
    mockedSendApiRequest.mockResolvedValue({
      itemId: 'visit-item-1',
      destinationVisitId: 'visit-456',
    });

    await expect(
      moveVisitItem({
        itemId: 'visit-item-1',
        destinationVisitId: 'visit-456',
      }),
    ).resolves.toEqual({
      itemId: 'visit-item-1',
      destinationVisitId: 'visit-456',
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/visit-items/visit-item-1/move',
      {
        method: 'POST',
        body: {
          destinationVisitId: 'visit-456',
        },
      },
    );
  });

  it('sends visitedOn on create and uploads photos to the newly created item ids first', async () => {
    mockedSendApiRequest.mockResolvedValue({
      id: 'visit-123',
      restaurantId: 'restaurant-1',
      restaurantName: 'Noodle House',
      visitedAt: '2026-04-05T18:00:00.000Z',
      visibility: 'friends',
      items: [
        {
          id: 'visit-item-new-1',
          name: 'Spicy Wontons',
          rating: 4,
          description: 'Crispy',
          notes: 'Shareable',
        },
        {
          id: 'visit-item-old-1',
          name: 'Dan Dan Noodles',
          rating: 5,
        },
      ],
      source: 'visit',
      createdAt: '2026-04-05T18:00:00.000Z',
      updatedAt: '2026-04-05T18:10:00.000Z',
    });

    await expect(
      createVisit({
        restaurantId: 'restaurant-1',
        restaurantName: 'Noodle House',
        visitedAt: '2026-04-05T18:00:00.000Z',
        visitedOn: '2026-04-05',
        visibility: 'friends',
        items: [
          {
            name: 'Spicy Wontons',
            rating: 4,
            description: 'Crispy',
            notes: 'Shareable',
            photos: [
              {
                uri: 'file:///wontons.jpg',
                name: 'wontons.jpg',
                mimeType: 'image/jpeg',
              },
            ],
          },
        ],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
      id: 'visit-123',
        items: expect.arrayContaining([
          expect.objectContaining({
          id: 'visit-item-new-1',
          name: 'Spicy Wontons',
          }),
        ]),
      }),
    );

    expect(mockedSendApiRequest).toHaveBeenCalledWith('/api/visits', {
      method: 'POST',
      body: {
        restaurantId: 'restaurant-1',
        restaurantName: 'Noodle House',
        items: [
          {
            name: 'Spicy Wontons',
            rating: 4,
            description: 'Crispy',
            notes: 'Shareable',
          },
        ],
        visitedAt: '2026-04-05T18:00:00.000Z',
        visitedOn: '2026-04-05',
        visibility: 'friends',
      },
    });
    expect(mockedUploadVisitPhotos).toHaveBeenCalledWith(
      'visit-123',
      'visit-item-new-1',
      'user-1',
      [
        {
          uri: 'file:///wontons.jpg',
          name: 'wontons.jpg',
          mimeType: 'image/jpeg',
        },
      ],
      'Crispy',
    );
  });

  it('deletes removed photo ids before uploading new visit item photos during edit', async () => {
    const operationOrder: string[] = [];
    const visitPhotosCollection = {
      delete: jest
        .fn()
        .mockImplementationOnce(async () => {
          operationOrder.push('delete:photo-1');
        })
        .mockImplementationOnce(async () => {
          operationOrder.push('delete:photo-2');
          throw buildClientResponseError(404);
        }),
    };

    mockedPocketBase.collection.mockImplementation((collectionName: string) => {
      if (collectionName === 'visit_photos') {
        return visitPhotosCollection;
      }

      throw new Error(`Unexpected collection: ${collectionName}`);
    });
    mockedSendApiRequest.mockResolvedValue({
      id: 'visit-123',
      restaurantId: 'restaurant-1',
      restaurantName: 'Noodle House',
      visitedAt: '2026-04-05T18:00:00.000Z',
      visibility: 'friends',
      items: [
        {
          id: 'visit-item-1',
          name: 'Spicy Wontons',
          rating: 4,
          description: 'Crispy',
          notes: 'Shareable',
        },
      ],
      source: 'visit',
      createdAt: '2026-04-05T18:00:00.000Z',
      updatedAt: '2026-04-05T18:10:00.000Z',
    });
    mockedUploadVisitPhotos.mockImplementation(async () => {
      operationOrder.push('upload');
    });

    await expect(
      updateVisit('visit-123', {
        restaurantName: 'Noodle House',
        visitedAt: '2026-04-05T18:00:00.000Z',
        visitedOn: '2026-04-05',
        visibility: 'friends',
        items: [
          {
            id: 'draft-item-1',
            name: 'Spicy Wontons',
            rating: 4,
            description: 'Crispy',
            notes: 'Shareable',
            deletePhotoIds: ['photo-1', 'photo-2'],
            newPhotos: [
              {
                uri: 'file:///wontons.jpg',
                name: 'wontons.jpg',
                mimeType: 'image/jpeg',
              },
            ],
          },
        ],
      }),
    ).resolves.toMatchObject({
      id: 'visit-123',
      restaurantName: 'Noodle House',
      items: [
        {
          id: 'visit-item-1',
          name: 'Spicy Wontons',
        },
      ],
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith('/api/visits/visit-123', {
      method: 'PUT',
      body: {
        restaurantId: undefined,
        restaurantName: 'Noodle House',
        items: [
          {
            id: 'draft-item-1',
            name: 'Spicy Wontons',
            rating: 4,
            description: 'Crispy',
            notes: 'Shareable',
          },
        ],
        visitedAt: '2026-04-05T18:00:00.000Z',
        visitedOn: '2026-04-05',
        visibility: 'friends',
      },
    });
    expect(mockedUploadVisitPhotos).toHaveBeenCalledWith(
      'visit-123',
      'visit-item-1',
      'user-1',
      [
        {
          uri: 'file:///wontons.jpg',
          name: 'wontons.jpg',
          mimeType: 'image/jpeg',
        },
      ],
      'Crispy',
    );
    expect(operationOrder).toEqual(['delete:photo-1', 'delete:photo-2', 'upload']);
  });
});
