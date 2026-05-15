export interface RestaurantMapItemMeta {
  label?: string;
  rating?: number;
  dateLabel?: string | null;
}

export interface RestaurantMapItem {
  id: string;
  name: string;
  notes?: string;
  meta: RestaurantMapItemMeta[];
  photoThumbnailUrl?: string | null;
  photoCount?: number;
  onOpenPhotos?: () => void;
}

export interface RestaurantMapGroup {
  id: string;
  restaurantName: string;
  restaurantLocation?: string;
  latitude: number;
  longitude: number;
  summary: string;
  notes?: string[];
  items: RestaurantMapItem[];
}
