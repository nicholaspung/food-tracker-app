import { PlaceResult, Restaurant, pb } from '@/lib/pocketbase';
import { logger } from '@/lib/logger';

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

let googleMapsLoaded = false;

export interface NearbySearchParams {
  latitude: number;
  longitude: number;
  radius?: number; // in meters, default 1500
  excludePlaceIds?: string[]; // Place IDs to exclude from results (for pagination)
}

/**
 * Load Google Maps API using the bootstrap loader
 * This sets up the importLibrary function on the global window object
 */
function loadGoogleMapsBootstrap(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if bootstrap loader is already installed
    if (typeof window.google?.maps?.importLibrary === 'function') {
      logger.log('[GooglePlaces] Bootstrap already loaded');
      resolve();
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector(
      'script[data-google-maps-bootstrap]'
    );
    if (existingScript) {
      logger.log('[GooglePlaces] Bootstrap script already exists, waiting...');
      // Wait for it to load
      const checkInterval = setInterval(() => {
        if (typeof window.google?.maps?.importLibrary === 'function') {
          clearInterval(checkInterval);
          logger.log('[GooglePlaces] Bootstrap loaded successfully');
          resolve();
        }
      }, 100);
      return;
    }

    logger.log('[GooglePlaces] Loading Google Maps bootstrap with API key:', API_KEY?.substring(0, 10) + '...');

    // Create the bootstrap loader script
    const script = document.createElement('script');
    script.setAttribute('data-google-maps-bootstrap', 'true');

    // Bootstrap loader code from Google's documentation
    script.text = `
      (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=\`https://maps.\${c}apis.com/maps/api/js?\`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
        key: "${API_KEY}",
        v: "weekly",
      });
    `;

    document.head.appendChild(script);

    // Inline scripts execute synchronously, so check immediately
    setTimeout(() => {
      if (typeof window.google?.maps?.importLibrary === 'function') {
        logger.log('[GooglePlaces] Bootstrap initialized successfully');
        resolve();
      } else {
        logger.error('[GooglePlaces] Bootstrap failed to initialize importLibrary');
        logger.error('[GooglePlaces] Troubleshooting:');
        logger.error('  1. Check API key is valid in Google Cloud Console');
        logger.error('  2. Verify all 3 APIs are enabled: Maps JS API, Places API (New), Geocoding API');
        logger.error('  3. Check API key restrictions (HTTP referrers should include localhost)');
        logger.error('  4. Disable ad blockers/privacy extensions temporarily');
        logger.error('  5. Try in incognito mode');
        reject(new Error('Bootstrap loader failed to initialize. Check console for details.'));
      }
    }, 100);
  });
}

/**
 * Initialize Google Maps JavaScript API
 * Only loads once per session
 */
async function initGoogleMaps(): Promise<void> {
  if (googleMapsLoaded) {
    return;
  }

  if (!API_KEY || API_KEY === 'your_google_places_api_key_here') {
    throw new Error(
      'Google Places API key not configured. Please set VITE_GOOGLE_PLACES_API_KEY in your .env file.'
    );
  }

  // Load the bootstrap loader
  await loadGoogleMapsBootstrap();

  googleMapsLoaded = true;
}

/**
 * Search for nearby food establishments using the new Google Places API
 * Includes restaurants, cafes, bakeries, coffee shops, dessert places, etc.
 * This should ONLY be called when user explicitly requests nearby search
 */
export async function searchNearbyRestaurants(
  params: NearbySearchParams
): Promise<PlaceResult[]> {
  const { latitude, longitude, radius = 1500, excludePlaceIds = [] } = params;

  // Initialize Google Maps if not already loaded
  await initGoogleMaps();

  // Import the places library using the new API
  const { Place } = (await google.maps.importLibrary(
    'places'
  )) as google.maps.PlacesLibrary;

  const center = { lat: latitude, lng: longitude };

  const request: google.maps.places.SearchNearbyRequest = {
    fields: ['displayName', 'location', 'types', 'id', 'formattedAddress'],
    locationRestriction: {
      center,
      radius,
    },
    includedTypes: [
      'restaurant',
      'cafe',
      'bakery',
      'coffee_shop',
      'dessert_shop',
      'ice_cream_shop',
      'meal_takeaway',
      'bar',
    ],
    maxResultCount: 20,
    rankPreference: google.maps.places.SearchNearbyRankPreference.DISTANCE,
  };

  try {
    logger.log('[GooglePlaces] Searching nearby food places...', { latitude, longitude, radius });
    const { places } = await Place.searchNearby(request);

    if (!places || places.length === 0) {
      logger.log('[GooglePlaces] No nearby food places found');
      return [];
    }

    logger.log(`[GooglePlaces] Found ${places.length} nearby food places`);

    // Transform to our PlaceResult interface
    const results: PlaceResult[] = places
      .map((place) => ({
        place_id: place.id || '',
        name: place.displayName || 'Unknown Place',
        vicinity: place.formattedAddress || '',
        types: place.types || [],
        geometry: {
          location: {
            lat: place.location?.lat() || 0,
            lng: place.location?.lng() || 0,
          },
        },
      }))
      // Filter out excluded place IDs (for pagination)
      .filter((place) => !excludePlaceIds.includes(place.place_id));

    logger.log(`[GooglePlaces] After filtering: ${results.length} new food places`);
    return results;
  } catch (error) {
    logger.error('[GooglePlaces] Error during nearby search:', error);
    if (error instanceof Error && error.message.includes('API key')) {
      throw new Error('Google Maps API key issue. Check console for details.');
    }
    throw new Error(`Failed to search nearby food places: ${error}`);
  }
}

