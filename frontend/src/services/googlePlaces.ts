import { PlaceResult } from '@/lib/pocketbase';

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

let googleMapsLoaded = false;

export interface NearbySearchParams {
  latitude: number;
  longitude: number;
  radius?: number; // in meters, default 1500
}

/**
 * Load Google Maps API using the bootstrap loader
 * This sets up the importLibrary function on the global window object
 */
function loadGoogleMapsBootstrap(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if bootstrap loader is already installed
    if (typeof window.google?.maps?.importLibrary === 'function') {
      resolve();
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector(
      'script[data-google-maps-bootstrap]'
    );
    if (existingScript) {
      // Wait for it to load
      const checkInterval = setInterval(() => {
        if (typeof window.google?.maps?.importLibrary === 'function') {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      return;
    }

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

    script.onload = () => {
      // Wait a bit for the bootstrap to initialize
      setTimeout(() => {
        if (typeof window.google?.maps?.importLibrary === 'function') {
          resolve();
        } else {
          reject(new Error('Bootstrap loader failed to initialize'));
        }
      }, 100);
    };

    script.onerror = () => reject(new Error('Failed to load Google Maps bootstrap'));

    document.head.appendChild(script);
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
 * Search for nearby restaurants using the new Google Places API
 * This should ONLY be called when user explicitly requests nearby search
 */
export async function searchNearbyRestaurants(
  params: NearbySearchParams
): Promise<PlaceResult[]> {
  const { latitude, longitude, radius = 1500 } = params;

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
    includedTypes: ['restaurant'],
    maxResultCount: 20,
    rankPreference: google.maps.places.SearchNearbyRankPreference.DISTANCE,
  };

  try {
    const { places } = await Place.searchNearby(request);

    if (!places || places.length === 0) {
      return [];
    }

    // Transform to our PlaceResult interface
    const results: PlaceResult[] = places.map((place) => ({
      place_id: place.id || '',
      name: place.displayName || 'Unknown Restaurant',
      vicinity: place.formattedAddress || '',
      types: place.types || [],
      geometry: {
        location: {
          lat: place.location?.lat() || 0,
          lng: place.location?.lng() || 0,
        },
      },
    }));

    return results;
  } catch (error) {
    console.error('Google Places API error:', error);
    throw new Error(`Failed to search nearby restaurants: ${error}`);
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
  };

  for (const type of types) {
    if (cuisineMap[type]) {
      return cuisineMap[type];
    }
  }

  return '';
}
