import { Platform } from 'react-native';

import { buildRestaurantMapUrl } from '../components/maps/restaurantMapLink';
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

describe('buildRestaurantMapUrl', () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    setPlatformOS(originalPlatformOS as 'ios' | 'android');
  });

  it('builds an Android geo search URL with the restaurant location when available', () => {
    setPlatformOS('android');

    expect(buildRestaurantMapUrl(buildGroup())).toBe(
      'geo:27.17,-80.27?q=Test%20Restaurant%20Palm%20City%2C%20FL',
    );
  });

  it('builds an iOS Apple Maps search URL with the restaurant location when available', () => {
    setPlatformOS('ios');

    const url = buildRestaurantMapUrl(buildGroup());

    expect(url).toBe(
      'https://maps.apple.com/?q=Test%20Restaurant%20Palm%20City%2C%20FL&ll=27.17%2C-80.27',
    );
  });

  it('uses coordinates with the restaurant label when no Android restaurant location is available', () => {
    setPlatformOS('android');

    expect(buildRestaurantMapUrl(buildGroup({
      restaurantLocation: undefined,
    }))).toBe(
      'geo:0,0?q=27.17%2C-80.27(Test%20Restaurant)',
    );
  });

  it('uses the restaurant label and centered coordinates when no iOS restaurant location is available', () => {
    setPlatformOS('ios');

    expect(buildRestaurantMapUrl(buildGroup({
      restaurantLocation: undefined,
    }))).toBe(
      'https://maps.apple.com/?q=Test%20Restaurant&ll=27.17%2C-80.27',
    );
  });

  it('encodes special characters in the restaurant label and query', () => {
    setPlatformOS('ios');

    const url = buildRestaurantMapUrl(buildGroup({
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
