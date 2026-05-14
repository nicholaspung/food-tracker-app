import type { Region } from 'react-native-maps';

import type { Coordinates } from '../../lib/coordinates';
import type { HomeFeedMapRestaurantGroup } from './homeFeedMapGrouping';

const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  latitudeDelta: 35,
  longitude: -98.5795,
  longitudeDelta: 45,
};

const SINGLE_POINT_DELTA = 0.045;
const MIN_REGION_DELTA = 0.02;
const REGION_PADDING_MULTIPLIER = 1.35;
const SELECTED_RESTAURANT_DELTA = 0.035;
const GPS_RADIUS_MILES = 50;
const MILES_PER_LATITUDE_DEGREE = 69;
const GPS_REGION_PADDING_MULTIPLIER = 1.15;

export function buildInitialMapRegion(groups: readonly HomeFeedMapRestaurantGroup[]): Region {
  if (groups.length === 0) {
    return DEFAULT_REGION;
  }

  if (groups.length === 1) {
    return {
      latitude: groups[0].latitude,
      latitudeDelta: SINGLE_POINT_DELTA,
      longitude: groups[0].longitude,
      longitudeDelta: SINGLE_POINT_DELTA,
    };
  }

  const latitudes = groups.map((group) => group.latitude);
  const longitudes = groups.map((group) => group.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * REGION_PADDING_MULTIPLIER, MIN_REGION_DELTA),
    longitude: (minLongitude + maxLongitude) / 2,
    longitudeDelta: Math.max((maxLongitude - minLongitude) * REGION_PADDING_MULTIPLIER, MIN_REGION_DELTA),
  };
}

export function buildCurrentLocationRegion(coordinates: Coordinates): Region {
  const latitudeRadians = (coordinates.latitude * Math.PI) / 180;
  const latitudeDelta = (GPS_RADIUS_MILES * 2) / MILES_PER_LATITUDE_DEGREE;
  const longitudeDelta = latitudeDelta / Math.max(Math.cos(latitudeRadians), 0.2);

  return {
    latitude: coordinates.latitude,
    latitudeDelta: latitudeDelta * GPS_REGION_PADDING_MULTIPLIER,
    longitude: coordinates.longitude,
    longitudeDelta: longitudeDelta * GPS_REGION_PADDING_MULTIPLIER,
  };
}

export function buildSelectedRestaurantRegion(group: HomeFeedMapRestaurantGroup): Region {
  return {
    latitude: group.latitude,
    latitudeDelta: SELECTED_RESTAURANT_DELTA,
    longitude: group.longitude,
    longitudeDelta: SELECTED_RESTAURANT_DELTA,
  };
}
