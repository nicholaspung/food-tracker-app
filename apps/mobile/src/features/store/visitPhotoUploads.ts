import { File, UploadType, type UploadResult } from 'expo-file-system';
import { ClientResponseError } from 'pocketbase';

import { env } from '../../config/env';
import { pb } from '../../lib/pocketbase';
import type { VisitPhotoUploadInput } from './featureStore';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  deriveFeatureWriteRecordId,
  resolveFeatureWriteHeaders,
} from './featureStoreShared';
import { getCollectionRecord } from './pocketbaseGateway';

interface VisitPhotoCollectionRecord {
  food_item?: string;
  id: string;
  user?: string;
}

function buildVisitPhotoUploadParameters(
  visitId: string | undefined,
  foodItemId: string,
  userId: string,
  caption?: string,
  recordId?: string,
): Record<string, string> {
  const parameters: Record<string, string> = {
    food_item: foodItemId,
    user: userId,
  };

  if (visitId) {
    parameters.visit = visitId;
  }
  if (recordId) {
    parameters.id = recordId;
  }

  const trimmedCaption = caption?.trim();
  if (trimmedCaption) {
    parameters.caption = trimmedCaption;
  }

  return parameters;
}

export async function uploadVisitPhotos(
  visitId: string | undefined,
  foodItemId: string,
  userId: string,
  photos: VisitPhotoUploadInput[],
  caption?: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<void> {
  if (photos.length === 0) {
    return;
  }

  for (const [photoIndex, photo] of photos.entries()) {
    throwIfAborted(requestOptions?.signal);
    const replayRecordId = deriveFeatureWriteRecordId(
      requestOptions,
      `visit-photo:${foodItemId}:${photoIndex}`,
    );

    try {
      const uploadResult = await uploadVisitPhotoFile(
        visitId,
        foodItemId,
        userId,
        photo,
        caption,
        replayRecordId,
        requestOptions,
      );
      assertVisitPhotoUploadSucceeded(uploadResult);
    } catch (error) {
      if (
        replayRecordId &&
        await isMatchingVisitPhotoRecord(
          replayRecordId,
          foodItemId,
          userId,
          requestOptions,
        )
      ) {
        continue;
      }

      if (error instanceof ClientResponseError && error.status !== 429) {
        throw normalizeVisitPhotoUploadError(error, photo);
      }

      throw error;
    }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }

  const error = new Error('Aborted');
  error.name = 'AbortError';
  throw error;
}

async function uploadVisitPhotoFile(
  visitId: string | undefined,
  foodItemId: string,
  userId: string,
  photo: VisitPhotoUploadInput,
  caption: string | undefined,
  recordId: string | undefined,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<UploadResult> {
  const file = new File(photo.uri);
  return file.upload(buildVisitPhotosCollectionUrl(), {
    fieldName: 'photo',
    headers: resolveVisitPhotoUploadHeaders(requestOptions),
    httpMethod: 'POST',
    mimeType: photo.mimeType,
    parameters: buildVisitPhotoUploadParameters(visitId, foodItemId, userId, caption, recordId),
    sessionType: 'foreground',
    uploadType: UploadType.MULTIPART,
  });
}

async function isMatchingVisitPhotoRecord(
  recordId: string,
  foodItemId: string,
  userId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<boolean> {
  try {
    const record = await getCollectionRecord<VisitPhotoCollectionRecord>(
      'visit_photos',
      recordId,
      {
        fields: 'id,food_item,user',
        headers: resolveFeatureWriteHeaders(requestOptions),
        ...(requestOptions?.signal ? { signal: requestOptions.signal } : {}),
      },
    );
    return record.food_item === foodItemId && record.user === userId;
  } catch {
    return false;
  }
}

function resolveVisitPhotoUploadHeaders(
  requestOptions?: FeatureWriteRequestOptions,
): Record<string, string> | undefined {
  const headers = { ...(resolveFeatureWriteHeaders(requestOptions) ?? {}) };
  const authToken = pb.authStore.token?.trim();

  if (authToken && !hasHeader(headers, 'Authorization')) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function assertVisitPhotoUploadSucceeded(uploadResult: UploadResult): void {
  if (uploadResult.status >= 200 && uploadResult.status < 300) {
    return;
  }

  throw new ClientResponseError({
    response: parsePocketBaseUploadErrorResponse(uploadResult.body),
    status: uploadResult.status,
    url: buildVisitPhotosCollectionUrl(),
  });
}

function buildVisitPhotosCollectionUrl(): string {
  return `${env.pocketbaseUrl.replace(/\/+$/, '')}/api/collections/visit_photos/records`;
}

function parsePocketBaseUploadErrorResponse(body: string): Record<string, unknown> {
  try {
    const parsedBody = JSON.parse(body) as unknown;
    if (parsedBody && typeof parsedBody === 'object') {
      return parsedBody as Record<string, unknown>;
    }
  } catch {
    // PocketBase normally returns JSON errors, but native uploads can surface plain text.
  }

  return {
    data: {},
    message: body.trim() || 'Failed to create record.',
  };
}

function normalizeVisitPhotoUploadError(
  error: ClientResponseError,
  photo: VisitPhotoUploadInput,
): Error {
  const fieldMessage = resolvePocketBaseFieldMessage(error);
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

function resolvePocketBaseFieldMessage(error: ClientResponseError): string | null {
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
