import { pb } from '../../lib/pocketbase';
import type { FoodProductRecord } from '../models';
import type {
  CreateFoodProductInput,
  UpdateFoodProductInput,
  VisitPhotoRecord,
} from './featureStore';
import { markNoteUsed } from './notesStore';
import {
  buildOrFilter,
  getAuthenticatedUserId,
  getDefaultVisitVisibility,
  isNotFoundError,
  nowIso,
  normalizeModerationContentStatus,
  normalizeStoredVisibility,
  resolveExpandedUserName,
  trackFeatureMutation,
} from './featureStoreShared';
import { listCollectionRecords, sendApiRequest } from './pocketbaseGateway';
import type {
  FoodItemCollectionRecord,
} from './pocketbaseRecordTypes';
import { uploadVisitPhotos } from './visitPhotoUploads';

export type {
  CreateFoodProductInput,
  UpdateFoodProductInput,
} from './featureStore';

export interface FoodProductCategorySuggestion {
  label: string;
  normalizedLabel: string;
  useCount: number;
  lastUsedAt: string;
}

interface FoodProductCategorySuggestionsResponse {
  items: FoodProductCategorySuggestion[];
}

interface ReadRequestOptions {
  signal?: AbortSignal;
}

interface VisitPhotoCollectionRecord {
  id: string;
  food_item?: string;
  user?: string;
  photo: string;
  created: string;
}

