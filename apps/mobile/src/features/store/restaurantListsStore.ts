import { pb } from '../../lib/pocketbase';
import type {
  RestaurantListBookmarkedItemRecord,
  RestaurantListItemRecord,
  RestaurantListRecord,
} from '../models';
import type {
  RestaurantListCandidateRestaurantsResult,
  RestaurantListDetailRecord,
  AddRestaurantVisitRatingsToListInput,
  CreateRestaurantListInput,
  LinkVisitToListBookmarkInput,
  ListRestaurantListsPageInput,
  MoveRestaurantListRestaurantInput,
  PaginatedResult,
  RemoveRestaurantListSourceRatingInput,
  RestaurantListVisitedRestaurantCandidate,
  SaveRestaurantFoodItemToListInput,
  UpdateRestaurantListInput,
  VisitPhotoRecord,
} from './featureStore';
import {
  buildOrFilter,
  createEmptyPaginatedResult,
  type FeatureWriteRequestOptions,
  getAuthenticatedUserId,
  isNotFoundError,
  resolveFeatureWriteHeaders,
  resolvePaginationInput,
  resolveExpandedUserName,
  trackFeatureMutation,
} from './featureStoreShared';
import { listCollectionRecords, sendApiRequest } from './pocketbaseGateway';
import type {
  RestaurantListCollectionRecord,
} from './pocketbaseRecordTypes';

export type {
  RestaurantListCandidateRestaurantsResult,
  RestaurantListDetailRecord,
  RestaurantListDetailPage,
  AddRestaurantVisitRatingsToListInput,
  CreateRestaurantListInput,
  LinkVisitToListBookmarkInput,
  ListRestaurantListVisitedRestaurantsPageInput,
  ListRestaurantListsPageInput,
  MoveRestaurantListRestaurantInput,
  RemoveRestaurantListSourceRatingInput,
  RestaurantListVisitedRestaurantCandidate,
  SaveRestaurantFoodItemToListInput,
  UpdateRestaurantListInput,
} from './featureStore';

interface ReadRequestOptions {
  signal?: AbortSignal;
}

