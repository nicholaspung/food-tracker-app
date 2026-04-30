import type {
  FeedModeValue,
  FeedTypeFilterValue,
  HomeFeedSortValue,
} from '../../components/shared';
import type { FoodProductRecord, VisitRecord } from '../../features';

export type FeedMode = FeedModeValue;
export type TypeFilter = FeedTypeFilterValue;
export type SortFilter = HomeFeedSortValue;

export interface BaseFeedItem {
  id: string;
  eventAt: string;
  isFriend: boolean;
  friendName?: string;
  source: 'visit' | 'food-product';
}

export interface VisitFeedItem extends BaseFeedItem {
  source: 'visit';
  visit: VisitRecord;
}

export interface FoodProductFeedItem extends BaseFeedItem {
  source: 'food-product';
  foodProduct: FoodProductRecord;
}

export type FeedItem = VisitFeedItem | FoodProductFeedItem;

export interface GroupedMonth {
  monthKey: string;
  monthLabel: string;
  totalCount: number;
  visitsCount: number;
  foodProductCount: number;
  entries: FeedItem[];
}

export type FriendFeedSection = GroupedMonth & {
  data: FeedItem[];
};
