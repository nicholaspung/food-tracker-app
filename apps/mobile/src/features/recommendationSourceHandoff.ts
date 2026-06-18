import type { SaveRestaurantFoodItemToListInput } from './store';

export type RecommendationDiscoverySurface =
  | 'home_friend_feed'
  | 'list_detail'
  | 'shared_restaurant_list';

export interface RecommendationSourceHandoffInput {
  discoverySurface: RecommendationDiscoverySurface;
  sourceFoodItemId?: string | null;
  sourceListId?: string | null;
  sourceListItemId?: string | null;
  sourceMenuItemId?: string | null;
  sourceUserId?: string | null;
}

export interface RecommendationSourceHandoff {
  discoverySurface: RecommendationDiscoverySurface;
  sourceFoodItemId?: string;
  sourceListId?: string;
  sourceListItemId?: string;
  sourceMenuItemId?: string;
  sourceUserId?: string;
}

function normalizeOptionalSourceID(value: string | null | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

export function createRecommendationSourceHandoff(
  input: RecommendationSourceHandoffInput,
): RecommendationSourceHandoff {
  const sourceFoodItemId = normalizeOptionalSourceID(input.sourceFoodItemId);
  const sourceListId = normalizeOptionalSourceID(input.sourceListId);
  const sourceListItemId = normalizeOptionalSourceID(input.sourceListItemId);
  const sourceMenuItemId = normalizeOptionalSourceID(input.sourceMenuItemId);
  const sourceUserId = normalizeOptionalSourceID(input.sourceUserId);

  return {
    discoverySurface: input.discoverySurface,
    ...(sourceFoodItemId ? { sourceFoodItemId } : {}),
    ...(sourceListId ? { sourceListId } : {}),
    ...(sourceListItemId ? { sourceListItemId } : {}),
    ...(sourceMenuItemId ? { sourceMenuItemId } : {}),
    ...(sourceUserId ? { sourceUserId } : {}),
  };
}

export function buildRecommendationBookmarkSourceFields(
  handoff: RecommendationSourceHandoff,
): Pick<
  SaveRestaurantFoodItemToListInput,
  'foodItemId' | 'menuItemId' | 'sourceListId' | 'sourceListItemId' | 'sourceUserId'
> {
  return {
    ...(handoff.sourceMenuItemId
      ? { menuItemId: handoff.sourceMenuItemId }
      : handoff.sourceFoodItemId
        ? { foodItemId: handoff.sourceFoodItemId }
        : {}),
    ...(handoff.sourceListId ? { sourceListId: handoff.sourceListId } : {}),
    ...(handoff.sourceListItemId ? { sourceListItemId: handoff.sourceListItemId } : {}),
    ...(handoff.sourceUserId ? { sourceUserId: handoff.sourceUserId } : {}),
  };
}

export function buildCreateVisitRecommendationSourceParams(
  handoff: RecommendationSourceHandoff,
): {
  recommendationSource: RecommendationSourceHandoff;
  sourceListId?: string;
  sourceListItemId?: string;
} {
  return {
    recommendationSource: handoff,
    ...(handoff.sourceListId ? { sourceListId: handoff.sourceListId } : {}),
    ...(handoff.sourceListItemId ? { sourceListItemId: handoff.sourceListItemId } : {}),
  };
}

export function resolveSharedRecommendationSourceListItemId(
  handoff: RecommendationSourceHandoff,
): string {
  if (!handoff.sourceListItemId) {
    throw new Error('Recommendation source list item is required.');
  }

  return handoff.sourceListItemId;
}
