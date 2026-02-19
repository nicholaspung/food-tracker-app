import type { RestaurantRecord } from '../features';
import { logger } from './logger';
import { pb } from './pocketbase';

interface PlaceResult {
  place_id: string;
  name: string;
  vicinity: string;
  types?: string[];
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

interface PlacesApiResponse {
  places?: PlaceResult[];
}

interface GeocodeApiResponse {
  found?: boolean;
  lat?: number;
  lng?: number;
}

interface RestaurantCollectionRecord {
  id: string;
  name: string;
  location?: string;
  cuisineType?: string;
  visibility?: 'private' | 'friends' | 'public';
  latitude?: number;
  longitude?: number;
  placeId?: string;
  isGooglePlace?: boolean;
  googlePlaceCachedAt?: string;
  created: string;
  updated: string;
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

const CACHE_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;

function mapRestaurantRecord(record: RestaurantCollectionRecord): RestaurantRecord {
  return {
    id: record.id,
    name: record.name.trim(),
    location: record.location?.trim() || undefined,
    city: record.location?.trim() || undefined,
    cuisineType: record.cuisineType?.trim() || undefined,
    visibility: record.visibility,
    latitude: typeof record.latitude === 'number' ? record.latitude : undefined,
    longitude: typeof record.longitude === 'number' ? record.longitude : undefined,
    placeId: record.placeId?.trim() || undefined,
    isGooglePlace: record.isGooglePlace === true,
  };
}

function isCacheStale(cachedAt: string | undefined): boolean {
  if (!cachedAt) {
    return true;
  }

  const cachedTimestamp = new Date(cachedAt).getTime();
  if (Number.isNaN(cachedTimestamp)) {
    return true;
  }

  return Date.now() - cachedTimestamp > CACHE_EXPIRATION_MS;
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

function getCuisineFromTypes(types: string[] | undefined): string {
  if (!types?.length) {
    return '';
  }

  const cuisineMap: Record<string, string> = {
    american_restaurant: 'American',
    bakery: 'Bakery',
    cafe: 'Cafe',
    chinese_restaurant: 'Chinese',
    coffee_shop: 'Coffee Shop',
    dessert_shop: 'Dessert',
    french_restaurant: 'French',
    indian_restaurant: 'Indian',
    italian_restaurant: 'Italian',
    japanese_restaurant: 'Japanese',
    korean_restaurant: 'Korean',
    mediterranean_restaurant: 'Mediterranean',
    mexican_restaurant: 'Mexican',
    pizza_restaurant: 'Pizza',
    seafood_restaurant: 'Seafood',
    steak_house: 'Steakhouse',
    thai_restaurant: 'Thai',
    vietnamese_restaurant: 'Vietnamese',
  };

  for (const type of types) {
    const mapped = cuisineMap[type];
    if (mapped) {
      return mapped;
    }
  }

  return '';
}

async function cacheGooglePlace(place: PlaceResult): Promise<RestaurantRecord> {
  const user = pb.authStore.record;
  if (!user?.id) {
    throw new Error('User not authenticated.');
  }

  const now = new Date().toISOString();
  const filter = pb.filter('createdBy = {:userId} && placeId = {:placeId}', {
    userId: user.id,
    placeId: place.place_id,
  });

  const existingRestaurants = await pb.collection('restaurants').getFullList<RestaurantCollectionRecord>({
    filter,
    sort: '-updated',
  });

  const payload = {
    cuisineType: getCuisineFromTypes(place.types),
    googlePlaceCachedAt: now,
    isGooglePlace: true,
    latitude: place.geometry.location.lat,
    location: place.vicinity,
    longitude: place.geometry.location.lng,
    name: place.name,
    placeId: place.place_id,
  };

  if (existingRestaurants.length > 0) {
    const existing = existingRestaurants[0];

    if (!isCacheStale(existing.googlePlaceCachedAt)) {
      return mapRestaurantRecord(existing);
    }

    const updated = await pb.collection('restaurants').update<RestaurantCollectionRecord>(existing.id, payload);
    return mapRestaurantRecord(updated);
  }

  const created = await pb.collection('restaurants').create<RestaurantCollectionRecord>({
    ...payload,
    createdBy: user.id,
    visibility: 'public',
  });
  return mapRestaurantRecord(created);
}

async function cacheGooglePlaces(places: PlaceResult[]): Promise<RestaurantRecord[]> {
  const cachedRestaurants: RestaurantRecord[] = [];

  for (const place of places) {
    try {
      const cached = await cacheGooglePlace(place);
      cachedRestaurants.push(cached);
    } catch (error) {
      logger.error('[GooglePlaces] Failed to cache place:', place.name, error);
    }
  }

  return cachedRestaurants;
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

  return cacheGooglePlaces(response.places ?? []);
}

export async function searchAndCacheRestaurantsByText(params: TextSearchParams): Promise<RestaurantRecord[]> {
  const response = await postPlacesRequest<PlacesApiResponse>('/api/places/search', {
    query: params.query,
    location: params.location ?? '',
    radius: params.radius ?? 5000,
  });

  return cacheGooglePlaces(response.places ?? []);
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