function normalizeFoodProductCategory(value: string | null | undefined): string | undefined {
  const normalizedValue = value?.replace(/\s+/g, ' ').trim() ?? '';
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function isFoodProductCollectionRecord(record: FoodItemCollectionRecord): boolean {
  return record.itemType === 'food-product';
}

function mapFoodProductCollectionRecord(record: FoodItemCollectionRecord): FoodProductRecord {
  return {
    id: record.id,
    restaurantName: record.expand?.visit?.expand?.restaurant?.name?.trim() || 'Food Product',
    itemCategory: normalizeFoodProductCategory(record.itemCategory),
    itemName: record.name,
    locationText: record.location_text?.trim() || undefined,
    rating: record.rating,
    notes: record.notes,
    userId: record.user,
    userName: resolveExpandedUserName(record.expand?.user),
    visibility: normalizeStoredVisibility(record.visibility),
    moderationStatus: normalizeModerationContentStatus(record.moderationStatus),
    itemDate: record.itemDate,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

function mapVisitPhotoCollectionRecord(record: VisitPhotoCollectionRecord): VisitPhotoRecord {
  return {
    id: record.id,
    food_item: record.food_item?.trim() || undefined,
    user: record.user?.trim() || undefined,
    photo: record.photo.trim(),
    collectionName: 'visit_photos',
    created: record.created,
  };
}

export async function getFoodProductById(
  foodProductId: string,
  options?: { signal?: AbortSignal },
): Promise<FoodProductRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const record = await pb.collection('food_items').getOne<FoodItemCollectionRecord>(foodProductId, {
      expand: 'user,visit,visit.restaurant',
      signal: options?.signal,
    });
    if (!isFoodProductCollectionRecord(record)) {
      return null;
    }
    return mapFoodProductCollectionRecord(record);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function listFoodProductPhotos(
  foodProductId: string,
  options?: ReadRequestOptions,
): Promise<VisitPhotoRecord[]> {
  const trimmedFoodProductId = foodProductId.trim();
  if (!pb.authStore.record?.id || !trimmedFoodProductId) {
    return [];
  }

  const records = await listCollectionRecords<VisitPhotoCollectionRecord>('visit_photos', {
    fields: 'id,food_item,user,photo,created',
    filter: buildOrFilter('food_item', [trimmedFoodProductId]),
    pageSize: 100,
    signal: options?.signal,
    sort: '-created',
  });

  return records.map(mapVisitPhotoCollectionRecord);
}

export async function listFoodProductCategorySuggestions(
  query: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<FoodProductCategorySuggestion[]> {
  const params = new URLSearchParams();
  const normalizedQuery = query.replace(/\s+/g, ' ').trim();
  const normalizedLimit = typeof options?.limit === 'number' ? Math.max(1, Math.min(12, Math.floor(options.limit))) : 8;

  params.set('limit', String(normalizedLimit));
  if (normalizedQuery) {
    params.set('query', normalizedQuery);
  }

  const response = await sendApiRequest<FoodProductCategorySuggestionsResponse>(
    `/api/food-products/category-suggestions?${params.toString()}`,
    {
      method: 'GET',
      signal: options?.signal,
    },
  );

  return response.items ?? [];
}

export async function createFoodProduct(input: CreateFoodProductInput): Promise<FoodProductRecord> {
  return trackFeatureMutation(
    'food_product.create',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const itemName = input.itemName.trim();
      const normalizedCategory = normalizeFoodProductCategory(input.itemCategory);
      if (!itemName) {
        throw new Error('Food product name is required.');
      }
      const payload: Record<string, unknown> = {
        name: itemName,
        rating: input.rating,
        user: currentUserId,
        itemType: 'food-product',
        visibility: input.visibility ?? getDefaultVisitVisibility(),
        itemDate: input.itemDate ?? nowIso(),
        location_text: input.locationText?.trim() || '',
        latitude: null,
        longitude: null,
      };

      if (input.notes !== undefined) {
        payload.notes = input.notes.trim() || '';
      }

      if (normalizedCategory !== undefined) {
        payload.itemCategory = normalizedCategory;
      }

      const record = await pb.collection('food_items').create<FoodItemCollectionRecord>(payload, {
        expand: 'user,visit,visit.restaurant',
      });

      if (input.photo) {
        await uploadVisitPhotos(undefined, record.id, currentUserId, [input.photo]);
      }

      if (input.sourceNoteId) {
        try {
          await markNoteUsed({
            noteId: input.sourceNoteId,
            usedInFoodItemId: record.id,
          });
        } catch {
          // Best effort only: food product create should still succeed if note linking fails.
        }
      }

      return {
        ...mapFoodProductCollectionRecord(record),
        sourceNoteId: input.sourceNoteId,
      };
    },
    {
      rating: input.rating,
      visibility: input.visibility ?? getDefaultVisitVisibility(),
      hasPhoto: Boolean(input.photo),
      hasSourceNote: Boolean(input.sourceNoteId),
      hasItemCategory: Boolean(normalizeFoodProductCategory(input.itemCategory)),
      hasLocationText: Boolean(input.locationText?.trim()),
    },
  );
}

export async function updateFoodProduct(
  foodProductId: string,
  updates: UpdateFoodProductInput,
): Promise<FoodProductRecord> {
  return trackFeatureMutation(
    'food_product.update',
    async () => {
      const currentRecord = await pb.collection('food_items').getOne<FoodItemCollectionRecord>(foodProductId);
      if (!isFoodProductCollectionRecord(currentRecord)) {
        throw new Error('Food product record not found.');
      }

      const payload: Record<string, unknown> = {};
      if (updates.itemName !== undefined) {
        const trimmedName = updates.itemName.trim();
        if (!trimmedName) {
          throw new Error('Food product name is required.');
        }
        payload.name = trimmedName;
      }

      if (updates.rating !== undefined) {
        payload.rating = updates.rating;
      }

      if (updates.locationText !== undefined) {
        payload.location_text = updates.locationText.trim() || '';
      }

      if (updates.notes !== undefined) {
        payload.notes = updates.notes.trim() || '';
      }

      if (updates.itemCategory !== undefined) {
        payload.itemCategory = normalizeFoodProductCategory(updates.itemCategory ?? undefined) ?? '';
      }

      if (updates.visibility !== undefined) {
        payload.visibility = updates.visibility;
      }

      if (updates.itemDate !== undefined) {
        payload.itemDate = updates.itemDate;
      }

      payload.latitude = null;
      payload.longitude = null;

      const updatedRecord =
        Object.keys(payload).length > 0
          ? await pb.collection('food_items').update<FoodItemCollectionRecord>(foodProductId, payload, {
              expand: 'user,visit,visit.restaurant',
            })
          : await pb.collection('food_items').getOne<FoodItemCollectionRecord>(foodProductId, {
              expand: 'user,visit,visit.restaurant',
            });

      if (updates.newPhoto) {
        const currentUserId = getAuthenticatedUserId();
        await uploadVisitPhotos(undefined, foodProductId, currentUserId, [updates.newPhoto]);
      }

      const deletePhotoIds = Array.from(
        new Set(
          (updates.deletePhotoIds ?? [])
            .map((photoId) => photoId.trim())
            .filter((photoId) => photoId.length > 0),
        ),
      );
      for (const photoId of deletePhotoIds) {
        try {
          await pb.collection('visit_photos').delete(photoId);
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
        }
      }

      return mapFoodProductCollectionRecord(updatedRecord);
    },
    {
      hasItemNameUpdate: updates.itemName !== undefined,
      hasRatingUpdate: updates.rating !== undefined,
      hasLocationUpdate: updates.locationText !== undefined,
      hasNotesUpdate: updates.notes !== undefined,
      hasVisibilityUpdate: updates.visibility !== undefined,
      hasItemDateUpdate: updates.itemDate !== undefined,
      hasNewPhoto: Boolean(updates.newPhoto),
      deletePhotoCount: updates.deletePhotoIds?.length ?? 0,
      clearsLegacyLocationData: true,
    },
  );
}

export async function deleteFoodProduct(foodProductId: string): Promise<void> {
  return trackFeatureMutation('food_product.delete', async () => {
    try {
      await pb.collection('food_items').delete(foodProductId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}
