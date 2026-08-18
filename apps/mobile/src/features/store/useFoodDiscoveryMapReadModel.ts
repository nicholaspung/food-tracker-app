import { useMemo } from 'react';

import {
  buildFoodDiscoveryMapGroups,
  buildFoodDiscoveryMapReadModel,
  type FoodDiscoveryMapReadModel,
} from '../../components/maps/foodDiscoveryMapAdapter';
import type { RestaurantMapSheetTabId } from '../../components/maps';
import type { VisitRestaurantWithDistance } from '../../lib/visitRestaurantSearch';
import { useFoodDiscoveryRestaurantReadModel } from './useFoodDiscoveryRestaurantReadModel';

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
  const selectedRestaurantReadModel = useFoodDiscoveryRestaurantReadModel({
    enabled: isMapMode && Boolean(selectedRestaurant),
    isOnline,
    restaurant: selectedRestaurant,
  });
  const groups = useMemo(
    () => buildFoodDiscoveryMapGroups(currentRestaurants),
    [currentRestaurants],
  );

  return useMemo(
    () =>
      buildFoodDiscoveryMapReadModel({
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
        totalRestaurantCount: currentRestaurants.length,
      }),
    [
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
      currentRestaurants.length,
    ],
  );
}
