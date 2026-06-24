import type { FoodProductFormValues } from '../../lib/foodProductForm';
import type {
  DraftPhotoAsset,
  RestaurantPhotoForm,
  RestaurantPhotoGroup,
} from './photoProcessingTypes';

export interface PhotoProcessingDraftSnapshot {
  currentPhotoIndex: number;
  foodProductForms: Record<string, FoodProductFormValues>;
  locationMetadataHintDismissedByPhotoId: Record<string, boolean>;
  photos: DraftPhotoAsset[];
  restaurantForms: Record<string, RestaurantPhotoForm>;
  restaurantPhotoGroups: RestaurantPhotoGroup[];
  selectedRestaurantPhotoGroupId: string | null;
}

export interface PhotoProcessingGroupingSnapshot {
  currentPhotoIndex: number;
  restaurantForms: Record<string, RestaurantPhotoForm>;
  restaurantPhotoGroups: RestaurantPhotoGroup[];
  selectedRestaurantPhotoGroupId: string | null;
}

export type RestaurantPhotoGroupTransitionResult =
  | {
      status: 'changed';
      message?: undefined;
      restaurantPhotoGroups: RestaurantPhotoGroup[];
      selectedRestaurantPhotoGroupId: string | null;
    }
  | {
      status: 'unchanged';
      message?: undefined;
      restaurantPhotoGroups: RestaurantPhotoGroup[];
      selectedRestaurantPhotoGroupId: string | null;
    }
  | {
      status: 'limit_reached';
      message: string;
      restaurantPhotoGroups: RestaurantPhotoGroup[];
      selectedRestaurantPhotoGroupId: string | null;
    };

export function buildPhotoProcessingDraftSnapshot(
  snapshot: PhotoProcessingDraftSnapshot,
): PhotoProcessingDraftSnapshot {
  return snapshot;
}

export function buildDefaultRestaurantPhotoGroups(
  photos: DraftPhotoAsset[],
): RestaurantPhotoGroup[] {
  return photos.map((photo) => ({
    id: `restaurant-photo-group-${photo.id}`,
    photoIds: [photo.id],
  }));
}

export function normalizeRestaurantPhotoGroups(
  groups: RestaurantPhotoGroup[],
): RestaurantPhotoGroup[] {
  const usedGroupIds = new Set<string>();
  const usedPhotoIds = new Set<string>();

  return groups
    .map((group) => {
      const baseGroupId = group.id.trim() || 'restaurant-photo-group';
      let nextGroupId = baseGroupId;
      let duplicateIndex = 1;
      while (usedGroupIds.has(nextGroupId)) {
        nextGroupId = `${baseGroupId}-${duplicateIndex}`;
        duplicateIndex += 1;
      }
      usedGroupIds.add(nextGroupId);

      const nextPhotoIds = group.photoIds.filter((photoId) => {
        if (usedPhotoIds.has(photoId)) {
          return false;
        }
        usedPhotoIds.add(photoId);
        return true;
      });

      return {
        id: nextGroupId,
        photoIds: nextPhotoIds,
      };
    })
    .filter((group) => group.photoIds.length > 0);
}

export function areRestaurantPhotoGroupsEqual(
  first: RestaurantPhotoGroup[],
  second: RestaurantPhotoGroup[],
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((firstGroup, index) => {
    const secondGroup = second[index];
    if (!secondGroup || firstGroup.id !== secondGroup.id) {
      return false;
    }

    if (firstGroup.photoIds.length !== secondGroup.photoIds.length) {
      return false;
    }

    return firstGroup.photoIds.every(
      (photoId, photoIndex) => photoId === secondGroup.photoIds[photoIndex],
    );
  });
}

export function resolveSelectedRestaurantPhotoGroupId(
  groups: RestaurantPhotoGroup[],
  selectedGroupId: string | null,
): string | null {
  if (selectedGroupId && groups.some((group) => group.id === selectedGroupId)) {
    return selectedGroupId;
  }

  return groups[0]?.id ?? null;
}