interface RestaurantListDetailApiListRecord {
  id: string;
  name: string;
  description?: string;
  visibility?: 'private' | 'friends' | 'public';
  userId: string;
  ownerName?: string;
  isDefault?: boolean;
  coverImage?: string;
  restaurantCount?: number;
  menuItemCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface RestaurantListDetailApiBookmarkedItemRecord {
  id: string;
  listItemId: string;
  name: string;
  rating: number;
  visitedAt?: string;
  sourceUserId?: string;
  sourceUserName?: string;
  userFoodItemId?: string;
  userFoodItemName?: string;
  userFoodItemRating?: number;
  userFoodItemVisitedAt?: string;
}

interface RestaurantListDetailApiItemRecord {
  id: string;
  listId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantCity?: string;
  restaurantCuisineType?: string;
  sourceUserId?: string;
  sourceUserName?: string;
  position: number;
  bookmarkedItems?: RestaurantListDetailApiBookmarkedItemRecord[];
  note?: string;
  createdAt: string;
}

interface RestaurantListDetailApiPhotoPreviewRecord {
  id: string;
  food_item?: string;
  user?: string;
  photo: string;
  collectionId?: string;
  collectionName?: string;
  created: string;
  ownerName?: string;
}

interface RestaurantListDetailApiResponse {
  list: RestaurantListDetailApiListRecord;
  items?: RestaurantListDetailApiItemRecord[];
  bookmarkState?: {
    savedListIdsByBookmarkLookupId?: Record<string, string[] | undefined>;
  };
  photoPreviews?: RestaurantListDetailApiPhotoPreviewRecord[];
  viewerLists?: RestaurantListDetailApiListRecord[];
}

interface RestaurantListCandidateRestaurantsApiResponse {
  list: RestaurantListDetailApiListRecord;
  items?: RestaurantListVisitedRestaurantCandidateApiRecord[];
}

interface RestaurantListVisitedRestaurantCandidateApiRecord {
  id: string;
  name: string;
  location?: string;
  cuisineType?: string;
  itemCount: number;
  visitDates?: string[];
  foodItems?: {
    id: string;
    name: string;
    rating: number;
    notes?: string;
    visitedAt: string;
    photoPreview?: {
      id: string;
      photo: string;
    };
    photoCount?: number;
  }[];
  alreadyInList?: boolean;
  existingNote?: string;
  linkedFoodItemIds?: string[];
}

interface RestaurantListMutationGroupApiResponse {
  list?: RestaurantListDetailApiListRecord;
  listId: string;
  restaurantId: string;
  items?: RestaurantListDetailApiItemRecord[];
}

interface RestaurantListMutationListApiResponse {
  list: RestaurantListDetailApiListRecord;
  listId: string;
  items?: RestaurantListDetailApiItemRecord[];
}

interface VisitPhotoCollectionRecord {
  id: string;
  food_item?: string;
  photo: string;
  created: string;
}

interface RestaurantListsPageApiResponse {
  items?: RestaurantListDetailApiListRecord[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

function normalizeListVisibility(value: unknown): 'private' | 'friends' {
  return value === 'friends' || value === 'public' ? 'friends' : 'private';
}

function normalizeOptionalCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.floor(value);
}

function mapRestaurantListCollectionRecord(record: RestaurantListCollectionRecord): RestaurantListRecord {
  return {
    id: record.id,
    name: record.name.trim(),
    description: record.description?.trim() || undefined,
    visibility: normalizeListVisibility(record.visibility),
    userId: record.user,
    ownerName: resolveExpandedUserName(record.expand?.user),
    isDefault: record.isDefault === true,
    coverImage: record.coverImage,
    restaurantCount: normalizeOptionalCount(record.restaurantCount),
    menuItemCount: normalizeOptionalCount(record.menuItemCount),
    createdAt: record.created,
    updatedAt: record.updated || record.created,
  };
}

function mapRestaurantListDetailApiListRecord(record: RestaurantListDetailApiListRecord): RestaurantListRecord {
  return {
    id: record.id,
    name: record.name.trim(),
    description: record.description?.trim() || undefined,
    visibility: normalizeListVisibility(record.visibility),
    userId: record.userId,
    ownerName: record.ownerName?.trim() || undefined,
    isDefault: record.isDefault === true,
    coverImage: record.coverImage?.trim() || undefined,
    restaurantCount: normalizeOptionalCount(record.restaurantCount),
    menuItemCount: normalizeOptionalCount(record.menuItemCount),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt || record.createdAt,
  };
}

function mapRestaurantListDetailBookmarkedItemRecord(
  record: RestaurantListDetailApiBookmarkedItemRecord,
): RestaurantListBookmarkedItemRecord {
  return {
    id: record.id,
    listItemId: record.listItemId,
    name: record.name.trim(),
    rating: record.rating,
    visitedAt: record.visitedAt,
    sourceUserId: record.sourceUserId?.trim() || undefined,
    sourceUserName: record.sourceUserName?.trim() || undefined,
    userFoodItemId: record.userFoodItemId?.trim() || undefined,
    userFoodItemName: record.userFoodItemName?.trim() || undefined,
    userFoodItemRating: record.userFoodItemRating,
    userFoodItemVisitedAt: record.userFoodItemVisitedAt,
  };
}

function mapRestaurantListDetailItemRecord(record: RestaurantListDetailApiItemRecord): RestaurantListItemRecord {
  return {
    id: record.id,
    listId: record.listId,
    restaurantId: record.restaurantId,
    restaurantName: record.restaurantName.trim() || 'Unknown restaurant',
    restaurantCity: record.restaurantCity?.trim() || undefined,
    restaurantCuisineType: record.restaurantCuisineType?.trim() || undefined,
    sourceUserId: record.sourceUserId?.trim() || undefined,
    sourceUserName: record.sourceUserName?.trim() || undefined,
    position: record.position,
    bookmarkedItems: (record.bookmarkedItems ?? []).map(mapRestaurantListDetailBookmarkedItemRecord),
    note: record.note?.trim() || undefined,
    createdAt: record.createdAt,
  };
}

function createEmptyRestaurantListDetail(): RestaurantListDetailRecord {
  return {
    list: null,
    items: [],
    bookmarkState: {
      savedListIdsByBookmarkLookupId: {},
    },
    photoPreviews: [],
    viewerLists: [],
  };
}

function createEmptyRestaurantListCandidateRestaurants(): RestaurantListCandidateRestaurantsResult {
  return {
    list: null,
    items: [],
  };
}

function mapRestaurantListVisitedRestaurantCandidateRecord(
  record: RestaurantListVisitedRestaurantCandidateApiRecord,
): RestaurantListVisitedRestaurantCandidate {
  return {
    id: record.id,
    name: record.name.trim(),
    location: record.location?.trim() || undefined,
    cuisineType: record.cuisineType?.trim() || undefined,
    itemCount:
      typeof record.itemCount === 'number' && Number.isFinite(record.itemCount) && record.itemCount >= 0
        ? Math.floor(record.itemCount)
        : 0,
    visitDates: (record.visitDates ?? []).map((visitDate) => visitDate.trim()).filter((visitDate) => visitDate.length > 0),
    foodItems: (record.foodItems ?? []).map((item) => ({
      id: item.id,
      name: item.name.trim(),
      rating: item.rating,
      notes: item.notes?.trim() || undefined,
      visitedAt: item.visitedAt,
      photoPreview:
        typeof item.photoPreview?.id === 'string' &&
        item.photoPreview.id.trim().length > 0 &&
        typeof item.photoPreview.photo === 'string' &&
        item.photoPreview.photo.trim().length > 0
          ? {
              id: item.photoPreview.id.trim(),
              photo: item.photoPreview.photo.trim(),
            }
          : undefined,
      photoCount: normalizeOptionalCount(item.photoCount),
    })),
    alreadyInList: record.alreadyInList === true,
    existingNote: record.existingNote?.trim() || undefined,
    linkedFoodItemIds: Array.from(
      new Set(
        (record.linkedFoodItemIds ?? [])
          .map((foodItemId) => foodItemId.trim())
          .filter((foodItemId) => foodItemId.length > 0),
      ),
    ),
  };
}

function mapRestaurantListMutationGroupItems(
  response: RestaurantListMutationGroupApiResponse,
): RestaurantListItemRecord[] {
  return (response.items ?? []).map(mapRestaurantListDetailItemRecord);
}

function mapRestaurantListDetailResponse(response: RestaurantListDetailApiResponse): RestaurantListDetailRecord {
  const savedListIdsByBookmarkLookupId = Object.fromEntries(
    Object.entries(response.bookmarkState?.savedListIdsByBookmarkLookupId ?? {}).map(([bookmarkLookupId, listIds]) => [
      bookmarkLookupId,
      (listIds ?? []).map((candidate) => candidate.trim()).filter((candidate) => candidate.length > 0),
    ]),
  );

  return {
    list: mapRestaurantListDetailApiListRecord(response.list),
    items: (response.items ?? []).map(mapRestaurantListDetailItemRecord),
    bookmarkState: {
      savedListIdsByBookmarkLookupId,
    },
    photoPreviews: (response.photoPreviews ?? []).map((photoPreview) => ({
      id: photoPreview.id,
      food_item: photoPreview.food_item?.trim() || undefined,
      user: photoPreview.user?.trim() || undefined,
      photo: photoPreview.photo,
      collectionId: photoPreview.collectionId?.trim() || undefined,
      collectionName: photoPreview.collectionName?.trim() || undefined,
      created: photoPreview.created,
      ownerName: photoPreview.ownerName?.trim() || undefined,
    })),
    viewerLists: (response.viewerLists ?? []).map(mapRestaurantListDetailApiListRecord),
  };
}

function mapRestaurantListMutationListItems(
  response: RestaurantListMutationListApiResponse,
): RestaurantListItemRecord[] {
  return (response.items ?? []).map(mapRestaurantListDetailItemRecord);
}

interface CandidateFoodItemPhotoFallback {
  photoCount: number;
  photoPreview?: {
    id: string;
    photo: string;
  };
}

function buildCandidateFoodItemPhotoFallbacks(
  records: VisitPhotoCollectionRecord[],
): Map<string, CandidateFoodItemPhotoFallback> {
  const map = new Map<string, CandidateFoodItemPhotoFallback>();

  for (const record of records) {
    const foodItemId = record.food_item?.trim();
    if (!foodItemId) {
      continue;
    }

    const existing = map.get(foodItemId);
    if (existing) {
      existing.photoCount += 1;
      continue;
    }

    const photoId = record.id.trim();
    const photoFilename = record.photo.trim();
    map.set(foodItemId, {
      photoCount: 1,
      photoPreview:
        photoId && photoFilename
          ? {
              id: photoId,
              photo: photoFilename,
            }
          : undefined,
    });
  }

  return map;
}

async function listCandidateFoodItemPhotoFallbacks(
  foodItemIds: string[],
  options?: ReadRequestOptions,
): Promise<Map<string, CandidateFoodItemPhotoFallback>> {
  const normalizedFoodItemIds = Array.from(
    new Set(foodItemIds.map((foodItemId) => foodItemId.trim()).filter((foodItemId) => foodItemId.length > 0)),
  );

  if (normalizedFoodItemIds.length === 0) {
    return new Map();
  }

  const records = await listCollectionRecords<VisitPhotoCollectionRecord>('visit_photos', {
    fields: 'id,food_item,photo,created',
    filter: buildOrFilter('food_item', normalizedFoodItemIds),
    pageSize: 200,
    signal: options?.signal,
    sort: '-created',
  });

  return buildCandidateFoodItemPhotoFallbacks(records);
}

function mapVisitPhotoCollectionRecord(record: VisitPhotoCollectionRecord): VisitPhotoRecord {
  return {
    id: record.id,
    food_item: record.food_item?.trim() || undefined,
    photo: record.photo.trim(),
    collectionName: 'visit_photos',
    created: record.created,
  };
}

export async function listRestaurantListCandidateFoodItemsPhotos(
  foodItemIds: string[],
  options?: ReadRequestOptions,
): Promise<Record<string, VisitPhotoRecord[]>> {
  if (!pb.authStore.record?.id) {
    return {};
  }

  const normalizedFoodItemIds = Array.from(
    new Set(
      foodItemIds
        .map((foodItemId) => foodItemId.trim())
        .filter((foodItemId) => foodItemId.length > 0),
    ),
  );
  if (normalizedFoodItemIds.length === 0) {
    return {};
  }

  const records = await listCollectionRecords<VisitPhotoCollectionRecord>('visit_photos', {
    fields: 'id,food_item,photo,created',
    filter: buildOrFilter('food_item', normalizedFoodItemIds),
    pageSize: Math.max(100, normalizedFoodItemIds.length * 10),
    signal: options?.signal,
    sort: '-created',
  });

  return records.reduce<Record<string, VisitPhotoRecord[]>>((accumulator, record) => {
    const mappedRecord = mapVisitPhotoCollectionRecord(record);
    const foodItemId = mappedRecord.food_item?.trim();
    if (!foodItemId) {
      return accumulator;
    }

    const existingRecords = accumulator[foodItemId] ?? [];
    accumulator[foodItemId] = [...existingRecords, mappedRecord];
    return accumulator;
  }, {});
}

export async function listRestaurantListCandidateFoodItemPhotos(
  foodItemId: string,
  options?: ReadRequestOptions,
): Promise<VisitPhotoRecord[]> {
  const photosByFoodItemId = await listRestaurantListCandidateFoodItemsPhotos([foodItemId], options);
  return photosByFoodItemId[foodItemId.trim()] ?? [];
}

export async function listRestaurantListsPage(
  input?: ListRestaurantListsPageInput,
): Promise<PaginatedResult<RestaurantListRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const scope = input?.scope === 'friends' ? 'friends' : 'my';
  const query = new URLSearchParams({
    scope,
    page: String(page),
    pageSize: String(pageSize),
  });
  const trimmedSearch = input?.search?.trim();
  if (trimmedSearch) {
    query.set('search', trimmedSearch);
  }

