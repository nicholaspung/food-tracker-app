import { ClientResponseError } from 'pocketbase';

import { pb } from '../../lib/pocketbase';
import type { VisitPhotoUploadInput } from './featureStore';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import { resolveFeatureWriteHeaders } from './featureStoreShared';

function buildVisitPhotoFormData(
  visitId: string | undefined,
  foodItemId: string,
  userId: string,
  photo: VisitPhotoUploadInput,
  caption?: string,
): FormData {
  const formData = new FormData();
  if (visitId) {
    formData.append('visit', visitId);
  }
  formData.append('food_item', foodItemId);
  formData.append('user', userId);
  formData.append('photo', {
    uri: photo.uri,
    name: photo.name,
    type: photo.mimeType,
  } as unknown as Blob);

  const trimmedCaption = caption?.trim();
  if (trimmedCaption) {
    formData.append('caption', trimmedCaption);
  }

  return formData;
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

  for (const photo of photos) {
    const formData = buildVisitPhotoFormData(visitId, foodItemId, userId, photo, caption);
    try {
      await pb.collection('visit_photos').create(formData, {
        headers: resolveFeatureWriteHeaders(requestOptions),
      });
    } catch (error) {
      if (error instanceof ClientResponseError && error.status !== 429) {
        throw normalizeVisitPhotoUploadError(error, photo);
      }

      throw error;
    }
  }
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
