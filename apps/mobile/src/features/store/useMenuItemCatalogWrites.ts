import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import type { MenuItemRecord } from './featureStore';
import { useConnectivity } from '../../providers/ConnectivityProvider';
import {
  createCollectionRecord,
  updateCollectionRecord,
} from './pocketbaseGateway';
import { menuItemsQueryKeys } from './menuItemsQuery';
import { suggestTastingMenuItem } from './tastingSessionsApiStore';
import { tastingSessionsQueryKeys } from './tastingSessionsQuery';

interface CreateMenuItemInput {
  createdBy: string;
  isFromOCR?: boolean;
  name: string;
  restaurantId: string;
  visibility: NonNullable<MenuItemRecord['visibility']>;
}

interface UpdateMenuItemInput {
  menuItemId: string;
  name: string;
  restaurantId: string;
  visibility?: MenuItemRecord['visibility'];
}

interface ApplyScannedMenuItemsInput {
  items: MenuItemRecord[];
  restaurantId: string;
}

interface CreateMenuItemAndAddToTastingPlanInput extends CreateMenuItemInput {
  tastingRestaurantSuggestionId: string;
  tastingSessionId: string;
}

export type MenuItemCatalogWriteResult<T> =
  | {
      result: T;
      status: 'completed';
    }
  | {
      message: string;
      status: 'blocked';
    };

function blocked(
  message = 'Menu item catalog changes require internet connection.',
): MenuItemCatalogWriteResult<never> {
  return {
    message,
    status: 'blocked',
  };
}

function upsertMenuItems(
  currentItems: MenuItemRecord[] | undefined,
  items: MenuItemRecord[],
): MenuItemRecord[] {
  const nextItems = [...(currentItems ?? [])];
  for (const item of items) {
    const existingIndex = nextItems.findIndex((currentItem) => currentItem.id === item.id);
    if (existingIndex >= 0) {
      nextItems[existingIndex] = {
        ...nextItems[existingIndex],
        ...item,
      };
      continue;
    }

    nextItems.unshift(item);
  }
  return nextItems;
}

async function invalidateRestaurantMenuItems(
  queryClient: QueryClient,
  restaurantId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: menuItemsQueryKeys.restaurant(restaurantId),
  });
}

function applyMenuItemsToCache(
  queryClient: QueryClient,
  restaurantId: string,
  items: MenuItemRecord[],
): void {
  queryClient.setQueryData<MenuItemRecord[]>(
    menuItemsQueryKeys.restaurant(restaurantId),
    (currentItems) => upsertMenuItems(currentItems, items),
  );
}

function patchMenuItemInCache(
  queryClient: QueryClient,
  input: UpdateMenuItemInput,
): void {
  queryClient.setQueryData<MenuItemRecord[]>(
    menuItemsQueryKeys.restaurant(input.restaurantId),
    (currentItems) =>
      currentItems?.map((item) =>
        item.id === input.menuItemId
          ? {
              ...item,
              name: input.name,
              visibility: input.visibility ?? item.visibility,
            }
          : item,
      ) ?? currentItems,
  );
}

export function useMenuItemCatalogWrites() {
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();

  const createMenuItem = useCallback(
    async ({
      createdBy,
      isFromOCR = false,
      name,
      restaurantId,
      visibility,
    }: CreateMenuItemInput): Promise<MenuItemCatalogWriteResult<MenuItemRecord>> => {
      if (!isOnline) {
        return blocked();
      }

      const createdItem = await createCollectionRecord<MenuItemRecord>('menu_items', {
        restaurant: restaurantId,
        name,
        createdBy,
        visibility,
        isFromOCR,
      });

      applyMenuItemsToCache(queryClient, restaurantId, [createdItem]);
      await invalidateRestaurantMenuItems(queryClient, restaurantId);
      return {
        result: createdItem,
        status: 'completed',
      };
    },
    [isOnline, queryClient],
  );

  const updateMenuItem = useCallback(
    async (input: UpdateMenuItemInput): Promise<MenuItemCatalogWriteResult<void>> => {
      if (!isOnline) {
        return blocked();
      }

      await updateCollectionRecord('menu_items', input.menuItemId, {
        name: input.name,
        ...(input.visibility ? { visibility: input.visibility } : {}),
      });

      patchMenuItemInCache(queryClient, input);
      await invalidateRestaurantMenuItems(queryClient, input.restaurantId);
      return {
        result: undefined,
        status: 'completed',
      };
    },
    [isOnline, queryClient],
  );

  const applyScannedMenuItems = useCallback(
    async ({ items, restaurantId }: ApplyScannedMenuItemsInput): Promise<void> => {
      applyMenuItemsToCache(queryClient, restaurantId, items);
      await invalidateRestaurantMenuItems(queryClient, restaurantId);
    },
    [queryClient],
  );

  const createMenuItemAndAddToTastingPlan = useCallback(
    async (
      input: CreateMenuItemAndAddToTastingPlanInput,
    ): Promise<MenuItemCatalogWriteResult<MenuItemRecord>> => {
      const createResult = await createMenuItem(input);
      if (createResult.status === 'blocked') {
        return createResult;
      }

      const createdItem = createResult.result;
      await suggestTastingMenuItem(input.tastingSessionId, input.tastingRestaurantSuggestionId, {
        menuItemId: createdItem.id,
        name: createdItem.name,
      });
      await queryClient.invalidateQueries({
        queryKey: tastingSessionsQueryKeys.detail(input.tastingSessionId),
      });
      return {
        result: createdItem,
        status: 'completed',
      };
    },
    [createMenuItem, queryClient],
  );

  return {
    applyScannedMenuItems,
    createMenuItemAndAddToTastingPlan,
    createMenuItem,
    updateMenuItem,
  };
}

export type MenuItemCatalogWrites = ReturnType<typeof useMenuItemCatalogWrites>;
