import { pb } from '../../lib/pocketbase';
import type {
  CollectionPageResult,
} from './pocketbaseGateway';
import { listCollectionPage, listCollectionRecords, sendApiRequest } from './pocketbaseGateway';
import {
  buildOrFilter,
  buildSearchFilter,
  combineFilterClauses,
  createEmptyPaginatedResult,
  escapeFilterValue,
  getAuthenticatedUserId,
  getDefaultVisitVisibility,
  isNotFoundError,
  mapPaginatedResult,
  nowIso,
  normalizeModerationContentStatus,
  normalizeQuickTrackVisibility,
  resolvePaginationInput,
  resolveExpandedUserName,
  trackFeatureMutation,
} from './featureStoreShared';
import type {
  CreateVisitInput,
  ListVisitsPageInput,
  PaginatedResult,
  UpdateVisitInput,
  VisitPhotoRecord,
} from './featureStore';
import { markNoteUsed } from './notesStore';
import type {
  FoodItemCollectionRecord,
  RestaurantCollectionRecord,
  VisitCollectionRecord,
} from './pocketbaseRecordTypes';
import type {
  VisitItem,
  VisitRecord,
} from '../models';
import { uploadVisitPhotos } from './visitPhotoUploads';

export type {
  CreateVisitInput,
  ListVisitsPageInput,
  UpdateVisitInput,
  VisitPhotoRecord,
} from './featureStore';

function mapVisitItemRecord(record: FoodItemCollectionRecord): VisitItem {
  return {
    id: record.id,
    name: record.name,
    rating: record.rating,
    description: record.description?.trim() || undefined,
    notes: record.notes,
  };
}

function mapVisitCollectionRecord(visit: VisitCollectionRecord, visitItems: FoodItemCollectionRecord[]): VisitRecord {
  return {
    id: visit.id,
    restaurantId: visit.restaurant,
    restaurantName: visit.expand?.restaurant?.name?.trim() || 'Unknown Restaurant',
    restaurantLocation: visit.expand?.restaurant?.location?.trim() || undefined,
    restaurantCuisineType: visit.expand?.restaurant?.cuisineType?.trim() || undefined,
    visitedAt: visit.visitDate || visit.created,
    items: visitItems.map(mapVisitItemRecord),
    source: 'visit',
    userId: visit.user,
    userName: resolveExpandedUserName(visit.expand?.user),
    visibility: normalizeQuickTrackVisibility(visit.visibility),
    moderationStatus: normalizeModerationContentStatus(visit.moderationStatus),
    createdAt: visit.created,
    updatedAt: visit.updated,
  };
}

async function listFoodItemsForVisitIds(visitIds: string[]): Promise<FoodItemCollectionRecord[]> {
  if (visitIds.length === 0) {
    return [];
  }

  const records: FoodItemCollectionRecord[] = [];
  const chunkSize = 20;

  for (let index = 0; index < visitIds.length; index += chunkSize) {
    const chunk = visitIds.slice(index, index + chunkSize);
    const chunkRecords = await listCollectionRecords<FoodItemCollectionRecord>('food_items', {
      filter: buildOrFilter('visit', chunk),
      sort: '-created',
      fields: 'id,name,rating,description,notes,visit',
    });
    records.push(...chunkRecords);
  }

  return records;
}

async function listRestaurantIdsMatchingSearch(search: string): Promise<string[]> {
  const searchFilter = buildSearchFilter(['name', 'location', 'cuisineType'], search);
  if (!searchFilter) {
    return [];
  }

  const records = await listCollectionRecords<Pick<RestaurantCollectionRecord, 'id'>>('restaurants', {
    filter: searchFilter,
    fields: 'id',
  });

  return Array.from(new Set(records.map((record) => record.id)));
}

async function listVisitIdsMatchingSearch(
  search: string,
  scope: 'all' | 'mine' | 'friends',
  currentUserId: string,
): Promise<string[]> {
  const searchFilter = buildSearchFilter(['name', 'notes'], search);
  if (!searchFilter) {
    return [];
  }

  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const scopeFilter =
    scope === 'mine'
      ? `user = "${escapedCurrentUserId}"`
      : scope === 'friends'
        ? `user != "${escapedCurrentUserId}"`
        : undefined;

  const records = await listCollectionRecords<Pick<FoodItemCollectionRecord, 'visit'>>('food_items', {
    filter: combineFilterClauses('visit != ""', 'isQuickTrack != true', scopeFilter, searchFilter),
    fields: 'visit',
  });

  return Array.from(new Set(records.map((record) => record.visit).filter((visitId): visitId is string => Boolean(visitId))));
}