  const response = await sendApiRequest<RestaurantListsPageApiResponse>(`/api/restaurant-lists?${query.toString()}`, {
    method: 'GET',
    signal: input?.signal,
  });

  return {
    items: (response.items ?? []).map(mapRestaurantListDetailApiListRecord),
    page: response.page,
    pageSize: response.pageSize,
    totalItems: response.totalItems,
    totalPages: response.totalPages,
    hasNextPage: response.hasNextPage,
  };
}

export async function getRestaurantListById(
  listId: string,
  options?: ReadRequestOptions,
): Promise<RestaurantListRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const record = await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId, {
      expand: 'user',
      signal: options?.signal,
    });
    return mapRestaurantListCollectionRecord(record);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getRestaurantListDetail(
  listId: string,
  options?: ReadRequestOptions,
): Promise<RestaurantListDetailRecord> {
  if (!pb.authStore.record?.id) {
    return createEmptyRestaurantListDetail();
  }

  const trimmedListId = listId.trim();
  if (!trimmedListId) {
    return createEmptyRestaurantListDetail();
  }

  try {
    const response = await sendApiRequest<RestaurantListDetailApiResponse>(
      `/api/restaurant-lists/${encodeURIComponent(trimmedListId)}/detail`,
      {
        method: 'GET',
        signal: options?.signal,
      },
    );

    return mapRestaurantListDetailResponse(response);
  } catch (error) {
    if (isNotFoundError(error)) {
      return createEmptyRestaurantListDetail();
    }

    throw error;
  }
}

