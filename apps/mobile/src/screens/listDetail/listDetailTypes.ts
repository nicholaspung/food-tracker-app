import type { RecommendationSourceHandoff } from '../../features';
import type {
  OwnerSourceRating,
  OwnerUserRating,
} from '../../features/restaurantLists/listDetailTypes';

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