export async function listVisitsPage(input?: ListVisitsPageInput): Promise<PaginatedResult<VisitRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const currentUserId = getAuthenticatedUserId();
  const scope = input?.scope ?? 'all';
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const scopeFilter =
    scope === 'mine'
      ? `user = "${escapedCurrentUserId}"`
      : scope === 'friends'
        ? `user != "${escapedCurrentUserId}"`
        : undefined;
  const trimmedSearch = input?.search?.trim() ?? '';
  let searchFilter: string | undefined;
  if (trimmedSearch) {
    const [matchingRestaurantIds, matchingVisitIds] = await Promise.all([
      listRestaurantIdsMatchingSearch(trimmedSearch),
      listVisitIdsMatchingSearch(trimmedSearch, scope, currentUserId),
    ]);

    const searchClauses = [
      matchingRestaurantIds.length > 0 ? buildOrFilter('restaurant', matchingRestaurantIds) : undefined,
      matchingVisitIds.length > 0 ? buildOrFilter('id', matchingVisitIds) : undefined,
    ].filter((clause): clause is string => Boolean(clause));

    if (searchClauses.length === 0) {
      return createEmptyPaginatedResult(input);
    }

    searchFilter = searchClauses.length > 1 ? `(${searchClauses.join(' || ')})` : searchClauses[0];
  }

  const pageResult = await listCollectionPage<VisitCollectionRecord>('visits', {
    page,
    pageSize,
    filter: combineFilterClauses(scopeFilter, searchFilter),
    expand: 'restaurant,user',
    sort: '-visitDate',
  });

  if (pageResult.items.length === 0) {
    return mapPaginatedResult(pageResult as CollectionPageResult<VisitCollectionRecord>, []);
  }

  const visitItems = await listFoodItemsForVisitIds(pageResult.items.map((visit) => visit.id));
  const itemsByVisitId = new Map<string, FoodItemCollectionRecord[]>();
  for (const item of visitItems) {
    if (!item.visit) {
      continue;
    }
    const existingItems = itemsByVisitId.get(item.visit) ?? [];
    existingItems.push(item);
    itemsByVisitId.set(item.visit, existingItems);
  }

  return mapPaginatedResult(
    pageResult as CollectionPageResult<VisitCollectionRecord>,
    pageResult.items.map((visit) => mapVisitCollectionRecord(visit, itemsByVisitId.get(visit.id) ?? [])),
  );
}

export async function getVisitById(visitId: string): Promise<VisitRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const visit = await pb.collection('visits').getOne<VisitCollectionRecord>(visitId, {
      expand: 'restaurant,user',
    });
    const visitItems = await listCollectionRecords<FoodItemCollectionRecord>('food_items', {
      filter: `visit = "${escapeFilterValue(visitId)}"`,
      sort: '-created',
      fields: 'id,name,rating,description,notes,visit',
    });

    return mapVisitCollectionRecord(visit, visitItems);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function createVisit(input: CreateVisitInput): Promise<VisitRecord> {
  return trackFeatureMutation(
    'visit.create',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const trimmedRestaurantName = input.restaurantName.trim();

      if (!trimmedRestaurantName) {
        throw new Error('Restaurant name is required.');
      }

      if (input.items.length === 0) {
        throw new Error('At least one item is required.');
      }

      const createdVisit = await sendApiRequest<VisitRecord>('/api/visits', {
        method: 'POST',
        body: {
          restaurantId: input.restaurantId?.trim() || undefined,
          restaurantName: trimmedRestaurantName,
          items: input.items.map((item) => ({
            name: item.name.trim(),
            rating: item.rating,
            description: item.description?.trim() || undefined,
            notes: item.notes?.trim() || undefined,
          })),
          visitedAt: input.visitedAt ?? nowIso(),
          visibility: input.visibility ?? getDefaultVisitVisibility(),
        },
      });

      for (const [index, item] of input.items.entries()) {
        const createdItemId = createdVisit.items[index]?.id;
        if (!createdItemId) {
          throw new Error('Created visit item could not be loaded.');
        }

        await uploadVisitPhotos(
          createdVisit.id,
          createdItemId,
          currentUserId,
          item.photos ?? [],
          item.description || item.name,
        );
      }

      if (input.sourceNoteId) {
        try {
          await markNoteUsed({
            noteId: input.sourceNoteId,
            usedInVisitId: createdVisit.id,
          });
        } catch {
          // Best effort only: visit create should still succeed if note linking fails.
        }
      }

      return createdVisit;
    },
    {
      itemCount: input.items.length,
      hasVisitedAt: Boolean(input.visitedAt),
      hasSourceNote: Boolean(input.sourceNoteId),
      visibility: input.visibility ?? getDefaultVisitVisibility(),
      source: input.source ?? 'unknown',
    },
  );
}

export async function updateVisit(visitId: string, updates: UpdateVisitInput): Promise<VisitRecord> {
  return trackFeatureMutation(
    'visit.update',
    async () => {
      return sendApiRequest<VisitRecord>(`/api/visits/${encodeURIComponent(visitId)}`, {
        method: 'PUT',
        body: {
          restaurantId: updates.restaurantId?.trim() || undefined,
          restaurantName: updates.restaurantName?.trim(),
          items: updates.items?.map((item) => ({
            id: item.id,
            name: item.name.trim(),
            rating: item.rating,
            description: item.description?.trim() || undefined,
            notes: item.notes?.trim() || undefined,
          })),
          visitedAt: updates.visitedAt,
          visibility: updates.visibility,
        },
      });
    },
    {
      hasRestaurantNameUpdate: updates.restaurantName !== undefined,
      hasVisitedAtUpdate: updates.visitedAt !== undefined,
      hasVisibilityUpdate: updates.visibility !== undefined,
      hasItemsUpdate: updates.items !== undefined,
      itemCount: updates.items?.length,
    },
  );
}

export async function deleteVisit(visitId: string): Promise<void> {
  return trackFeatureMutation('visit.delete', async () => {
    try {
      await pb.collection('visits').delete(visitId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function listVisitPhotosForFoodItemIds(foodItemIds: string[]): Promise<VisitPhotoRecord[]> {
  if (!pb.authStore.record?.id || foodItemIds.length === 0) {
    return [];
  }

  const records: VisitPhotoRecord[] = [];
  const chunkSize = 20;

  for (let index = 0; index < foodItemIds.length; index += chunkSize) {
    const chunk = foodItemIds.slice(index, index + chunkSize);
    const chunkRecords = await listCollectionRecords<VisitPhotoRecord>('visit_photos', {
      filter: buildOrFilter('food_item', chunk),
      sort: '-created',
      expand: 'user',
    });
    records.push(...chunkRecords);
  }

  return records;
}
