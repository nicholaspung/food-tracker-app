import type { QueryClient } from '@tanstack/react-query';

function normalizeEntityId(value: string): string {
  return value.trim();
}

export const visitPhotosQueryKeys = {
  root: ['feature', 'visitPhotos'] as const,
  feedItemsRoot: ['feature', 'visitPhotos', 'feedItems'] as const,
  feedItems: (scope: string) => ['feature', 'visitPhotos', 'feedItems', scope] as const,
  visit: (visitId: string) => ['feature', 'visitPhotos', 'visit', normalizeEntityId(visitId)] as const,
  foodProduct: (foodProductId: string) =>
    ['feature', 'visitPhotos', 'foodProduct', normalizeEntityId(foodProductId)] as const,
};

export async function invalidateVisitPhotoQuery(
  queryClient: QueryClient,
  queryKey: ReturnType<typeof visitPhotosQueryKeys.visit> | ReturnType<typeof visitPhotosQueryKeys.foodProduct>,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey });
}
