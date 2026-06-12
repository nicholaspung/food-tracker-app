import { pb } from '../../lib/pocketbase';
import { deleteCollectionRecord, listCollectionRecords, sendApiRequest } from './pocketbaseGateway';
import {
  buildOrFilter,
  deleteCollectionRecordsIgnoringNotFound,
  type FeatureWriteRequestOptions,
  getAuthenticatedUserId,
  getDefaultVisitVisibility,
  isNotFoundError,
  normalizeModerationContentStatus,
  normalizeStoredVisibility,
  nowIso,
  resolveFeatureWriteHeaders,
  trackFeatureMutation,
} from './featureStoreShared';
import type {
  CreateVisitInput,
  ConvertVisitItemToFoodProductInput,
  ConvertVisitItemToFoodProductResult,
  ListVisitsPageInput,
  MoveVisitItemInput,
  MoveVisitItemResult,
  PaginatedResult,
  UpdateVisitInput,
  VisitPhotoRecord,
} from './featureStore';
import { markNoteUsed } from './notesStore';
import type { VisitRecord } from '../models';
import { uploadVisitPhotos } from './visitPhotoUploads';

export type {
  CreateVisitInput,
  ConvertVisitItemToFoodProductInput,
  ConvertVisitItemToFoodProductResult,
  ListVisitsPageInput,
  MoveVisitItemInput,
  MoveVisitItemResult,
  UpdateVisitInput,
} from './featureStore';

interface VisitApiItemRecord {
  id: string;
  menuItemId?: string;
  menuItemVisibility?: 'private' | 'friends' | 'public';
  name: string;
  rating: number;
  description?: string;
  notes?: string;
}

interface VisitApiRecord {
  id: string;
  restaurantId?: string;
  restaurantName?: string;
  restaurantLocation?: string;
  restaurantCuisineType?: string;
  visitedAt: string;
  items?: VisitApiItemRecord[];
  userId?: string;
  userName?: string;
  visibility?: 'friends' | 'private' | 'public';
  moderationStatus?: string;
  createdAt: string;
  updatedAt: string;
}

interface VisitPhotoCollectionRecord {
  id: string;
  food_item?: string;
  user?: string;
  photo: string;
  created: string;
}

function normalizePageNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function mapVisitApiRecord(record: VisitApiRecord): VisitRecord {
  return {
    id: record.id,
    restaurantId: record.restaurantId?.trim() || undefined,
    restaurantName: record.restaurantName?.trim() || 'Unknown Restaurant',
    restaurantLocation: record.restaurantLocation?.trim() || undefined,
    restaurantCuisineType: record.restaurantCuisineType?.trim() || undefined,
    visitedAt: record.visitedAt,
    items: (record.items ?? []).map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId?.trim() || undefined,
      menuItemVisibility: item.menuItemVisibility,
      name: item.name.trim(),
      rating: item.rating,
      description: item.description?.trim() || undefined,
      notes: item.notes?.trim() || undefined,
    })),
    source: 'visit',
    userId: record.userId?.trim() || undefined,
    userName: record.userName?.trim() || undefined,
    visibility: normalizeStoredVisibility(record.visibility),
    moderationStatus: normalizeModerationContentStatus(record.moderationStatus),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapVisitPhotoCollectionRecord(
  record: VisitPhotoCollectionRecord,
): VisitPhotoRecord {
  return {
    id: record.id,
    food_item: record.food_item?.trim() || undefined,
    user: record.user?.trim() || undefined,
    photo: record.photo.trim(),
    collectionName: 'visit_photos',
    created: record.created,
  };
}

export async function listVisitsPage(
  input?: ListVisitsPageInput,
): Promise<PaginatedResult<VisitRecord>> {
  const page = normalizePageNumber(input?.page, 1);
  const pageSize = normalizePageNumber(input?.pageSize, 20);
  const scope = input?.scope ?? 'mine';
  const trimmedSearch = input?.search?.trim() || undefined;

  if (!pb.authStore.record?.id) {
    return {
      items: [],
      page,
      pageSize,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
    };
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    scope,
  });
  if (trimmedSearch) {
    query.set('search', trimmedSearch);
  }

  const response = await sendApiRequest<PaginatedResult<VisitApiRecord>>(
    `/api/visits?${query.toString()}`,
    {
      method: 'GET',
      signal: input?.signal,
    },
  );

  return {
    ...response,
    items: response.items.map(mapVisitApiRecord),
  };
}