export async function getRestaurantListCandidateRestaurants(
  listId: string,
  search?: string,
  options?: ReadRequestOptions,
): Promise<RestaurantListCandidateRestaurantsResult> {
  if (!pb.authStore.record?.id) {
    return createEmptyRestaurantListCandidateRestaurants();
  }

  const trimmedListId = listId.trim();
  if (!trimmedListId) {
    return createEmptyRestaurantListCandidateRestaurants();
  }

  const query = new URLSearchParams();
  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    query.set('search', trimmedSearch);
  }

  const querySuffix = query.toString() ? `?${query.toString()}` : '';

  try {
    const response = await sendApiRequest<RestaurantListCandidateRestaurantsApiResponse>(
      `/api/restaurant-lists/${encodeURIComponent(trimmedListId)}/candidate-restaurants${querySuffix}`,
      {
        method: 'GET',
        signal: options?.signal,
      },
    );

    const items = (response.items ?? []).map(mapRestaurantListVisitedRestaurantCandidateRecord);
    const missingPhotoFoodItemIds = Array.from(
      new Set(
        items.flatMap((restaurant) =>
          restaurant.foodItems
            .filter((item) => !item.photoPreview || item.photoCount === undefined)
            .map((item) => item.id),
        ),
      ),
    );
    const photoFallbacks =
      missingPhotoFoodItemIds.length > 0
        ? await listCandidateFoodItemPhotoFallbacks(missingPhotoFoodItemIds, options)
        : new Map<string, CandidateFoodItemPhotoFallback>();

    return {
      list: mapRestaurantListDetailApiListRecord(response.list),
      items: items.map((restaurant) => ({
        ...restaurant,
        foodItems: restaurant.foodItems.map((item) => {
          const fallback = photoFallbacks.get(item.id);
          if (!fallback) {
            return item;
          }

          return {
            ...item,
            photoPreview: item.photoPreview ?? fallback.photoPreview,
            photoCount: item.photoCount ?? fallback.photoCount,
          };
        }),
      })),
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return createEmptyRestaurantListCandidateRestaurants();
    }

    throw error;
  }
}

