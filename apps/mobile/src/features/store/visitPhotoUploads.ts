import { pb } from '../../lib/pocketbase';
import type { VisitPhotoUploadInput } from './featureStore';

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
): Promise<void> {
  if (photos.length === 0) {
    return;
  }

  for (const photo of photos) {
    const formData = buildVisitPhotoFormData(visitId, foodItemId, userId, photo, caption);
    await pb.collection('visit_photos').create(formData);
  }
}
