import type {
  HomeFeedMapMarker,
  HomeFeedMapPoint,
  HomeFeedPhotoPreviewRecord,
} from '../../features';
import { getRatingLabel } from '../../lib/ratingConstants';

export interface HomeFeedMapRestaurantItem {
  id: string;
  source: 'visit-item' | 'food-product';
  name: string;
  rating: number;
  ratingLabel: string;
  notes?: string;
  eventAt: string;
  photoPreviews: HomeFeedPhotoPreviewRecord[];
  userId?: string;
  ownerName?: string;
}

export interface HomeFeedMapRestaurantGroup {
  id: string;
  restaurantId?: string;
  restaurantName: string;
  restaurantLocation?: string;
  latitude: number;
  longitude: number;
  points: HomeFeedMapPoint[];
  items: HomeFeedMapRestaurantItem[];
  ratingAverage: number | null;
  visitCount: number;
  foodProductCount: number;
}

export interface HomeFeedMapMarkerGroup {
  foodProductCount: number;
  id: string;
  latitude: number;
  longitude: number;
  points: { recordId: string; source: 'visit' | 'food-product' }[];
  restaurantId?: string;
  restaurantLocation?: string;
  restaurantName: string;
  visitCount: number;
}

function buildFallbackRestaurantKey(point: HomeFeedMapPoint): string {
  return `${point.restaurantName.trim().toLowerCase()}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`;
}

function buildGroupId(point: HomeFeedMapPoint): string {
  return point.restaurantId?.trim() || buildFallbackRestaurantKey(point);
}

function buildMarkerGroupId(point: HomeFeedMapMarker): string {
  return point.restaurantId?.trim() || `${point.restaurantName.trim().toLowerCase()}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`;
}

export function groupHomeFeedMapMarkersByRestaurant(
  points: readonly HomeFeedMapMarker[],
): HomeFeedMapMarkerGroup[] {
  const groups = new Map<string, HomeFeedMapMarkerGroup>();

  for (const point of points) {
    const id = buildMarkerGroupId(point);
    const group = groups.get(id) ?? {
      foodProductCount: 0,
      id,
      latitude: point.latitude,
      longitude: point.longitude,
      points: [],
      restaurantId: point.restaurantId,
      restaurantLocation: point.restaurantLocation,
      restaurantName: point.restaurantName,
      visitCount: 0,
    };
    group.points.push({
      recordId: point.recordId,
      source: point.source,
    });
    if (point.source === 'visit') {
      group.visitCount += 1;
    } else {
      group.foodProductCount += 1;
    }
    groups.set(id, group);
  }

  return Array.from(groups.values());
}

function buildPhotoPreviewMap(
  photoPreviews: readonly HomeFeedPhotoPreviewRecord[],
): Map<string, HomeFeedPhotoPreviewRecord[]> {
  const photosByFoodItem = new Map<string, HomeFeedPhotoPreviewRecord[]>();
  for (const photo of photoPreviews) {
    const foodItemId = photo.food_item?.trim();
    if (!foodItemId) {
      continue;
    }

    const existing = photosByFoodItem.get(foodItemId) ?? [];
    existing.push(photo);
    photosByFoodItem.set(foodItemId, existing);
  }
  return photosByFoodItem;
}

function getOwnerName(
  userId: string | undefined,
  ownerName: string | undefined,
  currentUserId?: string | null,
): string | undefined {
  if (userId && currentUserId && userId === currentUserId) {
    return undefined;
  }

  return ownerName;
}

function appendPointItems(
  group: HomeFeedMapRestaurantGroup,
  point: HomeFeedMapPoint,
  photosByFoodItem: ReadonlyMap<string, HomeFeedPhotoPreviewRecord[]>,
  currentUserId?: string | null,
) {
  if (point.source === 'visit') {
    for (const item of point.visit.items) {
      group.items.push({
        eventAt: point.eventAt,
        id: `visit-item:${point.visit.id}:${item.id}`,
        name: item.name,
        notes: item.notes || item.description,
        ownerName: getOwnerName(point.visit.userId, point.visit.userName, currentUserId),
        photoPreviews: photosByFoodItem.get(item.id) ?? [],
        rating: item.rating,
        ratingLabel: getRatingLabel(item.rating),
        source: 'visit-item',
        userId: point.visit.userId,
      });
    }
    return;
  }

  group.items.push({
    eventAt: point.eventAt,
    id: `food-product:${point.foodProduct.id}`,
    name: point.foodProduct.itemName,
    notes: point.foodProduct.notes,
    ownerName: getOwnerName(point.foodProduct.userId, point.foodProduct.userName, currentUserId),
    photoPreviews: photosByFoodItem.get(point.foodProduct.id) ?? [],
    rating: point.foodProduct.rating,
    ratingLabel: getRatingLabel(point.foodProduct.rating),
    source: 'food-product',
    userId: point.foodProduct.userId,
  });
}

function sortRestaurantItems(items: HomeFeedMapRestaurantItem[]) {
  return [...items].sort((left, right) => {
    if (right.rating !== left.rating) {
      return right.rating - left.rating;
    }

    return right.eventAt.localeCompare(left.eventAt);
  });
}

function averageRating(items: readonly HomeFeedMapRestaurantItem[]): number | null {
  const ratedItems = items.filter((item) => item.rating > 0);
  if (ratedItems.length === 0) {
    return null;
  }

  const total = ratedItems.reduce((sum, item) => sum + item.rating, 0);
  return total / ratedItems.length;
}

export function groupHomeFeedMapPointsByRestaurant(
  points: readonly HomeFeedMapPoint[],
  options: {
    currentUserId?: string | null;
    photoPreviews?: readonly HomeFeedPhotoPreviewRecord[];
  } = {},
): HomeFeedMapRestaurantGroup[] {
  const groupsById = new Map<string, HomeFeedMapRestaurantGroup>();
  const photosByFoodItem = buildPhotoPreviewMap(options.photoPreviews ?? []);

  for (const point of points) {
    const id = buildGroupId(point);
    const existing = groupsById.get(id);
    const group =
      existing ??
      {
        foodProductCount: 0,
        id,
        items: [],
        latitude: point.latitude,
        longitude: point.longitude,
        points: [],
        ratingAverage: null,
        restaurantId: point.restaurantId,
        restaurantLocation: point.restaurantLocation,
        restaurantName: point.restaurantName,
        visitCount: 0,
      };

    group.points.push(point);
    if (point.source === 'visit') {
      group.visitCount += 1;
    } else {
      group.foodProductCount += 1;
    }
    appendPointItems(group, point, photosByFoodItem, options.currentUserId);
    groupsById.set(id, group);
  }

  return Array.from(groupsById.values()).map((group) => {
    const items = sortRestaurantItems(group.items);
    return {
      ...group,
      items,
      ratingAverage: averageRating(items),
    };
  });
}
