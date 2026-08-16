import { useEffect, useMemo, useState } from 'react';
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { MenuItemRecord, PaginatedResult } from './featureStore';
import { listMenuItemsForRestaurant } from './restaurantsStore';

export const RESTAURANT_MENU_ITEMS_PAGE_SIZE = 20;
const MENU_ITEM_SEARCH_DEBOUNCE_MS = 250;

export const menuItemsQueryKeys = {
  root: ['feature', 'menuItems'] as const,
  restaurant: (restaurantId: string) => ['feature', 'menuItems', restaurantId.trim()] as const,
  firstPage: (restaurantId: string, pageSize = RESTAURANT_MENU_ITEMS_PAGE_SIZE) => [
    'feature',
    'menuItems',
    restaurantId.trim(),
    'firstPage',
    pageSize,
  ] as const,
  paginated: (restaurantId: string, search = '', pageSize = RESTAURANT_MENU_ITEMS_PAGE_SIZE) => [
    'feature',
    'menuItems',
    restaurantId.trim(),
    'paginated',
    normalizeMenuItemSearch(search),
    pageSize,
  ] as const,
  selected: (restaurantId: string, itemIds: string[]) => [
    'feature',
    'menuItems',
    restaurantId.trim(),
    'selected',
    ...normalizeMenuItemIds(itemIds),
  ] as const,
};

export function isRestaurantMenuItemsQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length >= 3 &&
    queryKey[0] === menuItemsQueryKeys.root[0] &&
    queryKey[1] === menuItemsQueryKeys.root[1] &&
    typeof queryKey[2] === 'string' &&
    queryKey[2].trim().length > 0
  );
}

function normalizeMenuItemSearch(search: string): string {
  return search.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeMenuItemIds(itemIds: string[]): string[] {
  return [...new Set(itemIds.map((itemId) => itemId.trim()).filter(Boolean))].sort();
}

function useDebouncedMenuItemSearch(search: string): string {
  const normalizedSearch = normalizeMenuItemSearch(search);
  const [debouncedSearch, setDebouncedSearch] = useState(normalizedSearch);

  useEffect(() => {
    if (normalizedSearch === debouncedSearch) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setDebouncedSearch(normalizedSearch);
    }, MENU_ITEM_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [debouncedSearch, normalizedSearch]);

  return debouncedSearch;
}

function isMenuItemPage(value: unknown): value is PaginatedResult<MenuItemRecord> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as PaginatedResult<MenuItemRecord>).items),
  );
}

function readCachedRestaurantMenuItems(
  queryClient: QueryClient,
  restaurantId: string,
): { hasCache: boolean; items: MenuItemRecord[] } {
  const cachedQueries = queryClient.getQueriesData<
    InfiniteData<PaginatedResult<MenuItemRecord>> | MenuItemRecord[]
  >({ queryKey: menuItemsQueryKeys.restaurant(restaurantId) });
  const itemsById = new Map<string, MenuItemRecord>();
  let hasCache = false;

  for (const [, cachedValue] of cachedQueries) {
    if (cachedValue !== undefined) {
      hasCache = true;
    }
    if (Array.isArray(cachedValue)) {
      for (const item of cachedValue) {
        itemsById.set(item.id, item);
      }
      continue;
    }

    for (const page of cachedValue?.pages ?? []) {
      if (!isMenuItemPage(page)) {
        continue;
      }
      for (const item of page.items) {
        itemsById.set(item.id, item);
      }
    }
  }

  return { hasCache, items: [...itemsById.values()] };
}

export function getCachedRestaurantMenuItems(
  queryClient: QueryClient,
  restaurantId: string,
): MenuItemRecord[] {
  return readCachedRestaurantMenuItems(queryClient, restaurantId).items;
}

interface UseRestaurantMenuItemsQueryInput {
  enabled: boolean;
  isOnline: boolean;
  restaurantId: string | null;
  search?: string;
}

