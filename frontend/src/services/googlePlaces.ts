import { PlaceResult, Restaurant, pb } from '@/lib/pocketbase';
import { logger } from '@/lib/logger';

export interface NearbySearchParams {
  latitude: number;
  longitude: number;
  radius?: number; // in meters, default 1500
  excludePlaceIds?: string[]; // Place IDs to exclude from results (for pagination)
}

/**
 * Search for nearby food establishments using backend Google Places API
 * Includes restaurants, cafes, bakeries, coffee shops, dessert places, etc.
 * This should ONLY be called when user explicitly requests nearby search
 */
export async function searchNearbyRestaurants(
  params: NearbySearchParams
): Promise<PlaceResult[]> {
  const { latitude, longitude, radius = 1500, excludePlaceIds = [] } = params;

  try {
    logger.log('[GooglePlaces] Searching nearby food places via backend...', { latitude, longitude, radius });

    const baseUrl = pb.baseUrl;
    const token = pb.authStore.token;

    const response = await fetch(`${baseUrl}/api/places/nearby`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        latitude,
        longitude,
        radius,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[GooglePlaces] Backend search failed:', errorText);
      throw new Error(`Failed to search nearby places: ${response.statusText}`);
    }

    const result = await response.json();
    const places: PlaceResult[] = result.places || [];

    if (places.length === 0) {
      logger.log('[GooglePlaces] No nearby food places found');
      return [];
    }

    logger.log(`[GooglePlaces] Found ${places.length} nearby food places`);

    // Filter out excluded place IDs (for pagination)
    const filtered = places.filter((place) => !excludePlaceIds.includes(place.place_id));

    logger.log(`[GooglePlaces] After filtering: ${filtered.length} new food places`);
    return filtered;
  } catch (error) {
    logger.error('[GooglePlaces] Error during nearby search:', error);
    throw new Error(`Failed to search nearby food places: ${error}`);
  }
}

/**
 * Geocode a location string (city, zip code, address) to coordinates using backend
 */
export async function geocodeLocation(
  location: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    logger.log('[GooglePlaces] Geocoding location via backend:', location);

    const baseUrl = pb.baseUrl;
    const token = pb.authStore.token;

    const response = await fetch(`${baseUrl}/api/places/geocode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        location,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[GooglePlaces] Geocoding failed:', errorText);
      throw new Error(`Failed to geocode location: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.found) {
      logger.log('[GooglePlaces] Geocoding returned no results');
      return null;
    }

    const coords = { lat: result.lat, lng: result.lng };
    logger.log('[GooglePlaces] Geocoding successful:', coords);
    return coords;
  } catch (error) {
    logger.error('[GooglePlaces] Geocoding error:', error);
    throw new Error(`Failed to geocode location: ${error}`);
  }
}

export interface TextSearchParams {
  query: string; // Food place name or type (restaurant, cafe, bakery, etc.)
  location?: string; // Optional: zip code, city, or address
  radius?: number; // in meters, default 5000
  excludePlaceIds?: string[]; // Place IDs to exclude from results (for pagination)
}

/**
 * Search for food establishments by text query (name, type, etc.) using backend
 * Includes restaurants, cafes, bakeries, coffee shops, dessert places, etc.
 * with optional location filter
 */
