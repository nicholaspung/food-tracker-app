import { ClientResponseError } from 'pocketbase';

import {
  createFoodProduct,
  getFoodProductById,
  listFoodProductCategorySuggestions,
  listFoodProductPhotos,
  updateFoodProduct,
} from '../features/store/foodProductsStore';
import {
  createCollectionRecord,
  deleteCollectionRecord,
  getCollectionRecord,
  listCollectionRecords,
  sendApiRequest,
  updateCollectionRecord,
} from '../features/store/pocketbaseGateway';
import { uploadVisitPhotos } from '../features/store/visitPhotoUploads';
import { pb } from '../lib/pocketbase';

jest.mock('../features/store/pocketbaseGateway', () => ({
  createCollectionRecord: jest.fn(),
  deleteCollectionRecord: jest.fn(),
  getCollectionRecord: jest.fn(),
  listCollectionRecords: jest.fn(),
  sendApiRequest: jest.fn(),
  updateCollectionRecord: jest.fn(),
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

const mockedCreateCollectionRecord = createCollectionRecord as jest.MockedFunction<typeof createCollectionRecord>;
const mockedDeleteCollectionRecord = deleteCollectionRecord as jest.MockedFunction<typeof deleteCollectionRecord>;
const mockedGetCollectionRecord = getCollectionRecord as jest.MockedFunction<typeof getCollectionRecord>;
const mockedListCollectionRecords = listCollectionRecords as jest.MockedFunction<typeof listCollectionRecords>;
const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;
const mockedUpdateCollectionRecord = updateCollectionRecord as jest.MockedFunction<typeof updateCollectionRecord>;
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

describe('foodProductsStore', () => {
  beforeEach(() => {
    mockedCreateCollectionRecord.mockReset();
    mockedDeleteCollectionRecord.mockReset();
    mockedGetCollectionRecord.mockReset();
    mockedListCollectionRecords.mockReset();
    mockedSendApiRequest.mockReset();
    mockedUpdateCollectionRecord.mockReset();
    mockedUploadVisitPhotos.mockReset();
    (mockedPocketBase.collection as jest.Mock).mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('lists food product photos from visit_photos using the food item id', async () => {
    const abortController = new AbortController();
    mockedListCollectionRecords.mockResolvedValue([
      {
        id: 'photo-1',
        food_item: 'food-product-1',
        user: 'user-1',
        photo: 'iced-coffee.jpg',
        created: '2026-04-12T18:30:00.000Z',
      },
    ]);

    await expect(
      listFoodProductPhotos('food-product-1', { signal: abortController.signal }),
    ).resolves.toEqual([
      {
        id: 'photo-1',
        food_item: 'food-product-1',
        user: 'user-1',
        photo: 'iced-coffee.jpg',
        collectionName: 'visit_photos',
        created: '2026-04-12T18:30:00.000Z',
      },
    ]);

    expect(mockedListCollectionRecords).toHaveBeenCalledWith('visit_photos', {
      fields: 'id,food_item,user,photo,created',
      filter: 'food_item = "food-product-1"',
      pageSize: 100,
      signal: abortController.signal,
      sort: '-created',
    });
  });

  it('loads normalized category suggestions through the food products api endpoint', async () => {
    const abortController = new AbortController();
    mockedSendApiRequest.mockResolvedValue({
      items: [
        {
          label: 'Beverage',
          normalizedLabel: 'beverage',
          useCount: 3,
          lastUsedAt: '2026-04-19T07:00:00.000Z',
        },
      ],
    });

    await expect(
      listFoodProductCategorySuggestions('  Beverage   ', {
        signal: abortController.signal,
      }),
    ).resolves.toEqual([
      {
        label: 'Beverage',
        normalizedLabel: 'beverage',
        useCount: 3,
        lastUsedAt: '2026-04-19T07:00:00.000Z',
      },
    ]);

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/food-products/category-suggestions?limit=8&query=Beverage',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
  });

  it('loads a food product when the record uses itemType without the legacy flag', async () => {
    mockedGetCollectionRecord.mockResolvedValue({
        id: 'food-product-lookup-1',
        itemType: 'food-product',
        name: 'Sparkling Water',
        location_text: 'Corner Store',
        rating: 4,
        notes: 'Cold',
        user: 'user-1',
        visibility: 'friends',
        itemCategory: 'Beverages',
        itemDate: '2026-04-19T07:00:00.000Z',
        created: '2026-04-19T07:00:00.000Z',
        updated: '2026-04-19T07:00:00.000Z',
        expand: {
          user: {
            id: 'user-1',
            name: 'Taylor',
          },
        },
    });

    await expect(getFoodProductById('food-product-lookup-1')).resolves.toMatchObject({
      id: 'food-product-lookup-1',
      itemName: 'Sparkling Water',
      locationText: 'Corner Store',
      itemCategory: 'Beverages',
      userName: 'Taylor',
    });
  });

  it('uploads a replacement photo before deleting old primary photo ids', async () => {
    const operationOrder: string[] = [];
    mockedUpdateCollectionRecord.mockResolvedValue({
        id: 'food-product-1',
        itemType: 'food-product',
        name: 'Updated Latte',
        location_text: 'Market Hall',
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
    });
    mockedDeleteCollectionRecord
      .mockImplementationOnce(async () => {
        operationOrder.push('delete:photo-1');
        throw buildClientResponseError(404);
      })
      .mockImplementationOnce(async () => {
        operationOrder.push('delete:photo-2');
      });
    mockedUploadVisitPhotos.mockImplementation(async () => {
      operationOrder.push('upload');
    });

    await expect(
      updateFoodProduct('food-product-1', {
        itemName: '  Updated Latte  ',
        locationText: '  Market Hall  ',
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
      id: 'food-product-1',
      itemName: 'Updated Latte',
      locationText: 'Market Hall',
      rating: 5,
      notes: 'Keep foam',
      itemCategory: 'other',
      visibility: 'private',
      userName: 'Taylor',
    });

    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith(
      'food_items',
      'food-product-1',
      {
        name: 'Updated Latte',
        rating: 5,
        location_text: 'Market Hall',
        notes: 'Keep foam',
        itemCategory: 'other',
        visibility: 'private',
        itemDate: '2026-04-18T07:00:00.000Z',
        latitude: null,
        longitude: null,
      },
      {
        expand: 'user,visit,visit.restaurant',
        headers: undefined,
      },
    );
    expect(mockedUploadVisitPhotos).toHaveBeenCalledWith(
      undefined,
      'food-product-1',
      'user-1',
      [
        {
          uri: 'file:///latte.jpg',
          name: 'latte.jpg',
          mimeType: 'image/jpeg',
        },
      ],
      undefined,
      undefined,
    );
    expect(mockedDeleteCollectionRecord).toHaveBeenCalledTimes(2);
    expect(operationOrder).toEqual(['upload', 'delete:photo-1', 'delete:photo-2']);
  });

  it('creates a food product with freeform location text and clears legacy coordinates', async () => {
    const controller = new AbortController();
    const requestOptions = {
      headers: {
        Authorization: 'Bearer account_a_token',
      },
      signal: controller.signal,
    };
    const photo = {
      uri: 'file:///matcha.jpg',
      name: 'matcha.jpg',
      mimeType: 'image/jpeg',
    };
    mockedCreateCollectionRecord.mockResolvedValue({
        id: 'food-product-2',
        name: 'Matcha Latte',
        location_text: 'Ferry Building',
        rating: 4,
        notes: 'Earthy',
        user: 'user-1',
        visibility: 'friends',
        itemCategory: 'packaged_food',
        itemDate: '2026-04-18T07:00:00.000Z',
        created: '2026-04-18T07:00:00.000Z',
        updated: '2026-04-18T07:00:00.000Z',
        expand: {
          user: {
            id: 'user-1',
            name: 'Taylor',
          },
        },
    });

    await expect(
      createFoodProduct(
        {
          itemName: '  Matcha Latte  ',
          locationText: '  Ferry Building  ',
          rating: 4,
          notes: '  Earthy  ',
          visibility: 'friends',
          itemCategory: 'packaged_food',
          itemDate: '2026-04-18T07:00:00.000Z',
          photo,
        },
        requestOptions,
      ),
    ).resolves.toMatchObject({
      id: 'food-product-2',
      itemName: 'Matcha Latte',
      locationText: 'Ferry Building',
      rating: 4,
      notes: 'Earthy',
      userName: 'Taylor',
    });

    expect(mockedCreateCollectionRecord).toHaveBeenCalledWith(
      'food_items',
      {
        name: 'Matcha Latte',
        rating: 4,
        user: 'user-1',
        itemType: 'food-product',
        visibility: 'friends',
        itemDate: '2026-04-18T07:00:00.000Z',
        location_text: 'Ferry Building',
        latitude: null,
        longitude: null,
        notes: 'Earthy',
        itemCategory: 'packaged_food',
      },
      {
        expand: 'user,visit,visit.restaurant',
        headers: {
          Authorization: 'Bearer account_a_token',
        },
        signal: controller.signal,
      },
    );
    expect(mockedUploadVisitPhotos).toHaveBeenCalledWith(
      undefined,
      'food-product-2',
      'user-1',
      [photo],
      undefined,
      requestOptions,
    );
  });

  it('resumes a queued create after the product commits but its photo upload fails', async () => {
    const requestOptions = {
      headers: {
        Authorization: 'Bearer account_a_token',
        'Idempotency-Key': 'food-product-replay-1',
      },
    };
    const photo = {
      uri: 'file:///private.jpg',
      name: 'private.jpg',
      mimeType: 'image/jpeg',
    };
    const committedRecord = {
      id: 'replay-product-1',
      itemType: 'food-product',
      name: 'Private snack',
      rating: 4,
      user: 'user-1',
      visibility: 'private',
      itemDate: '2026-04-18T07:00:00.000Z',
      created: '2026-04-18T07:00:00.000Z',
      updated: '2026-04-18T07:00:00.000Z',
    };
    mockedCreateCollectionRecord
      .mockResolvedValueOnce(committedRecord)
      .mockRejectedValueOnce(buildClientResponseError(400));
    mockedGetCollectionRecord.mockResolvedValue(committedRecord);
    mockedUploadVisitPhotos
      .mockRejectedValueOnce(new Error('upload connection lost'))
      .mockResolvedValueOnce(undefined);

    const input = {
      itemName: 'Private snack',
      rating: 4,
      visibility: 'private' as const,
      itemDate: '2026-04-18T07:00:00.000Z',
      photo,
    };

    await expect(createFoodProduct(input, requestOptions)).rejects.toThrow(
      'upload connection lost',
    );
    await expect(createFoodProduct(input, requestOptions)).resolves.toMatchObject({
      id: 'replay-product-1',
      itemName: 'Private snack',
      visibility: 'private',
    });

    const firstPayload = mockedCreateCollectionRecord.mock.calls[0]?.[1];
    const secondPayload = mockedCreateCollectionRecord.mock.calls[1]?.[1];
    expect(firstPayload?.id).toMatch(/^i[a-z0-9]{14}$/);
    expect(secondPayload?.id).toBe(firstPayload?.id);
    expect(mockedGetCollectionRecord).toHaveBeenCalledWith(
      'food_items',
      firstPayload?.id,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer account_a_token',
        }),
      }),
    );
    expect(mockedUploadVisitPhotos).toHaveBeenCalledTimes(2);
    expect(mockedUploadVisitPhotos).toHaveBeenNthCalledWith(
      2,
      undefined,
      'replay-product-1',
      'user-1',
      [photo],
      undefined,
      requestOptions,
    );
  });

  it('clears food product location text when the user removes it during edit', async () => {
    mockedUpdateCollectionRecord.mockResolvedValue({
        id: 'food-product-3',
        itemType: 'food-product',
        name: 'Cold Brew',
        location_text: '',
        rating: 3,
        user: 'user-1',
        visibility: 'friends',
        itemDate: '2026-04-18T07:00:00.000Z',
        created: '2026-04-12T18:30:00.000Z',
        updated: '2026-04-18T07:00:00.000Z',
    });

    await updateFoodProduct('food-product-3', {
      locationText: '   ',
    });

    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith(
      'food_items',
      'food-product-3',
      {
        location_text: '',
        latitude: null,
        longitude: null,
      },
      {
        expand: 'user,visit,visit.restaurant',
        headers: undefined,
      },
    );
  });

  it('rejects updates when the returned record is not a food product', async () => {
    mockedUpdateCollectionRecord.mockResolvedValue({
        id: 'visit-item-1',
        itemType: 'visit-item',
    });

    await expect(
      updateFoodProduct('visit-item-1', {
        itemName: '  Updated Latte  ',
      }),
    ).rejects.toThrow('Food product record not found.');

    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith(
      'food_items',
      'visit-item-1',
      {
        name: 'Updated Latte',
        latitude: null,
        longitude: null,
      },
      {
        expand: 'user,visit,visit.restaurant',
        headers: undefined,
      },
    );
  });
});
