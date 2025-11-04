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
  isAdmin?: boolean;
  isSubscriber?: boolean;
  defaultVisitVisibility?: 'friends' | 'private';
  defaultRestaurantVisibility?: 'private' | 'friends' | 'public';
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
  createdBy?: string; // Optional - shared restaurants may not have a creator
  visibility?: 'private' | 'friends' | 'public';
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
  visibility: 'friends' | 'private';
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
  createdBy?: string; // relation to users
  visibility?: 'private' | 'friends' | 'public';
  isFromOCR?: boolean; // true if created from OCR/menu scan
  created: string;
  updated: string;
}

export interface Friendship {
  id: string;
  user: string; // User who sent the friend request
  friend: string; // User who received the friend request
  status: 'pending' | 'accepted' | 'blocked';
  created: string;
  updated: string;
}

export interface MenuReviewRequest {
  id: string;
  restaurant: string; // relation to restaurants
  requestedBy: string; // relation to users
  reason?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  adminNotes?: string;
  created: string;
  updated: string;
}

// Feedback system types
export interface Feedback {
  id: string;
  user: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  admin_unread_count?: number;
  user_unread_count?: number;
  last_message_at?: string;
  created: string;
  updated: string;
}

export interface FeedbackMessage {
  id: string;
  feedback: string;
  user: string;
  message: string;
  is_admin_message?: boolean;
  created: string;
}
