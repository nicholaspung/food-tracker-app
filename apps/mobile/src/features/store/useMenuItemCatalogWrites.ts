import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import type { MenuItemRecord } from './featureStore';
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

  const createMenuItem = useCallback(
    async ({
      createdBy,
      isFromOCR = false,
      name,
      restaurantId,
      visibility,
    }: CreateMenuItemInput): Promise<MenuItemRecord> => {
      const createdItem = await createCollectionRecord<MenuItemRecord>('menu_items', {
        restaurant: restaurantId,
        name,
        createdBy,
        visibility,
        isFromOCR,
      });

      applyMenuItemsToCache(queryClient, restaurantId, [createdItem]);
      await invalidateRestaurantMenuItems(queryClient, restaurantId);
      return createdItem;
    },
    [queryClient],
  );

  const updateMenuItem = useCallback(
    async (input: UpdateMenuItemInput): Promise<void> => {
      await updateCollectionRecord('menu_items', input.menuItemId, {
        name: input.name,
        ...(input.visibility ? { visibility: input.visibility } : {}),
      });

      patchMenuItemInCache(queryClient, input);
      await invalidateRestaurantMenuItems(queryClient, input.restaurantId);
    },
    [queryClient],
  );

  const applyScannedMenuItems = useCallback(
    async ({ items, restaurantId }: ApplyScannedMenuItemsInput): Promise<void> => {
      applyMenuItemsToCache(queryClient, restaurantId, items);
      await invalidateRestaurantMenuItems(queryClient, restaurantId);
    },
    [queryClient],
  );

  const createMenuItemAndAddToTastingPlan = useCallback(
    async (input: CreateMenuItemAndAddToTastingPlanInput): Promise<MenuItemRecord> => {
      const createdItem = await createMenuItem(input);
      await suggestTastingMenuItem(input.tastingSessionId, input.tastingRestaurantSuggestionId, {
        menuItemId: createdItem.id,
        name: createdItem.name,
      });
      await queryClient.invalidateQueries({
        queryKey: tastingSessionsQueryKeys.detail(input.tastingSessionId),
      });
      return createdItem;
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
