import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  buildMenuSelectionSuggestions,
  type MenuSelectionSuggestion,
} from '../restaurants/menuSelectionSuggestions';
import type { RestaurantRecord } from '../models';
import type {
  AllLocationsHistoryRecord,
  GroupMenuSuggestionsRecord,
  MenuItemRecord,
} from './featureStore';
import { useRestaurantMenuItemsQuery } from './menuItemsQuery';
import { restaurantsQueryKeys } from './restaurantsQuery';
import {
  getAllLocationsHistory,
  getGroupMenuSuggestionsForRestaurant,
} from './restaurantsStore';

interface FoodDiscoveryRestaurantReadModelInput {
  enabled?: boolean;
  isOnline: boolean;
  menuSelectionSearchQuery?: string;
  restaurant: RestaurantRecord | null;
}

export type FoodDiscoveryOrderedHistoryKind = 'exactLocation' | 'relatedLocation';

export interface FoodDiscoveryOrderedHistory {
  kind: FoodDiscoveryOrderedHistoryKind;
  orderCount: number;
}

export interface FoodDiscoveryMenuSelectionSuggestion extends MenuSelectionSuggestion {
  orderedHistory?: FoodDiscoveryOrderedHistory;
}

export interface FoodDiscoveryMenuCatalogItem {
  id: string;
  name: string;
  orderedHistory?: FoodDiscoveryOrderedHistory;
}

export interface FoodDiscoveryOrderedItem {
  id: string;
  latestRating: number;
  latestRestaurantLocation?: string;
  latestRestaurantName: string;
  name: string;
  orderCount: number;
}

export interface FoodDiscoveryRestaurantReadModel {
  allLocationsHistory: AllLocationsHistoryRecord | undefined;
  allLocationsHistoryErrorMessage: string | null;
  allLocationsHistoryLoading: boolean;
  canShowAllLocations: boolean;
  groupMenuSuggestions: GroupMenuSuggestionsRecord | undefined;
  groupMenuSuggestionsErrorMessage: string | null;
  groupMenuSuggestionsLoading: boolean;
  menuCatalogErrorMessage: string | null;
  menuCatalogHasNextPage: boolean;
  menuCatalogIsFetchingNextPage: boolean;
  menuCatalogItems: FoodDiscoveryMenuCatalogItem[];
  menuCatalogLoading: boolean;
  menuCatalogTotalItems: number;
  menuItems: MenuItemRecord[];
  menuSelectionSuggestions: MenuSelectionSuggestion[];
  refetchAllLocationsHistory: () => Promise<unknown>;
  refetchGroupMenuSuggestions: () => Promise<unknown>;
  refetchMenuCatalog: () => Promise<unknown>;
  fetchNextMenuCatalogPage: () => Promise<unknown>;
  relatedMenuSuggestions: FoodDiscoveryMenuSelectionSuggestion[];
  yourOrderedItems: FoodDiscoveryOrderedItem[];
}

const EMPTY_MENU_ITEMS: MenuItemRecord[] = [];

