import type { QueryClient } from '@tanstack/react-query';

import type { FoodProductRecord } from '../models';
import { invalidateHomeFeedQueries } from './homeFeedQuery';
import { notesQueryKeys } from './notesQuery';
import { invalidateMonthlyUsageQueries } from './usageQuery';
import { invalidateVisitPhotoQuery, visitPhotosQueryKeys } from './visitPhotosQuery';

function normalizeFoodProductCategoryQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLowerCase();
}

function hasNonEmptyValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const foodProductsQueryKeys = {
  root: ['feature', 'foodProducts'] as const,
  detail: (foodProductId: string) => ['feature', 'foodProduct', foodProductId] as const,
  categorySuggestionsRoot: ['feature', 'foodProductCategorySuggestions'] as const,
  categorySuggestions: (query: string) =>
    ['feature', 'foodProductCategorySuggestions', normalizeFoodProductCategoryQuery(query)] as const,
};

function setCachedFoodProductDetail(
  queryClient: QueryClient,
  foodProduct: FoodProductRecord,
): void {
  queryClient.setQueryData(foodProductsQueryKeys.detail(foodProduct.id), foodProduct);
}

interface SyncFoodProductMutationCachesOptions {
  foodProduct?: FoodProductRecord | null;
  foodProductId?: string;
  includeFoodProductPhotos?: boolean;
  includeUsage?: boolean;
  sourceNoteId?: string | null;
}

export async function syncFoodProductMutationCaches(
  queryClient: QueryClient,
  options: SyncFoodProductMutationCachesOptions = {},
): Promise<void> {
  const foodProductId = options.foodProduct?.id ?? options.foodProductId?.trim() ?? '';

  if (options.foodProduct) {
    setCachedFoodProductDetail(queryClient, options.foodProduct);
  }

  const invalidations: Promise<unknown>[] = [
    invalidateHomeFeedQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: foodProductsQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: foodProductsQueryKeys.categorySuggestionsRoot }),
  ];

  if (!options.foodProduct && foodProductId) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: foodProductsQueryKeys.detail(foodProductId),
      }),
    );
  }

  if (options.includeFoodProductPhotos && foodProductId) {
    invalidations.push(
      invalidateVisitPhotoQuery(
        queryClient,
        visitPhotosQueryKeys.foodProduct(foodProductId),
      ),
    );
  }

  if (options.includeUsage) {
    invalidations.push(invalidateMonthlyUsageQueries(queryClient));
  }

  if (hasNonEmptyValue(options.sourceNoteId)) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: notesQueryKeys.root,
      }),
    );
  }

  await Promise.all(invalidations);
}
