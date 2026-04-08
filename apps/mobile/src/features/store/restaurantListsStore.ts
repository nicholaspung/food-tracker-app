import { pb } from '../../lib/pocketbase';
import type {
  RestaurantListBookmarkedItemRecord,
  RestaurantListItemRecord,
  RestaurantListRecord,
} from '../models';
import type {
  RestaurantListDetailPage,
  AddRestaurantVisitRatingsToListInput,
  CreateRestaurantListInput,
  LinkVisitToListBookmarkInput,
  ListRestaurantListVisitedRestaurantsPageInput,
  ListRestaurantListsPageInput,
  MoveRestaurantListRestaurantInput,
  PaginatedResult,
  RemoveRestaurantListSourceRatingInput,
  RestaurantListItemLinkRecord,
  RestaurantListVisitedRestaurantCandidate,
  RestaurantListRestaurantNoteRecord,
  SaveRestaurantFoodItemToListInput,
  UpdateRestaurantListInput,
} from './featureStore';
import {
  buildAnyMatchFilter,
  buildOrFilter,
  buildSearchFilter,
  combineFilterClauses,
  combineOrFilterClauses,
  createEmptyPaginatedResult,
  escapeFilterValue,
  getAuthenticatedUserId,
  isNotFoundError,
  mapPaginatedResult,
  resolvePaginationInput,
  resolveExpandedUserName,
  trackFeatureMutation,
} from './featureStoreShared';
import { listCollectionPage, listCollectionRecords, sendApiRequest } from './pocketbaseGateway';
import type {
  CollectionUserExpand,
  FoodItemCollectionRecord,
  ListItemCollectionRecord,
  RestaurantListCollectionRecord,
} from './pocketbaseRecordTypes';
import { upsertRestaurantRecord } from './restaurantsStore';

export type {
  RestaurantListDetailPage,
  AddRestaurantVisitRatingsToListInput,
  CreateRestaurantListInput,
  LinkVisitToListBookmarkInput,
  ListRestaurantListVisitedRestaurantsPageInput,
  ListRestaurantListsPageInput,
  MoveRestaurantListRestaurantInput,
  RemoveRestaurantListSourceRatingInput,
  RestaurantListItemLinkRecord,
  RestaurantListVisitedRestaurantCandidate,
  RestaurantListRestaurantNoteRecord,
  SaveRestaurantFoodItemToListInput,
  UpdateRestaurantListInput,
} from './featureStore';

interface PageInputLike {
  page?: number;
  pageSize?: number;
}

interface AcceptedFriendshipRecord {
  user: string;
  friend: string;
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
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  bookmarkState?: {
    savedListIdsByBookmarkLookupId?: Record<string, string[] | undefined>;
  };
  photoPreviews?: RestaurantListDetailApiPhotoPreviewRecord[];
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
  }[];
  alreadyInList?: boolean;
  existingNote?: string;
  linkedFoodItemIds?: string[];
}

