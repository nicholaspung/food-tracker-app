import type {
  SharedRestaurantListPhotoPreviewRecord,
} from '../models';
import type { RestaurantListDetailPhotoPreviewRecord } from '../store/featureStore';
import { buildPhotoThumbnailUrl, buildPhotoViewerUrl } from '../../lib/photoUrls';
import type {
  GroupedBookmarkedItem,
  OwnerDisplayItem,
  OwnerItemPhotoEntry,
  OwnerUserRating,
} from './listDetailTypes';

export function groupListDetailPhotosByFoodItemId(
  photos: readonly RestaurantListDetailPhotoPreviewRecord[],
): Map<string, RestaurantListDetailPhotoPreviewRecord[]> {
  const map = new Map<string, RestaurantListDetailPhotoPreviewRecord[]>();

  for (const photo of photos) {
    if (!photo.food_item) {
      continue;
    }

    const existing = map.get(photo.food_item) ?? [];
    existing.push(photo);
    map.set(photo.food_item, existing);
  }

  return map;
}

function getUserPhotoFoodItemId(userRating: OwnerUserRating): string {
  return userRating.kind === 'linked' ? userRating.userFoodItemId : userRating.foodItemId;
}

function appendPhotoEntries(
  entriesById: Map<string, OwnerItemPhotoEntry>,
  photosByFoodItemId: Map<string, RestaurantListDetailPhotoPreviewRecord[]>,
  foodItemId: string | undefined,
  fallbackOwnerLabel: string,
) {
  if (!foodItemId) {
    return;
  }

  const photos = photosByFoodItemId.get(foodItemId) ?? [];
  for (const photo of photos) {
    const ownerLabel = photo.ownerName?.trim() || fallbackOwnerLabel;
    entriesById.set(photo.id, {
      id: photo.id,
      previewUrl: buildPhotoThumbnailUrl(photo),
      url: buildPhotoViewerUrl(photo),
      ownerLabel,
    });
  }
}

export function buildOwnerItemPhotoEntries(
  item: OwnerDisplayItem,
  photosByFoodItemId: Map<string, RestaurantListDetailPhotoPreviewRecord[]>,
): OwnerItemPhotoEntry[] {
  const entriesById = new Map<string, OwnerItemPhotoEntry>();

  if (item.source) {
    appendPhotoEntries(entriesById, photosByFoodItemId, item.source.foodItemId, item.source.sourceUserName);
  }

  if (item.user) {
    appendPhotoEntries(entriesById, photosByFoodItemId, getUserPhotoFoodItemId(item.user), 'You');
  }

  return Array.from(entriesById.values());
}

export function buildBookmarkedItemPhotoEntries(
  item: GroupedBookmarkedItem,
  photosByFoodItemId: Map<string, RestaurantListDetailPhotoPreviewRecord[]>,
): OwnerItemPhotoEntry[] {
  const entriesById = new Map<string, OwnerItemPhotoEntry>();
  const fallbackOwnerLabel = item.sourceUserName?.trim() || 'Friend';

  appendPhotoEntries(entriesById, photosByFoodItemId, item.foodItemId, fallbackOwnerLabel);
  appendPhotoEntries(entriesById, photosByFoodItemId, item.userFoodItemId, fallbackOwnerLabel);

  return Array.from(entriesById.values());
}

export function groupSharedListPhotosByFoodItemId(
  photos: readonly SharedRestaurantListPhotoPreviewRecord[],
): Map<string, SharedRestaurantListPhotoPreviewRecord[]> {
  const map = new Map<string, SharedRestaurantListPhotoPreviewRecord[]>();

  for (const photo of photos) {
    const foodItemId = photo.food_item?.trim();
    if (!foodItemId) {
      continue;
    }

    const existing = map.get(foodItemId) ?? [];
    existing.push(photo);
    map.set(foodItemId, existing);
  }

  return map;
}

export function buildSharedBookmarkedItemPhotoEntries(
  item: GroupedBookmarkedItem,
  photosByFoodItemId: Map<string, SharedRestaurantListPhotoPreviewRecord[]>,
): OwnerItemPhotoEntry[] {
  const entriesById = new Map<string, OwnerItemPhotoEntry>();

  for (const foodItemId of [item.foodItemId, item.userFoodItemId]) {
    if (!foodItemId) {
      continue;
    }

    for (const photo of photosByFoodItemId.get(foodItemId) ?? []) {
      entriesById.set(photo.id, {
        id: photo.id,
        previewUrl: buildPhotoThumbnailUrl(photo),
        url: buildPhotoViewerUrl(photo),
        ownerLabel: 'Shared list',
      });
    }
  }

  return Array.from(entriesById.values());
}
