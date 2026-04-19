import {
  type FoodProductRecord,
  resolveDefaultVisitVisibilityFromAuth,
  type CreateFoodProductInput,
  type UpdateFoodProductInput,
  type VisitPhotoUploadInput,
} from '../features';
import {
  formatDateToLocalDateString,
  getTodayLocalDateString,
  isValidLocalDate,
  localDateStringToUTC,
} from './dateFormatting';

export type FoodProductVisibility = 'friends' | 'private';

export interface FoodProductFormValues {
  itemName: string;
  locationText: string;
  category: string;
  rating: number;
  notes: string;
  visibility: FoodProductVisibility;
  date: string;
}

interface BuildDefaultFoodProductFormOptions {
  captureDate?: Date | null;
  detectedDateValue?: string | null;
  previousForm?: FoodProductFormValues;
}

interface BuildCreateFoodProductInputOptions {
  photo?: VisitPhotoUploadInput;
  sourceNoteId?: string;
}

interface BuildUpdateFoodProductInputOptions {
  newPhoto?: VisitPhotoUploadInput;
  deletePhotoIds?: string[];
}

function normalizeFoodProductCategory(value: string | undefined | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function resolveDefaultFoodProductVisibility(): FoodProductVisibility {
  return resolveDefaultVisitVisibilityFromAuth();
}

function normalizeFoodProductDate(value: string | undefined): string {
  if (!value) {
    return getTodayLocalDateString();
  }

  const normalizedValue = value.includes(' ') ? value.replace(' ', 'T') : value;
  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return getTodayLocalDateString();
  }

  return formatDateToLocalDateString(parsedDate);
}

export function buildDefaultFoodProductForm({
  captureDate,
  detectedDateValue,
  previousForm,
}: BuildDefaultFoodProductFormOptions = {}): FoodProductFormValues {
  return {
    itemName: '',
    locationText: previousForm?.locationText ?? '',
    category: previousForm?.category ?? '',
    rating: 3,
    notes: '',
    visibility: previousForm?.visibility ?? resolveDefaultFoodProductVisibility(),
    date:
      detectedDateValue ??
      (captureDate ? formatDateToLocalDateString(captureDate) : null) ??
      getTodayLocalDateString(),
  };
}

export function buildFoodProductFormFromRecord(record: FoodProductRecord): FoodProductFormValues {
  return {
    itemName: record.itemName,
    locationText: record.locationText ?? '',
    category: normalizeFoodProductCategory(record.itemCategory),
    rating: record.rating,
    notes: record.notes ?? '',
    visibility: record.visibility ?? resolveDefaultFoodProductVisibility(),
    date: normalizeFoodProductDate(record.itemDate),
  };
}

export function validateFoodProductForm(form: FoodProductFormValues): string | null {
  if (!form.itemName.trim()) {
    return 'Food product name is required.';
  }

  if (form.rating < 1 || form.rating > 5) {
    return 'Rating must be between 1 and 5.';
  }

  if (!isValidLocalDate(form.date.trim())) {
    return 'Please choose a valid date.';
  }

  return null;
}

export function buildCreateFoodProductInput(
  form: FoodProductFormValues,
  { photo, sourceNoteId }: BuildCreateFoodProductInputOptions = {},
): CreateFoodProductInput {
  return {
    itemName: form.itemName.trim(),
    locationText: form.locationText.trim() || undefined,
    rating: form.rating,
    itemCategory: normalizeFoodProductCategory(form.category) || undefined,
    notes: form.notes.trim() || undefined,
    visibility: form.visibility,
    itemDate: localDateStringToUTC(form.date),
    photo,
    sourceNoteId,
  };
}

export function buildUpdateFoodProductInput(
  form: FoodProductFormValues,
  { newPhoto, deletePhotoIds }: BuildUpdateFoodProductInputOptions = {},
): UpdateFoodProductInput {
  const normalizedDeletePhotoIds = deletePhotoIds?.filter((photoId) => photoId.trim().length > 0) ?? [];

  return {
    itemName: form.itemName.trim(),
    locationText: form.locationText,
    rating: form.rating,
    itemCategory: normalizeFoodProductCategory(form.category) || null,
    notes: form.notes,
    visibility: form.visibility,
    itemDate: localDateStringToUTC(form.date),
    newPhoto,
    deletePhotoIds: normalizedDeletePhotoIds.length > 0 ? normalizedDeletePhotoIds : undefined,
  };
}

export const buildDefaultQuickTrackForm = buildDefaultFoodProductForm;
export const buildQuickTrackFormFromRecord = buildFoodProductFormFromRecord;
export const validateQuickTrackForm = validateFoodProductForm;
export const buildCreateQuickTrackInput = buildCreateFoodProductInput;
export const buildUpdateQuickTrackInput = buildUpdateFoodProductInput;
export const resolveDefaultQuickTrackVisibility = resolveDefaultFoodProductVisibility;

export type QuickTrackFormValues = FoodProductFormValues;
export type QuickTrackVisibility = FoodProductVisibility;
