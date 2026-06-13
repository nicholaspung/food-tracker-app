import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  RestaurantMapGroup,
  RestaurantMapItem,
  RestaurantMapSheetTabId,
  RestaurantMapSheetTabs,
} from '../../components/maps';
import { formatDistance } from '../../lib/googlePlaces';
import type { VisitRestaurantWithDistance } from '../../lib/visitRestaurantSearch';
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
import { menuItemsQueryKeys } from './menuItemsQuery';
import { restaurantsQueryKeys } from './restaurantsQuery';
import {
  getAllLocationsHistory,
  getGroupMenuSuggestionsForRestaurant,
  listMenuItemsForRestaurant,
} from './restaurantsStore';

interface FoodDiscoveryMapReadModelInput {
  activeSheetTab: RestaurantMapSheetTabId;
  currentRestaurants: readonly VisitRestaurantWithDistance[];
  displayedSavedRestaurantsCount: number;
  isGettingLocation: boolean;
  isMapMode: boolean;
  isOnline: boolean;
  isSearchingNearbyRestaurants: boolean;
  onSheetTabChange: (tabId: RestaurantMapSheetTabId) => void;
  searchErrorMessage: string | null;
  selectedGroupId: string | null;
  showNearbyPlaces: boolean;
}

interface FoodDiscoveryMapReadModel {
  groups: RestaurantMapGroup[];
  mapStatusLabel: string;
  omittedWithoutCoordinates: number;
  selectedGroupTabs: RestaurantMapSheetTabs | null;
  selectedRestaurant: RestaurantRecord | null;
  selectedRestaurantId: string | null;
}

interface FoodDiscoveryRestaurantDetailReadModelInput {
  enabled?: boolean;
  isOnline: boolean;
  menuSelectionSearchQuery?: string;
  restaurant: RestaurantRecord | null;
}

export type FoodDiscoveryOrderedHistoryKind = 'exactLocation' | 'relatedLocation';

export interface FoodDiscoveryOrderedHistory {
  kind: FoodDiscoveryOrderedHistoryKind;
  label: string;
  orderCount: number;
}

export interface FoodDiscoveryMenuSelectionSuggestion extends MenuSelectionSuggestion {
  orderedHistory?: FoodDiscoveryOrderedHistory;
}

export interface FoodDiscoveryMenuCatalogRow extends RestaurantMapItem {
  orderedHistory?: FoodDiscoveryOrderedHistory;
}

interface FoodDiscoveryRestaurantDetailReadModel {
  allLocationsHistory: AllLocationsHistoryRecord | undefined;
  allLocationsHistoryErrorMessage: string | null;
  allLocationsHistoryLoading: boolean;
  canShowAllLocations: boolean;
  groupMenuSuggestions: GroupMenuSuggestionsRecord | undefined;
  groupMenuSuggestionsErrorMessage: string | null;
  groupMenuSuggestionsLoading: boolean;
  menuCatalogErrorMessage: string | null;
  menuCatalogLoading: boolean;
  menuCatalogRows: FoodDiscoveryMenuCatalogRow[];
  menuItems: MenuItemRecord[];
  menuSelectionSuggestions: MenuSelectionSuggestion[];
  refetchAllLocationsHistory: () => Promise<unknown>;
  refetchGroupMenuSuggestions: () => Promise<unknown>;
  refetchMenuCatalog: () => Promise<unknown>;
  relatedMenuSuggestions: FoodDiscoveryMenuSelectionSuggestion[];
  yourOrderedItemsRows: RestaurantMapItem[];
}

const EMPTY_MENU_ITEMS: MenuItemRecord[] = [];

