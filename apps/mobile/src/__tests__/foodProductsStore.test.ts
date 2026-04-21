import { ClientResponseError } from 'pocketbase';

import {
  createFoodProduct,
  getFoodProductById,
  listFoodProductCategorySuggestions,
  listFoodProductPhotos,
  updateFoodProduct,
} from '../features/store/foodProductsStore';
import { listCollectionRecords, sendApiRequest } from '../features/store/pocketbaseGateway';
import { uploadVisitPhotos } from '../features/store/visitPhotoUploads';
import { pb } from '../lib/pocketbase';

jest.mock('../features/store/pocketbaseGateway', () => ({
  listCollectionRecords: jest.fn(),
  sendApiRequest: jest.fn(),
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
const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;
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
    mockedListCollectionRecords.mockReset();
    mockedSendApiRequest.mockReset();
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
    const foodItemsCollection = {
      getOne: jest.fn().mockResolvedValue({
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
      }),
    };

    (mockedPocketBase.collection as jest.Mock).mockImplementation((collectionName: string) => {
      if (collectionName === 'food_items') {
        return foodItemsCollection;
      }
      throw new Error(`Unexpected collection: ${collectionName}`);
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
    const foodItemsCollection = {
      update: jest.fn().mockResolvedValue({
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

    expect(foodItemsCollection.update).toHaveBeenCalledWith(
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
      },
    );
    expect(mockedUploadVisitPhotos).toHaveBeenCalledWith(undefined, 'food-product-1', 'user-1', [
      {
        uri: 'file:///latte.jpg',
        name: 'latte.jpg',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(visitPhotosCollection.delete).toHaveBeenCalledTimes(2);
    expect(operationOrder).toEqual(['upload', 'delete:photo-1', 'delete:photo-2']);
  });

  it('creates a food product with freeform location text and clears legacy coordinates', async () => {
    const foodItemsCollection = {
      create: jest.fn().mockResolvedValue({
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
      }),
    };

    (mockedPocketBase.collection as jest.Mock).mockImplementation((collectionName: string) => {
      if (collectionName === 'food_items') {
        return foodItemsCollection;
      }
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await expect(
      createFoodProduct({
        itemName: '  Matcha Latte  ',
        locationText: '  Ferry Building  ',
        rating: 4,
        notes: '  Earthy  ',
        visibility: 'friends',
        itemCategory: 'packaged_food',
        itemDate: '2026-04-18T07:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      id: 'food-product-2',
      itemName: 'Matcha Latte',
      locationText: 'Ferry Building',
      rating: 4,
      notes: 'Earthy',
      userName: 'Taylor',
    });

    expect(foodItemsCollection.create).toHaveBeenCalledWith(
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
      },
    );
  });

  it('clears food product location text when the user removes it during edit', async () => {
    const foodItemsCollection = {
      update: jest.fn().mockResolvedValue({
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
      }),
    };

    (mockedPocketBase.collection as jest.Mock).mockImplementation((collectionName: string) => {
      if (collectionName === 'food_items') {
        return foodItemsCollection;
      }
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await updateFoodProduct('food-product-3', {
      locationText: '   ',
    });

    expect(foodItemsCollection.update).toHaveBeenCalledWith(
      'food-product-3',
      {
        location_text: '',
        latitude: null,
        longitude: null,
      },
      {
        expand: 'user,visit,visit.restaurant',
      },
    );
  });

  it('rejects updates when the returned record is not a food product', async () => {
    const foodItemsCollection = {
      update: jest.fn().mockResolvedValue({
        id: 'visit-item-1',
        itemType: 'visit-item',
      }),
    };

    (mockedPocketBase.collection as jest.Mock).mockImplementation((collectionName: string) => {
      if (collectionName === 'food_items') {
        return foodItemsCollection;
      }
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await expect(
      updateFoodProduct('visit-item-1', {
        itemName: '  Updated Latte  ',
      }),
    ).rejects.toThrow('Food product record not found.');

    expect(foodItemsCollection.update).toHaveBeenCalledWith(
      'visit-item-1',
      {
        name: 'Updated Latte',
        latitude: null,
        longitude: null,
      },
      {
        expand: 'user,visit,visit.restaurant',
      },
    );
  });
});
