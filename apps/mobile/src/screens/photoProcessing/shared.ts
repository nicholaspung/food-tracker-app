import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { HomeFeedPhotoRecord } from '../../components/shared';
import type {
  FoodProductRecord,
  RestaurantRecord,
  VisitRecord,
  VisitPhotoUploadInput,
} from '../../features';
import type { PhotoPickerPermissionSource } from '../../hooks/usePhotoPickerPermissions';
import {
  formatDisplayDate,
  formatDateToLocalDateString,
  formatLocalDateLabel,
  getTodayLocalDateString,
  resolveDateValue,
} from '../../lib/dateFormatting';
import type { VisitRestaurantWithDistance } from '../../lib/visitRestaurantSearch';
import type { FoodProductFormValues } from '../../lib/foodProductForm';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type {
  DraftPhotoAsset,
  PhotoCoordinates,
  ProcessType,
  RestaurantPhotoForm,
} from '../../features/photoProcessing/photoProcessingTypes';
export { parseMenuItemNamesFromCsv } from '../../features/photoProcessing/menuItemCsvParsing';
export { FREE_MONTHLY_PHOTO_LIMIT } from '../../features/photoProcessing/photoProcessingTypes';
export type {
  DraftPhotoAsset,
  PhotoCoordinates,
  ProcessType,
  RestaurantPhotoForm,
} from '../../features/photoProcessing/photoProcessingTypes';

export type PhotoProcessingScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'ProcessPhotos'
>;
export type ScanSource = PhotoPickerPermissionSource;
export type MenuScanPhase = 'choose' | 'processing' | 'success' | 'error';
export type GeneralPhotoStep = 'choice' | 'upload' | 'process' | 'review';

export interface CreatedMenuItemRecord {
  id: string;
  name: string;
}

export type MenuItemMode = 'existing' | 'create';

const PROGRESS_FLOW_TAIL: { label: string }[] = [
  { label: 'Upload' },
  { label: 'Process' },
  { label: 'Review' },
];

const reviewEntryDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export interface ReviewVisitCardData {
  id: string;
  visit: VisitRecord;
  photosByFoodItem: Map<string, HomeFeedPhotoRecord[]>;
  footerLabel: string;
}

export interface ReviewFoodProductCardData {
  id: string;
  foodProduct: FoodProductRecord;
  photos: HomeFeedPhotoRecord[];
  entryMeta: string;
}

export interface RestaurantReviewGroup {
  restaurantId: string;
  restaurantName: string;
  date: string;
  items: { photo: DraftPhotoAsset; form: RestaurantPhotoForm }[];
}

export interface FoodProductReviewEntry {
  photo: DraftPhotoAsset;
  form: FoodProductFormValues;
}

function formatReviewEntryDateLabel(value: string, fallbackDate: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatLocalDateLabel(fallbackDate);
  }

  return reviewEntryDateFormatter.format(date);
}

export function formatReviewEntryFooterLabel(
  value: string,
  fallbackDate: string,
): string {
  return formatReviewEntryDateLabel(value, fallbackDate);
}

export function buildRestaurantReviewGroups(
  photos: DraftPhotoAsset[],
  restaurantForms: Record<string, RestaurantPhotoForm>,
): RestaurantReviewGroup[] {
  const groups = new Map<string, RestaurantReviewGroup>();

  for (const photo of photos) {
    const form = restaurantForms[photo.id];
    if (!form) {
      continue;
    }

    const key = `${form.restaurantId.trim()}__${form.date}`;
    const existing =
      groups.get(key) ?? {
        restaurantId: form.restaurantId.trim(),
        restaurantName: form.restaurantName.trim(),
        date: form.date,
        items: [],
      };

    groups.set(key, {
      ...existing,
      items: [...existing.items, { photo, form }],
    });
  }

  return Array.from(groups.values());
}

export function buildFoodProductReviewEntries(
  photos: DraftPhotoAsset[],
  foodProductForms: Record<string, FoodProductFormValues>,
): FoodProductReviewEntry[] {
  return photos
    .map((photo) => {
      const form = foodProductForms[photo.id];
      if (!form) {
        return null;
      }

      return { photo, form };
    })
    .filter((entry): entry is FoodProductReviewEntry => Boolean(entry));
}

export function collapseRestaurantOptionsToSelection({
  savedRestaurants,
  searchRestaurants,
  selectedRestaurant,
}: {
  savedRestaurants: VisitRestaurantWithDistance[];
  searchRestaurants: VisitRestaurantWithDistance[];
  selectedRestaurant: RestaurantRecord | null;
}): {
  savedRestaurants: VisitRestaurantWithDistance[];
  searchRestaurants: VisitRestaurantWithDistance[];
} {
  if (!selectedRestaurant) {
    return {
      savedRestaurants,
      searchRestaurants,
    };
  }

  const selectedEntry =
    savedRestaurants.find(({ restaurant }) => restaurant.id === selectedRestaurant.id) ??
    searchRestaurants.find(({ restaurant }) => restaurant.id === selectedRestaurant.id) ??
    {
      restaurant: selectedRestaurant,
      distance: null,
    };

  return {
    savedRestaurants: [selectedEntry],
    searchRestaurants: [selectedEntry],
  };
}