export async function searchRestaurantsByText(
  params: TextSearchParams
): Promise<PlaceResult[]> {
  const { query, location, radius = 5000, excludePlaceIds = [] } = params;

  try {
    logger.log('[GooglePlaces] Text search via backend:', { query, location, radius });

    const baseUrl = pb.baseUrl;
    const token = pb.authStore.token;

    const response = await fetch(`${baseUrl}/api/places/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        query,
        location: location || '',
        radius,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[GooglePlaces] Text search failed:', errorText);
      throw new Error(`Failed to search places: ${response.statusText}`);
    }

    const result = await response.json();
    const places: PlaceResult[] = result.places || [];

    if (places.length === 0) {
      logger.log('[GooglePlaces] Text search returned no results');
      return [];
    }

    logger.log(`[GooglePlaces] Text search found ${places.length} food places`);

    // Filter out excluded place IDs (for pagination)
    const filtered = places.filter((place) => !excludePlaceIds.includes(place.place_id));

    logger.log(`[GooglePlaces] After filtering: ${filtered.length} new food places`);
    return filtered;
  } catch (error) {
    logger.error('[GooglePlaces] Text search error:', error);
    throw new Error(`Failed to search food places: ${error}`);
  }
}

/**
 * Get cuisine type from Google Places types
 */
export function getCuisineFromTypes(types?: string[]): string {
  if (!types || types.length === 0) return '';

  const cuisineMap: Record<string, string> = {
    chinese_restaurant: 'Chinese',
    italian_restaurant: 'Italian',
    japanese_restaurant: 'Japanese',
    mexican_restaurant: 'Mexican',
    indian_restaurant: 'Indian',
    thai_restaurant: 'Thai',
    french_restaurant: 'French',
    american_restaurant: 'American',
    korean_restaurant: 'Korean',
    vietnamese_restaurant: 'Vietnamese',
    mediterranean_restaurant: 'Mediterranean',
    seafood_restaurant: 'Seafood',
    steak_house: 'Steakhouse',
    pizza_restaurant: 'Pizza',
    fast_food_restaurant: 'Fast Food',
    cafe: 'Cafe',
    bakery: 'Bakery',
    bar: 'Bar',
    coffee_shop: 'Coffee Shop',
    dessert_shop: 'Dessert',
    ice_cream_shop: 'Ice Cream',
    meal_takeaway: 'Takeaway',
  };

  for (const type of types) {
    if (cuisineMap[type]) {
      return cuisineMap[type];
    }
  }

  return '';
}

/**
 * Cache expiration time in milliseconds (30 days)
 */
const CACHE_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Check if a cached Google Place is stale (older than 30 days)
 */
function isCacheStale(cachedAt: string): boolean {
  const cacheDate = new Date(cachedAt);
  const now = new Date();
  return now.getTime() - cacheDate.getTime() > CACHE_EXPIRATION_MS;
}

/**
 * Cache a Google Place in the database
 * - If restaurant with placeId exists for current user and is recent, return it
 * - If it exists but is stale, update it with new data
 * - If it doesn't exist, create it
 */
export async function cacheGooglePlace(
  place: PlaceResult
): Promise<Restaurant> {
  const user = pb.authStore.record;
  if (!user) throw new Error('User not authenticated');

  try {
    logger.log('[GooglePlaces] Caching place:', place.name, 'ID:', place.place_id);

    // Check if current user already has this restaurant
    // Note: Restaurants are now shared, but we filter by createdBy
    // Use PocketBase filter syntax with proper escaping
    const filter = pb.filter('createdBy = {:userId} && placeId = {:placeId}', {
      userId: user.id,
      placeId: place.place_id,
    });

    logger.log('[GooglePlaces] Checking for existing restaurant with filter');

    const existingRestaurants = await pb
      .collection('restaurants')
      .getFullList<Restaurant>({
        filter: filter,
      });

    const now = new Date().toISOString();

    if (existingRestaurants.length > 0) {
      logger.log('[GooglePlaces] Found existing restaurant in cache');
      const existing = existingRestaurants[0];

      // User already has this restaurant - check if cache is stale
      if (
        existing.googlePlaceCachedAt &&
        !isCacheStale(existing.googlePlaceCachedAt)
      ) {
        // Cache is fresh, return as-is
        logger.log('[GooglePlaces] Cache is fresh, returning existing restaurant');
        return existing;
      }

      // Cache is stale or doesn't exist, update it
      logger.log('[GooglePlaces] Cache is stale, updating restaurant data');
      const updated = await pb
        .collection('restaurants')
        .update<Restaurant>(existing.id, {
          name: place.name,
          location: place.vicinity,
          cuisineType: getCuisineFromTypes(place.types),
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
          googlePlaceCachedAt: now,
          isGooglePlace: true,
        });

      logger.log('[GooglePlaces] Restaurant updated successfully');
      return updated;
    }

    // Restaurant doesn't exist for current user, create it
    logger.log('[GooglePlaces] Creating new restaurant in database');
    const newRestaurant = await pb
      .collection('restaurants')
      .create<Restaurant>({
        name: place.name,
        location: place.vicinity,
        cuisineType: getCuisineFromTypes(place.types),
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        placeId: place.place_id,
        isGooglePlace: true,
        googlePlaceCachedAt: now,
        createdBy: user.id,
        visibility: 'public', // Google Places are verified and public by default
      });

    logger.log('[GooglePlaces] Restaurant created successfully:', newRestaurant.id);
    return newRestaurant;
  } catch (error) {
    logger.error('[GooglePlaces] Error caching place:', error);
    // Log full error details for debugging
    if (error && typeof error === 'object') {
      logger.error('[GooglePlaces] Error details:', JSON.stringify(error, null, 2));
    }
    throw error;
  }
}

/**
 * Cache multiple Google Places in the database
 */
export async function cacheGooglePlaces(
  places: PlaceResult[]
): Promise<Restaurant[]> {
  const cachedRestaurants: Restaurant[] = [];

  for (const place of places) {
    try {
      const restaurant = await cacheGooglePlace(place);
      cachedRestaurants.push(restaurant);
    } catch (error) {
      logger.error(
        `[GooglePlaces] Failed to cache place ${place.name}:`,
        error
      );
      // Continue with other places even if one fails
    }
  }

  return cachedRestaurants;
}

/**
 * Search for nearby food establishments and cache results in the database
 * Includes restaurants, cafes, bakeries, coffee shops, dessert places, etc.
 * Returns cached Restaurant objects instead of PlaceResult objects
 */
export async function searchAndCacheNearbyRestaurants(
  params: NearbySearchParams
): Promise<Restaurant[]> {
  // Get results from Google Places API
  const places = await searchNearbyRestaurants(params);

  // Cache all results in the database
  const cachedRestaurants = await cacheGooglePlaces(places);

  return cachedRestaurants;
}

/**
 * Search for food establishments by text and cache results in the database
 * Includes restaurants, cafes, bakeries, coffee shops, dessert places, etc.
 * Returns cached Restaurant objects instead of PlaceResult objects
 */
export async function searchAndCacheRestaurantsByText(
  params: TextSearchParams
): Promise<Restaurant[]> {
  // Get results from Google Places API
  const places = await searchRestaurantsByText(params);

  // Cache all results in the database
  const cachedRestaurants = await cacheGooglePlaces(places);

  return cachedRestaurants;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns Distance in miles
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth's radius in miles (use 6371 for kilometers)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in miles
}

/**
 * Format distance for display
 * @param miles Distance in miles
 * @returns Formatted string like "2.3 mi" or "0.5 mi"
 */
export function formatDistance(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}