export async function getVisitById(
  visitId: string,
  options?: { signal?: AbortSignal },
): Promise<VisitRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const response = await sendApiRequest<VisitApiRecord>(`/api/visits/${encodeURIComponent(visitId)}`, {
      method: 'GET',
      signal: options?.signal,
    });
    return mapVisitApiRecord(response);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function listVisitItemPhotos(
  foodItemIds: string[],
  options?: { signal?: AbortSignal },
): Promise<Record<string, VisitPhotoRecord[]>> {
  const normalizedFoodItemIds = Array.from(
    new Set(
      foodItemIds
        .map((foodItemId) => foodItemId.trim())
        .filter((foodItemId) => foodItemId.length > 0),
    ),
  );
  if (!pb.authStore.record?.id || normalizedFoodItemIds.length === 0) {
    return {};
  }

  const records = await listCollectionRecords<VisitPhotoCollectionRecord>(
    'visit_photos',
    {
      fields: 'id,food_item,user,photo,created',
      filter: buildOrFilter('food_item', normalizedFoodItemIds),
      pageSize: Math.max(100, normalizedFoodItemIds.length * 10),
      signal: options?.signal,
      sort: '-created',
    },
  );

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

export async function createVisit(
  input: CreateVisitInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<VisitRecord> {
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
        headers: resolveFeatureWriteHeaders(requestOptions),
        body: {
          restaurantId: input.restaurantId?.trim() || undefined,
          restaurantName: trimmedRestaurantName,
          sourceListItemId: input.sourceListItemId?.trim() || undefined,
          items: input.items.map((item) => ({
            name: item.name.trim(),
            rating: item.rating,
            menuItemId: item.menuItemId?.trim() || undefined,
            suggestionSource: item.suggestionSource
              ? {
                  type: item.suggestionSource.type,
                  sourceMenuItemId: item.suggestionSource.sourceMenuItemId.trim(),
                  sourceRestaurantId: item.suggestionSource.sourceRestaurantId?.trim() || undefined,
                  restaurantGroupId: item.suggestionSource.restaurantGroupId?.trim() || undefined,
                  normalizedItemName: item.suggestionSource.normalizedItemName?.trim() || undefined,
                }
              : undefined,
            description: item.description?.trim() || undefined,
            notes: item.notes?.trim() || undefined,
          })),
          visitedAt: input.visitedAt ?? nowIso(),
          visitedOn: input.visitedOn?.trim() || undefined,
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
          requestOptions,
        );
      }

      if (input.sourceNoteId) {
        const noteUsedAt = nowIso();
        try {
          await markNoteUsed({
            noteId: input.sourceNoteId,
            usedInVisitId: createdVisit.id,
            usedAt: noteUsedAt,
          }, requestOptions);
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

export async function updateVisit(
  visitId: string,
  updates: UpdateVisitInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<VisitRecord> {
  return trackFeatureMutation(
    'visit.update',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const normalizedItems = updates.items?.map((item) => ({
        id: item.id,
        name: item.name.trim(),
        rating: item.rating,
        description: item.description?.trim() || undefined,
        notes: item.notes?.trim() || undefined,
        newPhotos: item.newPhotos ?? [],
        deletePhotoIds: Array.from(
          new Set(
            (item.deletePhotoIds ?? [])
              .map((photoId) => photoId.trim())
              .filter((photoId) => photoId.length > 0),
          ),
        ),
      }));
      const updatedVisit = await sendApiRequest<VisitRecord>(
        `/api/visits/${encodeURIComponent(visitId)}`,
        {
          method: 'PUT',
          headers: resolveFeatureWriteHeaders(requestOptions),
          body: {
            restaurantId: updates.restaurantId?.trim() || undefined,
            restaurantName: updates.restaurantName?.trim(),
            items: normalizedItems?.map((item) => ({
              id: item.id,
              name: item.name,
              rating: item.rating,
              description: item.description,
              notes: item.notes,
            })),
            visitedAt: updates.visitedAt,
            visitedOn: updates.visitedOn?.trim() || undefined,
            visibility: updates.visibility,
          },
        },
      );

      if (!normalizedItems) {
        return updatedVisit;
      }

      const matchedResponseItemIds = new Set<string>();
      const resolveUpdatedItemId = (
        requestedItem: (typeof normalizedItems)[number],
      ): string | null => {
        const exactMatch = updatedVisit.items.find(
          (item) => item.id === requestedItem.id && !matchedResponseItemIds.has(item.id),
        );
        if (exactMatch) {
          matchedResponseItemIds.add(exactMatch.id);
          return exactMatch.id;
        }

        const normalizedName = requestedItem.name.trim().toLowerCase();
        const normalizedDescription = requestedItem.description?.trim() ?? '';
        const normalizedNotes = requestedItem.notes?.trim() ?? '';
        const contentMatch = updatedVisit.items.find(
          (item) =>
            !matchedResponseItemIds.has(item.id) &&
            item.name.trim().toLowerCase() === normalizedName &&
            item.rating === requestedItem.rating &&
            (item.description?.trim() ?? '') === normalizedDescription &&
            (item.notes?.trim() ?? '') === normalizedNotes,
        );
        if (contentMatch) {
          matchedResponseItemIds.add(contentMatch.id);
          return contentMatch.id;
        }

        return null;
      };

      for (const item of normalizedItems) {
        await deleteCollectionRecordsIgnoringNotFound(
          'visit_photos',
          item.deletePhotoIds,
          requestOptions,
        );

        if (item.newPhotos.length === 0) {
          continue;
        }

        const updatedItemId = resolveUpdatedItemId(item);
        if (!updatedItemId) {
          throw new Error('Updated visit item could not be matched for photo upload.');
        }

        await uploadVisitPhotos(
          visitId,
          updatedItemId,
          currentUserId,
          item.newPhotos,
          item.description || item.name,
          requestOptions,
        );
      }

      return updatedVisit;
    },
    {
      hasRestaurantNameUpdate: updates.restaurantName !== undefined,
      hasVisitedAtUpdate: updates.visitedAt !== undefined,
      hasVisibilityUpdate: updates.visibility !== undefined,
      hasItemsUpdate: updates.items !== undefined,
      itemCount: updates.items?.length,
      deletePhotoCount:
        updates.items?.reduce(
          (totalCount, item) => totalCount + (item.deletePhotoIds?.length ?? 0),
          0,
        ) ?? 0,
      newPhotoCount:
        updates.items?.reduce(
          (totalCount, item) => totalCount + (item.newPhotos?.length ?? 0),
          0,
        ) ?? 0,
    },
  );
}

export async function moveVisitItem(
  input: MoveVisitItemInput,
): Promise<MoveVisitItemResult> {
  return trackFeatureMutation(
    'visit.item.move',
    async () => {
      const trimmedItemId = input.itemId.trim();
      const trimmedDestinationVisitId = input.destinationVisitId.trim();

      if (!trimmedItemId) {
        throw new Error('Visit item is required.');
      }

      if (!trimmedDestinationVisitId) {
        throw new Error('Destination visit is required.');
      }

      return sendApiRequest<MoveVisitItemResult>(
        `/api/visit-items/${encodeURIComponent(trimmedItemId)}/move`,
        {
          method: 'POST',
          body: {
            destinationVisitId: trimmedDestinationVisitId,
          },
        },
      );
    },
    {
      destinationVisitId: input.destinationVisitId.trim(),
      itemId: input.itemId.trim(),
    },
  );
}

export async function convertVisitItemToFoodProduct(
  input: ConvertVisitItemToFoodProductInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<ConvertVisitItemToFoodProductResult> {
  return trackFeatureMutation(
    'visit.item.convert-to-food-product',
    async () => {
      const trimmedItemId = input.itemId.trim();
      if (!trimmedItemId) {
        throw new Error('Visit item is required.');
      }

      return sendApiRequest<ConvertVisitItemToFoodProductResult>(
        `/api/visit-items/${encodeURIComponent(trimmedItemId)}/convert-to-food-product`,
        {
          method: 'POST',
          headers: resolveFeatureWriteHeaders(requestOptions),
          body: {},
        },
      );
    },
    {
      itemId: input.itemId.trim(),
    },
  );
}

export async function deleteVisit(
  visitId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<void> {
  return trackFeatureMutation('visit.delete', async () => {
    try {
      await deleteCollectionRecord('visits', visitId, {
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
