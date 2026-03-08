import * as ImagePicker from 'expo-image-picker';

function parseExifDate(rawValue: unknown): Date | null {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null;
  }

  const normalized = rawValue.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function parseCreationTimestamp(rawValue: unknown): Date | null {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return null;
  }

  const normalizedTimestamp = rawValue < 1_000_000_000_000 ? rawValue * 1000 : rawValue;
  const parsed = new Date(normalizedTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function extractPhotoCaptureDate(asset: ImagePicker.ImagePickerAsset): Date | null {
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
  return (
    parseExifDate(exif.DateTimeOriginal) ??
    parseExifDate(exif.DateTimeDigitized) ??
    parseExifDate(exif.DateTime)
  );
}
