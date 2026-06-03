import {
  type CreateFoodProductInput,
  type CreateVisitInput,
  type VisitPhotoUploadInput,
} from '../store/featureStore';
import type { QueryClient } from '@tanstack/react-query';

import type { OfflineAwareFeatureWrite } from '../store/useOfflineAwareFeatureWrite';
import { createFoodProductWithOfflineSupport } from '../store/useFoodProductWrites';
import { createVisitWithOfflineSupport } from '../store/useVisitWrites';
import { persistSourceNoteUsed } from '../notes/sourceNoteCompletion';
import { isValidLocalDate, localDateStringToUTC } from '../../lib/dateFormatting';
import {
  buildCreateFoodProductInput,
  validateFoodProductForm,
  type FoodProductFormValues,
} from '../../lib/foodProductForm';
import type { RestaurantPhotoGroup } from './photoProcessingTypes';

export interface PhotoSubmissionDraftAsset {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
}

export interface RestaurantPhotoSubmissionForm {
  restaurantId: string;
  restaurantName: string;
  menuItemName: string;
  rating: number;
  description: string;
  notes: string;
  date: string;
}

export interface PhotoSubmissionResult {
  photoCount: number;
  queued: boolean;
  visitCount?: number;
}

interface SourceNoteSubmissionParams {
  noteId?: string;
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}

interface SubmitRestaurantPhotoEntriesParams extends SourceNoteSubmissionParams {
  photos: PhotoSubmissionDraftAsset[];
  restaurantPhotoGroups?: RestaurantPhotoGroup[];
  restaurantForms: Record<string, RestaurantPhotoSubmissionForm>;
  visitVisibility: 'friends' | 'private';
}

interface SubmitFoodProductPhotoEntriesParams extends SourceNoteSubmissionParams {
  foodProductForms: Record<string, FoodProductFormValues>;
  photos: PhotoSubmissionDraftAsset[];
}

function buildPhotoUploadInput(asset: PhotoSubmissionDraftAsset): VisitPhotoUploadInput {
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType,
  };
}

export function validateRestaurantPhotoSubmissionForm(
  form: RestaurantPhotoSubmissionForm,
): string | null {
  if (!form.restaurantName.trim()) {
    return 'Select a restaurant before continuing.';
  }

  if (!form.menuItemName.trim()) {
    return 'Select a menu item before continuing.';
  }

  if (form.rating < 1 || form.rating > 5) {
    return 'Rating must be between 1 and 5.';
  }

  if (!isValidLocalDate(form.date.trim())) {
    return 'Date must use YYYY-MM-DD format.';
  }

  return null;
}

export function buildRestaurantVisitInputsFromPhotos({
  photos,
  restaurantPhotoGroups,
  restaurantForms,
  sourceNoteId,
  visitVisibility,
}: {
  photos: PhotoSubmissionDraftAsset[];
  restaurantPhotoGroups?: RestaurantPhotoGroup[];
  restaurantForms: Record<string, RestaurantPhotoSubmissionForm>;
  sourceNoteId?: string;
  visitVisibility: 'friends' | 'private';
}): CreateVisitInput[] {
  const groupedVisits = new Map<
    string,
    {
      restaurantId: string;
      restaurantName: string;
      date: string;
      items: { photos: PhotoSubmissionDraftAsset[]; form: RestaurantPhotoSubmissionForm }[];
    }
  >();
  const photosById = new Map(photos.map((photo) => [photo.id, photo]));
  const entries = restaurantPhotoGroups
    ? restaurantPhotoGroups.map((group, index) => ({
        form: restaurantForms[group.id],
        index,
        photos: group.photoIds
          .map((photoId) => photosById.get(photoId))
          .filter((photo): photo is PhotoSubmissionDraftAsset => Boolean(photo)),
      }))
    : photos.map((photo, index) => ({
        form: restaurantForms[photo.id],
        index,
        photos: [photo],
      }));

  for (const entry of entries) {
    const form = entry.form;
    if (!form) {
      throw new Error(`Photo group ${entry.index + 1} is missing restaurant details.`);
    }

    if (entry.photos.length === 0) {
      throw new Error(`Photo group ${entry.index + 1} has no photos.`);
    }

    const validationMessage = validateRestaurantPhotoSubmissionForm(form);
    if (validationMessage) {
      throw new Error(`Photo group ${entry.index + 1}: ${validationMessage}`);
    }

    const key = `${form.restaurantId.trim()}__${form.date}`;
    const existingVisit =
      groupedVisits.get(key) ?? {
        restaurantId: form.restaurantId.trim(),
        restaurantName: form.restaurantName.trim(),
        date: form.date,
        items: [],
      };

    groupedVisits.set(key, {
      ...existingVisit,
      items: [...existingVisit.items, { photos: entry.photos, form }],
    });
  }

  return Array.from(groupedVisits.values()).map((visitGroup) => ({
    restaurantId: visitGroup.restaurantId,
    restaurantName: visitGroup.restaurantName,
    visitedAt: localDateStringToUTC(visitGroup.date),
    visitedOn: visitGroup.date,
    visibility: visitVisibility,
    source: 'visit' as const,
    ...(sourceNoteId && groupedVisits.size === 1
      ? { sourceNoteId }
      : {}),
    items: visitGroup.items.map((entry) => ({
      name: entry.form.menuItemName.trim(),
      rating: entry.form.rating,
      description: entry.form.description.trim() || undefined,
      notes: entry.form.notes.trim() || undefined,
      photos: entry.photos.map(buildPhotoUploadInput),
    })),
  }));
}

