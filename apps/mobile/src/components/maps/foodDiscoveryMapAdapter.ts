import type { FoodDiscoveryRestaurantReadModel } from '../../features/store/useFoodDiscoveryRestaurantReadModel';
import { formatDistance } from '../../lib/googlePlaces';
import type { VisitRestaurantWithDistance } from '../../lib/visitRestaurantSearch';
import type { RestaurantRecord } from '../../features/models';
import type {
  RestaurantMapGroup,
  RestaurantMapItem,
  RestaurantMapSheetTabId,
  RestaurantMapSheetTabs,
} from './restaurantMapTypes';

export interface FoodDiscoveryMapAdapterInput {
  activeSheetTab: RestaurantMapSheetTabId;
  displayedSavedRestaurantsCount: number;
  groups: RestaurantMapGroup[];
  isGettingLocation: boolean;
  isSearchingNearbyRestaurants: boolean;
  onSheetTabChange: (tabId: RestaurantMapSheetTabId) => void;
  searchErrorMessage: string | null;
  selectedRestaurant: RestaurantRecord | null;
  selectedRestaurantReadModel: FoodDiscoveryRestaurantReadModel;
  showNearbyPlaces: boolean;
  totalRestaurantCount: number;
}

export interface FoodDiscoveryMapReadModel {
  groups: RestaurantMapGroup[];
  mapStatusLabel: string;
  omittedWithoutCoordinates: number;
  selectedGroupTabs: RestaurantMapSheetTabs | null;
  selectedRestaurant: RestaurantRecord | null;
  selectedRestaurantId: string | null;
}

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

export function buildFoodDiscoveryMapGroups(
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

function getOrderedHistoryLabel(kind: 'exactLocation' | 'relatedLocation'): string {
  return kind === 'exactLocation' ? 'Had here' : 'Had at related locations';
}

function buildFoodDiscoveryMenuCatalogRows(
  readModel: FoodDiscoveryRestaurantReadModel,
): RestaurantMapItem[] {
  return readModel.menuCatalogItems.map((item) => ({
    id: item.id,
    meta: item.orderedHistory
      ? [{ label: getOrderedHistoryLabel(item.orderedHistory.kind) }]
      : [],
    name: item.name,
  }));
}

function buildFoodDiscoveryYourOrderedItemsRows(
  readModel: FoodDiscoveryRestaurantReadModel,
): RestaurantMapItem[] {
  return readModel.yourOrderedItems.map((item) => {
    const latestLocationParts = [item.latestRestaurantName, item.latestRestaurantLocation].filter(Boolean);

    return {
      id: item.id,
      meta: [
        {
          dateLabel: latestLocationParts.length > 0
            ? `Latest at ${latestLocationParts.join(' • ')}`
            : null,
          label: pluralize(item.orderCount, 'order', 'orders'),
          rating: item.latestRating,
        },
      ],
      name: item.name,
    };
  });
}

function getFoodDiscoveryMapStatusLabel({
  displayedSavedRestaurantsCount,
  isGettingLocation,
  isSearchingNearbyRestaurants,
  searchErrorMessage,
  showNearbyPlaces,
}: Pick<
  FoodDiscoveryMapAdapterInput,
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

export function buildFoodDiscoveryMapReadModel({
  activeSheetTab,
  displayedSavedRestaurantsCount,
  groups,
  isGettingLocation,
  isSearchingNearbyRestaurants,
  onSheetTabChange,
  searchErrorMessage,
  selectedRestaurant,
  selectedRestaurantReadModel,
  showNearbyPlaces,
  totalRestaurantCount,
}: FoodDiscoveryMapAdapterInput): FoodDiscoveryMapReadModel {
  const selectedRestaurantId = selectedRestaurant?.id ?? null;
  const selectedGroupTabs = selectedRestaurantId
    ? ({
        activeTab: activeSheetTab,
        allLocations: {
          emptyDescription: 'Track a visit at this restaurant name to build your history.',
          emptyTitle: 'No orders across locations yet',
          errorMessage: selectedRestaurantReadModel.allLocationsHistoryErrorMessage,
          items: buildFoodDiscoveryYourOrderedItemsRows(selectedRestaurantReadModel),
          loading: selectedRestaurantReadModel.allLocationsHistoryLoading,
          title: 'All Locations',
        },
        location: {
          actionLabel: selectedRestaurantReadModel.menuCatalogHasNextPage
            ? 'Load more menu items'
            : undefined,
          actionLoading: selectedRestaurantReadModel.menuCatalogIsFetchingNextPage,
          emptyDescription: 'Open this restaurant to scan a menu or add items.',
          emptyTitle: 'No menu items yet',
          errorMessage: selectedRestaurantReadModel.menuCatalogErrorMessage,
          items: buildFoodDiscoveryMenuCatalogRows(selectedRestaurantReadModel),
          loading: selectedRestaurantReadModel.menuCatalogLoading,
          onActionPress: selectedRestaurantReadModel.menuCatalogHasNextPage
            ? () => {
                void selectedRestaurantReadModel.fetchNextMenuCatalogPage();
              }
            : undefined,
          title: 'This Location',
        },
        onTabChange: onSheetTabChange,
      } satisfies RestaurantMapSheetTabs)
    : null;

  return {
    groups,
    mapStatusLabel: getFoodDiscoveryMapStatusLabel({
      displayedSavedRestaurantsCount,
      isGettingLocation,
      isSearchingNearbyRestaurants,
      searchErrorMessage,
      showNearbyPlaces,
    }),
    omittedWithoutCoordinates: totalRestaurantCount - groups.length,
    selectedGroupTabs,
    selectedRestaurant,
    selectedRestaurantId,
  };
}
