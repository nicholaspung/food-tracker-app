import { pb } from '../../lib/pocketbase';
import type { NoteRecord } from '../models';
import type {
  CreateNoteInput,
  ListNotesPageInput,
  NoteCountSummary,
  NotePhotoRecord,
  NotePhotoUploadInput,
  PaginatedResult,
  UpdateNoteInput,
} from './featureStore';
import {
  buildOrFilter,
  createEmptyPaginatedResult,
  escapeFilterValue,
  getAuthenticatedUserId,
  isNotFoundError,
  mapPaginatedResult,
  resolvePaginationInput,
  trackFeatureMutation,
} from './featureStoreShared';
import { listCollectionPage, listCollectionRecords, sendApiRequest } from './pocketbaseGateway';

export type {
  CreateNoteInput,
  ListNotesPageInput,
  NoteCountSummary,
  NotePhotoRecord,
  UpdateNoteInput,
} from './featureStore';

interface RestaurantCollectionRecord {
  name?: string;
}

interface NoteCollectionRecord {
  id: string;
  user: string;
  content: string;
  restaurant?: string;
  status?: 'draft' | 'used';
  usedInVisit?: string;
  usedInFoodItem?: string;
  created: string;
  updated: string;
  expand?: {
    restaurant?: RestaurantCollectionRecord;
  };
}

function normalizeNoteStatus(status: unknown): NoteRecord['status'] {
  return status === 'used' ? 'used' : 'draft';
}

function buildNoteTitle(content: string): string {
  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return 'Note';
  }

  if (firstLine.length <= 48) {
    return firstLine;
  }

  return `${firstLine.slice(0, 45).trimEnd()}...`;
}

function buildNoteContent(title: string | undefined, content: string | undefined): string {
  const trimmedTitle = title?.trim() ?? '';
  const trimmedContent = content?.trim() ?? '';

  if (trimmedTitle && trimmedContent) {
    if (trimmedContent.toLowerCase().startsWith(trimmedTitle.toLowerCase())) {
      return trimmedContent;
    }

    return `${trimmedTitle}\n\n${trimmedContent}`;
  }

  return trimmedContent || trimmedTitle;
}

