import type {
  RecommendationSourceHandoff,
  RestaurantListFriendMatchRecord,
  RestaurantListRecommendationUsageProofRecord,
} from '../../features';

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

export interface SaveBookmarkTarget {
  bookmarkLookupIds: string[];
  restaurantId: string;
  restaurantName: string;
  foodItemId: string;
  foodItemName: string;
  foodItemRating: number;
  recommendationSource: RecommendationSourceHandoff;
  sourceListItemId: string;
  visitedAt?: string;
  sourceNote?: string;
}

export interface SaveBookmarkTrackingContext {
  entryMethod: 'quick_default';
  createdDefaultList: boolean;
}

export interface PendingListItemTransferTarget {
  itemName: string;
  restaurantId: string;
  restaurantName: string;
  source?: OwnerSourceRating;
  user?: OwnerUserRating;
}

export type PendingDeleteListItem =
  | {
      kind: 'restaurant-bookmark';
      restaurantId: string;
      restaurantName: string;
    }
  | {
      kind: 'menu-bookmark';
      itemName: string;
      restaurantId: string;
      listItemId: string;
      foodItemId?: string;
      menuItemId?: string;
    }
  | {
      kind: 'source';
      itemName: string;
      listItemId: string;
      foodItemId: string;
    }
  | {
      kind: 'user-linked';
      itemName: string;
      listItemId: string;
    }
  | {
      kind: 'user-standalone';
      itemName: string;
      listItemId: string;
      foodItemId: string;
    };
