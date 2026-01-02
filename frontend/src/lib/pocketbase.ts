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
  name?: string;
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
  visit?: string; // Optional for quick track items (items without a visit)
  rating: number;
  notes?: string;
  user: string;
  created: string;
  updated: string;
  // Quick Track fields
  isQuickTrack?: boolean; // true if this is a standalone quick track item
  visibility?: 'private' | 'friends'; // visibility for quick track items
  itemCategory?: 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other';
  location_text?: string;
  latitude?: number;
  longitude?: number;
  itemDate?: string; // Date when item was consumed/tracked (ISO string)
  expand?: {
    visit?: Visit & {
      expand?: {
        restaurant?: Restaurant;
      };
    };
    user?: {
      id: string;
      email: string;
      name?: string;
    };
  };
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
  expand?: {
    user?: User;
    friend?: User;
  };
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

// Bill splitting types
export interface Bill {
  id: string;
  creator_user: string;
  bill_name: string;
  total_amount: number;
  tax: number;
  tip: number;
  fees: number;
  split_mode: 'even' | 'itemized' | 'custom';
  extras_split_mode: 'proportional' | 'equal';
  status: 'active' | 'settled' | 'cancelled';
  created: string;
  updated: string;
}

export interface BillParticipant {
  id: string;
  bill: string;
  user?: string | null;
  participant_name?: string;
  amount_owed: number;
  paid_status: 'pending' | 'paid';
  paid_date?: string | null;
  payment_method?: string | null;
  created: string;
  updated: string;
  expand?: {
    user?: User;
  };
}

export interface BillItem {
  id: string;
  bill: string;
  item_name: string;
  price: number;
  assigned_to: string[]; // Array of bill_participant IDs
  created: string;
}

export interface BillInvite {
  id: string;
  bill: string;
  code: string;
  created_by: string;
  expires_at: string;
  used_by?: string | null;
  created: string;
}

export interface BillReminder {
  id: string;
  bill: string;
  participant: string;
  sent_by: string;
  sent_at: string;
}

// Restaurant lists types
export interface RestaurantList {
  id: string;
  name: string;
  description?: string;
  visibility: 'private' | 'friends' | 'public';
  user: string;
  coverImage?: string;
  isCollaborative?: boolean;
  created: string;
  updated: string;
  expand?: {
    user?: User;
  };
}

export interface ListItem {
  id: string;
  list: string;
  restaurant: string;
  addedBy: string;
  position: number;
  note?: string;
  recommendedItems?: string[]; // Array of food_item IDs
  created: string;
  expand?: {
    restaurant?: Restaurant;
    addedBy?: User;
    recommendedItems?: FoodItem[];
  };
}

// Expand type definitions for type-safe access to PocketBase expand properties

export interface MenuReviewRequestExpand {
  restaurant?: Restaurant;
  requestedBy?: User;
}

export interface MenuReviewRequestWithExpand extends MenuReviewRequest {
  expand?: MenuReviewRequestExpand;
}

export interface MenuItemExpand {
  sourceImage?: MenuImage;
  createdBy?: User;
}

export interface MenuItemWithExpand extends MenuItem {
  expand?: MenuItemExpand;
}

export interface VisitExpand {
  restaurant?: Restaurant;
  user?: User;
}

export interface VisitWithExpand extends Visit {
  expand?: VisitExpand;
}

export interface FoodItemExpand {
  visit?: VisitWithExpand;
}

export interface FoodItemWithExpand extends FoodItem {
  expand?: FoodItemExpand;
}

// Type guards for safe access to expand properties

/**
 * Type guard to check if user is authenticated
 */
export function isAuthenticatedUser(record: unknown): record is User {
  return (
    record !== null &&
    typeof record === 'object' &&
    'id' in record &&
    'email' in record &&
    typeof record.id === 'string' &&
    typeof record.email === 'string'
  );
}

/**
 * Type guard for MenuReviewRequest with expand
 */
export function hasMenuReviewExpand(
  request: MenuReviewRequest
): request is MenuReviewRequestWithExpand {
  return 'expand' in request && request.expand !== undefined;
}

/**
 * Type guard for MenuItem with expand
 */
export function hasMenuItemExpand(
  item: MenuItem
): item is MenuItemWithExpand {
  return 'expand' in item && item.expand !== undefined;
}

/**
 * Type guard for FoodItem with expand
 */
export function hasFoodItemExpand(
  item: FoodItem
): item is FoodItemWithExpand {
  return 'expand' in item && item.expand !== undefined;
}

/**
 * Type guard for Visit with expand
 */
export function hasVisitExpand(
  visit: Visit
): visit is VisitWithExpand {
  return 'expand' in visit && visit.expand !== undefined;
}