function mapNoteCollectionRecord(record: NoteCollectionRecord): NoteRecord {
  const normalizedContent = record.content?.trim() ?? '';

  return {
    id: record.id,
    title: buildNoteTitle(normalizedContent),
    content: normalizedContent,
    status: normalizeNoteStatus(record.status),
    restaurantId: record.restaurant,
    restaurantName: record.expand?.restaurant?.name?.trim() || undefined,
    usedInVisitId: record.usedInVisit,
    usedInFoodItemId: record.usedInFoodItem,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

function buildNotePhotoFormData(
  noteId: string,
  userId: string,
  photo: NotePhotoUploadInput,
): FormData {
  const formData = new FormData();
  formData.append('note', noteId);
  formData.append('user', userId);
  formData.append('photo', {
    uri: photo.uri,
    name: photo.name,
    type: photo.mimeType,
  } as unknown as Blob);
  return formData;
}

async function uploadNotePhotos(
  noteId: string,
  userId: string,
  photos: NotePhotoUploadInput[],
): Promise<void> {
  if (photos.length === 0) {
    return;
  }

  for (const photo of photos) {
    const formData = buildNotePhotoFormData(noteId, userId, photo);
    await pb.collection('note_photos').create(formData);
  }
}

export async function getNoteById(noteId: string): Promise<NoteRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const record = await pb.collection('notes').getOne<NoteCollectionRecord>(noteId, {
      expand: 'restaurant',
    });
    return mapNoteCollectionRecord(record);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function createNote(input: CreateNoteInput): Promise<NoteRecord> {
  return trackFeatureMutation(
    'note.create',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const content = buildNoteContent(input.title, input.content);
      if (!content) {
        throw new Error('Note content is required.');
      }

      const payload: Record<string, unknown> = {
        user: currentUserId,
        content,
        status: 'draft',
      };

      const record = await pb.collection('notes').create<NoteCollectionRecord>(
        payload,
        {
          expand: 'restaurant',
        },
      );

      await uploadNotePhotos(record.id, currentUserId, input.photos ?? []);

      return mapNoteCollectionRecord(record);
    },
    {
      photoCount: input.photos?.length ?? 0,
      hasRating: input.rating !== undefined,
    },
  );
}

export async function updateNote(noteId: string, updates: UpdateNoteInput): Promise<NoteRecord> {
  return trackFeatureMutation(
    'note.update',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const payload: Record<string, unknown> = {};

      if (updates.title !== undefined || updates.content !== undefined) {
        const content = buildNoteContent(updates.title, updates.content);
        if (!content) {
          throw new Error('Note content is required.');
        }

        payload.content = content;
      }

      payload.location_text = '';
      payload.latitude = null;
      payload.longitude = null;

      if (updates.deletePhotoIds && updates.deletePhotoIds.length > 0) {
        for (const photoId of updates.deletePhotoIds) {
          try {
            await pb.collection('note_photos').delete(photoId);
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error;
            }
          }
        }
      }

      const record =
        Object.keys(payload).length > 0
          ? await pb.collection('notes').update<NoteCollectionRecord>(noteId, payload, {
              expand: 'restaurant',
            })
          : await pb.collection('notes').getOne<NoteCollectionRecord>(noteId, {
              expand: 'restaurant',
            });

      await uploadNotePhotos(noteId, currentUserId, updates.newPhotos ?? []);

      return mapNoteCollectionRecord(record);
    },
    {
      hasContentUpdate: updates.title !== undefined || updates.content !== undefined,
      clearsLegacyLocationData: true,
      newPhotoCount: updates.newPhotos?.length ?? 0,
      deletePhotoCount: updates.deletePhotoIds?.length ?? 0,
    },
  );
}

export async function deleteNote(noteId: string): Promise<void> {
  return trackFeatureMutation('note.delete', async () => {
    try {
      await pb.collection('notes').delete(noteId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function listNotePhotosForNote(noteId: string): Promise<NotePhotoRecord[]> {
  const trimmedNoteId = noteId.trim();
  if (!trimmedNoteId) {
    return [];
  }

  return listNotePhotosForNoteIds([trimmedNoteId]);
}

export async function listNotePhotosForNoteIds(noteIds: string[]): Promise<NotePhotoRecord[]> {
  if (!pb.authStore.record?.id || noteIds.length === 0) {
    return [];
  }

  const records: NotePhotoRecord[] = [];
  const chunkSize = 20;
  for (let index = 0; index < noteIds.length; index += chunkSize) {
    const chunk = noteIds.slice(index, index + chunkSize);
    const chunkRecords = await listCollectionRecords<NotePhotoRecord>('note_photos', {
      filter: buildOrFilter('note', chunk),
      sort: 'created',
      fields: 'id,note,photo,created',
    });
    records.push(...chunkRecords);
  }

  return records;
}

export async function listNotesPage(input?: ListNotesPageInput): Promise<PaginatedResult<NoteRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const currentUserId = getAuthenticatedUserId();
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const status = input?.status === 'draft' || input?.status === 'used' ? input.status : 'all';
  const filter =
    status === 'all'
      ? `user = "${escapedCurrentUserId}"`
      : `user = "${escapedCurrentUserId}" && status = "${status}"`;

  const pageResult = await listCollectionPage<NoteCollectionRecord>('notes', {
    page,
    pageSize,
    filter,
    expand: 'restaurant',
    sort: '-updated,-created',
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapNoteCollectionRecord));
}

export async function getNoteCountSummary(): Promise<NoteCountSummary> {
  if (!pb.authStore.record?.id) {
    return {
      allCount: 0,
      draftCount: 0,
      usedCount: 0,
    };
  }

  return sendApiRequest<NoteCountSummary>('/api/notes/summary', {
    method: 'GET',
  });
}
