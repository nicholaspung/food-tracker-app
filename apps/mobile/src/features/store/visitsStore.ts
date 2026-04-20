import { pb } from '../../lib/pocketbase';
import { sendApiRequest } from './pocketbaseGateway';
import {
  getAuthenticatedUserId,
  getDefaultVisitVisibility,
  isNotFoundError,
  normalizeModerationContentStatus,
  normalizeStoredVisibility,
  nowIso,
  trackFeatureMutation,
} from './featureStoreShared';
import type {
  CreateVisitInput,
  UpdateVisitInput,
} from './featureStore';
import { markNoteUsed } from './notesStore';
import type { VisitRecord } from '../models';
import { uploadVisitPhotos } from './visitPhotoUploads';

export type {
  CreateVisitInput,
  UpdateVisitInput,
} from './featureStore';

interface VisitApiItemRecord {
  id: string;
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