function hasUsableCoordinates(restaurant: RestaurantRecord): restaurant is RestaurantRecord & {
  latitude: number;
  longitude: number;
} {
  return (
    typeof restaurant.latitude === 'number' &&
    typeof restaurant.longitude === 'number' &&
    Number.isFinite(restaurant.latitude) &&
    Number.isFinite(restaurant.longitude) &&
    restaurant.latitude >= -90 &&
    restaurant.latitude <= 90 &&
    restaurant.longitude >= -180 &&
    restaurant.longitude <= 180 &&
    !(restaurant.latitude === 0 && restaurant.longitude === 0)
  );
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

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

function buildDiscoveryRestaurantSummary({ distance, restaurant }: VisitRestaurantWithDistance): string {
  const parts = [
    restaurant.cuisineType,
    distance !== null ? formatDistance(distance) : null,
    typeof restaurant.userVisitCount === 'number' && restaurant.userVisitCount > 0
      ? pluralize(restaurant.userVisitCount, 'visit', 'visits')
      : null,
    typeof restaurant.friendCount === 'number' && restaurant.friendCount > 0
      ? pluralize(restaurant.friendCount, 'friend', 'friends')
      : null,
  ].filter(Boolean);

  return parts.join(' • ') || 'Restaurant';
}

function buildFoodDiscoveryMapGroups(
  restaurants: readonly VisitRestaurantWithDistance[],
): RestaurantMapGroup[] {
  return restaurants.flatMap((entry) => {
    const { restaurant } = entry;
    if (!hasUsableCoordinates(restaurant)) {
      return [];
    }

    const meta = [
      restaurant.isGooglePlace ? { label: 'Google Place' } : null,
      typeof restaurant.userVisitCount === 'number' && restaurant.userVisitCount > 0
        ? { label: pluralize(restaurant.userVisitCount, 'visit', 'visits') }
        : null,
      typeof restaurant.friendCount === 'number' && restaurant.friendCount > 0
        ? { label: pluralize(restaurant.friendCount, 'friend', 'friends') }
        : null,
    ].filter((value): value is { label: string } => Boolean(value));

    return [
      {
        id: restaurant.id,
        items: [
          {
            id: restaurant.id,
            meta,
            name: restaurant.cuisineType ?? 'Restaurant',
          },
        ],
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        restaurantLocation: restaurant.location ?? restaurant.city,
        restaurantName: restaurant.name,
        summary: buildDiscoveryRestaurantSummary(entry),
      },
    ];
  });
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
      label: 'Had here',
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
      label: 'Had here',
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
    label: 'Had at related locations',
    orderCount: resolvedRelatedHistoryCount,
  };
}

function buildOrderedHistoryMeta(
  orderedHistory: FoodDiscoveryOrderedHistory | undefined,
): RestaurantMapItem['meta'] {
  return orderedHistory
    ? [
        {
          label: orderedHistory.label,
        },
      ]
    : [];
}