export function reconcileRestaurantPhotoGroupsWithPhotos({
  photos,
  restaurantPhotoGroups,
  selectedRestaurantPhotoGroupId,
}: {
  photos: DraftPhotoAsset[];
  restaurantPhotoGroups: RestaurantPhotoGroup[];
  selectedRestaurantPhotoGroupId: string | null;
}): {
  restaurantPhotoGroups: RestaurantPhotoGroup[];
  selectedRestaurantPhotoGroupId: string | null;
} {
  const photoIds = new Set(photos.map((photo) => photo.id));
  const nextGroups = normalizeRestaurantPhotoGroups(
    restaurantPhotoGroups.map((group) => ({
      ...group,
      photoIds: group.photoIds.filter((photoId) => photoIds.has(photoId)),
    })),
  );

  return {
    restaurantPhotoGroups: nextGroups,
    selectedRestaurantPhotoGroupId: resolveSelectedRestaurantPhotoGroupId(
      nextGroups,
      selectedRestaurantPhotoGroupId,
    ),
  };
}

export function initializeRestaurantPhotoGrouping(
  photos: DraftPhotoAsset[],
): PhotoProcessingGroupingSnapshot {
  const restaurantPhotoGroups = normalizeRestaurantPhotoGroups(
    buildDefaultRestaurantPhotoGroups(photos),
  );

  return {
    currentPhotoIndex: 0,
    restaurantForms: {},
    restaurantPhotoGroups,
    selectedRestaurantPhotoGroupId: restaurantPhotoGroups[0]?.id ?? null,
  };
}

export function removePhotoFromPhotoProcessingDraft({
  photoId,
  snapshot,
}: {
  photoId: string;
  snapshot: PhotoProcessingDraftSnapshot;
}): PhotoProcessingDraftSnapshot {
  const photos = snapshot.photos.filter((photo) => photo.id !== photoId);
  const restaurantFormsWithoutRemovedPhoto = omitRecordKey(
    snapshot.restaurantForms,
    photoId,
  );
  const foodProductForms = omitRecordKey(snapshot.foodProductForms, photoId);
  const locationMetadataHintDismissedByPhotoId = omitRecordKey(
    snapshot.locationMetadataHintDismissedByPhotoId,
    photoId,
  );
  const reconciledGroups = reconcileRestaurantPhotoGroupsWithPhotos({
    photos,
    restaurantPhotoGroups: snapshot.restaurantPhotoGroups,
    selectedRestaurantPhotoGroupId: snapshot.selectedRestaurantPhotoGroupId,
  });
  const previousGroupIds = new Set(
    snapshot.restaurantPhotoGroups.map((group) => group.id),
  );
  const nextGroupIds = new Set(
    reconciledGroups.restaurantPhotoGroups.map((group) => group.id),
  );
  const restaurantForms = Object.fromEntries(
    Object.entries(restaurantFormsWithoutRemovedPhoto).filter(([formId]) => {
      return !previousGroupIds.has(formId) || nextGroupIds.has(formId);
    }),
  );
  const maxIndex =
    reconciledGroups.restaurantPhotoGroups.length > 0
      ? reconciledGroups.restaurantPhotoGroups.length - 1
      : photos.length - 1;

  return {
    currentPhotoIndex: Math.min(snapshot.currentPhotoIndex, Math.max(maxIndex, 0)),
    foodProductForms,
    locationMetadataHintDismissedByPhotoId,
    photos,
    restaurantForms,
    restaurantPhotoGroups: reconciledGroups.restaurantPhotoGroups,
    selectedRestaurantPhotoGroupId: reconciledGroups.selectedRestaurantPhotoGroupId,
  };
}

