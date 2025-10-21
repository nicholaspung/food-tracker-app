import { Loader } from '@googlemaps/js-api-loader';
import { PlaceResult } from '@/lib/pocketbase';

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

let googleMapsLoaded = false;
let placesService: google.maps.places.PlacesService | null = null;

export interface NearbySearchParams {
  latitude: number;
  longitude: number;
  radius?: number; // in meters, default 1500
}

/**
 * Initialize Google Maps JavaScript API
 * Only loads once per session
 */
async function initGoogleMaps(): Promise<void> {
  if (googleMapsLoaded && placesService) {
    return;
  }

  if (!API_KEY || API_KEY === 'your_google_places_api_key_here') {
    throw new Error(
      'Google Places API key not configured. Please set VITE_GOOGLE_PLACES_API_KEY in your .env file.'
    );
  }

  const loader = new Loader({
    apiKey: API_KEY,
    version: 'weekly',
    libraries: ['places'],
  });

  await loader.load();

  // Create a hidden div for PlacesService (required by Google Maps API)
  let mapDiv = document.getElementById('places-service-map');
  if (!mapDiv) {
    mapDiv = document.createElement('div');
    mapDiv.id = 'places-service-map';
    mapDiv.style.display = 'none';
    document.body.appendChild(mapDiv);
  }

  const map = new google.maps.Map(mapDiv as HTMLElement);
  placesService = new google.maps.places.PlacesService(map);
  googleMapsLoaded = true;
}

/**
 * Search for nearby restaurants using Google Places API
 * This should ONLY be called when user explicitly requests nearby search
 */
export async function searchNearbyRestaurants(
  params: NearbySearchParams
): Promise<PlaceResult[]> {
  const { latitude, longitude, radius = 1500 } = params;

  // Initialize Google Maps if not already loaded
  await initGoogleMaps();

  if (!placesService) {
    throw new Error('Failed to initialize Google Places service');
  }

  return new Promise((resolve, reject) => {
    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(latitude, longitude),
      radius,
      type: 'restaurant',
    };

    placesService!.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        // Transform to our PlaceResult interface
        const places: PlaceResult[] = results.map((place) => ({
          place_id: place.place_id || '',
          name: place.name || 'Unknown Restaurant',
          vicinity: place.vicinity || '',
          types: place.types || [],
          geometry: {
            location: {
              lat: place.geometry?.location?.lat() || 0,
              lng: place.geometry?.location?.lng() || 0,
            },
          },
        }));
        resolve(places);
      } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        resolve([]);
      } else {
        reject(new Error(`Google Places API error: ${status}`));
      }
    });
  });
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
  };

  for (const type of types) {
    if (cuisineMap[type]) {
      return cuisineMap[type];
    }
  }

  return '';
}
