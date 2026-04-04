import type { RestaurantRecord } from '../features';
import { pb } from './pocketbase';

interface PlacesApiResponse {
  restaurants?: RestaurantRecord[];
}

interface GeocodeApiResponse {
  found?: boolean;
  lat?: number;
  lng?: number;
}

export interface NearbySearchParams {
  latitude: number;
  longitude: number;
  radius?: number;
}

export interface TextSearchParams {
  query: string;
  location?: string;
  radius?: number;
}

function normalizeRestaurantRecord(record: RestaurantRecord): RestaurantRecord {
  const location = record.location?.trim() || undefined;

  return {
    id: record.id,
    name: record.name.trim(),
    location,
    city: record.city?.trim() || location,
    cuisineType: record.cuisineType?.trim() || undefined,
    visibility: record.visibility,
    latitude: typeof record.latitude === 'number' ? record.latitude : undefined,
    longitude: typeof record.longitude === 'number' ? record.longitude : undefined,
    placeId: record.placeId?.trim() || undefined,
    isGooglePlace: record.isGooglePlace === true,
  };
}

async function postPlacesRequest<ResponseType>(path: string, payload: object): Promise<ResponseType> {
  const response = await fetch(`${pb.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: pb.authStore.token ? `Bearer ${pb.authStore.token}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed (${response.status}).`);
  }

  return (await response.json()) as ResponseType;
}

function compareRestaurantRecords(left: RestaurantRecord, right: RestaurantRecord): number {
  const nameComparison = left.name.localeCompare(right.name, undefined, {
    sensitivity: 'base',
  });
  if (nameComparison !== 0) {
    return nameComparison;
  }

  return left.id.localeCompare(right.id);
}

export function mergeRestaurantSearchResults(
  currentRestaurants: RestaurantRecord[] | undefined,
  nextRestaurants: RestaurantRecord[],
): RestaurantRecord[] {
  const merged = new Map<string, RestaurantRecord>();

  for (const restaurant of currentRestaurants ?? []) {
    merged.set(restaurant.id, normalizeRestaurantRecord(restaurant));
  }

  for (const restaurant of nextRestaurants) {
    merged.set(restaurant.id, normalizeRestaurantRecord(restaurant));
  }

  return Array.from(merged.values()).sort(compareRestaurantRecords);
}

export async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  if (!location.trim()) {
    return null;
  }

  const response = await postPlacesRequest<GeocodeApiResponse>('/api/places/geocode', {
    location: location.trim(),
  });

  if (!response.found || typeof response.lat !== 'number' || typeof response.lng !== 'number') {
    return null;
  }

  return { lat: response.lat, lng: response.lng };
}

export async function searchAndCacheNearbyRestaurants(params: NearbySearchParams): Promise<RestaurantRecord[]> {
  const response = await postPlacesRequest<PlacesApiResponse>('/api/places/nearby', {
    latitude: params.latitude,
    longitude: params.longitude,
    radius: params.radius ?? 5000,
  });

  return (response.restaurants ?? []).map(normalizeRestaurantRecord);
}

export async function searchAndCacheRestaurantsByText(params: TextSearchParams): Promise<RestaurantRecord[]> {
  const response = await postPlacesRequest<PlacesApiResponse>('/api/places/search', {
    query: params.query,
    location: params.location ?? '',
    radius: params.radius ?? 5000,
  });

  return (response.restaurants ?? []).map(normalizeRestaurantRecord);
}

export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMiles = 3959;
  const latitudeDelta = ((lat2 - lat1) * Math.PI) / 180;
  const longitudeDelta = ((lng2 - lng1) * Math.PI) / 180;

  const haversineComponent =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(haversineComponent), Math.sqrt(1 - haversineComponent));
}

export function formatDistance(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}
