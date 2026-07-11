import {
  DEFAULT_HOME_FEED_MAP_REGION,
  normalizeHomeFeedMapViewport,
} from '../features/store/homeFeedMapViewport';

describe('normalizeHomeFeedMapViewport', () => {
  it('pads and quantizes equivalent regions to one stable identity', () => {
    const first = normalizeHomeFeedMapViewport({
      latitude: 37.78,
      latitudeDelta: 0.1,
      longitude: -122.42,
      longitudeDelta: 0.12,
    });
    const second = normalizeHomeFeedMapViewport({
      latitude: 37.781,
      latitudeDelta: 0.099,
      longitude: -122.419,
      longitudeDelta: 0.119,
    });

    expect(first).not.toBeNull();
    expect(second?.identity).toBe(first?.identity);
    expect(first).toMatchObject({
      crossesAntimeridian: false,
      north: 37.85,
      south: 37.7,
    });
  });

  it('represents antimeridian-crossing regions with wrapped longitudes', () => {
    expect(normalizeHomeFeedMapViewport({
      latitude: 10,
      latitudeDelta: 4,
      longitude: 179,
      longitudeDelta: 6,
    })).toMatchObject({
      crossesAntimeridian: true,
      east: expect.any(Number),
      west: expect.any(Number),
    });
  });

  it('rejects malformed and excessively broad regions', () => {
    expect(normalizeHomeFeedMapViewport({
      ...DEFAULT_HOME_FEED_MAP_REGION,
      latitude: Number.NaN,
    })).toBeNull();
    expect(normalizeHomeFeedMapViewport({
      latitude: 0,
      latitudeDelta: 90,
      longitude: 0,
      longitudeDelta: 45,
    })).toBeNull();
    expect(normalizeHomeFeedMapViewport({
      latitude: 0,
      latitudeDelta: 20,
      longitude: 0,
      longitudeDelta: 200,
    })).toBeNull();
    expect(normalizeHomeFeedMapViewport({
      latitude: 0,
      latitudeDelta: 60,
      longitude: 0,
      longitudeDelta: 150,
    })).toBeNull();
  });

  it('normalizes the independent default region without marker data', () => {
    expect(normalizeHomeFeedMapViewport(DEFAULT_HOME_FEED_MAP_REGION)).not.toBeNull();
  });
});
