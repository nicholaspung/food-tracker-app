export interface LocalPhotoAsset {
  uri: string;
  fileName?: string | null;
  height?: number | null;
  mimeType?: string | null;
  width?: number | null;
}

interface BuildLocalPhotoFileNameOptions {
  fallbackPrefix?: string;
  mimeType?: string | null;
}

export interface LocalPhotoFile {
  uri: string;
  name: string;
  mimeType: string;
}

function inferLocalPhotoMimeType(uri: string): string {
  const normalizedUri = uri.toLowerCase();
  if (normalizedUri.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedUri.endsWith('.webp')) {
    return 'image/webp';
  }

  if (normalizedUri.endsWith('.heic') || normalizedUri.endsWith('.heif')) {
    return 'image/heic';
  }

  return 'image/jpeg';
}

function resolvePhotoExtension(mimeType: string): string {
  if (mimeType === 'image/png') {
    return 'png';
  }

  if (mimeType === 'image/webp') {
    return 'webp';
  }

  if (mimeType === 'image/heic') {
    return 'heic';
  }

  return 'jpg';
}

export function buildLocalPhotoFileName(
  uri: string,
  {
    fallbackPrefix = 'photo',
    mimeType,
  }: BuildLocalPhotoFileNameOptions = {},
): string {
  const baseName = uri.split('/').pop()?.trim();
  if (baseName && baseName.includes('.')) {
    return baseName;
  }

  const normalizedMimeType = mimeType?.trim() || inferLocalPhotoMimeType(uri);
  return `${fallbackPrefix}-${Date.now()}.${resolvePhotoExtension(normalizedMimeType)}`;
}

export function buildLocalPhotoFile(
  asset: LocalPhotoAsset,
  { fallbackPrefix }: Pick<BuildLocalPhotoFileNameOptions, 'fallbackPrefix'> = {},
): LocalPhotoFile | null {
  const normalizedUri = asset.uri.trim();
  if (!normalizedUri) {
    return null;
  }

  const normalizedMimeType = asset.mimeType?.trim() || inferLocalPhotoMimeType(normalizedUri);

  return {
    uri: normalizedUri,
    name:
      asset.fileName?.trim() ||
      buildLocalPhotoFileName(normalizedUri, {
        fallbackPrefix,
        mimeType: normalizedMimeType,
      }),
    mimeType: normalizedMimeType,
  };
}
