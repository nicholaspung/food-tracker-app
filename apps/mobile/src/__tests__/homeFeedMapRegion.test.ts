import {
  buildCurrentLocationRegion,
  buildSelectedRestaurantRegion,
} from '../screens/home/homeFeedMapRegion';

describe('buildCurrentLocationRegion', () => {
  it('builds a viewport around a 50 mile radius from the current location', () => {
    const region = buildCurrentLocationRegion({
      latitude: 34.05,
      longitude: -118.24,
    });

    expect(region.latitude).toBe(34.05);
    expect(region.longitude).toBe(-118.24);
    expect(region.latitudeDelta).toBeCloseTo(1.6667, 3);
    expect(region.longitudeDelta).toBeCloseTo(2.009, 2);
  });
});

describe('buildSelectedRestaurantRegion', () => {
  it('builds a focused viewport around the selected restaurant', () => {
    const region = buildSelectedRestaurantRegion({
      foodProductCount: 0,
      id: 'restaurant-1',
      items: [],
      latitude: 34.05,
      longitude: -118.24,
      points: [],
      ratingAverage: null,
      restaurantName: 'CCB Snack Bar',
      visitCount: 1,
    });

    expect(region).toEqual({
      latitude: 34.05,
      latitudeDelta: 0.035,
      longitude: -118.24,
      longitudeDelta: 0.035,
    });
  });
});
