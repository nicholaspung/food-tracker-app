import * as pocketbaseModule from '../lib/pocketbase';
import { searchAndCacheNearbyRestaurants, searchAndCacheRestaurantsByText } from '../lib/googlePlaces';

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      token: 'test-token',
    },
    send: jest.fn(),
  },
  __mockSend: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

describe('googlePlaces', () => {
  const mockedPocketbaseModule = pocketbaseModule as typeof pocketbaseModule & {
    __mockSend: jest.Mock;
  };

  beforeEach(() => {
    const mockSend = mockedPocketbaseModule.pb.send as jest.Mock;
    mockSend.mockImplementation(mockedPocketbaseModule.__mockSend);
    mockSend.mockClear();
    mockedPocketbaseModule.__mockSend.mockReset();
  });

  it('posts text search with locationText and returns resolved coordinates plus usage', async () => {
    mockedPocketbaseModule.__mockSend.mockResolvedValue({
      resolvedLocation: {
        lat: 37.7749,
        lng: -122.4194,
      },
      restaurants: [
        {
          city: 'San Francisco, CA',
          cuisineType: 'Pizza',
          id: 'rest_1',
          friendCount: 2,
          hasPendingMenuReview: true,
          isGooglePlace: true,
          latitude: 37.78,
          location: 'San Francisco, CA',
          longitude: -122.42,
          name: 'Tony Pizza',
          placeId: 'google-place-1',
          userVisitCount: 3,
          visibility: 'public',
        },
      ],
      usage: {
        limits: {
          menuScansMonthly: 5,
          photoUploadsMonthly: 5,
          photoUploadsPerRecord: 1,
          placesQueriesMonthly: 100,
          receiptScansMonthly: 5,
          storefrontReadsMonthly: 5,
        },
        monthKey: '2026-04',
        remaining: {
          menuScansMonthly: 5,
          photoUploadsMonthly: 5,
          placesQueriesMonthly: 58,
          receiptScansMonthly: 5,
          storefrontReadsMonthly: 5,
        },
        usage: {
          menuScans: 0,
          photoUploads: 0,
          placesQueries: 42,
          receiptScans: 0,
          storefrontReads: 0,
        },
        userTier: 'free',
      },
    });

    const result = await searchAndCacheRestaurantsByText({
      locationText: 'San Francisco, CA',
      query: 'pizza',
      radius: 4000,
    });

    expect(mockedPocketbaseModule.__mockSend).toHaveBeenCalledTimes(1);
    expect(mockedPocketbaseModule.__mockSend).toHaveBeenCalledWith(
      '/api/places/search',
      expect.objectContaining({
        body: {
          locationText: 'San Francisco, CA',
          query: 'pizza',
          radius: 4000,
        },
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    );
    expect(result.resolvedLocation).toEqual({
      lat: 37.7749,
      lng: -122.4194,
    });
    expect(result.usageSnapshot?.usage.placesQueries).toBe(42);
    expect(result.restaurants).toEqual([
      expect.objectContaining({
        city: 'San Francisco, CA',
        id: 'rest_1',
        friendCount: 2,
        hasPendingMenuReview: true,
        name: 'Tony Pizza',
        userVisitCount: 3,
      }),
    ]);
  });

  it('returns nearby results with the updated usage snapshot', async () => {
    mockedPocketbaseModule.__mockSend.mockResolvedValue({
      restaurants: [
        {
          city: 'Los Angeles, CA',
          id: 'rest_2',
          isGooglePlace: true,
          location: 'Los Angeles, CA',
          name: 'Coffee Spot',
          visibility: 'public',
        },
      ],
      usage: {
        limits: {
          menuScansMonthly: 5,
          photoUploadsMonthly: 5,
          photoUploadsPerRecord: 1,
          placesQueriesMonthly: 100,
          receiptScansMonthly: 5,
          storefrontReadsMonthly: 5,
        },
        monthKey: '2026-04',
        remaining: {
          menuScansMonthly: 5,
          photoUploadsMonthly: 5,
          placesQueriesMonthly: 57,
          receiptScansMonthly: 5,
          storefrontReadsMonthly: 5,
        },
        usage: {
          menuScans: 0,
          photoUploads: 0,
          placesQueries: 43,
          receiptScans: 0,
          storefrontReads: 0,
        },
        userTier: 'free',
      },
    });

    const result = await searchAndCacheNearbyRestaurants({
      latitude: 34.0522,
      longitude: -118.2437,
      radius: 5000,
    });

    expect(mockedPocketbaseModule.__mockSend).toHaveBeenCalledTimes(1);
    expect(mockedPocketbaseModule.__mockSend).toHaveBeenCalledWith(
      '/api/places/nearby',
      expect.objectContaining({
        body: {
          latitude: 34.0522,
          longitude: -118.2437,
          radius: 5000,
        },
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    );
    expect(result.usageSnapshot?.remaining.placesQueriesMonthly).toBe(57);
    expect(result.restaurants).toEqual([
      expect.objectContaining({
        city: 'Los Angeles, CA',
        id: 'rest_2',
        name: 'Coffee Spot',
      }),
    ]);
  });
});
