export interface HomeFeedMapRegion {
  latitude: number;
  latitudeDelta: number;
  longitude: number;
  longitudeDelta: number;
}

export interface HomeFeedMapViewport {
  crossesAntimeridian: boolean;
  east: number;
  identity: string;
  north: number;
  south: number;
  west: number;
}

export const DEFAULT_HOME_FEED_MAP_REGION: HomeFeedMapRegion = {
  latitude: 39.8283,
  latitudeDelta: 35,
  longitude: -98.5795,
  longitudeDelta: 45,
};

const VIEWPORT_PADDING_MULTIPLIER = 1.15;
const VIEWPORT_GRID_DEGREES = 0.05;
const MAX_LATITUDE_SPAN = 80;
const MAX_LONGITUDE_SPAN = 180;
const MAX_VIEWPORT_AREA_SQUARE_KM = 30_000_000;
const EARTH_RADIUS_KM = 6371;

function normalizeLongitude(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function quantizeDown(value: number): number {
  return Math.floor(value / VIEWPORT_GRID_DEGREES) * VIEWPORT_GRID_DEGREES;
}

function quantizeUp(value: number): number {
  return Math.ceil(value / VIEWPORT_GRID_DEGREES) * VIEWPORT_GRID_DEGREES;
}

function formatCoordinate(value: number): string {
  return value.toFixed(2);
}

export function normalizeHomeFeedMapViewport(
  region: HomeFeedMapRegion,
): HomeFeedMapViewport | null {
  const values = [
    region.latitude,
    region.latitudeDelta,
    region.longitude,
    region.longitudeDelta,
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const latitudeDelta = Math.abs(region.latitudeDelta) * VIEWPORT_PADDING_MULTIPLIER;
  const longitudeDelta = Math.abs(region.longitudeDelta) * VIEWPORT_PADDING_MULTIPLIER;
  if (
    latitudeDelta <= 0 ||
    longitudeDelta <= 0 ||
    latitudeDelta > MAX_LATITUDE_SPAN ||
    longitudeDelta > MAX_LONGITUDE_SPAN
  ) {
    return null;
  }

  const south = Math.max(-90, quantizeDown(region.latitude - latitudeDelta / 2));
  const north = Math.min(90, quantizeUp(region.latitude + latitudeDelta / 2));
  const west = normalizeLongitude(quantizeDown(region.longitude - longitudeDelta / 2));
  const east = normalizeLongitude(quantizeUp(region.longitude + longitudeDelta / 2));
  if (north <= south) {
    return null;
  }

  const crossesAntimeridian = west > east;
  const longitudeSpan = crossesAntimeridian ? 360 - west + east : east - west;
  const areaSquareKm = EARTH_RADIUS_KM * EARTH_RADIUS_KM
    * Math.abs(
      Math.sin(north * Math.PI / 180) - Math.sin(south * Math.PI / 180),
    )
    * (longitudeSpan * Math.PI / 180);
  if (areaSquareKm > MAX_VIEWPORT_AREA_SQUARE_KM) {
    return null;
  }

  return {
    crossesAntimeridian,
    east,
    identity: [
      formatCoordinate(south),
      formatCoordinate(west),
      formatCoordinate(north),
      formatCoordinate(east),
      crossesAntimeridian ? 'wrap' : 'standard',
    ].join(':'),
    north,
    south,
    west,
  };
}
