import type { QueryKey } from '@tanstack/react-query';

export const menuItemsQueryKeys = {
  root: ['feature', 'menuItems'] as const,
  restaurant: (restaurantId: string) => ['feature', 'menuItems', restaurantId.trim()] as const,
};

export function isRestaurantMenuItemsQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === 3 &&
    queryKey[0] === menuItemsQueryKeys.root[0] &&
    queryKey[1] === menuItemsQueryKeys.root[1] &&
    typeof queryKey[2] === 'string' &&
    queryKey[2].trim().length > 0
  );
}

