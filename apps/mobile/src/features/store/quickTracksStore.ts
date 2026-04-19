import { pb } from '../../lib/pocketbase';
import type { QuickTrackRecord } from '../models';
import type {
  CreateQuickTrackInput,
  UpdateQuickTrackInput,
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
  normalizeQuickTrackVisibility,
  resolveExpandedUserName,
  trackFeatureMutation,
} from './featureStoreShared';
import { listCollectionRecords } from './pocketbaseGateway';
import type {
  FoodItemCollectionRecord,
} from './pocketbaseRecordTypes';
import { uploadVisitPhotos } from './visitPhotoUploads';

export type {
  CreateQuickTrackInput,
  UpdateQuickTrackInput,
} from './featureStore';

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

function mapQuickTrackCollectionRecord(record: FoodItemCollectionRecord): QuickTrackRecord {
  return {
    id: record.id,
    restaurantName: record.expand?.visit?.expand?.restaurant?.name?.trim() || 'Quick Track',
    itemCategory: record.itemCategory,
    itemName: record.name,
    locationText: record.location_text?.trim() || undefined,
    rating: record.rating,
    notes: record.notes,
    userId: record.user,
    userName: resolveExpandedUserName(record.expand?.user),
    visibility: normalizeQuickTrackVisibility(record.visibility),
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

export async function getQuickTrackById(
  quickTrackId: string,
  options?: { signal?: AbortSignal },
): Promise<QuickTrackRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const record = await pb.collection('food_items').getOne<FoodItemCollectionRecord>(quickTrackId, {
      expand: 'user,visit,visit.restaurant',
      signal: options?.signal,
    });
    if (record.isQuickTrack !== true) {
      return null;
    }
    return mapQuickTrackCollectionRecord(record);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function listQuickTrackPhotos(
  quickTrackId: string,
  options?: ReadRequestOptions,
): Promise<VisitPhotoRecord[]> {
  const trimmedQuickTrackId = quickTrackId.trim();
  if (!pb.authStore.record?.id || !trimmedQuickTrackId) {
    return [];
  }

  const records = await listCollectionRecords<VisitPhotoCollectionRecord>('visit_photos', {
    fields: 'id,food_item,user,photo,created',
    filter: buildOrFilter('food_item', [trimmedQuickTrackId]),
    pageSize: 100,
    signal: options?.signal,
    sort: '-created',
  });

  return records.map(mapVisitPhotoCollectionRecord);
}

export async function createQuickTrack(input: CreateQuickTrackInput): Promise<QuickTrackRecord> {
  return trackFeatureMutation(
    'quick_track.create',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const itemName = input.itemName.trim();
      if (!itemName) {
        throw new Error('Item name is required.');
      }
      const payload: Record<string, unknown> = {
        name: itemName,
        rating: input.rating,
        user: currentUserId,
        isQuickTrack: true,
        visibility: input.visibility ?? getDefaultVisitVisibility(),
        itemDate: input.itemDate ?? nowIso(),
        location_text: input.locationText?.trim() || '',
        latitude: null,
        longitude: null,
      };

      if (input.notes !== undefined) {
        payload.notes = input.notes.trim() || '';
      }

      if (input.itemCategory !== undefined) {
        payload.itemCategory = input.itemCategory;
      }

      const record = await pb.collection('food_items').create<FoodItemCollectionRecord>(
        payload,
        {
          expand: 'user,visit,visit.restaurant',
        },
      );

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
          // Best effort only: quick-track create should still succeed if note linking fails.
        }
      }

      return {
        ...mapQuickTrackCollectionRecord(record),
        sourceNoteId: input.sourceNoteId,
      };
    },
    {
      rating: input.rating,
      visibility: input.visibility ?? getDefaultVisitVisibility(),
      hasPhoto: Boolean(input.photo),
      hasSourceNote: Boolean(input.sourceNoteId),
      hasItemCategory: Boolean(input.itemCategory),
      hasLocationText: Boolean(input.locationText?.trim()),
    },
  );
}

export async function updateQuickTrack(
  quickTrackId: string,
  updates: UpdateQuickTrackInput,
): Promise<QuickTrackRecord> {
  return trackFeatureMutation(
    'quick_track.update',
    async () => {
      const currentRecord = await pb.collection('food_items').getOne<FoodItemCollectionRecord>(quickTrackId);
      if (currentRecord.isQuickTrack !== true) {
        throw new Error('Quick track record not found.');
      }

      const payload: Record<string, unknown> = {};
      if (updates.itemName !== undefined) {
        const trimmedName = updates.itemName.trim();
        if (!trimmedName) {
          throw new Error('Item name is required.');
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
        payload.itemCategory = updates.itemCategory ?? '';
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
          ? await pb.collection('food_items').update<FoodItemCollectionRecord>(quickTrackId, payload, {
              expand: 'user,visit,visit.restaurant',
            })
          : await pb.collection('food_items').getOne<FoodItemCollectionRecord>(quickTrackId, {
              expand: 'user,visit,visit.restaurant',
            });

      if (updates.newPhoto) {
        const currentUserId = getAuthenticatedUserId();
        await uploadVisitPhotos(undefined, quickTrackId, currentUserId, [updates.newPhoto]);
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

      return mapQuickTrackCollectionRecord(updatedRecord);
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

export async function deleteQuickTrack(quickTrackId: string): Promise<void> {
  return trackFeatureMutation('quick_track.delete', async () => {
    try {
      await pb.collection('food_items').delete(quickTrackId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}
