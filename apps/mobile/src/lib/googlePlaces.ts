import type { MonthlyUsageSnapshot, RestaurantRecord } from '../features';
import { pb } from './pocketbase';

interface PlacesApiResponse {
  restaurants?: RestaurantRecord[];
  resolvedLocation?: {
    lat?: number;
    lng?: number;
  };
  usage?: MonthlyUsageSnapshot;
}

export interface NearbySearchParams {
  latitude: number;
  longitude: number;
  radius?: number;
}

export interface TextSearchParams {
  query: string;
  locationText?: string;
  radius?: number;
}

export interface PlacesSearchResult {
  restaurants: RestaurantRecord[];
  usageSnapshot: MonthlyUsageSnapshot | null;
}

export interface TextPlacesSearchResult extends PlacesSearchResult {
  resolvedLocation: { lat: number; lng: number } | null;
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

export async function searchAndCacheNearbyRestaurants(
  params: NearbySearchParams,
): Promise<PlacesSearchResult> {
  const response = await postPlacesRequest<PlacesApiResponse>('/api/places/nearby', {
    latitude: params.latitude,
    longitude: params.longitude,
    radius: params.radius ?? 5000,
  });

  return {
    restaurants: (response.restaurants ?? []).map(normalizeRestaurantRecord),
    usageSnapshot: response.usage ?? null,
  };
}

export async function searchAndCacheRestaurantsByText(
  params: TextSearchParams,
): Promise<TextPlacesSearchResult> {
  const response = await postPlacesRequest<PlacesApiResponse>('/api/places/search', {
    query: params.query,
    locationText: params.locationText ?? '',
    radius: params.radius ?? 5000,
  });

  const resolvedLocation =
    typeof response.resolvedLocation?.lat === 'number' && typeof response.resolvedLocation?.lng === 'number'
      ? {
          lat: response.resolvedLocation.lat,
          lng: response.resolvedLocation.lng,
        }
      : null;

  return {
    resolvedLocation,
    restaurants: (response.restaurants ?? []).map(normalizeRestaurantRecord),
    usageSnapshot: response.usage ?? null,
  };
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