interface RestaurantListVisitedRestaurantsPageApiResponse {
  items?: RestaurantListVisitedRestaurantCandidateApiRecord[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

interface RestaurantListMutationGroupApiResponse {
  listId: string;
  restaurantId: string;
  items?: RestaurantListDetailApiItemRecord[];
}

const RESTAURANT_LIST_ITEM_LINK_FIELDS = 'id,list,restaurant,foodItem,userFoodItem,sourceUser,recommendedItems';

function resolveAcceptedFriendIds(
  friendships: AcceptedFriendshipRecord[],
  currentUserId: string,
): string[] {
  return Array.from(
    new Set(
      friendships.map((friendship) => (friendship.user === currentUserId ? friendship.friend : friendship.user)),
    ),
  );
}

function getDefaultRestaurantVisibility(): 'private' | 'friends' | 'public' {
  const value = pb.authStore.record?.defaultRestaurantVisibility;
  if (value === 'private' || value === 'public') {
    return value;
  }
  return 'friends';
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

function mapRestaurantListBookmarkedItemRecord(
  listItemId: string,
  sourceUser: CollectionUserExpand | undefined,
  sourceUserId: string | undefined,
  foodItem: FoodItemCollectionRecord,
  userFoodItem?: FoodItemCollectionRecord,
): RestaurantListBookmarkedItemRecord {
  const normalizedSourceUserId = sourceUser?.id ?? sourceUserId?.trim() ?? undefined;

  return {
    id: foodItem.id,
    listItemId,
    name: foodItem.name?.trim() || 'Unknown item',
    rating: foodItem.rating,
    visitedAt: foodItem.expand?.visit?.visitDate || foodItem.itemDate || foodItem.created,
    sourceUserId: normalizedSourceUserId,
    sourceUserName: resolveExpandedUserName(sourceUser),
    userFoodItemId: userFoodItem?.id,
    userFoodItemName: userFoodItem?.name?.trim() || undefined,
    userFoodItemRating: userFoodItem?.rating,
    userFoodItemVisitedAt:
      userFoodItem?.expand?.visit?.visitDate || userFoodItem?.itemDate || userFoodItem?.created,
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

function mapListItemCollectionRecord(record: ListItemCollectionRecord): RestaurantListItemRecord {
  const expandedFoodItem = record.expand?.foodItem;
  const expandedRecommendedItems = record.expand?.recommendedItems ?? [];
  const bookmarkedItems = expandedFoodItem
    ? [
        mapRestaurantListBookmarkedItemRecord(
          record.id,
          record.expand?.sourceUser,
          record.sourceUser,
          expandedFoodItem,
          record.expand?.userFoodItem,
        ),
      ]
    : expandedRecommendedItems.map((foodItem) =>
        mapRestaurantListBookmarkedItemRecord(
          record.id,
          record.expand?.sourceUser,
          record.sourceUser,
          foodItem,
          record.expand?.userFoodItem,
        ),
      );

  return {
    id: record.id,
    listId: record.list,
    restaurantId: record.restaurant,
    restaurantName: record.expand?.restaurant?.name?.trim() || 'Unknown restaurant',
    restaurantCity: record.expand?.restaurant?.location?.trim() || undefined,
    restaurantCuisineType: record.expand?.restaurant?.cuisineType?.trim() || undefined,
    sourceUserId: record.expand?.sourceUser?.id ?? record.sourceUser?.trim() ?? undefined,
    sourceUserName: resolveExpandedUserName(record.expand?.sourceUser),
    position: record.position,
    bookmarkedItems,
    note: record.note?.trim() || undefined,
    createdAt: record.created,
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

function mapRestaurantListItemLinkRecord(record: ListItemCollectionRecord): RestaurantListItemLinkRecord {
  return {
    id: record.id,
    listId: record.list,
    restaurantId: record.restaurant,
    foodItemId: record.foodItem?.trim() || undefined,
    userFoodItemId: record.userFoodItem?.trim() || undefined,
    sourceUserId: record.sourceUser?.trim() || undefined,
    recommendedItemIds: (record.recommendedItems ?? [])
      .map((itemId) => itemId?.trim())
      .filter((itemId): itemId is string => Boolean(itemId)),
  };
}

export function getRestaurantListItemLinkFoodItemIds(
  record: Pick<RestaurantListItemLinkRecord, 'foodItemId' | 'userFoodItemId' | 'recommendedItemIds'>,
): string[] {
  const foodItemIds = new Set<string>();

  if (record.foodItemId?.trim()) {
    foodItemIds.add(record.foodItemId.trim());
  }

  if (record.userFoodItemId?.trim()) {
    foodItemIds.add(record.userFoodItemId.trim());
  }

  for (const recommendedItemId of record.recommendedItemIds ?? []) {
    if (recommendedItemId?.trim()) {
      foodItemIds.add(recommendedItemId.trim());
    }
  }

  return Array.from(foodItemIds);
}

function createEmptyRestaurantListDetailPage(input?: PageInputLike): RestaurantListDetailPage {
  return {
    ...createEmptyPaginatedResult<RestaurantListItemRecord>(input),
    list: null,
    bookmarkState: {
      savedListIdsByBookmarkLookupId: {},
    },
    photoPreviews: [],
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

function buildRestaurantListItemLinkFoodItemLookupFilter(foodItemIds: string[]): string | undefined {
  const normalizedFoodItemIds = Array.from(new Set(foodItemIds.map((id) => id.trim()).filter((id) => id.length > 0)));
  if (normalizedFoodItemIds.length === 0) {
    return undefined;
  }

  return combineOrFilterClauses(
    buildOrFilter('foodItem', normalizedFoodItemIds),
    buildOrFilter('userFoodItem', normalizedFoodItemIds),
    buildAnyMatchFilter('recommendedItems', normalizedFoodItemIds),
  );
}

function mapRestaurantListMutationGroupItems(
  response: RestaurantListMutationGroupApiResponse,
): RestaurantListItemRecord[] {
  return (response.items ?? []).map(mapRestaurantListDetailItemRecord);
}

async function listAcceptedFriendships(): Promise<AcceptedFriendshipRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const currentUserId = getAuthenticatedUserId();
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  return listCollectionRecords<AcceptedFriendshipRecord>('friendships', {
    filter: `(user = "${escapedCurrentUserId}" || friend = "${escapedCurrentUserId}") && status = "accepted"`,
    fields: 'user,friend',
  });
}

export async function listRestaurantListsPage(
  input?: ListRestaurantListsPageInput,
): Promise<PaginatedResult<RestaurantListRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const currentUserId = getAuthenticatedUserId();
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const scope = input?.scope === 'friends' ? 'friends' : 'my';
  const searchFilter = buildSearchFilter(['name', 'description'], input?.search ?? '');

  let filter: string | undefined;
  let expand: string | undefined;

  if (scope === 'my') {
    filter = combineFilterClauses(`user = "${escapedCurrentUserId}"`, searchFilter);
  } else {
    const friendships = await listAcceptedFriendships();
    const friendIds = resolveAcceptedFriendIds(friendships, currentUserId);

    if (friendIds.length === 0) {
      return createEmptyPaginatedResult(input);
    }

    const matchingOwnerIds = input?.search?.trim()
      ? Array.from(
          new Set(
            (
              await listCollectionRecords<Pick<CollectionUserExpand, 'id'>>('users', {
                filter: buildSearchFilter(['name', 'email'], input.search) ?? undefined,
                fields: 'id',
              })
            )
              .map((record) => record.id)
              .filter((recordId) => friendIds.includes(recordId)),
          ),
        )
      : [];

    const friendFilter = friendIds.map((friendId) => `user = "${escapeFilterValue(friendId)}"`).join(' || ');
    const ownerSearchFilter = matchingOwnerIds.length > 0 ? buildOrFilter('user', matchingOwnerIds) : undefined;
    const combinedSearchFilter =
      searchFilter && ownerSearchFilter
        ? `(${searchFilter} || ${ownerSearchFilter})`
        : searchFilter ?? ownerSearchFilter;
    filter = combineFilterClauses(`(${friendFilter})`, 'visibility = "friends"', combinedSearchFilter);
    expand = 'user';
  }

  const pageResult = await listCollectionPage<RestaurantListCollectionRecord>('restaurant_lists', {
    page,
    pageSize,
    filter,
    expand,
    sort: scope === 'my' ? '-isDefault,-updated' : '-updated',
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapRestaurantListCollectionRecord));
}

export async function getRestaurantListById(listId: string): Promise<RestaurantListRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const record = await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId, {
      expand: 'user',
    });
    return mapRestaurantListCollectionRecord(record);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getRestaurantListDetailPage(
  listId: string,
  input?: PageInputLike,
): Promise<RestaurantListDetailPage> {
  if (!pb.authStore.record?.id) {
    return createEmptyRestaurantListDetailPage(input);
  }

  const trimmedListId = listId.trim();
  if (!trimmedListId) {
    return createEmptyRestaurantListDetailPage(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  try {
    const response = await sendApiRequest<RestaurantListDetailApiResponse>(
      `/api/restaurant-lists/${encodeURIComponent(trimmedListId)}/detail?${query.toString()}`,
      {
        method: 'GET',
      },
    );

    const savedListIdsByBookmarkLookupId = Object.fromEntries(
      Object.entries(response.bookmarkState?.savedListIdsByBookmarkLookupId ?? {}).map(([bookmarkLookupId, listIds]) => [
        bookmarkLookupId,
        (listIds ?? []).map((candidate) => candidate.trim()).filter((candidate) => candidate.length > 0),
      ]),
    );

    return {
      list: mapRestaurantListDetailApiListRecord(response.list),
      items: (response.items ?? []).map(mapRestaurantListDetailItemRecord),
      page: response.page,
      pageSize: response.pageSize,
      totalItems: response.totalItems,
      totalPages: response.totalPages,
      hasNextPage: response.hasNextPage,
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
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return createEmptyRestaurantListDetailPage(input);
    }

    throw error;
  }
}

export async function listRestaurantListVisitedRestaurantsPage(
  listId: string,
  input?: ListRestaurantListVisitedRestaurantsPageInput,
): Promise<PaginatedResult<RestaurantListVisitedRestaurantCandidate>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const trimmedListId = listId.trim();
  if (!trimmedListId) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const trimmedSearch = input?.search?.trim();
  if (trimmedSearch) {
    query.set('search', trimmedSearch);
  }

  try {
    const response = await sendApiRequest<RestaurantListVisitedRestaurantsPageApiResponse>(
      `/api/restaurant-lists/${encodeURIComponent(trimmedListId)}/visited-restaurants?${query.toString()}`,
      {
        method: 'GET',
      },
    );

    return {
      items: (response.items ?? []).map(mapRestaurantListVisitedRestaurantCandidateRecord),
      page: response.page,
      pageSize: response.pageSize,
      totalItems: response.totalItems,
      totalPages: response.totalPages,
      hasNextPage: response.hasNextPage,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return createEmptyPaginatedResult(input);
    }

    throw error;
  }
}

export async function createDefaultRestaurantList(): Promise<RestaurantListRecord> {
  return trackFeatureMutation('restaurant_list.default.create', async () => {
    const currentUserId = getAuthenticatedUserId();
    const escapedCurrentUserId = escapeFilterValue(currentUserId);

    const existingDefault = await pb.collection('restaurant_lists').getList<RestaurantListCollectionRecord>(1, 1, {
      filter: `user = "${escapedCurrentUserId}" && isDefault = true`,
      sort: '-updated',
      expand: 'user',
    });

    const existingRecord = existingDefault.items[0];
    if (existingRecord) {
      return mapRestaurantListCollectionRecord(existingRecord);
    }

    const createdRecord = await pb.collection('restaurant_lists').create<RestaurantListCollectionRecord>(
      {
        name: 'Saved',
        description: 'Items saved from other lists',
        visibility: 'private',
        user: currentUserId,
        isDefault: true,
      },
      {
        expand: 'user',
      },
    );

    return mapRestaurantListCollectionRecord(createdRecord);
  });
}

export async function createRestaurantList(input: CreateRestaurantListInput): Promise<RestaurantListRecord> {
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

      const existingRecord = await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId, {
        expand: 'user',
      });

      if (existingRecord.isDefault === true && Object.keys(payload).length > 0) {
        throw new Error('The Saved list cannot be edited.');
      }

      const updatedRecord =
        Object.keys(payload).length > 0
          ? await pb.collection('restaurant_lists').update<RestaurantListCollectionRecord>(listId, payload, {
              expand: 'user',
            })
          : existingRecord;

      return mapRestaurantListCollectionRecord(updatedRecord);
    },
    {
      hasNameUpdate: updates.name !== undefined,
      hasDescriptionUpdate: updates.description !== undefined,
      hasVisibilityUpdate: updates.visibility !== undefined,
    },
  );
}

export async function deleteRestaurantList(listId: string): Promise<void> {
  return trackFeatureMutation('restaurant_list.delete', async () => {
    getAuthenticatedUserId();

    try {
      await pb.collection('restaurant_lists').delete(listId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function listRestaurantListItemsPage(
  listId: string,
  input?: PageInputLike,
): Promise<PaginatedResult<RestaurantListItemRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const pageResult = await listCollectionPage<ListItemCollectionRecord>('list_items', {
    page,
    pageSize,
    filter: `list = "${escapeFilterValue(listId)}"`,
    expand:
      'restaurant,sourceUser,foodItem.visit,foodItem.user,userFoodItem.visit,userFoodItem.user,recommendedItems.visit,recommendedItems.user',
    sort: 'position,-created',
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapListItemCollectionRecord));
}

export async function listRestaurantListItemLinksForRestaurantIds(
  listId: string,
  restaurantIds: string[],
): Promise<RestaurantListItemLinkRecord[]> {
  if (!pb.authStore.record?.id || restaurantIds.length === 0) {
    return [];
  }

  const records = await listCollectionRecords<ListItemCollectionRecord>('list_items', {
    filter: combineFilterClauses(`list = "${escapeFilterValue(listId)}"`, buildOrFilter('restaurant', restaurantIds)),
    fields: RESTAURANT_LIST_ITEM_LINK_FIELDS,
  });

  return records.map(mapRestaurantListItemLinkRecord);
}

export async function listRestaurantListNotesForRestaurantIds(
  listId: string,
  restaurantIds: string[],
): Promise<RestaurantListRestaurantNoteRecord[]> {
  if (!pb.authStore.record?.id || restaurantIds.length === 0) {
    return [];
  }

  const records = await listCollectionRecords<Pick<ListItemCollectionRecord, 'restaurant' | 'note' | 'position'>>(
    'list_items',
    {
      filter: combineFilterClauses(`list = "${escapeFilterValue(listId)}"`, buildOrFilter('restaurant', restaurantIds)),
      fields: 'restaurant,note,position',
      sort: 'position',
    },
  );

  const noteByRestaurantId = new Map<string, RestaurantListRestaurantNoteRecord>();
  for (const record of records) {
    const trimmedNote = record.note?.trim();
    if (!trimmedNote || noteByRestaurantId.has(record.restaurant)) {
      continue;
    }

    noteByRestaurantId.set(record.restaurant, {
      restaurantId: record.restaurant,
      note: trimmedNote,
    });
  }

  return Array.from(noteByRestaurantId.values());
}

export async function listMyBookmarkedListItemLinksForFoodItemIds(
  foodItemIds: string[],
): Promise<RestaurantListItemLinkRecord[]> {
  if (!pb.authStore.record?.id || foodItemIds.length === 0) {
    return [];
  }

  const currentUserId = getAuthenticatedUserId();
  const normalizedFoodItemIds = Array.from(new Set(foodItemIds.map((id) => id.trim()).filter((id) => id.length > 0)));
  if (normalizedFoodItemIds.length === 0) {
    return [];
  }

  const linksById = new Map<string, RestaurantListItemLinkRecord>();
  const itemChunkSize = 20;
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  for (let itemIndex = 0; itemIndex < normalizedFoodItemIds.length; itemIndex += itemChunkSize) {
    const itemChunk = normalizedFoodItemIds.slice(itemIndex, itemIndex + itemChunkSize);
    const lookupFilter = buildRestaurantListItemLinkFoodItemLookupFilter(itemChunk);
    if (!lookupFilter) {
      continue;
    }

    const records = await listCollectionRecords<ListItemCollectionRecord>('list_items', {
      filter: combineFilterClauses(`list.user = "${escapedCurrentUserId}"`, lookupFilter),
      fields: RESTAURANT_LIST_ITEM_LINK_FIELDS,
    });

    for (const record of records) {
      const link = mapRestaurantListItemLinkRecord(record);
      linksById.set(link.id, link);
    }
  }

  return Array.from(linksById.values());
}

export async function saveRestaurantFoodItemToList(
  input: SaveRestaurantFoodItemToListInput,
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

export async function addRestaurantToList(
  listId: string,
  restaurantName: string,
  city?: string,
): Promise<RestaurantListItemRecord> {
  return trackFeatureMutation(
    'restaurant_list.restaurant.add',
    async () => {
      getAuthenticatedUserId();
      const trimmedName = restaurantName.trim();
      if (!trimmedName) {
        throw new Error('Restaurant name is required.');
      }

      const restaurant = await upsertRestaurantRecord({
        restaurantName: trimmedName,
        location: city,
        visibility: getDefaultRestaurantVisibility(),
      });
      const response = await sendApiRequest<RestaurantListMutationGroupApiResponse>(
        `/api/restaurant-lists/${encodeURIComponent(listId)}/restaurants`,
        {
          method: 'POST',
          body: {
            restaurantId: restaurant.id,
          },
        },
      );

      const items = mapRestaurantListMutationGroupItems(response);
      const firstItem = items[0];
      if (!firstItem) {
        throw new Error('Could not add restaurant to the list.');
      }

      return firstItem;
    },
    {
      hasCity: Boolean(city?.trim()),
    },
  );
}

export async function addRestaurantVisitRatingsToList(
  input: AddRestaurantVisitRatingsToListInput,
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
): Promise<void> {
  return trackFeatureMutation(
    'restaurant_list.restaurant.move',
    async () => {
      const currentUserId = getAuthenticatedUserId();
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

      const list = await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId, {
        fields: 'id,user',
      });
      if (list.user !== currentUserId) {
        throw new Error('You can only reorder restaurants in your own lists.');
      }

      const listItems = await listCollectionRecords<Pick<ListItemCollectionRecord, 'id' | 'restaurant' | 'position' | 'created'>>(
        'list_items',
        {
          filter: `list = "${escapeFilterValue(listId)}"`,
          sort: 'position,created',
          fields: 'id,restaurant,position,created',
        },
      );

      if (listItems.length < 2) {
        return;
      }

      const listItemIdsByRestaurant = new Map<
        string,
        Pick<ListItemCollectionRecord, 'id' | 'restaurant' | 'position' | 'created'>[]
      >();
      const restaurantOrder: string[] = [];
      for (const item of listItems) {
        const existingItems = listItemIdsByRestaurant.get(item.restaurant);
        if (existingItems) {
          existingItems.push(item);
          continue;
        }

        listItemIdsByRestaurant.set(item.restaurant, [item]);
        restaurantOrder.push(item.restaurant);
      }

      const currentIndex = restaurantOrder.indexOf(restaurantId);
      if (currentIndex === -1) {
        return;
      }

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= restaurantOrder.length) {
        return;
      }

      const [movedRestaurantId] = restaurantOrder.splice(currentIndex, 1);
      if (!movedRestaurantId) {
        return;
      }
      restaurantOrder.splice(targetIndex, 0, movedRestaurantId);

      const reorderedItems: Pick<ListItemCollectionRecord, 'id' | 'restaurant' | 'position' | 'created'>[] = [];
      for (const orderedRestaurantId of restaurantOrder) {
        const itemsForRestaurant = listItemIdsByRestaurant.get(orderedRestaurantId);
        if (!itemsForRestaurant) {
          continue;
        }
        reorderedItems.push(...itemsForRestaurant);
      }

      for (let index = 0; index < reorderedItems.length; index += 1) {
        const listItem = reorderedItems[index];
        if (!listItem) {
          continue;
        }

        const nextPosition = index + 1;
        if (listItem.position === nextPosition) {
          continue;
        }

        await pb.collection('list_items').update<ListItemCollectionRecord>(listItem.id, {
          position: nextPosition,
        });
      }
    },
    {
      direction: input.direction,
    },
  );
}

export async function removeRestaurantFromList(
  listId: string,
  listItemId: string,
): Promise<void> {
  return trackFeatureMutation('restaurant_list.restaurant.remove', async () => {
    getAuthenticatedUserId();

    try {
      const listItem = await pb.collection('list_items').getOne<ListItemCollectionRecord>(listItemId);
      if (listItem.list !== listId) {
        throw new Error('List item not found.');
      }

      await pb.collection('list_items').delete(listItemId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function removeRestaurantListSourceRating(
  input: RemoveRestaurantListSourceRatingInput,
): Promise<void> {
  return trackFeatureMutation('restaurant_list.source_rating.remove', async () => {
    getAuthenticatedUserId();

    const listId = input.listId.trim();
    const listItemId = input.listItemId.trim();
    const foodItemId = input.foodItemId.trim();
    if (!listId || !listItemId || !foodItemId) {
      throw new Error('List item and food item are required.');
    }

    try {
      const listItem = await pb.collection('list_items').getOne<ListItemCollectionRecord>(listItemId, {
        fields: 'id,list,foodItem,recommendedItems,userFoodItem,sourceUser',
      });

      if (listItem.list !== listId) {
        throw new Error('List item not found.');
      }

      let nextFoodItem = listItem.foodItem?.trim() || '';
      let nextUserFoodItem = listItem.userFoodItem?.trim() || '';
      let nextSourceUser = listItem.sourceUser?.trim() || '';
      let nextRecommendedItems = (listItem.recommendedItems ?? [])
        .map((itemId) => itemId?.trim())
        .filter((itemId): itemId is string => Boolean(itemId));

      const isPrimaryFoodItem = nextFoodItem === foodItemId;
      const hasLegacyFoodItem = nextRecommendedItems.includes(foodItemId);

      if (!isPrimaryFoodItem && !hasLegacyFoodItem) {
        return;
      }

      if (isPrimaryFoodItem) {
        nextFoodItem = '';
      } else {
        nextRecommendedItems = nextRecommendedItems.filter((itemId) => itemId !== foodItemId);
      }

      const hasSourceItems = Boolean(nextFoodItem) || nextRecommendedItems.length > 0;
      if (!hasSourceItems) {
        if (nextUserFoodItem) {
          nextFoodItem = nextUserFoodItem;
          nextUserFoodItem = '';
          nextSourceUser = '';
        } else {
          await pb.collection('list_items').delete(listItemId);
          return;
        }
      }

      await pb.collection('list_items').update<ListItemCollectionRecord>(listItemId, {
        foodItem: nextFoodItem || null,
        recommendedItems: nextRecommendedItems,
        sourceUser: nextSourceUser || null,
        userFoodItem: nextUserFoodItem || null,
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function removeRestaurantListUserRating(listId: string, listItemId: string): Promise<void> {
  return trackFeatureMutation('restaurant_list.user_rating.remove', async () => {
    getAuthenticatedUserId();

    const trimmedListId = listId.trim();
    const trimmedListItemId = listItemId.trim();
    if (!trimmedListId || !trimmedListItemId) {
      throw new Error('List item is required.');
    }

    try {
      const listItem = await pb.collection('list_items').getOne<ListItemCollectionRecord>(trimmedListItemId, {
        fields: 'id,list,foodItem,recommendedItems,userFoodItem',
      });

      if (listItem.list !== trimmedListId) {
        throw new Error('List item not found.');
      }

      if (!listItem.userFoodItem?.trim()) {
        return;
      }

      const hasSourceItems =
        Boolean(listItem.foodItem?.trim()) ||
        (listItem.recommendedItems ?? []).some((itemId) => Boolean(itemId?.trim()));

      if (!hasSourceItems) {
        await pb.collection('list_items').delete(trimmedListItemId);
        return;
      }

      await pb.collection('list_items').update<ListItemCollectionRecord>(trimmedListItemId, {
        userFoodItem: null,
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}
