import {
  resolveDefaultVisitVisibilityFromAuth,
  type CreateQuickTrackInput,
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

export function resolveDefaultQuickTrackVisibility(): QuickTrackVisibility {
  return resolveDefaultVisitVisibilityFromAuth();
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
