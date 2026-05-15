import { Platform } from 'react-native';

import { buildRestaurantDirectionsUrl } from '../components/maps/restaurantDirectionsLink';
import type { RestaurantMapGroup } from '../components/maps/restaurantMapTypes';

function setPlatformOS(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => os,
  });
}

function buildGroup(overrides: Partial<RestaurantMapGroup> = {}): RestaurantMapGroup {
  return {
    id: 'restaurant-1',
    items: [],
    latitude: 27.17,
    longitude: -80.27,
    restaurantLocation: 'Palm City, FL',
    restaurantName: 'Test Restaurant',
    summary: '3 ratings - 2 visits',
    ...overrides,
  };
}

describe('buildRestaurantDirectionsUrl', () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    setPlatformOS(originalPlatformOS as 'ios' | 'android');
  });

  it('builds an Android geo URL with the restaurant location when available', () => {
    setPlatformOS('android');

    expect(buildRestaurantDirectionsUrl(buildGroup())).toBe(
      'geo:0,0?q=Test%20Restaurant%20Palm%20City%2C%20FL',
    );
  });

  it('builds an iOS Apple Maps driving directions URL with the restaurant location when available', () => {
    setPlatformOS('ios');

    const url = buildRestaurantDirectionsUrl(buildGroup());

    expect(url).toBe(
      'https://maps.apple.com/?daddr=Test%20Restaurant%20Palm%20City%2C%20FL&q=Test%20Restaurant&dirflg=d',
    );
  });

  it('falls back to coordinates when no restaurant location is available', () => {
    setPlatformOS('ios');

    expect(buildRestaurantDirectionsUrl(buildGroup({
      restaurantLocation: undefined,
    }))).toBe(
      'https://maps.apple.com/?daddr=27.17,-80.27&q=Test%20Restaurant&dirflg=d',
    );
  });

  it('encodes special characters in the restaurant label and query', () => {
    setPlatformOS('ios');

    const url = buildRestaurantDirectionsUrl(buildGroup({
      restaurantLocation: 'A/B Market',
      restaurantName: "Bob's Sushi & Grill (North)",
    }));

    expect(url).toContain('Bob%27s%20Sushi%20%26%20Grill%20%28North%29');
    expect(url).toContain('A%2FB%20Market');
    expect(url).not.toContain("Bob's");
    expect(url).not.toContain('Sushi & Grill');
    expect(url).not.toContain('(North)');
    expect(url).not.toContain('A/B');
  });
});