function buildFoodDiscoveryMenuCatalogRows(
  items: readonly MenuItemRecord[],
  allLocationsHistory: AllLocationsHistoryRecord | undefined,
  currentRestaurantId: string,
): FoodDiscoveryMenuCatalogRow[] {
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
        meta: buildOrderedHistoryMeta(orderedHistory),
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

function buildFoodDiscoveryYourOrderedItemsRows(
  history: AllLocationsHistoryRecord | undefined,
): RestaurantMapItem[] {
  return (history?.items ?? []).map((item) => {
    const latestLocationParts = [item.latestRestaurantName, item.latestRestaurantLocation].filter(Boolean);

    return {
      id: item.normalizedItemName,
      meta: [
        {
          dateLabel: latestLocationParts.length > 0
            ? `Latest at ${latestLocationParts.join(' • ')}`
            : null,
          label: pluralize(item.orderCount, 'order', 'orders'),
          rating: item.latestRating,
        },
      ],
      name: item.displayName,
    };
  });
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

function getFoodDiscoveryMapStatusLabel({
  displayedSavedRestaurantsCount,
  isGettingLocation,
  isSearchingNearbyRestaurants,
  searchErrorMessage,
  showNearbyPlaces,
}: Pick<
  FoodDiscoveryMapReadModelInput,
  | 'displayedSavedRestaurantsCount'
  | 'isGettingLocation'
  | 'isSearchingNearbyRestaurants'
  | 'searchErrorMessage'
  | 'showNearbyPlaces'
>): string {
  if (isSearchingNearbyRestaurants || isGettingLocation) {
    return 'Finding nearby places...';
  }

  if (searchErrorMessage) {
    return 'Search needs attention';
  }

  if (showNearbyPlaces) {
    return 'Showing search results';
  }

  if (displayedSavedRestaurantsCount > 0) {
    return 'Showing saved restaurants';
  }

  return 'Nearby-first map search';
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

export function useFoodDiscoveryRestaurantDetailReadModel({
  enabled = true,
  isOnline,
  menuSelectionSearchQuery = '',
  restaurant,
}: FoodDiscoveryRestaurantDetailReadModelInput): FoodDiscoveryRestaurantDetailReadModel {
  const queryClient = useQueryClient();
  const restaurantId = restaurant?.id ?? '';
  const menuItemsQueryKey = menuItemsQueryKeys.restaurant(restaurantId);
  const allLocationsHistoryQueryKey = restaurantsQueryKeys.allLocationsHistory(restaurantId);
  const groupMenuSuggestionsQueryKey = restaurantsQueryKeys.groupMenuSuggestions(restaurantId);

  const menuItemsQuery = useQuery({
    enabled: enabled && Boolean(restaurantId),
    queryFn: async ({ signal }) => {
      if (!restaurantId) {
        return [];
      }

      if (!isOnline) {
        const cached = queryClient.getQueryData<MenuItemRecord[]>(menuItemsQueryKey);
        if (cached) {
          return cached;
        }
        throw new Error('Menu items need internet connection.');
      }

      return listMenuItemsForRestaurant(restaurantId, { signal });
    },
    queryKey: menuItemsQueryKey,
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
  const menuCatalogRows = useMemo(
    () => buildFoodDiscoveryMenuCatalogRows(menuItems, allLocationsHistory, restaurantId),
    [allLocationsHistory, menuItems, restaurantId],
  );
  const yourOrderedItemsRows = useMemo(
    () => buildFoodDiscoveryYourOrderedItemsRows(allLocationsHistory),
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
      yourOrderedItemsRows.length > 0,
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
    menuCatalogErrorMessage: getBlockingErrorMessage(menuItemsQuery.error, menuCatalogRows.length > 0),
    menuCatalogLoading: isQueryLoading(menuItemsQuery),
    menuCatalogRows,
    menuItems,
    menuSelectionSuggestions,
    refetchAllLocationsHistory: allLocationsHistoryQuery.refetch,
    refetchGroupMenuSuggestions: groupMenuSuggestionsQuery.refetch,
    refetchMenuCatalog: menuItemsQuery.refetch,
    relatedMenuSuggestions,
    yourOrderedItemsRows,
  };
}

export function useFoodDiscoveryMapReadModel({
  activeSheetTab,
  currentRestaurants,
  displayedSavedRestaurantsCount,
  isGettingLocation,
  isMapMode,
  isOnline,
  isSearchingNearbyRestaurants,
  onSheetTabChange,
  searchErrorMessage,
  selectedGroupId,
  showNearbyPlaces,
}: FoodDiscoveryMapReadModelInput): FoodDiscoveryMapReadModel {
  const selectedRestaurant = selectedGroupId
    ? currentRestaurants.find((entry) => entry.restaurant.id === selectedGroupId)?.restaurant ?? null
    : null;
  const selectedRestaurantId = selectedRestaurant?.id ?? null;
  const selectedRestaurantDetail = useFoodDiscoveryRestaurantDetailReadModel({
    enabled: isMapMode && Boolean(selectedRestaurantId),
    isOnline,
    restaurant: selectedRestaurant,
  });

  const groups = useMemo(
    () => buildFoodDiscoveryMapGroups(currentRestaurants),
    [currentRestaurants],
  );
  const mapStatusLabel = getFoodDiscoveryMapStatusLabel({
    displayedSavedRestaurantsCount,
    isGettingLocation,
    isSearchingNearbyRestaurants,
    searchErrorMessage,
    showNearbyPlaces,
  });
  const selectedGroupTabs = selectedRestaurantId
    ? ({
        activeTab: activeSheetTab,
        allLocations: {
          emptyDescription: 'Track a visit at this restaurant name to build your history.',
          emptyTitle: 'No orders across locations yet',
          errorMessage: selectedRestaurantDetail.allLocationsHistoryErrorMessage,
          items: selectedRestaurantDetail.yourOrderedItemsRows,
          loading: selectedRestaurantDetail.allLocationsHistoryLoading,
          title: 'All Locations',
        },
        location: {
          emptyDescription: 'Open this restaurant to scan a menu or add items.',
          emptyTitle: 'No menu items yet',
          errorMessage: selectedRestaurantDetail.menuCatalogErrorMessage,
          items: selectedRestaurantDetail.menuCatalogRows,
          loading: selectedRestaurantDetail.menuCatalogLoading,
          title: 'This Location',
        },
        onTabChange: onSheetTabChange,
      } satisfies RestaurantMapSheetTabs)
    : null;

  return {
    groups,
    mapStatusLabel,
    omittedWithoutCoordinates: currentRestaurants.length - groups.length,
    selectedGroupTabs,
    selectedRestaurant,
    selectedRestaurantId,
  };
}
