import type { QueryClient } from '@tanstack/react-query';

import type { FoodProductRecord } from '../features/models';
import { homeFeedQueryKeys } from '../features/store/homeFeedQuery';
import { notesQueryKeys } from '../features/store/notesQuery';
import {
  foodProductsQueryKeys,
  syncFoodProductMutationCaches,
} from '../features/store/foodProductsQuery';
import { usageQueryKeys } from '../features/store/usageQuery';
import { visitPhotosQueryKeys } from '../features/store/visitPhotosQuery';

function buildFoodProductRecord(
  overrides: Partial<FoodProductRecord> = {},
): FoodProductRecord {
  return {
    id: overrides.id ?? 'food-product-1',
    restaurantName: overrides.restaurantName ?? 'Corner Market',
    itemName: overrides.itemName ?? 'Sparkling Tea',
    rating: overrides.rating ?? 4,
    visibility: overrides.visibility ?? 'friends',
    itemDate: overrides.itemDate ?? '2026-04-21T00:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-04-21T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('foodProductsQuery', () => {
  it('patches the cached detail entry and invalidates only targeted mutation queries', async () => {
    const queryClient = {
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
      setQueryData: jest.fn(),
    } as unknown as QueryClient;
    const foodProduct = buildFoodProductRecord();

    await syncFoodProductMutationCaches(queryClient, {
      foodProduct,
      includeFoodProductPhotos: true,
      includeUsage: true,
      sourceNoteId: 'note-1',
    });

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      foodProductsQueryKeys.detail(foodProduct.id),
      foodProduct,
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: homeFeedQueryKeys.root,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: foodProductsQueryKeys.root,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: foodProductsQueryKeys.categorySuggestionsRoot,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: visitPhotosQueryKeys.foodProduct(foodProduct.id),
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: usageQueryKeys.monthlyRoot,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: notesQueryKeys.root,
    });
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: visitPhotosQueryKeys.root,
    });
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: foodProductsQueryKeys.detail(foodProduct.id),
    });
  });

  it('invalidates the detail query when only the id is available', async () => {
    const queryClient = {
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
      setQueryData: jest.fn(),
    } as unknown as QueryClient;

    await syncFoodProductMutationCaches(queryClient, {
      foodProductId: 'food-product-2',
    });

    expect(queryClient.setQueryData).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: foodProductsQueryKeys.detail('food-product-2'),
    });
  });
});
