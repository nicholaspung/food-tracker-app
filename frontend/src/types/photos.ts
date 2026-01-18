import { Restaurant } from "@/lib/pocketbase";

/**
 * Screen states for the photo processing workflow
 */
export type ScreenState = "choice" | "upload" | "process" | "review";

/**
 * Type of photo processing workflow
 */
export type ProcessType = "restaurant" | "quickTrack";

/**
 * Photo awaiting processing with metadata
 */
export interface PhotoToProcess {
  id: string;
  file: File;
  previewUrl: string;
  captureDate: Date | null;
}

/**
 * Combined photo data (for combining multiple photos into one menu item)
 */
export interface CombinedPhotoData {
  photoId: string;
  photo: File;
  previewUrl: string;
}

/**
 * Processed photo data for restaurant visit
 * Supports multiple photos per menu item via combinedPhotos array
 */
export interface ProcessedPhoto {
  photoId: string;
  photo: File;
  previewUrl: string; // Original preview URL to avoid creating new blob URLs
  restaurant: any;
  menuItemName: string;
  menuItemDescription: string;
  rating: number;
  notes: string;
  isNewMenuItem: boolean;
  captureDate: Date | null;
  /** Additional photos combined with this menu item */
  combinedPhotos?: CombinedPhotoData[];
}

/**
 * Quick track photo data
 */
export interface QuickTrackPhotoData {
  photoId: string;
  photo: File;
  previewUrl: string;
  itemName: string;
  category: 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other' | '';
  rating: number;
  locationText: string;
  notes: string;
  visibility: "friends" | "private";
  captureDate: Date | null;
  /** User-edited date in yyyy-MM-dd format (defaults to captureDate, but can be changed by user) */
  date: string;
}

/**
 * Restaurant stats returned by getRestaurantStats
 */
export interface RestaurantStats {
  userVisitCount: number;
  friendCount: number;
}

/**
 * Props for RestaurantSelector component
 */
export interface RestaurantSelectorProps {
  selectedRestaurant: Restaurant | null;
  onRestaurantSelected: (restaurant: Restaurant) => void;
  restaurants: Restaurant[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  locationQuery: string;
  onLocationQueryChange: (query: string) => void;
  isOnline: boolean;
  onOpenCamera?: () => void;
  previousRestaurant?: Restaurant | null;
  onUsePreviousRestaurant?: () => void;
  showSameAsAbove?: boolean;
  restaurantCreationMutation: any;
  onShowValidation?: (message: string) => void;
  onHandleError?: (error: Error, options?: { customMessage?: string }) => void;
  /** Function to get visit stats for a restaurant */
  getRestaurantStats?: (restaurantId: string) => RestaurantStats;
}

/**
 * Stored camera OCR result from RestaurantNameFinder
 */
export interface StoredCameraResult {
  id: string;
  imagePreview: string;
  result: {
    found: boolean;
    options?: Array<{ name: string; confidence: string }>;
  };
  timestamp: number;
}

/**
 * Type guards
 */
export function isRestaurantMode(type: ProcessType | null): type is "restaurant" {
  return type === "restaurant";
}

export function isQuickTrackMode(type: ProcessType | null): type is "quickTrack" {
  return type === "quickTrack";
}
