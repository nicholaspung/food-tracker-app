import {
  type QuickTrackRecord,
  resolveDefaultVisitVisibilityFromAuth,
  type CreateQuickTrackInput,
  type UpdateQuickTrackInput,
  type VisitPhotoUploadInput,
} from '../features';
import {
  formatDateToLocalDateString,
  getTodayLocalDateString,
  isValidLocalDate,
  localDateStringToUTC,
} from './dateFormatting';

export const QUICK_TRACK_CATEGORIES = [
  { value: 'convenience_store', label: 'Convenience Store' },
  { value: 'packaged_food', label: 'Packaged Food' },
  { value: 'homemade', label: 'Homemade' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'other', label: 'Other' },
] as const;

export type QuickTrackCategory = (typeof QUICK_TRACK_CATEGORIES)[number]['value'];
export type QuickTrackVisibility = 'friends' | 'private';

export interface QuickTrackFormValues {
  itemName: string;
  category: QuickTrackCategory | '';
  rating: number;
  notes: string;
  visibility: QuickTrackVisibility;
  date: string;
}

interface BuildDefaultQuickTrackFormOptions {
  captureDate?: Date | null;
  detectedDateValue?: string | null;
  previousForm?: QuickTrackFormValues;
}

interface BuildCreateQuickTrackInputOptions {
  photo?: VisitPhotoUploadInput;
  sourceNoteId?: string;
}

interface BuildUpdateQuickTrackInputOptions {
  newPhoto?: VisitPhotoUploadInput;
  deletePhotoIds?: string[];
}

export function resolveDefaultQuickTrackVisibility(): QuickTrackVisibility {
  return resolveDefaultVisitVisibilityFromAuth();
}

function normalizeQuickTrackDate(value: string | undefined): string {
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

function normalizeQuickTrackCategory(
  value: QuickTrackRecord['itemCategory'] | '' | null | undefined,
): QuickTrackCategory | '' {
  return QUICK_TRACK_CATEGORIES.some((category) => category.value === value) ? (value as QuickTrackCategory) : '';
}

export function buildDefaultQuickTrackForm({
  captureDate,
  detectedDateValue,
  previousForm,
}: BuildDefaultQuickTrackFormOptions = {}): QuickTrackFormValues {
  return {
    itemName: '',
    category: previousForm?.category ?? '',
    rating: 3,
    notes: '',
    visibility: previousForm?.visibility ?? resolveDefaultQuickTrackVisibility(),
    date:
      detectedDateValue ??
      (captureDate ? formatDateToLocalDateString(captureDate) : null) ??
      getTodayLocalDateString(),
  };
}

export function buildQuickTrackFormFromRecord(record: QuickTrackRecord): QuickTrackFormValues {
  return {
    itemName: record.itemName,
    category: normalizeQuickTrackCategory(record.itemCategory),
    rating: record.rating,
    notes: record.notes ?? '',
    visibility: record.visibility ?? resolveDefaultQuickTrackVisibility(),
    date: normalizeQuickTrackDate(record.itemDate),
  };
}

export function validateQuickTrackForm(form: QuickTrackFormValues): string | null {
  if (!form.itemName.trim()) {
    return 'Item name is required.';
  }

  if (form.rating < 1 || form.rating > 5) {
    return 'Rating must be between 1 and 5.';
  }

  if (!isValidLocalDate(form.date.trim())) {
    return 'Please choose a valid date.';
  }

  return null;
}

export function buildCreateQuickTrackInput(
  form: QuickTrackFormValues,
  { photo, sourceNoteId }: BuildCreateQuickTrackInputOptions = {},
): CreateQuickTrackInput {
  return {
    itemName: form.itemName.trim(),
    rating: form.rating,
    itemCategory: form.category || undefined,
    notes: form.notes.trim() || undefined,
    visibility: form.visibility,
    itemDate: localDateStringToUTC(form.date),
    photo,
    sourceNoteId,
  };
}

export function buildUpdateQuickTrackInput(
  form: QuickTrackFormValues,
  { newPhoto, deletePhotoIds }: BuildUpdateQuickTrackInputOptions = {},
): UpdateQuickTrackInput {
  const normalizedDeletePhotoIds = deletePhotoIds?.filter((photoId) => photoId.trim().length > 0) ?? [];

  return {
    itemName: form.itemName.trim(),
    rating: form.rating,
    itemCategory: form.category || null,
    notes: form.notes,
    visibility: form.visibility,
    itemDate: localDateStringToUTC(form.date),
    newPhoto,
    deletePhotoIds: normalizedDeletePhotoIds.length > 0 ? normalizedDeletePhotoIds : undefined,
  };
}