function normalizeFoodDiscoveryHistoryName(value: string): string {
  return value
    .replace(/[’‘＇`]/g, "'")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function toPositiveInteger(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function getAllLocationsHistoryItemByName(
  history: AllLocationsHistoryRecord | undefined,
  itemName: string,
): AllLocationsHistoryRecord['items'][number] | undefined {
  const normalizedName = normalizeFoodDiscoveryHistoryName(itemName);
  if (!normalizedName) {
    return undefined;
  }

  return (history?.items ?? []).find((historyItem) => {
    const normalizedHistoryName =
      normalizeFoodDiscoveryHistoryName(historyItem.normalizedItemName) ||
      normalizeFoodDiscoveryHistoryName(historyItem.displayName);
    return normalizedHistoryName === normalizedName;
  });
}

function resolveFoodDiscoveryOrderedHistory({
  allLocationsHistory,
  currentRestaurantId,
  exactOrderCountHint,
  itemName,
  relatedRestaurantIds,
}: {
  allLocationsHistory: AllLocationsHistoryRecord | undefined;
  currentRestaurantId: string;
  exactOrderCountHint?: number;
  itemName: string;
  relatedRestaurantIds?: ReadonlySet<string>;
}): FoodDiscoveryOrderedHistory | undefined {
  const exactOrderCount = toPositiveInteger(exactOrderCountHint);
  if (exactOrderCount > 0) {
    return {
      kind: 'exactLocation',
      orderCount: exactOrderCount,
    };
  }

  const historyItem = getAllLocationsHistoryItemByName(allLocationsHistory, itemName);
  if (!historyItem) {
    return undefined;
  }

  const historyRestaurants = Array.isArray(historyItem.restaurants) ? historyItem.restaurants : [];
  const exactHistoryCount = historyRestaurants.reduce((sum, restaurantHistory) => {
    if (restaurantHistory.restaurantId !== currentRestaurantId) {
      return sum;
    }

    return sum + toPositiveInteger(restaurantHistory.orderCount);
  }, 0);
  const latestRestaurantId = historyItem.latestRestaurantId?.trim();
  if (
    exactHistoryCount > 0 ||
    (historyRestaurants.length === 0 && latestRestaurantId === currentRestaurantId && historyItem.orderCount > 0)
  ) {
    return {
      kind: 'exactLocation',
      orderCount: Math.max(exactHistoryCount, toPositiveInteger(historyItem.orderCount)),
    };
  }

  const relatedHistoryCount = historyRestaurants.reduce((sum, restaurantHistory) => {
    if (restaurantHistory.restaurantId === currentRestaurantId) {
      return sum;
    }
    if (relatedRestaurantIds && !relatedRestaurantIds.has(restaurantHistory.restaurantId)) {
      return sum;
    }

    return sum + toPositiveInteger(restaurantHistory.orderCount);
  }, 0);
  const latestRelatedOnlyHistoryCount =
    historyRestaurants.length === 0 &&
    latestRestaurantId &&
    latestRestaurantId !== currentRestaurantId &&
    (!relatedRestaurantIds || relatedRestaurantIds.has(latestRestaurantId))
      ? toPositiveInteger(historyItem.orderCount)
      : 0;
  const resolvedRelatedHistoryCount = Math.max(relatedHistoryCount, latestRelatedOnlyHistoryCount);
  if (resolvedRelatedHistoryCount <= 0) {
    return undefined;
  }

  return {
    kind: 'relatedLocation',
    orderCount: resolvedRelatedHistoryCount,
  };
}

function buildFoodDiscoveryMenuCatalogItems(
  items: readonly MenuItemRecord[],
  allLocationsHistory: AllLocationsHistoryRecord | undefined,
  currentRestaurantId: string,
): FoodDiscoveryMenuCatalogItem[] {
  return [...items]
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
    .map((item) => {
      const orderedHistory = resolveFoodDiscoveryOrderedHistory({
        allLocationsHistory,
        currentRestaurantId,
        exactOrderCountHint: item.userEatenCount,
        itemName: item.name,
      });

      return {
        id: item.id,
        name: item.name,
        ...(orderedHistory ? { orderedHistory } : {}),
      };
    });
}

function buildEmptyAllLocationsHistory(restaurant: RestaurantRecord): AllLocationsHistoryRecord {
  return {
    anchorRestaurant: {
      id: restaurant.id,
      name: restaurant.name,
      city: restaurant.city,
      cuisineType: restaurant.cuisineType,
      location: restaurant.location,
    },
    normalizedName: '',
    locationCount: 1,
    visitCount: 0,
    itemCount: 0,
    restaurants: [],
    items: [],
  };
}

function buildEmptyGroupMenuSuggestions(restaurantId: string): GroupMenuSuggestionsRecord {
  return {
    restaurantId,
    suggestions: [],
  };
}

function buildFoodDiscoveryOrderedItems(
  history: AllLocationsHistoryRecord | undefined,
): FoodDiscoveryOrderedItem[] {
  return (history?.items ?? []).map((item) => ({
    id: item.normalizedItemName,
    latestRating: item.latestRating,
    ...(item.latestRestaurantLocation
      ? { latestRestaurantLocation: item.latestRestaurantLocation }
      : {}),
    latestRestaurantName: item.latestRestaurantName,
    name: item.displayName,
    orderCount: item.orderCount,
  }));
}

function getRelatedRestaurantIdsForGroupSuggestion(
  groupMenuSuggestions: GroupMenuSuggestionsRecord | undefined,
  itemName: string,
): ReadonlySet<string> | undefined {
  const normalizedItemName = normalizeFoodDiscoveryHistoryName(itemName);
  const groupSuggestion = (groupMenuSuggestions?.suggestions ?? []).find((suggestion) => {
    const normalizedSuggestionName =
      normalizeFoodDiscoveryHistoryName(suggestion.normalizedItemName) ||
      normalizeFoodDiscoveryHistoryName(suggestion.displayName);
    return normalizedSuggestionName === normalizedItemName;
  });

  if (!groupSuggestion) {
    return undefined;
  }

  return new Set(
    groupSuggestion.sources
      .map((source) => source.restaurantId.trim())
      .filter(Boolean),
  );
}

function buildFoodDiscoveryRelatedMenuSuggestions({
  allLocationsHistory,
  currentRestaurantId,
  exactLocationMenuItems,
  groupMenuSuggestions,
}: {
  allLocationsHistory: AllLocationsHistoryRecord | undefined;
  currentRestaurantId: string;
  exactLocationMenuItems: readonly MenuItemRecord[];
  groupMenuSuggestions: GroupMenuSuggestionsRecord | undefined;
}): FoodDiscoveryMenuSelectionSuggestion[] {
  return buildMenuSelectionSuggestions({
    exactLocationMenuItems: [...exactLocationMenuItems],
    groupMenuSuggestions,
  })
    .filter((suggestion) => suggestion.source === 'relatedLocationSuggestion')
    .map((suggestion) => {
      const orderedHistory = resolveFoodDiscoveryOrderedHistory({
        allLocationsHistory,
        currentRestaurantId,
        exactOrderCountHint: suggestion.orderCount,
        itemName: suggestion.name,
        relatedRestaurantIds: getRelatedRestaurantIdsForGroupSuggestion(groupMenuSuggestions, suggestion.name),
      });

      return {
        ...suggestion,
        ...(orderedHistory ? { orderedHistory } : {}),
      };
    });
}

export function canShowFoodDiscoveryAllLocationsHistory(
  history: AllLocationsHistoryRecord | undefined,
  currentRestaurantId: string | null,
): boolean {
  if (!history || !currentRestaurantId) {
    return false;
  }

  const historyItems = Array.isArray(history.items) ? history.items : [];
  const historyRestaurants = Array.isArray(history.restaurants) ? history.restaurants : [];
  const hasItemBackedHistory = history.itemCount > 0 || historyItems.length > 0;
  if (!hasItemBackedHistory || history.visitCount <= 0) {
    return false;
  }

  const hasOrderedHistoryAtAnotherLocation = historyRestaurants.some(
    (historyRestaurant) => historyRestaurant.restaurantId !== currentRestaurantId,
  );

  return history.locationCount > 1 || hasOrderedHistoryAtAnotherLocation;
}

function getBlockingErrorMessage(error: unknown, hasCachedRows: boolean): string | null {
  if (hasCachedRows || !(error instanceof Error)) {
    return null;
  }

  return error.message;
}

function isQueryLoading(query: { isLoading?: boolean; isPending?: boolean }): boolean {
  return query.isPending ?? query.isLoading ?? false;
}

export function useFoodDiscoveryRestaurantReadModel({
  enabled = true,
  isOnline,
  menuSelectionSearchQuery = '',
  restaurant,
}: FoodDiscoveryRestaurantReadModelInput): FoodDiscoveryRestaurantReadModel {
  const queryClient = useQueryClient();
  const restaurantId = restaurant?.id ?? '';
  const allLocationsHistoryQueryKey = restaurantsQueryKeys.allLocationsHistory(restaurantId);
  const groupMenuSuggestionsQueryKey = restaurantsQueryKeys.groupMenuSuggestions(restaurantId);

  const menuItemsQuery = useRestaurantMenuItemsQuery({
    enabled: enabled && Boolean(restaurantId),
    isOnline,
    restaurantId,
    search: menuSelectionSearchQuery,
  });

  const allLocationsHistoryQuery = useQuery({
    enabled: enabled && Boolean(restaurantId),
    queryFn: ({ signal }): Promise<AllLocationsHistoryRecord> => {
      if (!restaurant) {
        return Promise.resolve({
          anchorRestaurant: { id: '', name: '' },
          normalizedName: '',
          locationCount: 0,
          visitCount: 0,
          itemCount: 0,
          restaurants: [],
          items: [],
        });
      }

      if (!isOnline) {
        return Promise.resolve(
          queryClient.getQueryData<AllLocationsHistoryRecord>(allLocationsHistoryQueryKey) ??
            buildEmptyAllLocationsHistory(restaurant),
        );
      }

      return getAllLocationsHistory(restaurant.id, { signal });
    },
    queryKey: allLocationsHistoryQueryKey,
  });

  const groupMenuSuggestionsQuery = useQuery({
    enabled: enabled && Boolean(restaurantId),
    queryFn: ({ signal }): Promise<GroupMenuSuggestionsRecord> => {
      const emptySuggestions = buildEmptyGroupMenuSuggestions(restaurantId);
      if (!restaurantId) {
        return Promise.resolve(emptySuggestions);
      }

      if (!isOnline) {
        return Promise.resolve(
          queryClient.getQueryData<GroupMenuSuggestionsRecord>(groupMenuSuggestionsQueryKey) ??
            emptySuggestions,
        );
      }

      return getGroupMenuSuggestionsForRestaurant(restaurantId, { signal });
    },
    queryKey: groupMenuSuggestionsQueryKey,
  });

  const menuItems = Array.isArray(menuItemsQuery.data) ? menuItemsQuery.data : EMPTY_MENU_ITEMS;
  const allLocationsHistory = allLocationsHistoryQuery.data;
  const groupMenuSuggestions = groupMenuSuggestionsQuery.data;
  const menuCatalogItems = useMemo(
    () => buildFoodDiscoveryMenuCatalogItems(menuItems, allLocationsHistory, restaurantId),
    [allLocationsHistory, menuItems, restaurantId],
  );
  const yourOrderedItems = useMemo(
    () => buildFoodDiscoveryOrderedItems(allLocationsHistory),
    [allLocationsHistory],
  );
  const relatedMenuSuggestions = useMemo(
    () =>
      buildFoodDiscoveryRelatedMenuSuggestions({
        allLocationsHistory,
        currentRestaurantId: restaurantId,
        exactLocationMenuItems: menuItems,
        groupMenuSuggestions,
      }),
    [allLocationsHistory, groupMenuSuggestions, menuItems, restaurantId],
  );
  const menuSelectionSuggestions = useMemo(
    () =>
      buildMenuSelectionSuggestions({
        allLocationsHistory,
        exactLocationMenuItems: [...menuItems],
        groupMenuSuggestions,
        searchQuery: menuSelectionSearchQuery,
      }),
    [allLocationsHistory, groupMenuSuggestions, menuItems, menuSelectionSearchQuery],
  );

  return {
    allLocationsHistory,
    allLocationsHistoryErrorMessage: getBlockingErrorMessage(
      allLocationsHistoryQuery.error,
      yourOrderedItems.length > 0,
    ),
    allLocationsHistoryLoading: isQueryLoading(allLocationsHistoryQuery),
    canShowAllLocations: canShowFoodDiscoveryAllLocationsHistory(
      allLocationsHistory,
      restaurantId || null,
    ),
    groupMenuSuggestions,
    groupMenuSuggestionsErrorMessage: getBlockingErrorMessage(
      groupMenuSuggestionsQuery.error,
      relatedMenuSuggestions.length > 0,
    ),
    groupMenuSuggestionsLoading: isQueryLoading(groupMenuSuggestionsQuery),
    menuCatalogErrorMessage: getBlockingErrorMessage(menuItemsQuery.error, menuCatalogItems.length > 0),
    menuCatalogHasNextPage: menuItemsQuery.hasNextPage,
    menuCatalogIsFetchingNextPage: menuItemsQuery.isFetchingNextPage,
    menuCatalogItems,
    menuCatalogLoading: isQueryLoading(menuItemsQuery),
    menuCatalogTotalItems: menuItemsQuery.totalItems,
    menuItems,
    menuSelectionSuggestions,
    refetchAllLocationsHistory: allLocationsHistoryQuery.refetch,
    refetchGroupMenuSuggestions: groupMenuSuggestionsQuery.refetch,
    refetchMenuCatalog: menuItemsQuery.refetch,
    fetchNextMenuCatalogPage: menuItemsQuery.fetchNextPage,
    relatedMenuSuggestions,
    yourOrderedItems,
  };
}
