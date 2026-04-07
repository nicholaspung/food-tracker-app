import type { ModerationContentStatus } from '../models';

export interface CollectionUserExpand {
  id: string;
  name?: string;
  email?: string;
}

export interface RestaurantCollectionRecord {
  id: string;
  name: string;
  location?: string;
  cuisineType?: string;
  visibility?: 'private' | 'friends' | 'public';
  latitude?: number;
  longitude?: number;
  placeId?: string;
  isGooglePlace?: boolean;
  created: string;
  updated: string;
}

export interface VisitCollectionRecord {
  id: string;
  restaurant: string;
  user: string;
  visitDate: string;
  visibility?: 'friends' | 'private';
  moderationStatus?: ModerationContentStatus;
  notes?: string;
  created: string;
  updated: string;
  expand?: {
    restaurant?: RestaurantCollectionRecord;
    user?: CollectionUserExpand;
  };
}

export interface FoodItemCollectionRecord {
  id: string;
  name: string;
  rating: number;
  description?: string;
  itemCategory?: 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other' | 'restaurant';
  notes?: string;
  visit?: string;
  user: string;
  isQuickTrack?: boolean;
  visibility?: 'friends' | 'private';
  moderationStatus?: ModerationContentStatus;
  location_text?: string;
  latitude?: number;
  longitude?: number;
  itemDate?: string;
  created: string;
  updated: string;
  expand?: {
    user?: CollectionUserExpand;
    visit?: VisitCollectionRecord;
  };
}

export interface RestaurantListCollectionRecord {
  id: string;
  name: string;
  description?: string;
  visibility?: 'private' | 'friends' | 'public';
  user: string;
  coverImage?: string;
  isDefault?: boolean;
  restaurantCount?: number;
  menuItemCount?: number;
  created: string;
  updated: string;
  expand?: {
    user?: CollectionUserExpand;
  };
}

export interface ListItemCollectionRecord {
  id: string;
  list: string;
  restaurant: string;
  addedBy: string;
  sourceUser?: string;
  recommendedItems?: string[];
  foodItem?: string;
  userFoodItem?: string;
  position: number;
  note?: string;
  created: string;
  expand?: {
    restaurant?: RestaurantCollectionRecord;
    sourceUser?: CollectionUserExpand;
    foodItem?: FoodItemCollectionRecord;
    userFoodItem?: FoodItemCollectionRecord;
    recommendedItems?: FoodItemCollectionRecord[];
  };
}
