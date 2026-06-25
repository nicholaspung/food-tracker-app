import { Platform } from 'react-native';

import { buildPocketBaseFileUrl } from '../features/store/pocketbaseGateway';

const WEB_PHOTO_VIEWER_THUMB_SIZE = '1600x1600f';

export interface PhotoFileReference {
  id: string;
  photo: string;
  uri?: string;
  collectionId?: string;
  collectionName?: string;
}

interface PhotoUrlBuildOptions {
  collectionName?: string;
  preferLocalUri?: boolean;
  thumb?: string;
}

export interface PhotoViewerState {
  urls: string[];
  previewUrls: string[];
  initialIndex: number;
}

export function buildPhotoFileUrl(
  photo: PhotoFileReference,
  thumbOrOptions?: string | PhotoUrlBuildOptions,
): string {
  const options =
    typeof thumbOrOptions === 'string'
      ? { thumb: thumbOrOptions }
      : thumbOrOptions ?? {};
  const localUri = photo.uri?.trim();
  if (localUri && options.preferLocalUri !== false) {
    return localUri;
  }

  return buildPocketBaseFileUrl({
    collectionId: photo.collectionId,
    collectionName: photo.collectionName ?? options.collectionName ?? 'visit_photos',
    recordId: photo.id,
    filename: photo.photo,
    thumb: options.thumb,
  });
}

export function buildPhotoThumbnailUrl(
  photo: PhotoFileReference,
  options?: Omit<PhotoUrlBuildOptions, 'thumb'>,
): string {
  return buildPhotoFileUrl(photo, { ...options, thumb: '100x100' });
}

export function buildPhotoViewerUrl(
  photo: PhotoFileReference,
  options?: Omit<PhotoUrlBuildOptions, 'thumb'>,
): string {
  if (Platform.OS === 'web' && !photo.uri?.trim()) {
    return buildPhotoFileUrl(photo, { ...options, thumb: WEB_PHOTO_VIEWER_THUMB_SIZE });
  }

  return buildPhotoFileUrl(photo, options);
}

export function buildPhotoViewerUrls(
  photos: readonly PhotoFileReference[],
  options?: PhotoUrlBuildOptions,
): string[] {
  return photos.map((photo) => buildPhotoViewerUrl(photo, options));
}

export function buildPhotoPreviewUrls(
  photos: readonly PhotoFileReference[],
  options?: Omit<PhotoUrlBuildOptions, 'thumb'>,
): string[] {
  return photos.map((photo) => buildPhotoThumbnailUrl(photo, options));
}

export function buildPhotoViewerState(
  photos: readonly PhotoFileReference[],
  initialPhotoIdOrIndex: string | number = 0,
  options?: Omit<PhotoUrlBuildOptions, 'thumb'> & {
    fullSizePreferLocalUri?: boolean;
  },
): PhotoViewerState {
  const urls = buildPhotoViewerUrls(photos, {
    collectionName: options?.collectionName,
    preferLocalUri: options?.fullSizePreferLocalUri,
  });
  const previewUrls = buildPhotoPreviewUrls(photos, options);
  const requestedIndex =
    typeof initialPhotoIdOrIndex === 'number'
      ? initialPhotoIdOrIndex
      : photos.findIndex((photo) => photo.id === initialPhotoIdOrIndex);
  const fallbackIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const initialIndex = urls.length > 0 ? Math.max(0, Math.min(fallbackIndex, urls.length - 1)) : 0;

  return {
    urls,
    previewUrls,
    initialIndex,
  };
}
