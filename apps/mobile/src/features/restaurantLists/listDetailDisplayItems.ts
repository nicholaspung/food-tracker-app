import { normalizeMenuItemKey } from './listDetailFormatters';
import type {
  GroupedBookmarkedItem,
  OwnerDisplayItem,
  OwnerUserRating,
} from './listDetailTypes';

export function buildViewerDisplayItems(items: GroupedBookmarkedItem[]): GroupedBookmarkedItem[] {
  const rows = new Map<string, GroupedBookmarkedItem>();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) {
      continue;
    }

    const normalizedKey = normalizeMenuItemKey(item.name);
    const existing = rows.get(normalizedKey);

    if (!existing) {
      rows.set(normalizedKey, {
        ...item,
        key: normalizedKey || item.key,
      });
      continue;
    }

    rows.set(normalizedKey, {
      ...existing,
      bookmarkLookupIds: Array.from(
        new Set([...existing.bookmarkLookupIds, ...item.bookmarkLookupIds]),
      ),
    });
  }

  return Array.from(rows.values());
}

export function buildOwnerDisplayItems(items: GroupedBookmarkedItem[]): OwnerDisplayItem[] {
  const rows = new Map<string, OwnerDisplayItem>();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) {
      continue;
    }

    const normalizedKey = normalizeMenuItemKey(item.name);
    const existing = rows.get(normalizedKey);
    const nextRow: OwnerDisplayItem =
      existing ??
      {
        key: normalizedKey || `${item.listItemId}:${item.foodItemId}`,
        name: item.name,
        orderIndex: index,
        bookmark: {
          listItemId: item.listItemId,
          foodItemId: item.foodItemId,
          ...(item.menuItemId ? { menuItemId: item.menuItemId } : {}),
          ...(item.foodItemRestaurantId ? { restaurantId: item.foodItemRestaurantId } : {}),
        },
      };

    const hasSourceBookmark = Boolean(item.sourceUserId || item.sourceUserName);
    if (hasSourceBookmark && !nextRow.source) {
      nextRow.source = {
        listItemId: item.listItemId,
        foodItemId: item.foodItemId,
        ...(item.menuItemId ? { menuItemId: item.menuItemId } : {}),
        ...(item.foodItemRestaurantId ? { restaurantId: item.foodItemRestaurantId } : {}),
        ...(item.sourceUserId ? { sourceUserId: item.sourceUserId } : {}),
        sourceUserName: item.sourceUserName?.trim() || 'Friend',
        rating: item.rating,
        visitedAt: item.visitedAt,
      };
    }

    const linkedUserRating: OwnerUserRating | null =
      item.userFoodItemId && item.userFoodItemRating
        ? {
            kind: 'linked',
            listItemId: item.listItemId,
            userFoodItemId: item.userFoodItemId,
            ...(item.userFoodItemRestaurantId ? { restaurantId: item.userFoodItemRestaurantId } : {}),
            rating: item.userFoodItemRating,
            visitedAt: item.userFoodItemVisitedAt,
          }
        : null;

    const standaloneUserRating: OwnerUserRating | null =
      !hasSourceBookmark && item.rating > 0
        ? {
          kind: 'standalone',
          listItemId: item.listItemId,
          foodItemId: item.foodItemId,
          ...(item.menuItemId ? { menuItemId: item.menuItemId } : {}),
          ...(item.foodItemRestaurantId ? { restaurantId: item.foodItemRestaurantId } : {}),
            rating: item.rating,
            visitedAt: item.visitedAt,
          }
        : null;

    const nextUserRating = linkedUserRating ?? standaloneUserRating;
    if (nextUserRating) {
      const shouldReplaceExisting =
        !nextRow.user || (nextRow.user.kind === 'standalone' && nextUserRating.kind === 'linked');

      if (shouldReplaceExisting) {
        nextRow.user = nextUserRating;
      }
    }

    rows.set(normalizedKey, nextRow);
  }

  return Array.from(rows.values()).sort((left, right) => left.orderIndex - right.orderIndex);
}
