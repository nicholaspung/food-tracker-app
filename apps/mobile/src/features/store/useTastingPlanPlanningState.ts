import { useEffect, useMemo, useState } from 'react';

import type {
  TastingMenuItemRecord,
  TastingRestaurantRecord,
  TastingSessionRecord,
} from '../models';

export type TastingPlanPlanningPhase = 'restaurants' | 'items';

export interface TastingPlanRestaurantFact {
  id: string;
  restaurantId: string;
  restaurantName: string;
  selectedItemCount: number;
}

export interface TastingPlanStartReadiness {
  canStart: boolean;
  disabledReason: string | null;
  hasSelectedItems: boolean;
  hasSelectedRestaurants: boolean;
}

export interface TastingPlanMissingItemConfirmation {
  description: string;
  restaurantNames: string[];
  required: boolean;
}

export interface TastingPlanOnlineActionAvailability {
  disabled: boolean;
  message: string | null;
}

export interface TastingPlanScanHandoff {
  disabled: boolean;
  restaurantId: string | null;
  restaurantName: string | null;
}

export interface TastingPlanPlanningFacts {
  activeRestaurant: TastingRestaurantRecord | null;
  activeRestaurantFact: TastingPlanRestaurantFact | null;
  activeSelectedItemCount: number;
  missingItemConfirmation: TastingPlanMissingItemConfirmation;
  onlineActions: TastingPlanOnlineActionAvailability;
  restaurantsWithoutItems: TastingRestaurantRecord[];
  scanHandoff: TastingPlanScanHandoff;
  selectedItemCount: number;
  selectedItemIds: Set<string>;
  selectedRestaurantFacts: TastingPlanRestaurantFact[];
  selectedRestaurantIds: Set<string>;
  selectedRestaurants: TastingRestaurantRecord[];
  startReadiness: TastingPlanStartReadiness;
}

interface BuildTastingPlanPlanningFactsInput {
  activeRestaurantSuggestionId: string | null;
  isLeader: boolean;
  isOnline: boolean;
  session: TastingSessionRecord | null | undefined;
}

interface UseTastingPlanPlanningStateInput {
  isLeader: boolean;
  isOnline: boolean;
  session: TastingSessionRecord | null | undefined;
}

function getApprovedItems(restaurant: TastingRestaurantRecord): TastingMenuItemRecord[] {
  return (restaurant.items ?? []).filter((item) => item.status === 'approved');
}

function toRestaurantFact(restaurant: TastingRestaurantRecord): TastingPlanRestaurantFact {
  return {
    id: restaurant.id,
    restaurantId: restaurant.restaurantId,
    restaurantName: restaurant.restaurantName,
    selectedItemCount: getApprovedItems(restaurant).length,
  };
}

export function buildTastingPlanPlanningFacts({
  activeRestaurantSuggestionId,
  isLeader,
  isOnline,
  session,
}: BuildTastingPlanPlanningFactsInput): TastingPlanPlanningFacts {
  const selectedRestaurants = (session?.restaurants ?? []).filter(
    (restaurant) => restaurant.status === 'approved',
  );
  const selectedRestaurantIds = new Set(
    selectedRestaurants.map((restaurant) => restaurant.restaurantId),
  );
  const activeRestaurant =
    selectedRestaurants.find((restaurant) => restaurant.id === activeRestaurantSuggestionId) ??
    selectedRestaurants[0] ??
    null;
  const activeApprovedItems = activeRestaurant ? getApprovedItems(activeRestaurant) : [];
  const selectedItemIds = new Set(activeApprovedItems.map((item) => item.menuItemId));
  const selectedRestaurantFacts = selectedRestaurants.map(toRestaurantFact);
  const selectedItemCount = selectedRestaurantFacts.reduce(
    (total, restaurant) => total + restaurant.selectedItemCount,
    0,
  );
  const restaurantsWithoutItems = selectedRestaurants.filter(
    (restaurant) => getApprovedItems(restaurant).length === 0,
  );
  const missingRestaurantNames = restaurantsWithoutItems.map((restaurant) => restaurant.restaurantName);
  const missingItemPredicate = restaurantsWithoutItems.length === 1 ? 'does' : 'do';
  const missingItemConfirmation: TastingPlanMissingItemConfirmation = {
    description:
      missingRestaurantNames.length > 0
        ? `Are you sure you want to continue? ${missingRestaurantNames.join(', ')} ${missingItemPredicate} not have a menu item to rate.`
        : '',
    restaurantNames: missingRestaurantNames,
    required: missingRestaurantNames.length > 0,
  };
  const hasSelectedRestaurants = selectedRestaurants.length > 0;
  const hasSelectedItems = selectedItemCount > 0;
  const onlineActions = {
    disabled: !isOnline,
    message: !isOnline ? 'Planning actions require a connection.' : null,
  };
  const startReadiness: TastingPlanStartReadiness = {
    canStart: isLeader && isOnline && hasSelectedRestaurants && hasSelectedItems,
    disabledReason: !isLeader
      ? 'Only the leader can start tasting.'
      : !isOnline
        ? 'Planning actions require a connection.'
        : !hasSelectedRestaurants
          ? 'Select at least one restaurant before starting.'
          : !hasSelectedItems
            ? 'Select at least one menu item before starting.'
            : null,
    hasSelectedItems,
    hasSelectedRestaurants,
  };

  return {
    activeRestaurant,
    activeRestaurantFact: activeRestaurant ? toRestaurantFact(activeRestaurant) : null,
    activeSelectedItemCount: activeApprovedItems.length,
    missingItemConfirmation,
    onlineActions,
    restaurantsWithoutItems,
    scanHandoff: {
      disabled: !activeRestaurant || !isOnline,
      restaurantId: activeRestaurant?.restaurantId ?? null,
      restaurantName: activeRestaurant?.restaurantName ?? null,
    },
    selectedItemCount,
    selectedItemIds,
    selectedRestaurantFacts,
    selectedRestaurantIds,
    selectedRestaurants,
    startReadiness,
  };
}

export function useTastingPlanPlanningState({
  isLeader,
  isOnline,
  session,
}: UseTastingPlanPlanningStateInput) {
  const [phase, setPhase] = useState<TastingPlanPlanningPhase>('restaurants');
  const [activeRestaurantSuggestionId, setActiveRestaurantSuggestionId] = useState<string | null>(null);
  const facts = useMemo(
    () =>
      buildTastingPlanPlanningFacts({
        activeRestaurantSuggestionId,
        isLeader,
        isOnline,
        session,
      }),
    [activeRestaurantSuggestionId, isLeader, isOnline, session],
  );

  useEffect(() => {
    if (facts.selectedRestaurants.length === 0 && phase === 'items') {
      setPhase('restaurants');
    }
  }, [facts.selectedRestaurants.length, phase]);

  useEffect(() => {
    if (!facts.activeRestaurant && facts.selectedRestaurants[0]) {
      setActiveRestaurantSuggestionId(facts.selectedRestaurants[0].id);
      return;
    }

    if (facts.activeRestaurant && facts.activeRestaurant.id !== activeRestaurantSuggestionId) {
      setActiveRestaurantSuggestionId(facts.activeRestaurant.id);
    }
  }, [activeRestaurantSuggestionId, facts.activeRestaurant, facts.selectedRestaurants]);

  return {
    ...facts,
    activeRestaurantSuggestionId,
    phase,
    setActiveRestaurantSuggestionId,
    setPhase,
  };
}
