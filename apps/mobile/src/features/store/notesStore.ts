import { pb } from '../../lib/pocketbase';
import type { NoteRecord } from '../models';
import type {
  CreateNoteInput,
  ListNotesPageInput,
  MarkNoteUsedInput,
  NoteDetailRecord,
  NoteCountSummary,
  NoteOverviewItemRecord,
  NoteOverviewPage,
  NotePhotoRecord,
  NotePhotoUploadInput,
  UpdateNoteInput,
} from './featureStore';
import {
  buildOrFilter,
  createEmptyPaginatedResult,
  getAuthenticatedUserId,
  isNotFoundError,
  resolvePaginationInput,
  trackFeatureMutation,
} from './featureStoreShared';
import { listCollectionRecords, sendApiRequest } from './pocketbaseGateway';

export type {
  CreateNoteInput,
  ListNotesPageInput,
  MarkNoteUsedInput,
  NoteDetailRecord,
  NoteCountSummary,
  NoteOverviewItemRecord,
  NoteOverviewPage,
  NotePhotoRecord,
  UpdateNoteInput,
} from './featureStore';

interface ReadRequestOptions {
  signal?: AbortSignal;
}

interface RestaurantCollectionRecord {
  name?: string;
}

interface NoteCollectionRecord {
  id: string;
  user: string;
  content: string;
  location_text?: string;
  latitude?: number;
  longitude?: number;
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

interface NoteOverviewPhotoPreviewApiRecord {
  id: string;
  photo: string;
  count: number;
}

interface NoteOverviewApiRecord {
  id: string;
  content: string;
  locationText?: string;
  status?: 'draft' | 'used';
  restaurantId?: string;
  restaurantName?: string;
  usedInVisitId?: string;
  usedInFoodItemId?: string;
  createdAt: string;
  updatedAt: string;
  photoPreview?: NoteOverviewPhotoPreviewApiRecord;
}

interface NoteOverviewApiResponse {
  items?: NoteOverviewApiRecord[];
  summary?: NoteCountSummary;
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
  hasNextPage?: boolean;
}

interface NoteDetailApiResponse {
  note?: NoteOverviewApiRecord | null;
  photos?: NotePhotoRecord[];
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
    locationText: record.location_text?.trim() || undefined,
    status: normalizeNoteStatus(record.status),
    restaurantId: record.restaurant,
    restaurantName: record.expand?.restaurant?.name?.trim() || undefined,
    usedInVisitId: record.usedInVisit,
    usedInFoodItemId: record.usedInFoodItem,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

function mapNoteOverviewApiRecord(record: NoteOverviewApiRecord): NoteOverviewItemRecord {
  const normalizedContent = record.content?.trim() ?? '';

  return {
    id: record.id,
    title: buildNoteTitle(normalizedContent),
    content: normalizedContent,
    locationText: record.locationText?.trim() || undefined,
    status: normalizeNoteStatus(record.status),
    restaurantId: record.restaurantId?.trim() || undefined,
    restaurantName: record.restaurantName?.trim() || undefined,
    usedInVisitId: record.usedInVisitId?.trim() || undefined,
    usedInFoodItemId: record.usedInFoodItemId?.trim() || undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    photoPreview: record.photoPreview
      ? {
          id: record.photoPreview.id,
          photo: record.photoPreview.photo,
          count: record.photoPreview.count,
        }
      : undefined,
  };
}

function createEmptyNoteOverviewPage(input?: ListNotesPageInput): NoteOverviewPage {
  return {
    ...createEmptyPaginatedResult<NoteOverviewItemRecord>(input),
    summary: {
      allCount: 0,
      draftCount: 0,
      usedCount: 0,
    },
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

export async function getNoteById(noteId: string, options?: ReadRequestOptions): Promise<NoteRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const record = await pb.collection('notes').getOne<NoteCollectionRecord>(noteId, {
      expand: 'restaurant',
      signal: options?.signal,
    });
    return mapNoteCollectionRecord(record);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getNoteDetail(
  noteId: string,
  options?: ReadRequestOptions,
): Promise<NoteDetailRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  const trimmedNoteId = noteId.trim();
  if (!trimmedNoteId) {
    return null;
  }

  try {
    const response = await sendApiRequest<NoteDetailApiResponse>(`/api/notes/${encodeURIComponent(trimmedNoteId)}`, {
      method: 'GET',
      signal: options?.signal,
    });

    if (!response.note) {
      return null;
    }

    return {
      note: mapNoteOverviewApiRecord(response.note),
      photos: response.photos ?? [],
    };
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
      const trimmedLocationText = input.locationText?.trim() || '';
      if (!content) {
        throw new Error('Note content is required.');
      }

      const payload: Record<string, unknown> = {
        user: currentUserId,
        content,
        location_text: trimmedLocationText,
        latitude: null,
        longitude: null,
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
      hasLocationText: Boolean(input.locationText?.trim()),
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

      if (updates.locationText !== undefined) {
        payload.location_text = updates.locationText.trim() || '';
      }

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
      hasLocationUpdate: updates.locationText !== undefined,
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

export async function markNoteUsed(input: MarkNoteUsedInput): Promise<void> {
  const trimmedNoteId = input.noteId.trim();
  if (!trimmedNoteId) {
    throw new Error('Note id is required.');
  }

  await trackFeatureMutation(
    'note.mark_used',
    async () => {
      try {
        const payload: Record<string, unknown> = {
          status: 'used',
        };

        const trimmedVisitId = input.usedInVisitId?.trim();
        const trimmedFoodItemId = input.usedInFoodItemId?.trim();
        if (trimmedVisitId) {
          payload.usedInVisit = trimmedVisitId;
        }
        if (trimmedFoodItemId) {
          payload.usedInFoodItem = trimmedFoodItemId;
        }

        await pb.collection('notes').update(trimmedNoteId, payload);
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }
    },
    {
      hasFoodItemLink: Boolean(input.usedInFoodItemId?.trim()),
      hasVisitLink: Boolean(input.usedInVisitId?.trim()),
    },
  );
}

export async function listNotePhotosForNote(
  noteId: string,
  options?: ReadRequestOptions,
): Promise<NotePhotoRecord[]> {
  const trimmedNoteId = noteId.trim();
  if (!trimmedNoteId) {
    return [];
  }

  return listNotePhotosForNoteIds([trimmedNoteId], options);
}

async function listNotePhotosForNoteIds(
  noteIds: string[],
  options?: ReadRequestOptions,
): Promise<NotePhotoRecord[]> {
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
      signal: options?.signal,
    });
    records.push(...chunkRecords);
  }

  return records;
}

export async function listNotesOverviewPage(input?: ListNotesPageInput): Promise<NoteOverviewPage> {
  if (!pb.authStore.record?.id) {
    return createEmptyNoteOverviewPage(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const status = input?.status === 'draft' || input?.status === 'used' ? input.status : 'all';

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    status,
  });

  const response = await sendApiRequest<NoteOverviewApiResponse>(`/api/notes/overview?${query.toString()}`, {
    method: 'GET',
    signal: input?.signal,
  });

  return {
    items: (response.items ?? []).map(mapNoteOverviewApiRecord),
    summary: response.summary,
    page: response.page ?? page,
    pageSize: response.pageSize ?? pageSize,
    totalItems: response.totalItems,
    totalPages: response.totalPages,
    hasNextPage: response.hasNextPage ?? false,
  };
}
