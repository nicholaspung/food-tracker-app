import { File, UploadType, type UploadResult } from 'expo-file-system';
import { ClientResponseError } from 'pocketbase';

import { env } from '../../config/env';
import { pb } from '../../lib/pocketbase';
import { isRetryableStatus } from '../../offline/retryPolicy';
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
  deleteCollectionRecordsIgnoringNotFound,
  deriveFeatureWriteRecordId,
  type FeatureWriteRequestOptions,
  getAuthenticatedUserId,
  isNotFoundError,
  isRetryableFeatureStoreError,
  nowIso,
  resolveFeatureWriteHeaders,
  resolvePaginationInput,
  trackFeatureMutation,
} from './featureStoreShared';
import { parseNativeUploadErrorResponse } from './nativeUploadResponse';
import {
  createCollectionRecord,
  deleteCollectionRecord,
  getCollectionRecord,
  listCollectionRecords,
  sendApiRequest,
  updateCollectionRecord,
} from './pocketbaseGateway';

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
  usedAt?: string;
  created: string;
  updated: string;
  expand?: {
    restaurant?: RestaurantCollectionRecord;
  };
}

interface NotePhotoCollectionRecord {
  id: string;
  note: string;
  user: string;
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
    usedAt: record.usedAt?.trim() || undefined,
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

function buildNotePhotoUploadParameters(
  noteId: string,
  userId: string,
  photo: NotePhotoUploadInput,
  recordId?: string,
): Record<string, string> {
  const parameters: Record<string, string> = {
    note: noteId,
    user: userId,
  };

  if (recordId) {
    parameters.id = recordId;
  }

  const trimmedCapturedAt = photo.capturedAt?.trim();
  if (trimmedCapturedAt) {
    parameters.capturedAt = trimmedCapturedAt;
  }

  return parameters;
}

async function uploadNotePhotos(
  noteId: string,
  userId: string,
  photos: NotePhotoUploadInput[],
  requestOptions?: FeatureWriteRequestOptions,
): Promise<void> {
  if (photos.length === 0) {
    return;
  }

  for (const [photoIndex, photo] of photos.entries()) {
    const replayRecordId = deriveFeatureWriteRecordId(
      requestOptions,
      `note-photo:${noteId}:${photoIndex}`,
    );
    try {
      const uploadResult = await uploadNotePhotoFile(
        noteId,
        userId,
        photo,
        replayRecordId,
        requestOptions,
      );
      assertNotePhotoUploadSucceeded(uploadResult);
    } catch (error) {
      if (replayRecordId) {
        try {
          const existingPhoto = await getCollectionRecord<NotePhotoCollectionRecord>(
            'note_photos',
            replayRecordId,
            { headers: resolveFeatureWriteHeaders(requestOptions) },
          );
          if (existingPhoto.note === noteId && existingPhoto.user === userId) {
            continue;
          }
        } catch (recoveryError) {
          if (isRetryableFeatureStoreError(recoveryError)) {
            throw recoveryError;
          }
          // Preserve the original upload error when the deterministic record is absent.
        }
      }

      if (error instanceof ClientResponseError) {
        if (error.status === 0 || isRetryableStatus(error.status)) {
          throw error;
        }
        throw normalizeNotePhotoUploadError(error, photo);
      }

      throw error;
    }
  }
}

async function uploadNotePhotoFile(
  noteId: string,
  userId: string,
  photo: NotePhotoUploadInput,
  recordId: string | undefined,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<UploadResult> {
  const file = new File(photo.uri);
  return file.upload(buildNotePhotosCollectionUrl(), {
    fieldName: 'photo',
    headers: resolveNotePhotoUploadHeaders(requestOptions),
    httpMethod: 'POST',
    mimeType: photo.mimeType,
    parameters: buildNotePhotoUploadParameters(noteId, userId, photo, recordId),
    sessionType: 'foreground',
    uploadType: UploadType.MULTIPART,
  });
}

function resolveNotePhotoUploadHeaders(
  requestOptions?: FeatureWriteRequestOptions,
): Record<string, string> | undefined {
  const headers = { ...(resolveFeatureWriteHeaders(requestOptions) ?? {}) };
  const authToken = pb.authStore.token?.trim();

  if (authToken && !hasHeader(headers, 'Authorization')) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function assertNotePhotoUploadSucceeded(uploadResult: UploadResult): void {
  if (uploadResult.status >= 200 && uploadResult.status < 300) {
    return;
  }

  throw new ClientResponseError({
    response: parseNativeUploadErrorResponse(uploadResult.body, 'Failed to create record.'),
    status: uploadResult.status,
    url: buildNotePhotosCollectionUrl(),
  });
}

function buildNotePhotosCollectionUrl(): string {
  return `${env.pocketbaseUrl.replace(/\/+$/, '')}/api/collections/note_photos/records`;
}

function normalizeNotePhotoUploadError(
  error: ClientResponseError,
  photo: NotePhotoUploadInput,
): Error {
  const fieldMessage = resolvePocketBasePhotoFieldMessage(error);
  if (fieldMessage) {
    return new Error(`Could not upload ${photo.name}: ${fieldMessage}`);
  }

  const responseMessage = error.response?.message?.trim();
  if (
    responseMessage &&
    responseMessage.toLowerCase() !== 'failed to create record.'
  ) {
    return new Error(`Could not upload ${photo.name}: ${responseMessage}`);
  }

  return new Error(
    `Could not upload ${photo.name}. The image may be too large or in an unsupported format.`,
  );
}

function resolvePocketBasePhotoFieldMessage(error: ClientResponseError): string | null {
  const responseData = error.response?.data;
  if (!responseData || typeof responseData !== 'object') {
    return null;
  }

  const photoFieldData = (responseData as Record<string, unknown>).photo;
  if (
    photoFieldData &&
    typeof photoFieldData === 'object' &&
    'message' in photoFieldData &&
    typeof photoFieldData.message === 'string' &&
    photoFieldData.message.trim()
  ) {
    return photoFieldData.message.trim();
  }

  return null;
}

function hasHeader(headers: Record<string, string>, targetHeader: string): boolean {
  const normalizedTarget = targetHeader.toLowerCase();
  return Object.keys(headers).some((header) => header.toLowerCase() === normalizedTarget);
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

export async function createNote(
  input: CreateNoteInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<NoteRecord> {
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

      const replayRecordId = deriveFeatureWriteRecordId(requestOptions, 'note');
      if (replayRecordId) {
        payload.id = replayRecordId;
      }

      const collectionOptions = {
        expand: 'restaurant',
        headers: resolveFeatureWriteHeaders(requestOptions),
        ...(requestOptions?.signal ? { signal: requestOptions.signal } : {}),
      };

      let record: NoteCollectionRecord;
      try {
        record = await createCollectionRecord<NoteCollectionRecord>('notes', payload, collectionOptions);
      } catch (createError) {
        if (!replayRecordId) {
          throw createError;
        }

        try {
          const existingRecord = await getCollectionRecord<NoteCollectionRecord>(
            'notes',
            replayRecordId,
            collectionOptions,
          );
          if (existingRecord.user !== currentUserId) {
            throw createError;
          }
          record = existingRecord;
        } catch (recoveryError) {
          if (isRetryableFeatureStoreError(recoveryError)) {
            throw recoveryError;
          }
          throw createError;
        }
      }

      await uploadNotePhotos(record.id, currentUserId, input.photos ?? [], requestOptions);

      return mapNoteCollectionRecord(record);
    },
    {
      hasLocationText: Boolean(input.locationText?.trim()),
      photoCount: input.photos?.length ?? 0,
      hasRating: input.rating !== undefined,
    },
  );
}

export async function updateNote(
  noteId: string,
  updates: UpdateNoteInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<NoteRecord> {
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

      await deleteCollectionRecordsIgnoringNotFound(
        'note_photos',
        updates.deletePhotoIds ?? [],
        requestOptions,
      );

      const record =
        Object.keys(payload).length > 0
          ? await updateCollectionRecord<NoteCollectionRecord>('notes', noteId, payload, {
              expand: 'restaurant',
              headers: resolveFeatureWriteHeaders(requestOptions),
            })
          : await getCollectionRecord<NoteCollectionRecord>('notes', noteId, {
              expand: 'restaurant',
            });

      await uploadNotePhotos(noteId, currentUserId, updates.newPhotos ?? [], requestOptions);

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

export async function deleteNote(
  noteId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<void> {
  return trackFeatureMutation('note.delete', async () => {
    try {
      await deleteCollectionRecord('notes', noteId, {
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

export async function markNoteUsed(
  input: MarkNoteUsedInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<void> {
  const trimmedNoteId = input.noteId.trim();
  if (!trimmedNoteId) {
    throw new Error('Note id is required.');
  }

  await trackFeatureMutation(
    'note.mark_used',
    async () => {
      const trimmedVisitId = input.usedInVisitId?.trim();
      const trimmedFoodItemId = input.usedInFoodItemId?.trim();
      const trimmedUsedAt = input.usedAt?.trim();
      const payload: Record<string, unknown> = {
        status: 'used',
        usedAt: trimmedUsedAt || nowIso(),
      };

      if (trimmedVisitId) {
        payload.usedInVisit = trimmedVisitId;
      }

      if (trimmedFoodItemId) {
        payload.usedInFoodItem = trimmedFoodItemId;
      }

      try {
        await updateCollectionRecord('notes', trimmedNoteId, payload, {
          headers: resolveFeatureWriteHeaders(requestOptions),
          ...(requestOptions?.signal ? { signal: requestOptions.signal } : {}),
        });
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }
    },
    {
      hasFoodItemLink: Boolean(input.usedInFoodItemId?.trim()),
      hasVisitLink: Boolean(input.usedInVisitId?.trim()),
      hasUsedAtOverride: Boolean(input.usedAt?.trim()),
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
      fields: 'id,note,photo,created,capturedAt',
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
  const trimmedSearch = input?.search?.trim();

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    status,
  });
  if (trimmedSearch) {
    query.set('search', trimmedSearch);
  }

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