export function buildFoodProductInputsFromPhotos({
  foodProductForms,
  photos,
  sourceNoteId,
}: {
  foodProductForms: Record<string, FoodProductFormValues>;
  photos: PhotoSubmissionDraftAsset[];
  sourceNoteId?: string;
}): CreateFoodProductInput[] {
  return photos.map((photo, index) => {
    const form = foodProductForms[photo.id];
    if (!form) {
      throw new Error(`Photo ${index + 1} is missing food product details.`);
    }

    const validationMessage = validateFoodProductForm(form);
    if (validationMessage) {
      throw new Error(`Photo ${index + 1}: ${validationMessage}`);
    }

    return buildCreateFoodProductInput(form, {
      photo: buildPhotoUploadInput(photo),
      sourceNoteId: sourceNoteId && photos.length === 1 ? sourceNoteId : undefined,
    });
  });
}

export async function submitRestaurantPhotoEntries({
  noteId,
  photos,
  queryClient,
  restaurantPhotoGroups,
  restaurantForms,
  visitVisibility,
  writeFeature,
}: SubmitRestaurantPhotoEntriesParams): Promise<PhotoSubmissionResult> {
  const noteUsedAt = noteId ? new Date().toISOString() : null;
  let queued = false;
  const visitInputs = buildRestaurantVisitInputsFromPhotos({
    photos,
    restaurantPhotoGroups,
    restaurantForms,
    sourceNoteId: noteId,
    visitVisibility,
  });

  for (const visitInput of visitInputs) {
    const createResult = await createVisitWithOfflineSupport({
      input: visitInput,
      hasPhotoUploads: true,
      queryClient,
      queuedAlert: false,
      sourceNote:
        noteId && visitInputs.length === 1 && noteUsedAt
          ? {
              noteId,
              usedAt: noteUsedAt,
            }
          : undefined,
      useApiReplay: false,
      writeFeature,
    });
    queued = queued || createResult.status === 'queued';
  }

  if (noteId && visitInputs.length > 1 && noteUsedAt) {
    await persistSourceNoteUsed({
      noteId,
      queryClient,
      usedAt: noteUsedAt,
      writeFeature,
    });
  }

  return {
    photoCount: photos.length,
    queued,
    visitCount: visitInputs.length,
  };
}

export async function submitFoodProductPhotoEntries({
  foodProductForms,
  noteId,
  photos,
  queryClient,
  writeFeature,
}: SubmitFoodProductPhotoEntriesParams): Promise<PhotoSubmissionResult> {
  const noteUsedAt = noteId ? new Date().toISOString() : null;
  let queued = false;
  const foodProductInputs = buildFoodProductInputsFromPhotos({
    foodProductForms,
    photos,
    sourceNoteId: noteId,
  });

  for (const foodProductInput of foodProductInputs) {
    const createResult = await createFoodProductWithOfflineSupport({
      input: foodProductInput,
      includeUsage: true,
      queryClient,
      queuedAlert: false,
      sourceNote:
        noteId && photos.length === 1 && noteUsedAt
          ? {
              noteId,
              usedAt: noteUsedAt,
            }
          : undefined,
      writeFeature,
    });
    queued = queued || createResult.status === 'queued';
  }

  if (noteId && photos.length > 1 && noteUsedAt) {
    await persistSourceNoteUsed({
      noteId,
      queryClient,
      usedAt: noteUsedAt,
      writeFeature,
    });
  }

  return {
    photoCount: photos.length,
    queued,
  };
}