export function useRestaurantMenuItemsQuery({
  enabled,
  isOnline,
  restaurantId,
  search = '',
}: UseRestaurantMenuItemsQueryInput) {
  const queryClient = useQueryClient();
  const normalizedRestaurantId = restaurantId?.trim() ?? '';
  const debouncedSearch = useDebouncedMenuItemSearch(search);
  const queryKey = menuItemsQueryKeys.paginated(
    normalizedRestaurantId,
    debouncedSearch,
    RESTAURANT_MENU_ITEMS_PAGE_SIZE,
  );
  const query = useInfiniteQuery<
    PaginatedResult<MenuItemRecord>,
    Error,
    InfiniteData<PaginatedResult<MenuItemRecord>, number>,
    typeof queryKey,
    number
  >({
    enabled: enabled && Boolean(normalizedRestaurantId),
    getNextPageParam: (lastPage) => lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      if (!normalizedRestaurantId) {
        return Promise.resolve({
          items: [],
          page: pageParam,
          pageSize: RESTAURANT_MENU_ITEMS_PAGE_SIZE,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
        });
      }

      if (!isOnline) {
        const cachedResult = readCachedRestaurantMenuItems(queryClient, normalizedRestaurantId);
        const cachedItems = cachedResult.items
          .filter((item) => normalizeMenuItemSearch(item.name).includes(debouncedSearch));
        if (!cachedResult.hasCache) {
          return Promise.reject(new Error('Menu items need internet connection.'));
        }

        const totalPages = Math.ceil(cachedItems.length / RESTAURANT_MENU_ITEMS_PAGE_SIZE);
        const offset = (pageParam - 1) * RESTAURANT_MENU_ITEMS_PAGE_SIZE;
        return Promise.resolve({
          items: cachedItems.slice(offset, offset + RESTAURANT_MENU_ITEMS_PAGE_SIZE),
          page: pageParam,
          pageSize: RESTAURANT_MENU_ITEMS_PAGE_SIZE,
          totalItems: cachedItems.length,
          totalPages,
          hasNextPage: pageParam < totalPages,
        });
      }

      return listMenuItemsForRestaurant(normalizedRestaurantId, {
        page: pageParam,
        pageSize: RESTAURANT_MENU_ITEMS_PAGE_SIZE,
        search: debouncedSearch,
        signal,
      });
    },
    queryKey,
  });
  const items = useMemo(() => {
    const itemsById = new Map<string, MenuItemRecord>();
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        itemsById.set(item.id, item);
      }
    }
    return [...itemsById.values()];
  }, [query.data?.pages]);
  const latestPage = query.data?.pages[(query.data?.pages.length ?? 0) - 1];

  return {
    ...query,
    data: items,
    isLoading: query.isPending,
    totalItems: latestPage?.totalItems ?? items.length,
  };
}

interface UseRestaurantSelectedMenuItemsQueryInput {
  enabled: boolean;
  isOnline: boolean;
  itemIds: string[];
  restaurantId: string | null;
}

export function useRestaurantSelectedMenuItemsQuery({
  enabled,
  isOnline,
  itemIds,
  restaurantId,
}: UseRestaurantSelectedMenuItemsQueryInput) {
  const queryClient = useQueryClient();
  const normalizedRestaurantId = restaurantId?.trim() ?? '';
  const normalizedItemIds = useMemo(() => normalizeMenuItemIds(itemIds), [itemIds]);
  const queryKey = menuItemsQueryKeys.selected(normalizedRestaurantId, normalizedItemIds);

  return useQuery({
    enabled: enabled && Boolean(normalizedRestaurantId) && normalizedItemIds.length > 0,
    queryFn: async ({ signal }) => {
      if (!normalizedRestaurantId || normalizedItemIds.length === 0) {
        return [];
      }

      if (!isOnline) {
        const selectedIds = new Set(normalizedItemIds);
        return readCachedRestaurantMenuItems(queryClient, normalizedRestaurantId).items.filter(
          (item) => selectedIds.has(item.id),
        );
      }

      const chunks: string[][] = [];
      for (let index = 0; index < normalizedItemIds.length; index += 50) {
        chunks.push(normalizedItemIds.slice(index, index + 50));
      }
      const pages = await Promise.all(
        chunks.map((ids) =>
          listMenuItemsForRestaurant(normalizedRestaurantId, {
            ids,
            page: 1,
            pageSize: ids.length,
            signal,
          }),
        ),
      );
      return pages.flatMap((page) => page.items);
    },
    queryKey,
  });
}

export type RestaurantMenuItemsQuery = ReturnType<typeof useRestaurantMenuItemsQuery>;
