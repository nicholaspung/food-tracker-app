import { pb } from '../../lib/pocketbase';
import type { RestaurantRecord } from '../models';
import type {
  AllLocationsHistoryRecord,
  GroupMenuSuggestionsRecord,
  ListRestaurantSuggestionsInput,
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
  AllLocationsHistoryRecord,
  GroupMenuSuggestionRecord,
  GroupMenuSuggestionSourceRecord,
  GroupMenuSuggestionsRecord,
  ListRestaurantSuggestionsInput,
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

const DEFAULT_RESTAURANT_SUGGESTIONS_LIMIT = 50;
const MAX_RESTAURANT_SUGGESTIONS_LIMIT = 50;

function resolveRestaurantSuggestionsLimit(limit?: number): number {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return DEFAULT_RESTAURANT_SUGGESTIONS_LIMIT;
  }

  return Math.min(MAX_RESTAURANT_SUGGESTIONS_LIMIT, Math.max(1, Math.floor(limit)));
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

export async function listRestaurantSuggestions(
  input?: ListRestaurantSuggestionsInput,
): Promise<RestaurantRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const limit = resolveRestaurantSuggestionsLimit(input?.limit);
  const trimmedSearch = input?.search?.replace(/\s+/g, ' ').trim() ?? '';
  const query = new URLSearchParams({
    limit: String(limit),
  });
  if (trimmedSearch) {
    query.set('search', trimmedSearch);
  }

  const response = await sendApiRequest<RestaurantSelectionApiRecord[]>(
    `/api/restaurants/suggestions?${query.toString()}`,
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

export async function getGroupMenuSuggestionsForRestaurant(
  restaurantId: string,
  options?: SearchRestaurantsPageOptions,
): Promise<GroupMenuSuggestionsRecord> {
  const trimmedRestaurantId = restaurantId.trim();
  if (!pb.authStore.record?.id || !trimmedRestaurantId) {
    return {
      restaurantId: trimmedRestaurantId,
      suggestions: [],
    };
  }

  return sendApiRequest<GroupMenuSuggestionsRecord>(
    `/api/restaurants/${encodeURIComponent(trimmedRestaurantId)}/group-menu-suggestions`,
    {
      method: 'GET',
      signal: options?.signal,
    },
  );
}

export async function getAllLocationsHistory(
  restaurantId: string,
  options?: SearchRestaurantsPageOptions,
): Promise<AllLocationsHistoryRecord> {
  if (!pb.authStore.record?.id) {
    return {
      anchorRestaurant: {
        id: restaurantId.trim(),
        name: '',
      },
      normalizedName: '',
      locationCount: 1,
      visitCount: 0,
      itemCount: 0,
      restaurants: [],
      items: [],
    };
  }

  const trimmedRestaurantId = restaurantId.trim();
  if (!trimmedRestaurantId) {
    return {
      anchorRestaurant: {
        id: '',
        name: '',
      },
      normalizedName: '',
      locationCount: 1,
      visitCount: 0,
      itemCount: 0,
      restaurants: [],
      items: [],
    };
  }

  return sendApiRequest<AllLocationsHistoryRecord>(
    `/api/restaurants/${encodeURIComponent(trimmedRestaurantId)}/same-name-history`,
    {
      method: 'GET',
      signal: options?.signal,
    },
  );
}
