import { pb } from '../../lib/pocketbase';
import type {
  RestaurantListBookmarkedItemRecord,
  RestaurantListItemRecord,
  RestaurantListRecord,
} from '../models';
import type {
  AddRestaurantVisitRatingsToListInput,
  CreateRestaurantListInput,
  LinkVisitToListBookmarkInput,
  ListRestaurantListsPageInput,
  MoveRestaurantListRestaurantInput,
  PaginatedResult,
  RemoveRestaurantListSourceRatingInput,
  RestaurantListItemLinkRecord,
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
import { listCollectionPage, listCollectionRecords } from './pocketbaseGateway';
import type {
  CollectionUserExpand,
  FoodItemCollectionRecord,
  ListItemCollectionRecord,
  RestaurantCollectionRecord,
  RestaurantListCollectionRecord,
} from './pocketbaseRecordTypes';
import { upsertRestaurantRecord } from './restaurantsStore';

export type {
  AddRestaurantVisitRatingsToListInput,
  CreateRestaurantListInput,
  LinkVisitToListBookmarkInput,
  ListRestaurantListsPageInput,
  MoveRestaurantListRestaurantInput,
  RemoveRestaurantListSourceRatingInput,
  RestaurantListItemLinkRecord,
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

export async function saveRestaurantFoodItemToList(input: SaveRestaurantFoodItemToListInput): Promise<void> {
  return trackFeatureMutation(
    'restaurant_list.food_item.save',
    async () => {
      const currentUserId = getAuthenticatedUserId();
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

      const list = await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId, {
        fields: 'id,user',
      });
      if (list.user !== currentUserId) {
        throw new Error('You can only save items to your own lists.');
      }

      await pb.collection('restaurants').getOne<RestaurantCollectionRecord>(restaurantId, { fields: 'id' });
      await pb.collection('food_items').getOne<FoodItemCollectionRecord>(foodItemId, { fields: 'id' });

      const escapedListId = escapeFilterValue(listId);
      const escapedRestaurantId = escapeFilterValue(restaurantId);
      const escapedFoodItemId = escapeFilterValue(foodItemId);
      const existingItem = await pb.collection('list_items').getList<ListItemCollectionRecord>(1, 1, {
        filter: `list = "${escapedListId}" && restaurant = "${escapedRestaurantId}" && foodItem = "${escapedFoodItemId}"`,
        fields: 'id',
      });
      if (existingItem.totalItems > 0) {
        return;
      }

      const itemsWithHighestPosition = await pb.collection('list_items').getList<ListItemCollectionRecord>(1, 1, {
        filter: `list = "${escapedListId}"`,
        sort: '-position',
        fields: 'position',
      });
      const nextPosition = (itemsWithHighestPosition.items[0]?.position ?? 0) + 1;

      await pb.collection('list_items').create<ListItemCollectionRecord>({
        list: listId,
        restaurant: restaurantId,
        addedBy: currentUserId,
        sourceUser: sourceUserId,
        foodItem: foodItemId,
        position: nextPosition,
        note: trimmedNote,
      });
    },
    {
      hasSourceUser: Boolean(input.sourceUserId?.trim()),
      hasNote: Boolean(input.note?.trim()),
    },
  );
}

export async function linkVisitToListBookmark(input: LinkVisitToListBookmarkInput): Promise<void> {
  return trackFeatureMutation('restaurant_list.bookmark.link', async () => {
    const currentUserId = getAuthenticatedUserId();
    const listItemId = input.listItemId.trim();
    const userFoodItemId = input.userFoodItemId.trim();

    if (!listItemId) {
      throw new Error('List item is required.');
    }

    if (!userFoodItemId) {
      throw new Error('Food item is required.');
    }

    const [listItem, userFoodItem] = await Promise.all([
      pb.collection('list_items').getOne<ListItemCollectionRecord>(listItemId, {
        fields: 'id,list,addedBy',
      }),
      pb.collection('food_items').getOne<FoodItemCollectionRecord>(userFoodItemId, {
        fields: 'id,user',
      }),
    ]);

    if (userFoodItem.user !== currentUserId) {
      throw new Error('You can only link your own rated items.');
    }

    const list = await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listItem.list, {
      fields: 'id,user',
    });
    const canUpdateListItem = list.user === currentUserId || listItem.addedBy === currentUserId;
    if (!canUpdateListItem) {
      throw new Error('You can only link bookmarks in your own lists.');
    }

    await pb.collection('list_items').update<ListItemCollectionRecord>(listItemId, {
      userFoodItem: userFoodItemId,
    });
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
      const trimmedName = restaurantName.trim();
      if (!trimmedName) {
        throw new Error('Restaurant name is required.');
      }

      const escapedListId = escapeFilterValue(listId);

      await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId);

      const restaurant = await upsertRestaurantRecord({
        restaurantName: trimmedName,
        location: city,
        visibility: getDefaultRestaurantVisibility(),
      });
      const escapedRestaurantId = escapeFilterValue(restaurant.id);

      const existingItems = await pb.collection('list_items').getList<ListItemCollectionRecord>(1, 1, {
        filter: `list = "${escapedListId}" && restaurant = "${escapedRestaurantId}"`,
        expand: 'restaurant',
      });
      if (existingItems.totalItems > 0 && existingItems.items[0]) {
        return mapListItemCollectionRecord(existingItems.items[0]);
      }

      const itemsWithHighestPosition = await pb.collection('list_items').getList<ListItemCollectionRecord>(1, 1, {
        filter: `list = "${escapedListId}"`,
        sort: '-position',
      });
      const nextPosition = (itemsWithHighestPosition.items[0]?.position ?? 0) + 1;

      const createdItem = await pb.collection('list_items').create<ListItemCollectionRecord>(
        {
          list: listId,
          restaurant: restaurant.id,
          addedBy: getAuthenticatedUserId(),
          position: nextPosition,
        },
        {
          expand: 'restaurant',
        },
      );

      return mapListItemCollectionRecord(createdItem);
    },
    {
      hasCity: Boolean(city?.trim()),
    },
  );
}