export async function createDefaultRestaurantList(
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RestaurantListRecord> {
  return trackFeatureMutation('restaurant_list.default.create', async () => {
    getAuthenticatedUserId();

    const response = await sendApiRequest<RestaurantListDetailApiListRecord>('/api/restaurant-lists/default', {
      method: 'POST',
      headers: resolveFeatureWriteHeaders(requestOptions),
    });

    return mapRestaurantListDetailApiListRecord(response);
  });
}

export async function createRestaurantList(
  input: CreateRestaurantListInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RestaurantListRecord> {
  return trackFeatureMutation(
    'restaurant_list.create',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const trimmedName = input.name.trim();
      const visibility = normalizeListVisibility(input.visibility);
      if (!trimmedName) {
        throw new Error('List name is required.');
      }

      const createdRecord = await pb.collection('restaurant_lists').create<RestaurantListCollectionRecord>(
        {
          name: trimmedName,
          description: input.description?.trim() || '',
          visibility,
          user: currentUserId,
        },
        {
          expand: 'user',
          headers: resolveFeatureWriteHeaders(requestOptions),
        },
      );

      return mapRestaurantListCollectionRecord(createdRecord);
    },
    {
      visibility: normalizeListVisibility(input.visibility),
      hasDescription: Boolean(input.description?.trim()),
    },
  );
}

export async function updateRestaurantList(
  listId: string,
  updates: UpdateRestaurantListInput,
  currentList?: Pick<RestaurantListRecord, 'isDefault'> | null,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RestaurantListRecord> {
  return trackFeatureMutation(
    'restaurant_list.update',
    async () => {
      getAuthenticatedUserId();

      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) {
        const trimmedName = updates.name.trim();
        if (!trimmedName) {
          throw new Error('List name is required.');
        }
        payload.name = trimmedName;
      }

      if (updates.description !== undefined) {
        payload.description = updates.description.trim();
      }

      if (updates.visibility !== undefined) {
        payload.visibility = normalizeListVisibility(updates.visibility);
      }

      if (currentList?.isDefault === true && Object.keys(payload).length > 0) {
        throw new Error('The Saved list cannot be edited.');
      }

      const updatedRecord =
        Object.keys(payload).length > 0
          ? await pb.collection('restaurant_lists').update<RestaurantListCollectionRecord>(listId, payload, {
              expand: 'user',
              headers: resolveFeatureWriteHeaders(requestOptions),
            })
          : await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId, {
              expand: 'user',
            });

      return mapRestaurantListCollectionRecord(updatedRecord);
    },
    {
      hasNameUpdate: updates.name !== undefined,
      hasDescriptionUpdate: updates.description !== undefined,
      hasVisibilityUpdate: updates.visibility !== undefined,
    },
  );
}

