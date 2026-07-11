import type {
  RestaurantListFriendMatchRecord,
  RestaurantListRecommendationUsageProofRecord,
} from '../models';

export interface GroupedBookmarkedItem {
  key: string;
  bookmarkLookupIds: string[];
  foodItemId: string;
  foodItemRestaurantId?: string;
  menuItemId?: string;
  listItemId: string;
  name: string;
  rating: number;
  visitedAt?: string;
  sourceUserId?: string;
  sourceUserName?: string;
  sourceNote?: string;
  userFoodItemId?: string;
  userFoodItemRestaurantId?: string;
  userFoodItemRating?: number;
  userFoodItemVisitedAt?: string;
}

export interface OwnerSourceRating {
  listItemId: string;
  foodItemId: string;
  menuItemId?: string;
  restaurantId?: string;
  sourceUserId?: string;
  sourceUserName: string;
  rating: number;
  visitedAt?: string;
}

export type OwnerUserRating =
  | {
      kind: 'linked';
      listItemId: string;
      userFoodItemId: string;
      restaurantId?: string;
      rating: number;
      visitedAt?: string;
    }
  | {
      kind: 'standalone';
      listItemId: string;
      foodItemId: string;
      menuItemId?: string;
      restaurantId?: string;
      rating: number;
      visitedAt?: string;
    };

export interface OwnerDisplayItem {
  key: string;
  name: string;
  orderIndex: number;
  bookmark: {
    listItemId: string;
    foodItemId: string;
    menuItemId?: string;
    restaurantId?: string;
  };
  source?: OwnerSourceRating;
  user?: OwnerUserRating;
}

export interface OwnerItemPhotoEntry {
  id: string;
  previewUrl: string;
  url: string;
  ownerLabel: string;
}

export interface GroupedRestaurant {
  restaurantId: string;
  restaurantName: string;
  restaurantLocation?: string;
  restaurantCity?: string;
  restaurantCuisineType?: string;
  restaurantVisibility?: 'private' | 'friends' | 'public';
  latitude?: number;
  longitude?: number;
  notes: string[];
  firstPosition: number;
  restaurantBookmarkListItemId?: string;
  friendOverlapCount?: number;
  friendMatches?: RestaurantListFriendMatchRecord[];
  recommendationUsageProofs?: RestaurantListRecommendationUsageProofRecord[];
  items: GroupedBookmarkedItem[];
}
