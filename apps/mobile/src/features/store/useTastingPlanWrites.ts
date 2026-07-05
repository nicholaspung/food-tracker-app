import { useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type {
  RestaurantRecord,
  TastingSessionRecord,
} from '../models';
import type { MenuItemRecord } from './featureStore';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';
import type { OfflineOutboxFeatureWriteOptions } from './useOfflineAwareFeatureWrite';
import {
  blockedTastingSessionLifecycleWrite,
  createTastingSessionLifecycleWriteActions,
  TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES,
  type TastingSessionLifecycleWriteResult,
} from './useTastingSessionLifecycleWrites';

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

type TastingPlanWriteResult<T> = Exclude<
  TastingSessionLifecycleWriteResult<T>,
  { status: 'queued' }
>;

async function executeReplaySafeWriteOnline<TName extends FeatureOutboxOperationName, TResult>(
  options: OfflineOutboxFeatureWriteOptions<TName, TResult>,
): Promise<{ result: TResult; status: 'completed' }> {
  return {
    result: await options.execute(),
    status: 'completed',
  };
}

function asCompatibilityResult<T>(
  result: Promise<TastingSessionLifecycleWriteResult<T>>,
): Promise<TastingPlanWriteResult<T>> {
  return result as Promise<TastingPlanWriteResult<T>>;
}

function blockedCompatibilityResult<T>(message: string): TastingPlanWriteResult<T> {
  return blockedTastingSessionLifecycleWrite(message) as TastingPlanWriteResult<T>;
}

export function useTastingPlanWrites() {
  const queryClient = useQueryClient();
  const uploadedPhotoKeysRef = useRef<Set<string>>(new Set());

  const createActions = useCallback(
    (isOnline: boolean) =>
      createTastingSessionLifecycleWriteActions({
        isOnline,
        queryClient,
        uploadedPhotoKeysRef,
        writeReplaySafe: executeReplaySafeWriteOnline,
      }),
    [queryClient],
  );

  const blockIfOffline = useCallback(
    <T>(isOnline: boolean): TastingPlanWriteResult<T> | null =>
      isOnline
        ? null
        : blockedCompatibilityResult(TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.planning),
    [],
  );

  return useMemo(
    () => ({
      addMenuItem: ({
        existingSuggestionId,
        isOnline,
        menuItem,
        restaurantSuggestionId,
        sessionId,
      }: AddTastingPlanMenuItemInput): Promise<TastingPlanWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(isOnline);
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).addMenuItem({
              existingSuggestionId,
              menuItem,
              restaurantSuggestionId,
              sessionId,
            }));
      },
      addRestaurant: ({
        isOnline,
        restaurant,
        sessionId,
      }: AddTastingPlanRestaurantInput): Promise<TastingPlanWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(isOnline);
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).addRestaurant({ restaurant, sessionId }));
      },
      removeMenuItem: ({
        isOnline,
        itemSuggestionId,
        sessionId,
      }: RemoveTastingPlanMenuItemInput): Promise<TastingPlanWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(isOnline);
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).removeMenuItem({ itemSuggestionId, sessionId }));
      },
      removeRestaurant: ({
        isOnline,
        restaurantSuggestionId,
        sessionId,
      }: RemoveTastingPlanRestaurantInput): Promise<TastingPlanWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(isOnline);
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).removeRestaurant({ restaurantSuggestionId, sessionId }));
      },
      startTasting: ({
        isOnline,
        sessionId,
      }: OnlineOnlyTastingPlanWriteInput): Promise<TastingPlanWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(isOnline);
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).startTasting({ sessionId }));
      },
    }),
    [blockIfOffline, createActions],
  );
}

export type TastingPlanWrites = ReturnType<typeof useTastingPlanWrites>;