export async function deleteRestaurantList(
  listId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<void> {
  return trackFeatureMutation('restaurant_list.delete', async () => {
    getAuthenticatedUserId();

    try {
      await pb.collection('restaurant_lists').delete(listId, {
        headers: resolveFeatureWriteHeaders(requestOptions),
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function saveRestaurantFoodItemToList(
  input: SaveRestaurantFoodItemToListInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RestaurantListItemRecord[]> {
  return trackFeatureMutation(
    'restaurant_list.food_item.save',
    async () => {
      getAuthenticatedUserId();
      const listId = input.listId.trim();
      const restaurantId = input.restaurantId.trim();
      const foodItemId = input.foodItemId.trim();
      const sourceUserId = input.sourceUserId?.trim() || undefined;
      const trimmedNote = input.note?.trim() || undefined;

      if (!listId) {
        throw new Error('List is required.');
      }

      if (!restaurantId) {
        throw new Error('Restaurant is required.');
      }

      if (!foodItemId) {
        throw new Error('Food item is required.');
      }

      const response = await sendApiRequest<RestaurantListMutationGroupApiResponse>(
        `/api/restaurant-lists/${encodeURIComponent(listId)}/bookmarks`,
        {
          method: 'POST',
          headers: resolveFeatureWriteHeaders(requestOptions),
          body: {
            restaurantId,
            foodItemId,
            sourceUserId,
            note: trimmedNote,
          },
        },
      );

      return mapRestaurantListMutationGroupItems(response);
    },
    {
      hasSourceUser: Boolean(input.sourceUserId?.trim()),
      hasNote: Boolean(input.note?.trim()),
    },
  );
}

export async function linkVisitToListBookmark(
  input: LinkVisitToListBookmarkInput,
): Promise<RestaurantListItemRecord[]> {
  return trackFeatureMutation('restaurant_list.bookmark.link', async () => {
    getAuthenticatedUserId();
    const listItemId = input.listItemId.trim();
    const userFoodItemId = input.userFoodItemId.trim();

    if (!listItemId) {
      throw new Error('List item is required.');
    }

    if (!userFoodItemId) {
      throw new Error('Food item is required.');
    }

    const response = await sendApiRequest<RestaurantListMutationGroupApiResponse>(
      `/api/restaurant-lists/list-items/${encodeURIComponent(listItemId)}/link-visit`,
      {
        method: 'POST',
        body: {
          userFoodItemId,
        },
      },
    );

    return mapRestaurantListMutationGroupItems(response);
  });
}

export async function addRestaurantVisitRatingsToList(
  input: AddRestaurantVisitRatingsToListInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RestaurantListItemRecord[]> {
  return trackFeatureMutation(
    'restaurant_list.visit_ratings.add',
    async () => {
      getAuthenticatedUserId();
      const listId = input.listId.trim();
      const restaurantId = input.restaurantId.trim();

      if (!listId) {
        throw new Error('List is required.');
      }

      if (!restaurantId) {
        throw new Error('Restaurant is required.');
      }

      const uniqueRequestedFoodItemIds = Array.from(
        new Set((input.foodItemIds ?? []).map((itemId) => itemId.trim()).filter((itemId) => itemId.length > 0)),
      );
      const response = await sendApiRequest<RestaurantListMutationGroupApiResponse>(
        `/api/restaurant-lists/${encodeURIComponent(listId)}/restaurants`,
        {
          method: 'POST',
          headers: resolveFeatureWriteHeaders(requestOptions),
          body: {
            restaurantId,
            foodItemIds: uniqueRequestedFoodItemIds,
            note: input.note !== undefined ? input.note : undefined,
          },
        },
      );

      return mapRestaurantListMutationGroupItems(response);
    },
    {
      requestedFoodItemCount: input.foodItemIds?.length ?? 0,
      hasNote: Boolean(input.note?.trim()),
    },
  );
}

export async function moveRestaurantListRestaurant(
  input: MoveRestaurantListRestaurantInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RestaurantListItemRecord[]> {
  return trackFeatureMutation(
    'restaurant_list.restaurant.move',
    async () => {
      getAuthenticatedUserId();
      const listId = input.listId.trim();
      const restaurantId = input.restaurantId.trim();
      const direction = input.direction;

      if (!listId) {
        throw new Error('List is required.');
      }

      if (!restaurantId) {
        throw new Error('Restaurant is required.');
      }

      if (direction !== 'up' && direction !== 'down') {
        throw new Error('Direction must be up or down.');
      }

      const response = await sendApiRequest<RestaurantListMutationListApiResponse>(
        `/api/restaurant-lists/${encodeURIComponent(listId)}/restaurants/reorder`,
        {
          method: 'POST',
          headers: resolveFeatureWriteHeaders(requestOptions),
          body: {
            restaurantId,
            direction,
          },
        },
      );

      return mapRestaurantListMutationListItems(response);
    },
    {
      direction: input.direction,
    },
  );
}

export async function removeRestaurantListSourceRating(
  input: RemoveRestaurantListSourceRatingInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RestaurantListItemRecord[]> {
  return trackFeatureMutation('restaurant_list.source_rating.remove', async () => {
    getAuthenticatedUserId();

    const listId = input.listId.trim();
    const listItemId = input.listItemId.trim();
    const foodItemId = input.foodItemId.trim();
    if (!listId || !listItemId || !foodItemId) {
      throw new Error('List item and food item are required.');
    }

    try {
      const response = await sendApiRequest<RestaurantListMutationGroupApiResponse>(
        `/api/restaurant-lists/${encodeURIComponent(listId)}/list-items/${encodeURIComponent(listItemId)}/remove-source-rating`,
        {
          method: 'POST',
          headers: resolveFeatureWriteHeaders(requestOptions),
          body: {
            foodItemId,
          },
        },
      );

      return mapRestaurantListMutationGroupItems(response);
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  });
}

export async function removeRestaurantListUserRating(
  listId: string,
  listItemId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RestaurantListItemRecord[]> {
  return trackFeatureMutation('restaurant_list.user_rating.remove', async () => {
    getAuthenticatedUserId();

    const trimmedListId = listId.trim();
    const trimmedListItemId = listItemId.trim();
    if (!trimmedListId || !trimmedListItemId) {
      throw new Error('List item is required.');
    }

    try {
      const response = await sendApiRequest<RestaurantListMutationGroupApiResponse>(
        `/api/restaurant-lists/${encodeURIComponent(trimmedListId)}/list-items/${encodeURIComponent(trimmedListItemId)}/remove-user-rating`,
        {
          method: 'POST',
          headers: resolveFeatureWriteHeaders(requestOptions),
        },
      );

      return mapRestaurantListMutationGroupItems(response);
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  });
}
