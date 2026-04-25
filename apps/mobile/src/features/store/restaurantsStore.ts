import { pb } from '../../lib/pocketbase';
import type { RestaurantRecord } from '../models';
import type {
  ListRecentRestaurantsInput,
  MenuItemRecord,
  PaginatedResult,
  SearchRestaurantsPageInput,
} from './featureStore';
import {
  createEmptyPaginatedResult,
  getAuthenticatedUserId,
  nowIso,
  resolvePaginationInput,
} from './featureStoreShared';
import type { RestaurantCollectionRecord } from './pocketbaseRecordTypes';
import { sendApiRequest } from './pocketbaseGateway';

export type {
  ListRecentRestaurantsInput,
  MenuItemRecord,
  SearchRestaurantsPageInput,
} from './featureStore';

interface RestaurantSelectionApiRecord {
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
  userVisitCount?: number;
  friendCount?: number;
  hasPendingMenuReview?: boolean;
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

interface SearchRestaurantsPageOptions {
  signal?: AbortSignal;
}

interface SearchRestaurantsPageApiResponse {
  items?: RestaurantSelectionApiRecord[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
  hasNextPage?: boolean;
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

function mapRestaurantSelectionApiRecord(record: RestaurantSelectionApiRecord): RestaurantRecord {
  const location = record.location?.trim() || undefined;

  return {
    id: record.id,
    name: record.name.trim(),
    city: record.city?.trim() || location,
    location,
    cuisineType: record.cuisineType?.trim() || undefined,
    visibility: record.visibility,
    latitude: typeof record.latitude === 'number' ? record.latitude : undefined,
    longitude: typeof record.longitude === 'number' ? record.longitude : undefined,
    placeId: record.placeId?.trim() || undefined,
    isGooglePlace: record.isGooglePlace === true,
    userVisitCount:
      typeof record.userVisitCount === 'number' ? record.userVisitCount : undefined,
    friendCount: typeof record.friendCount === 'number' ? record.friendCount : undefined,
    hasPendingMenuReview:
      typeof record.hasPendingMenuReview === 'boolean'
        ? record.hasPendingMenuReview
        : undefined,
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
  options?: SearchRestaurantsPageOptions,
): Promise<PaginatedResult<RestaurantRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const trimmedSearch = input.search.trim();
  if (!trimmedSearch) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const response = await sendApiRequest<SearchRestaurantsPageApiResponse>(
    `/api/restaurants/search?search=${encodeURIComponent(trimmedSearch)}&page=${encodeURIComponent(String(page))}&pageSize=${encodeURIComponent(String(pageSize))}`,
    {
      method: 'GET',
      signal: options?.signal,
    },
  );

  return {
    items: (response.items ?? []).map(mapRestaurantSelectionApiRecord),
    page: response.page ?? page,
    pageSize: response.pageSize ?? pageSize,
    totalItems: response.totalItems ?? 0,
    totalPages: response.totalPages ?? 0,
    hasNextPage: response.hasNextPage ?? false,
  };
}

export async function listRecentRestaurants(
  input?: ListRecentRestaurantsInput,
): Promise<RestaurantRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const limit = resolveRecentRestaurantLimit(input?.limit);
  const response = await sendApiRequest<RestaurantSelectionApiRecord[]>(
    `/api/restaurants/recent?limit=${encodeURIComponent(String(limit))}`,
    {
      method: 'GET',
      signal: input?.signal,
    },
  );

  return response.map(mapRestaurantSelectionApiRecord);
}

export async function listMenuItemsForRestaurant(
  restaurantId: string,
  options?: SearchRestaurantsPageOptions,
): Promise<MenuItemRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const trimmedRestaurantId = restaurantId.trim();
  if (!trimmedRestaurantId) {
    return [];
  }

  return sendApiRequest<MenuItemRecord[]>(
    `/api/restaurants/${encodeURIComponent(trimmedRestaurantId)}/menu-items`,
    {
      method: 'GET',
      signal: options?.signal,
    },
  );
}