function parseExifRational(rawValue: unknown): number | null {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.includes('/')) {
      const [numeratorRaw, denominatorRaw] = trimmed.split('/');
      const numerator = Number(numeratorRaw);
      const denominator = Number(denominatorRaw);
      if (
        Number.isFinite(numerator) &&
        Number.isFinite(denominator) &&
        denominator !== 0
      ) {
        return numerator / denominator;
      }
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (rawValue && typeof rawValue === 'object') {
    const maybeFraction = rawValue as {
      numerator?: unknown;
      denominator?: unknown;
    };
    if (
      typeof maybeFraction.numerator === 'number' &&
      typeof maybeFraction.denominator === 'number'
    ) {
      if (
        !Number.isFinite(maybeFraction.numerator) ||
        !Number.isFinite(maybeFraction.denominator) ||
        maybeFraction.denominator === 0
      ) {
        return null;
      }

      return maybeFraction.numerator / maybeFraction.denominator;
    }
  }

  return null;
}

function parseExifCoordinate(rawValue: unknown): number | null {
  const directValue = parseExifRational(rawValue);
  if (directValue !== null) {
    return directValue;
  }

  if (!Array.isArray(rawValue) || rawValue.length === 0) {
    return null;
  }

  const degrees = parseExifRational(rawValue[0]);
  if (degrees === null) {
    return null;
  }

  const minutes = parseExifRational(rawValue[1]) ?? 0;
  const seconds = parseExifRational(rawValue[2]) ?? 0;
  const sign = degrees < 0 ? -1 : 1;
  const absoluteDegrees = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  return sign * absoluteDegrees;
}

function applyCoordinateDirection(
  coordinate: number,
  rawDirection: unknown,
): number {
  if (typeof rawDirection !== 'string') {
    return coordinate;
  }

  const direction = rawDirection.trim().toUpperCase();
  if (direction === 'S' || direction === 'W') {
    return -Math.abs(coordinate);
  }

  if (direction === 'N' || direction === 'E') {
    return Math.abs(coordinate);
  }

  return coordinate;
}

export function extractCaptureCoordinates(
  asset: ImagePicker.ImagePickerAsset,
): PhotoCoordinates | null {
  if (!asset.exif || typeof asset.exif !== 'object') {
    return null;
  }

  const exif = asset.exif as Record<string, unknown>;
  const latitudeRaw = parseExifCoordinate(
    exif.GPSLatitude ?? exif.latitude ?? exif.Latitude,
  );
  const longitudeRaw = parseExifCoordinate(
    exif.GPSLongitude ?? exif.longitude ?? exif.Longitude,
  );

  if (latitudeRaw === null || longitudeRaw === null) {
    return null;
  }

  const latitude = applyCoordinateDirection(
    latitudeRaw,
    exif.GPSLatitudeRef ?? exif.LatitudeRef,
  );
  const longitude = applyCoordinateDirection(
    longitudeRaw,
    exif.GPSLongitudeRef ?? exif.LongitudeRef,
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

export function formatCoordinatesForDisplay(
  coordinates: PhotoCoordinates,
): string {
  const latitudeDirection = coordinates.latitude >= 0 ? 'N' : 'S';
  const longitudeDirection = coordinates.longitude >= 0 ? 'E' : 'W';
  const latitude = Math.abs(coordinates.latitude).toFixed(4);
  const longitude = Math.abs(coordinates.longitude).toFixed(4);
  return `${latitude}${latitudeDirection}, ${longitude}${longitudeDirection}`;
}

export function normalizeSelectionLabel(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveDraftPhotoDetectedDateValue(
  photo: DraftPhotoAsset,
): string | null {
  const resolvedDate =
    resolveDateValue(photo.captureDate) ??
    resolveDateValue(photo.metadataDate);
  return resolvedDate ? formatDateToLocalDateString(resolvedDate) : null;
}

export function buildDefaultRestaurantForm(
  photo: DraftPhotoAsset,
  previousForm: RestaurantPhotoForm | undefined,
): RestaurantPhotoForm {
  return {
    restaurantId: previousForm?.restaurantId ?? '',
    restaurantName: previousForm?.restaurantName ?? '',
    menuItemId: '',
    menuItemName: '',
    rating: 3,
    description: '',
    notes: '',
    date: resolveDraftPhotoDetectedDateValue(photo) ?? getTodayLocalDateString(),
  };
}

export function buildPhotoUploadInput(
  asset: DraftPhotoAsset,
): VisitPhotoUploadInput {
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType,
  };
}

export function formatDraftPhotoMetadataLabel(photo: DraftPhotoAsset): string {
  return formatDisplayDate(photo.metadataDate, {
    fallback: 'Date unavailable',
    options: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    },
  });
}

export function resolveWizardStepIndex(step: GeneralPhotoStep): number {
  if (step === 'choice') {
    return 0;
  }

  if (step === 'upload') {
    return 1;
  }

  if (step === 'process') {
    return 2;
  }

  return 3;
}

export function resolveProgressSteps(
  processType: ProcessType | null,
): { label: string }[] {
  const firstLabel =
    processType === null
      ? 'Choose Method'
      : processType === 'restaurant'
        ? 'Restaurant Visit'
        : 'Food Product';

  return [{ label: firstLabel }, ...PROGRESS_FLOW_TAIL];
}
