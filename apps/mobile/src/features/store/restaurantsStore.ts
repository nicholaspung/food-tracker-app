import { pb } from '../../lib/pocketbase';
import type { RestaurantRecord } from '../models';
import type {
  ListRecentRestaurantsInput,
  MenuItemRecord,
  PaginatedResult,
  RestaurantVisitStatsSummary,
  SearchRestaurantsPageInput,
} from './featureStore';
import {
  buildSearchFilter,
  createEmptyPaginatedResult,
  escapeFilterValue,
  getAuthenticatedUserId,
  mapPaginatedResult,
  nowIso,
  resolvePaginationInput,
} from './featureStoreShared';
import type { RestaurantCollectionRecord } from './pocketbaseRecordTypes';
import {
  getCollectionCount,
  listCollectionPage,
  listCollectionRecords,
  sendApiRequest,
} from './pocketbaseGateway';

export type {
  ListRecentRestaurantsInput,
  MenuItemRecord,
  SearchRestaurantsPageInput,
} from './featureStore';

interface RecentRestaurantApiRecord {
  id: string;
  name: string;
  city?: string;
  location?: string;
  cuisineType?: string;
  visibility?: 'private' | 'friends' | 'public';
  latitude?: number;
  longitude?: number;
  placeId?: string;
  isGooglePlace?: boolean;
}

interface RestaurantUpsertApiRecord {
  id: string;
  name: string;
  location?: string;
  cuisineType?: string;
  visibility?: 'private' | 'friends' | 'public';
  latitude?: number;
  longitude?: number;
  placeId?: string;
  isGooglePlace?: boolean;
  created?: string;
  updated?: string;
}

export interface UpsertRestaurantInput {
  restaurantName: string;
  location?: string;
  cuisineType?: string;
  visibility?: 'private' | 'friends' | 'public';
  placeId?: string;
  latitude?: number;
  longitude?: number;
  isGooglePlace?: boolean;
}

const RESTAURANT_LIST_FIELDS =
  'id,name,location,cuisineType,visibility,latitude,longitude,placeId,isGooglePlace,created,updated';
const DEFAULT_RECENT_RESTAURANT_LIMIT = 12;
const MAX_RECENT_RESTAURANT_LIMIT = 24;

function resolveRecentRestaurantLimit(limit?: number): number {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return DEFAULT_RECENT_RESTAURANT_LIMIT;
  }

  return Math.min(MAX_RECENT_RESTAURANT_LIMIT, Math.max(1, Math.floor(limit)));
}

function mapRestaurantCollectionRecord(record: RestaurantCollectionRecord): RestaurantRecord {
  return {
    id: record.id,
    name: record.name.trim(),
    location: record.location?.trim() || undefined,
    city: record.location?.trim() || undefined,
    cuisineType: record.cuisineType?.trim() || undefined,
    visibility: record.visibility,
    latitude: typeof record.latitude === 'number' ? record.latitude : undefined,
    longitude: typeof record.longitude === 'number' ? record.longitude : undefined,
    placeId: record.placeId?.trim() || undefined,
    isGooglePlace: record.isGooglePlace === true,
  };
}

export async function upsertRestaurantRecord(input: UpsertRestaurantInput): Promise<RestaurantRecord> {
  getAuthenticatedUserId();

  const trimmedName = input.restaurantName.trim();
  if (!trimmedName) {
    throw new Error('Restaurant name is required.');
  }

  const response = await sendApiRequest<RestaurantUpsertApiRecord>('/api/restaurants/upsert', {
    method: 'POST',
    body: {
      restaurantName: trimmedName,
      location: input.location?.trim() || undefined,
      cuisineType: input.cuisineType?.trim() || undefined,
      visibility: input.visibility,
      placeId: input.placeId?.trim() || undefined,
      latitude: input.latitude,
      longitude: input.longitude,
      isGooglePlace: input.isGooglePlace === true,
    },
  });

  return mapRestaurantCollectionRecord({
    id: response.id,
    name: response.name,
    location: response.location,
    cuisineType: response.cuisineType,
    visibility: response.visibility,
    latitude: response.latitude,
    longitude: response.longitude,
    placeId: response.placeId,
    isGooglePlace: response.isGooglePlace,
    created: response.created ?? nowIso(),
    updated: response.updated ?? nowIso(),
  });
}

export async function searchRestaurantsPage(
  input: SearchRestaurantsPageInput,
): Promise<PaginatedResult<RestaurantRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const trimmedSearch = input.search.trim();
  if (!trimmedSearch) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const pageResult = await listCollectionPage<RestaurantCollectionRecord>('restaurants', {
    page,
    pageSize,
    filter: buildSearchFilter(['name', 'location', 'cuisineType'], trimmedSearch),
    sort: 'name',
    fields: RESTAURANT_LIST_FIELDS,
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapRestaurantCollectionRecord));
}

export async function listRecentRestaurants(
  input?: ListRecentRestaurantsInput,
): Promise<RestaurantRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const limit = resolveRecentRestaurantLimit(input?.limit);
  const response = await sendApiRequest<RecentRestaurantApiRecord[]>(
    `/api/restaurants/recent?limit=${encodeURIComponent(String(limit))}`,
    {
      method: 'GET',
    },
  );

  return response.map((restaurant) => {
    const location = restaurant.location?.trim() || undefined;

    return {
      id: restaurant.id,
      name: restaurant.name.trim(),
      city: restaurant.city?.trim() || location,
      location,
      cuisineType: restaurant.cuisineType?.trim() || undefined,
      visibility: restaurant.visibility,
      latitude: typeof restaurant.latitude === 'number' ? restaurant.latitude : undefined,
      longitude: typeof restaurant.longitude === 'number' ? restaurant.longitude : undefined,
      placeId: restaurant.placeId?.trim() || undefined,
      isGooglePlace: restaurant.isGooglePlace === true,
    };
  });
}

export async function listMenuItemsForRestaurant(restaurantId: string): Promise<MenuItemRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const trimmedRestaurantId = restaurantId.trim();
  if (!trimmedRestaurantId) {
    return [];
  }

  return listCollectionRecords<MenuItemRecord>('menu_items', {
    filter: `restaurant = "${escapeFilterValue(trimmedRestaurantId)}"`,
    sort: '-created',
  });
}

export async function hasPendingMenuReviewRequest(restaurantId: string): Promise<boolean> {
  if (!pb.authStore.record?.id) {
    return false;
  }

  const trimmedRestaurantId = restaurantId.trim();
  if (!trimmedRestaurantId) {
    return false;
  }

  return (
    await getCollectionCount(
      'menu_review_requests',
      `restaurant = "${escapeFilterValue(trimmedRestaurantId)}" && status = "pending"`,
    )
  ) > 0;
}

export async function getRestaurantVisitStatsSummary(
  restaurantIds: string[],
): Promise<RestaurantVisitStatsSummary[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const normalizedRestaurantIds = Array.from(
    new Set(
      restaurantIds
        .map((restaurantId) => restaurantId.trim())
        .filter((restaurantId) => restaurantId.length > 0),
    ),
  ).sort();
  if (normalizedRestaurantIds.length === 0) {
    return [];
  }

  const response = await sendApiRequest<{ stats?: RestaurantVisitStatsSummary[] }>(
    '/api/restaurants/visit-stats',
    {
      method: 'POST',
      body: {
        restaurantIds: normalizedRestaurantIds,
      },
    },
  );

  return response.stats ?? [];
}
