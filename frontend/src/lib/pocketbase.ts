import PocketBase from 'pocketbase';

// Create a single PocketBase instance for the entire application
// Use environment variable for API URL, fallback to localhost for dev
const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8090';
export const pb = new PocketBase(apiUrl);

// Enable auto cancellation for pending requests
pb.autoCancellation(false);

// Export types for user authentication
export interface AuthData {
  email: string;
  password: string;
}

export interface SignUpData extends AuthData {
  passwordConfirm: string;
}

export interface User {
  id: string;
  email: string;
  verified: boolean;
  created: string;
  updated: string;
}

// Food tracker types
export interface Restaurant {
  id: string;
  name: string;
  location: string;
  cuisineType?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  isGooglePlace?: boolean;
  googlePlaceCachedAt?: string;
  user: string;
  created: string;
  updated: string;
}

// Google Places types
export interface PlaceResult {
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

export interface Visit {
  id: string;
  restaurant: string;
  user: string;
  visitDate: string;
  notes?: string;
  created: string;
  updated: string;
}

export interface FoodItem {
  id: string;
  name: string;
  description?: string;
  visit: string;
  rating: number;
  notes?: string;
  user: string;
  created: string;
  updated: string;
}

export interface MenuImage {
  id: string;
  restaurant: string;
  image: string; // filename
  uploadedBy: string;
  created: string;
  updated: string;
}

export interface MenuItem {
  id: string;
  restaurant: string;
  name: string;
  description?: string;
  sourceImage?: string; // relation to menu_images
  created: string;
  updated: string;
}