export function movePhotoToRestaurantGroup({
  maxPhotosPerRestaurantItem,
  photoId,
  restaurantPhotoGroups,
  targetGroupId,
}: {
  maxPhotosPerRestaurantItem: number | null;
  photoId: string;
  restaurantPhotoGroups: RestaurantPhotoGroup[];
  targetGroupId: string;
}): RestaurantPhotoGroupTransitionResult {
  const targetGroup = restaurantPhotoGroups.find((group) => group.id === targetGroupId);
  if (!targetGroup || targetGroup.photoIds.includes(photoId)) {
    return {
      status: 'unchanged',
      restaurantPhotoGroups,
      selectedRestaurantPhotoGroupId: resolveSelectedRestaurantPhotoGroupId(
        restaurantPhotoGroups,
        targetGroupId,
      ),
    };
  }

  if (
    maxPhotosPerRestaurantItem !== null &&
    targetGroup.photoIds.length >= maxPhotosPerRestaurantItem
  ) {
    return {
      status: 'limit_reached',
      message:
        maxPhotosPerRestaurantItem === 1
          ? 'Free users can keep one photo per menu item. Keep this photo as its own item, or replace the selected item photo.'
          : `You can group up to ${maxPhotosPerRestaurantItem} photos per menu item.`,
      restaurantPhotoGroups,
      selectedRestaurantPhotoGroupId: targetGroupId,
    };
  }

  const nextGroups = normalizeRestaurantPhotoGroups(
    restaurantPhotoGroups.map((group) => {
      const withoutPhoto = group.photoIds.filter((groupPhotoId) => groupPhotoId !== photoId);
      if (group.id !== targetGroupId) {
        return {
          ...group,
          photoIds: withoutPhoto,
        };
      }

      return {
        ...group,
        photoIds: [...withoutPhoto, photoId],
      };
    }),
  );

  return {
    status: 'changed',
    restaurantPhotoGroups: nextGroups,
    selectedRestaurantPhotoGroupId: resolveSelectedRestaurantPhotoGroupId(nextGroups, targetGroupId),
  };
}

export function replaceRestaurantGroupPhoto({
  photoId,
  restaurantPhotoGroups,
  targetGroupId,
}: {
  photoId: string;
  restaurantPhotoGroups: RestaurantPhotoGroup[];
  targetGroupId: string;
}): RestaurantPhotoGroupTransitionResult {
  const targetGroup = restaurantPhotoGroups.find((group) => group.id === targetGroupId);
  if (!targetGroup || targetGroup.photoIds.includes(photoId)) {
    return {
      status: 'unchanged',
      restaurantPhotoGroups,
      selectedRestaurantPhotoGroupId: resolveSelectedRestaurantPhotoGroupId(
        restaurantPhotoGroups,
        targetGroupId,
      ),
    };
  }

  const replacedPhotoIds = targetGroup.photoIds;
  const nextGroups = normalizeRestaurantPhotoGroups([
    ...restaurantPhotoGroups
      .map((group) => ({
        ...group,
        photoIds: group.photoIds.filter((groupPhotoId) => groupPhotoId !== photoId),
      }))
      .filter((group) => group.photoIds.length > 0 && group.id !== targetGroupId),
    {
      id: targetGroupId,
      photoIds: [photoId],
    },
    ...replacedPhotoIds
      .filter((replacedPhotoId) => replacedPhotoId !== photoId)
      .map((replacedPhotoId) => ({
        id: `restaurant-photo-group-${replacedPhotoId}`,
        photoIds: [replacedPhotoId],
      })),
  ]);

  return {
    status: 'changed',
    restaurantPhotoGroups: nextGroups,
    selectedRestaurantPhotoGroupId: resolveSelectedRestaurantPhotoGroupId(nextGroups, targetGroupId),
  };
}

export function splitPhotoToRestaurantGroup({
  photoId,
  restaurantPhotoGroups,
}: {
  photoId: string;
  restaurantPhotoGroups: RestaurantPhotoGroup[];
}): RestaurantPhotoGroupTransitionResult {
  const nextGroupId = `restaurant-photo-group-${photoId}`;
  if (
    restaurantPhotoGroups.some(
      (group) => group.id === nextGroupId && group.photoIds.includes(photoId),
    )
  ) {
    return {
      status: 'unchanged',
      restaurantPhotoGroups,
      selectedRestaurantPhotoGroupId: resolveSelectedRestaurantPhotoGroupId(
        restaurantPhotoGroups,
        nextGroupId,
      ),
    };
  }

  const nextGroups = normalizeRestaurantPhotoGroups([
    ...restaurantPhotoGroups.map((group) => ({
      ...group,
      photoIds: group.photoIds.filter((groupPhotoId) => groupPhotoId !== photoId),
    })),
    {
      id: nextGroupId,
      photoIds: [photoId],
    },
  ]);

  return {
    status: 'changed',
    restaurantPhotoGroups: nextGroups,
    selectedRestaurantPhotoGroupId: resolveSelectedRestaurantPhotoGroupId(nextGroups, nextGroupId),
  };
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!record[key]) {
    return record;
  }

  const next = { ...record };
  delete next[key];
  return next;
}
