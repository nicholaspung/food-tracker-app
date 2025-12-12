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
 * Processed photo data for restaurant visit
 */
export interface ProcessedPhoto {
  photoId: string;
  photo: File;
  restaurant: any;
  menuItemName: string;
  menuItemDescription: string;
  rating: number;
  notes: string;
  isNewMenuItem: boolean;
  captureDate: Date | null;
}

/**
 * Quick track photo data
 */
export interface QuickTrackPhotoData {
  photoId: string;
  photo: File;
  previewUrl: string;
  itemName: string;
  category: string;
  rating: number;
  locationText: string;
  notes: string;
  visibility: "friends" | "private";
  captureDate: Date | null;
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
