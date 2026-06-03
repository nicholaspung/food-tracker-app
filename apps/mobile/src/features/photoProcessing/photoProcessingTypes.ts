export type ProcessType = 'restaurant' | 'foodProduct';

export interface PhotoCoordinates {
  latitude: number;
  longitude: number;
}

export interface DraftPhotoAsset {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  captureDate: Date | null;
  captureCoordinates: PhotoCoordinates | null;
  metadataDate: Date | string | null;
}

export interface RestaurantPhotoForm {
  restaurantId: string;
  restaurantName: string;
  menuItemId: string;
  menuItemName: string;
  rating: number;
  description: string;
  notes: string;
  date: string;
}

export interface RestaurantPhotoGroup {
  id: string;
  photoIds: string[];
}

export const FREE_MONTHLY_PHOTO_LIMIT = 100;