/**
 * Geocode a location string (city, zip code, address) to coordinates
 */
export async function geocodeLocation(
  location: string
): Promise<{ lat: number; lng: number } | null> {
  // Initialize Google Maps if not already loaded
  await initGoogleMaps();

  // Import the geocoding library
  const { Geocoder } = (await google.maps.importLibrary(
    'geocoding'
  )) as google.maps.GeocodingLibrary;

  const geocoder = new Geocoder();

  try {
    logger.log('[GooglePlaces] Geocoding location:', location);
    const response = await geocoder.geocode({ address: location });

    if (response.results && response.results.length > 0) {
      const { lat, lng } = response.results[0].geometry.location;
      const coords = { lat: lat(), lng: lng() };
      logger.log('[GooglePlaces] Geocoding successful:', coords);
      return coords;
    }

    logger.log('[GooglePlaces] Geocoding returned no results');
    return null;
  } catch (error) {
    logger.error('[GooglePlaces] Geocoding error:', error);
    if (error instanceof Error && error.message.includes('API key')) {
      throw new Error('Google Maps API key issue. Check console for details.');
    }
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
 * Search for food establishments by text query (name, type, etc.)
 * Includes restaurants, cafes, bakeries, coffee shops, dessert places, etc.
 * with optional location filter
 */
export async function searchRestaurantsByText(
  params: TextSearchParams
): Promise<PlaceResult[]> {
  const { query, location, radius = 5000, excludePlaceIds = [] } = params;

  // Initialize Google Maps if not already loaded
  await initGoogleMaps();

  // If location is provided, geocode it first
  let center: { lat: number; lng: number } | undefined;
  if (location) {
    const geocoded = await geocodeLocation(location);
    if (geocoded) {
      center = geocoded;
    }
  }

  // Import the places library
  const { Place } = (await google.maps.importLibrary(
    'places'
  )) as google.maps.PlacesLibrary;

  const request: google.maps.places.SearchByTextRequest = {
    textQuery: query,
    fields: ['displayName', 'location', 'types', 'id', 'formattedAddress'],
    // Restrict to food/drink establishments only
    // Note: Text search only supports single includedType (not array like nearby search)
    // Using 'restaurant' as it broadly covers food establishments
    includedType: 'restaurant',
    maxResultCount: 20,
  };

  // Add location bias if we have coordinates
  if (center) {
    request.locationBias = {
      center,
      radius,
    };
  }

  try {
    logger.log('[GooglePlaces] Text search:', { query, location, center, radius });
    const { places } = await Place.searchByText(request);

    if (!places || places.length === 0) {
      logger.log('[GooglePlaces] Text search returned no results');
      return [];
    }

    logger.log(`[GooglePlaces] Text search found ${places.length} food places`);

    // Transform to our PlaceResult interface
    const results: PlaceResult[] = places
      .map((place) => ({
        place_id: place.id || '',
        name: place.displayName || 'Unknown Place',
        vicinity: place.formattedAddress || '',
        types: place.types || [],
        geometry: {
          location: {
            lat: place.location?.lat() || 0,
            lng: place.location?.lng() || 0,
          },
        },
      }))
      // Filter out excluded place IDs (for pagination)
      .filter((place) => !excludePlaceIds.includes(place.place_id));

    logger.log(`[GooglePlaces] After filtering: ${results.length} new food places`);
    return results;
  } catch (error) {
    logger.error('[GooglePlaces] Text search error:', error);
    if (error instanceof Error && error.message.includes('API key')) {
      throw new Error('Google Maps API key issue. Check console for details.');
    }
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
    // Note: Collection rules only allow users to see their own restaurants
    // Use PocketBase filter syntax with proper escaping
    const filter = pb.filter('user = {:userId} && placeId = {:placeId}', {
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
        user: user.id,
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
