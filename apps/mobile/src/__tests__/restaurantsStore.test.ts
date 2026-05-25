import { getAllLocationsHistory } from '../features/store/restaurantsStore';
import { sendApiRequest } from '../features/store/pocketbaseGateway';
import { pb } from '../lib/pocketbase';

jest.mock('../features/store/pocketbaseGateway', () => ({
  sendApiRequest: jest.fn(),
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
  },
}));

const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;
const mockedPocketBase = pb as typeof pb & {
  authStore: {
    record: {
      collectionId: string;
      collectionName: string;
      id: string;
    } | null;
  };
};

describe('restaurantsStore', () => {
  beforeEach(() => {
    mockedSendApiRequest.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user-1',
    };
  });

  it('loads all locations history from the feature endpoint', async () => {
    const abortController = new AbortController();
    mockedSendApiRequest.mockResolvedValue({
      anchorRestaurant: {
        id: 'restaurant-1',
        name: 'Noodle House',
      },
      itemCount: 0,
      items: [],
      locationCount: 1,
      normalizedName: 'noodle house',
      restaurants: [],
      visitCount: 0,
    });

    await expect(
      getAllLocationsHistory(' restaurant-1 ', { signal: abortController.signal }),
    ).resolves.toEqual(
      expect.objectContaining({
        normalizedName: 'noodle house',
      }),
    );

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/restaurants/restaurant-1/same-name-history',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
  });
});