export async function addRestaurantVisitRatingsToList(
  input: AddRestaurantVisitRatingsToListInput,
): Promise<void> {
  return trackFeatureMutation(
    'restaurant_list.visit_ratings.add',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const listId = input.listId.trim();
      const restaurantId = input.restaurantId.trim();

      if (!listId) {
        throw new Error('List is required.');
      }

      if (!restaurantId) {
        throw new Error('Restaurant is required.');
      }

      await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId);
      await pb.collection('restaurants').getOne<RestaurantCollectionRecord>(restaurantId);

      const escapedListId = escapeFilterValue(listId);
      const escapedRestaurantId = escapeFilterValue(restaurantId);

      const existingItems = await listCollectionRecords<
        Pick<ListItemCollectionRecord, 'id' | 'foodItem' | 'userFoodItem' | 'recommendedItems'>
      >('list_items', {
        filter: `list = "${escapedListId}" && restaurant = "${escapedRestaurantId}"`,
        fields: 'id,foodItem,userFoodItem,recommendedItems',
      });

      const existingFoodItemIds = new Set<string>();
      for (const item of existingItems) {
        if (item.foodItem?.trim()) {
          existingFoodItemIds.add(item.foodItem.trim());
        }

        if (item.userFoodItem?.trim()) {
          existingFoodItemIds.add(item.userFoodItem.trim());
        }

        for (const recommendedItemId of item.recommendedItems ?? []) {
          if (recommendedItemId?.trim()) {
            existingFoodItemIds.add(recommendedItemId.trim());
          }
        }
      }

      const uniqueRequestedFoodItemIds = Array.from(
        new Set((input.foodItemIds ?? []).map((itemId) => itemId.trim()).filter((itemId) => itemId.length > 0)),
      );
      const newFoodItemIds = uniqueRequestedFoodItemIds.filter((itemId) => !existingFoodItemIds.has(itemId));
      const noteProvided = input.note !== undefined;
      const trimmedNote = input.note?.trim() ?? '';
      const firstExistingItemId = existingItems[0]?.id;

      if (noteProvided && firstExistingItemId) {
        await pb.collection('list_items').update(firstExistingItemId, {
          note: trimmedNote,
        });

        if (newFoodItemIds.length === 0) {
          return;
        }
      }

      if (newFoodItemIds.length === 0 && existingItems.length > 0) {
        return;
      }

      const highestPositionItem = await pb.collection('list_items').getList<ListItemCollectionRecord>(1, 1, {
        filter: `list = "${escapedListId}"`,
        sort: '-position',
        fields: 'position',
      });
      let nextPosition = (highestPositionItem.items[0]?.position ?? 0) + 1;

      if (newFoodItemIds.length === 0) {
        await pb.collection('list_items').create<ListItemCollectionRecord>({
          list: listId,
          restaurant: restaurantId,
          addedBy: currentUserId,
          position: nextPosition,
          note: noteProvided ? trimmedNote : undefined,
        });
        return;
      }

      for (let index = 0; index < newFoodItemIds.length; index += 1) {
        const foodItemId = newFoodItemIds[index];
        const shouldAttachNote = !firstExistingItemId && index === 0 && noteProvided;
        await pb.collection('list_items').create<ListItemCollectionRecord>({
          list: listId,
          restaurant: restaurantId,
          addedBy: currentUserId,
          position: nextPosition,
          foodItem: foodItemId,
          note: shouldAttachNote ? trimmedNote : undefined,
        });
        nextPosition += 1;
      }
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
