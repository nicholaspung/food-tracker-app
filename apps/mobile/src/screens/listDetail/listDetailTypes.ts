export interface GroupedBookmarkedItem {
  key: string;
  bookmarkLookupIds: string[];
  foodItemId: string;
  listItemId: string;
  name: string;
  rating: number;
  visitedAt?: string;
  sourceUserId?: string;
  sourceUserName?: string;
  sourceNote?: string;
  userFoodItemId?: string;
  userFoodItemRating?: number;
  userFoodItemVisitedAt?: string;
}

export interface OwnerSourceRating {
  listItemId: string;
  foodItemId: string;
  sourceUserName: string;
  rating: number;
  visitedAt?: string;
}

export type OwnerUserRating =
  | {
      kind: 'linked';
      listItemId: string;
      userFoodItemId: string;
      rating: number;
      visitedAt?: string;
    }
  | {
      kind: 'standalone';
      listItemId: string;
      foodItemId: string;
      rating: number;
      visitedAt?: string;
    };

export interface OwnerDisplayItem {
  key: string;
  name: string;
  orderIndex: number;
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
  items: GroupedBookmarkedItem[];
}

export interface SaveBookmarkTarget {
  bookmarkLookupIds: string[];
  restaurantId: string;
  restaurantName: string;
  foodItemId: string;
  foodItemName: string;
  foodItemRating: number;
  visitedAt?: string;
  sourceNote?: string;
}

export interface SaveBookmarkTrackingContext {
  entryMethod: 'quick_default' | 'selected_lists';
  createdDefaultList: boolean;
}

export type PendingDeleteListItem =
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
