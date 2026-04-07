import { pb } from '../../lib/pocketbase';
import type { QuickTrackRecord } from '../models';
import type {
  CreateQuickTrackInput,
  ListQuickTracksPageInput,
  PaginatedResult,
  UpdateQuickTrackInput,
} from './featureStore';
import {
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
  FoodItemCollectionRecord,
} from './pocketbaseRecordTypes';
import { listCollectionPage } from './pocketbaseGateway';
import { uploadVisitPhotos } from './visitPhotoUploads';

export type {
  CreateQuickTrackInput,
  ListQuickTracksPageInput,
  UpdateQuickTrackInput,
} from './featureStore';

function mapQuickTrackCollectionRecord(record: FoodItemCollectionRecord): QuickTrackRecord {
  return {
    id: record.id,
    restaurantName: record.expand?.visit?.expand?.restaurant?.name?.trim() || 'Quick Track',
    itemCategory: record.itemCategory,
    itemName: record.name,
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

export async function listQuickTracksPage(input?: ListQuickTracksPageInput): Promise<PaginatedResult<QuickTrackRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const currentUserId = getAuthenticatedUserId();
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const scope = input?.scope ?? 'all';
  const scopeFilter =
    scope === 'mine'
      ? `user = "${escapedCurrentUserId}"`
      : scope === 'friends'
        ? `user != "${escapedCurrentUserId}"`
        : undefined;
  const searchFilter = buildSearchFilter(['name', 'itemCategory', 'notes'], input?.search ?? '');
  const filter = combineFilterClauses('isQuickTrack = true', scopeFilter, searchFilter);

  const pageResult = await listCollectionPage<FoodItemCollectionRecord>('food_items', {
    page,
    pageSize,
    filter,
    expand: 'user,visit,visit.restaurant',
    sort: '-itemDate,-created',
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapQuickTrackCollectionRecord));
}

export async function getQuickTrackById(quickTrackId: string): Promise<QuickTrackRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const record = await pb.collection('food_items').getOne<FoodItemCollectionRecord>(quickTrackId, {
      expand: 'user,visit,visit.restaurant',
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
          await pb.collection('notes').update(input.sourceNoteId, {
            status: 'used',
            usedInFoodItem: record.id,
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

      payload.location_text = '';
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

      return mapQuickTrackCollectionRecord(updatedRecord);
    },
    {
      hasItemNameUpdate: updates.itemName !== undefined,
      hasRatingUpdate: updates.rating !== undefined,
      hasNotesUpdate: updates.notes !== undefined,
      hasVisibilityUpdate: updates.visibility !== undefined,
      hasItemDateUpdate: updates.itemDate !== undefined,
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
