import { searchAndCacheNearbyRestaurants, searchAndCacheRestaurantsByText } from '../lib/googlePlaces';

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      token: 'test-token',
    },
    baseUrl: 'https://example.com',
  },
}));

describe('googlePlaces', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts text search with locationText and returns resolved coordinates plus usage', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        resolvedLocation: {
          lat: 37.7749,
          lng: -122.4194,
        },
        restaurants: [
          {
            city: 'San Francisco, CA',
            cuisineType: 'Pizza',
            id: 'rest_1',
            isGooglePlace: true,
            latitude: 37.78,
            location: 'San Francisco, CA',
            longitude: -122.42,
            name: 'Tony Pizza',
            placeId: 'google-place-1',
            visibility: 'public',
          },
        ],
        usage: {
          limits: {
            menuScansMonthly: 5,
            photoUploadsMonthly: 5,
            photoUploadsPerRecord: 1,
            placesQueriesMonthly: 100,
          },
          monthKey: '2026-04',
          remaining: {
            menuScansMonthly: 5,
            photoUploadsMonthly: 5,
            placesQueriesMonthly: 58,
          },
          usage: {
            menuScans: 0,
            photoUploads: 0,
            placesQueries: 42,
          },
          userTier: 'free',
        },
      }),
      ok: true,
    });

    const result = await searchAndCacheRestaurantsByText({
      locationText: 'San Francisco, CA',
      query: 'pizza',
      radius: 4000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/places/search',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      locationText: 'San Francisco, CA',
      query: 'pizza',
      radius: 4000,
    });
    expect(result.resolvedLocation).toEqual({
      lat: 37.7749,
      lng: -122.4194,
    });
    expect(result.usageSnapshot?.usage.placesQueries).toBe(42);
    expect(result.restaurants).toEqual([
      expect.objectContaining({
        city: 'San Francisco, CA',
        id: 'rest_1',
        name: 'Tony Pizza',
      }),
    ]);
  });

  it('returns nearby results with the updated usage snapshot', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
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
          },
          monthKey: '2026-04',
          remaining: {
            menuScansMonthly: 5,
            photoUploadsMonthly: 5,
            placesQueriesMonthly: 57,
          },
          usage: {
            menuScans: 0,
            photoUploads: 0,
            placesQueries: 43,
          },
          userTier: 'free',
        },
      }),
      ok: true,
    });

    const result = await searchAndCacheNearbyRestaurants({
      latitude: 34.0522,
      longitude: -118.2437,
      radius: 5000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
