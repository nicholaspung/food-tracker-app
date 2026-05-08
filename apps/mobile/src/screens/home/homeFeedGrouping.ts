import type { Dispatch, SetStateAction } from 'react';

import type { FoodProductRecord, VisitRecord } from '../../features';
import type { HomeInitialViewParams } from '../../navigation/homeRouteParams';
import type {
  FeedItem,
  FeedMode,
  FoodProductFeedItem,
  SortFilter,
  TypeFilter,
  VisitFeedItem,
} from './homeFeedTypes';

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});

const entryDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const REDACTED_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatEntryDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return entryDateFormatter.format(date).toUpperCase();
}

export function getFriendEntryMonthInfo(value: string): { monthKey: string; monthLabel: string } | null {
  const trimmedValue = value.trim();
  const redactedMonthMatch = REDACTED_MONTH_PATTERN.exec(trimmedValue);
  if (redactedMonthMatch) {
    const year = Number(redactedMonthMatch[1]);
    const monthIndex = Number(redactedMonthMatch[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) {
      return null;
    }

    return {
      monthKey: trimmedValue,
      monthLabel: monthFormatter.format(new Date(Date.UTC(year, monthIndex, 15, 12))),
    };
  }

  const date = new Date(trimmedValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    monthKey,
    monthLabel: monthFormatter.format(date),
  };
}

export function formatFriendEntryMonthLabel(value: string): string {
  return getFriendEntryMonthInfo(value)?.monthLabel ?? value;
}

export function buildVisitFeedItem(
  visit: VisitRecord,
  currentUserId: string | null,
  eventAt?: string,
): VisitFeedItem {
  return {
    isFriend: !!visit.userId && !!currentUserId && visit.userId !== currentUserId,
    friendName: visit.userName,
    id: `visit_${visit.id}`,
    eventAt: eventAt?.trim() || visit.visitedAt || visit.createdAt,
    source: 'visit',
    visit,
  };
}

export function buildFoodProductFeedItem(
  foodProduct: FoodProductRecord,
  currentUserId: string | null,
  eventAt?: string,
): FoodProductFeedItem {
  return {
    isFriend: !!foodProduct.userId && !!currentUserId && foodProduct.userId !== currentUserId,
    friendName: foodProduct.userName,
    id: `food_product_${foodProduct.id}`,
    eventAt: eventAt?.trim() || foodProduct.itemDate || foodProduct.createdAt,
    source: 'food-product',
    foodProduct,
  };
}

export function formatMineEntryFooterLabel(feedItem: FeedItem): string {
  return formatEntryDateLabel(feedItem.eventAt) || feedItem.eventAt;
}

export function applyInitialViewParams(
  initialView: HomeInitialViewParams,
  {
    setFeedMode,
    setFiltersExpanded,
    setSearchQuery,
    setSortByMode,
    setTypeFilter,
  }: {
    setFeedMode: (value: FeedMode) => void;
    setFiltersExpanded: (value: boolean) => void;
    setSearchQuery: (value: string) => void;
    setSortByMode: Dispatch<SetStateAction<Record<FeedMode, SortFilter>>>;
    setTypeFilter: (value: TypeFilter) => void;
  },
) {
  setFeedMode(initialView.feedMode);
  setTypeFilter(initialView.typeFilter);
  setSearchQuery(initialView.searchQuery);
  setFiltersExpanded(initialView.filtersExpanded);
  setSortByMode((previous) => ({
    ...previous,
    [initialView.feedMode]: initialView.sortFilter,
  }));
}
