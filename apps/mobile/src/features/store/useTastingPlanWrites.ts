import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import type {
  RestaurantRecord,
  TastingSessionRecord,
} from '../models';
import type { MenuItemRecord } from './featureStore';
import {
  setTastingMenuItemSuggestionStatus,
  setTastingRestaurantSuggestionStatus,
  startTastingSession,
  suggestTastingMenuItem,
  suggestTastingRestaurant,
} from './tastingSessionsApiStore';
import { moreFeatureSignalQueryKeys } from './moreFeatureSignalsQuery';
import { tastingSessionsQueryKeys } from './tastingSessionsQuery';

interface OnlineOnlyTastingPlanWriteInput {
  isOnline: boolean;
  sessionId: string;
}

interface AddTastingPlanRestaurantInput extends OnlineOnlyTastingPlanWriteInput {
  restaurant: Pick<RestaurantRecord, 'id' | 'name'>;
}

interface RemoveTastingPlanRestaurantInput extends OnlineOnlyTastingPlanWriteInput {
  restaurantSuggestionId: string;
}

interface AddTastingPlanMenuItemInput extends OnlineOnlyTastingPlanWriteInput {
  existingSuggestionId?: string;
  menuItem: Pick<MenuItemRecord, 'id' | 'name'>;
  restaurantSuggestionId: string;
}

interface RemoveTastingPlanMenuItemInput extends OnlineOnlyTastingPlanWriteInput {
  itemSuggestionId: string;
}

type TastingPlanWriteResult<T> =
  | {
      result: T;
      status: 'completed';
    }
  | {
      message: string;
      status: 'blocked';
    };

function blocked(message = 'Planning actions require a connection.'): TastingPlanWriteResult<never> {
  return {
    message,
    status: 'blocked',
  };
}

async function refreshTastingPlan(
  queryClient: QueryClient,
  sessionId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) }),
    queryClient.invalidateQueries({ queryKey: moreFeatureSignalQueryKeys.summary }),
  ]);
}

export function useTastingPlanWrites() {
  const queryClient = useQueryClient();

  const addRestaurant = useCallback(
    async ({
      isOnline,
      restaurant,
      sessionId,
    }: AddTastingPlanRestaurantInput): Promise<TastingPlanWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked();
      }

      const session = await suggestTastingRestaurant(sessionId, {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
      });
      await refreshTastingPlan(queryClient, sessionId);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const removeRestaurant = useCallback(
    async ({
      isOnline,
      restaurantSuggestionId,
      sessionId,
    }: RemoveTastingPlanRestaurantInput): Promise<TastingPlanWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked();
      }

      const session = await setTastingRestaurantSuggestionStatus(
        sessionId,
        restaurantSuggestionId,
        'rejected',
      );
      await refreshTastingPlan(queryClient, sessionId);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const addMenuItem = useCallback(
    async ({
      existingSuggestionId,
      isOnline,
      menuItem,
      restaurantSuggestionId,
      sessionId,
    }: AddTastingPlanMenuItemInput): Promise<TastingPlanWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked();
      }

      const session = existingSuggestionId
        ? await setTastingMenuItemSuggestionStatus(sessionId, existingSuggestionId, 'approved')
        : await suggestTastingMenuItem(sessionId, restaurantSuggestionId, {
            menuItemId: menuItem.id,
            name: menuItem.name,
          });
      await refreshTastingPlan(queryClient, sessionId);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const removeMenuItem = useCallback(
    async ({
      isOnline,
      itemSuggestionId,
      sessionId,
    }: RemoveTastingPlanMenuItemInput): Promise<TastingPlanWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked();
      }

      const session = await setTastingMenuItemSuggestionStatus(sessionId, itemSuggestionId, 'rejected');
      await refreshTastingPlan(queryClient, sessionId);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const startTasting = useCallback(
    async ({
      isOnline,
      sessionId,
    }: OnlineOnlyTastingPlanWriteInput): Promise<TastingPlanWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked();
      }

      const session = await startTastingSession(sessionId);
      await refreshTastingPlan(queryClient, sessionId);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  return {
    addMenuItem,
    addRestaurant,
    removeMenuItem,
    removeRestaurant,
    startTasting,
  };
}

export type TastingPlanWrites = ReturnType<typeof useTastingPlanWrites>;
