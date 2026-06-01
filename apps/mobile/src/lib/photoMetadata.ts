import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

function normalizeTimestampCandidate(rawValue: unknown): number | null {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string' && rawValue.trim()) {
    const parsed = Number(rawValue.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseExifDate(rawValue: unknown): Date | null {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    const numericTimestamp = normalizeTimestampCandidate(rawValue);
    return numericTimestamp === null ? null : parseCreationTimestamp(numericTimestamp);
  }

  const trimmed = rawValue.trim();
  const exifMatch = trimmed.match(
    /^(\d{4}):(\d{2}):(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(?:\s?(Z|[+\-]\d{2}:?\d{2}))?$/,
  );
  if (exifMatch) {
    const [
      ,
      yearRaw,
      monthRaw,
      dayRaw,
      hourRaw = '0',
      minuteRaw = '0',
      secondRaw = '0',
      timezoneRaw,
    ] = exifMatch;
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const second = Number(secondRaw);

    if ([year, month, day, hour, minute, second].every(Number.isFinite)) {
      if (timezoneRaw) {
        const normalizedTimezone = timezoneRaw === 'Z'
          ? 'Z'
          : `${timezoneRaw.slice(0, 3)}:${timezoneRaw.slice(-2)}`;
        const isoLikeValue = `${yearRaw}-${monthRaw}-${dayRaw}T${hourRaw}:${minuteRaw}:${secondRaw}${normalizedTimezone}`;
        const timezoneParsed = new Date(isoLikeValue);
        if (!Number.isNaN(timezoneParsed.getTime())) {
          return timezoneParsed;
        }
      }

      const parsed = new Date(year, month - 1, day, hour, minute, second);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  const normalized = trimmed.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function parseCreationTimestamp(rawValue: unknown): Date | null {
  const normalizedRawValue = normalizeTimestampCandidate(rawValue);
  if (normalizedRawValue === null) {
    return null;
  }

  const normalizedTimestamp =
    normalizedRawValue < 1_000_000_000_000 ? normalizedRawValue * 1000 : normalizedRawValue;
  const parsed = new Date(normalizedTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function extractPhotoCaptureDate(asset: ImagePicker.ImagePickerAsset): Date | null {
  const creationTime = parseCreationTimestamp(
    (asset as ImagePicker.ImagePickerAsset & { creationTime?: number }).creationTime,
  );
  if (creationTime) {
    return creationTime;
  }

  if (!asset.exif || typeof asset.exif !== 'object') {
    return null;
  }

  const exif = asset.exif as Record<string, unknown>;
  const explicitDate =
    parseExifDate(exif.DateTimeOriginal) ??
    parseExifDate(exif.DateTimeDigitized) ??
    parseExifDate(exif.DateTime) ??
    parseExifDate(exif.creationTime) ??
    parseExifDate(exif.dateTimeOriginal) ??
    parseExifDate(exif.dateTimeDigitized) ??
    parseExifDate(exif.dateTime) ??
    parseExifDate(exif.CreationDate) ??
    parseExifDate(exif.DateCreated) ??
    parseExifDate(exif.FileModifyDate) ??
    parseExifDate(exif.FileDateTime);

  if (explicitDate) {
    return explicitDate;
  }

  return (
    parseCreationTimestamp(exif.creationTime) ??
    parseCreationTimestamp(exif.modificationTime) ??
    parseCreationTimestamp(exif.FileDateTime)
  );
}

async function getMediaLibraryCaptureDate(assetId: string): Promise<Date | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Native-only require avoids loading ExpoMediaLibraryNext on web.
    const { Asset } = require('expo-media-library') as typeof import('expo-media-library');
    const mediaLibraryAsset = new Asset(assetId);
    return parseCreationTimestamp(await mediaLibraryAsset.getCreationTime());
  } catch {
    return null;
  }
}

export async function resolvePhotoCaptureDate(
  asset: ImagePicker.ImagePickerAsset,
): Promise<Date | null> {
  if (typeof asset.assetId === 'string' && asset.assetId.trim()) {
    const mediaLibraryDate = await getMediaLibraryCaptureDate(asset.assetId);
    if (mediaLibraryDate) {
      return mediaLibraryDate;
    }
  }

  return extractPhotoCaptureDate(asset);
}
