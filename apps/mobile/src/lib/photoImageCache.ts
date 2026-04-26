import { Image, type ImageURISource } from 'react-native';

export type PhotoImageCacheStatus = 'unknown' | 'prefetched' | 'loaded';

const loadedPhotoUris = new Set<string>();
const prefetchedPhotoUris = new Set<string>();
const pendingPrefetchPhotoUris = new Set<string>();

function normalizePhotoUri(uri: string): string {
  return uri.trim();
}

export function markPhotoImagePrefetched(uri: string): void {
  const normalizedUri = normalizePhotoUri(uri);
  if (!normalizedUri) {
    return;
  }

  prefetchedPhotoUris.add(normalizedUri);
}

export function markPhotoImageLoaded(uri: string): void {
  const normalizedUri = normalizePhotoUri(uri);
  if (!normalizedUri) {
    return;
  }

  prefetchedPhotoUris.add(normalizedUri);
  loadedPhotoUris.add(normalizedUri);
}

export function getPhotoImageCacheStatus(uri: string): PhotoImageCacheStatus {
  const normalizedUri = normalizePhotoUri(uri);
  if (!normalizedUri) {
    return 'unknown';
  }

  if (loadedPhotoUris.has(normalizedUri)) {
    return 'loaded';
  }

  if (prefetchedPhotoUris.has(normalizedUri)) {
    return 'prefetched';
  }

  return 'unknown';
}

export function hasPhotoImageLoaded(uri: string): boolean {
  return getPhotoImageCacheStatus(uri) === 'loaded';
}

export function prefetchPhotoImages(uris: string[]): void {
  const uniqueUris = Array.from(
    new Set(
      uris
        .map(normalizePhotoUri)
        .filter(
          (uri) =>
            uri.length > 0 &&
            !prefetchedPhotoUris.has(uri) &&
            !pendingPrefetchPhotoUris.has(uri),
        ),
    ),
  );

  for (const uri of uniqueUris) {
    pendingPrefetchPhotoUris.add(uri);
    if (typeof Image.prefetch !== 'function') {
      markPhotoImagePrefetched(uri);
      pendingPrefetchPhotoUris.delete(uri);
      continue;
    }

    Image.prefetch(uri)
      .then(() => {
        markPhotoImagePrefetched(uri);
        pendingPrefetchPhotoUris.delete(uri);
      })
      .catch(() => {
        pendingPrefetchPhotoUris.delete(uri);
        prefetchedPhotoUris.delete(uri);
      });
  }
}

export function buildCachedImageSource(uri: string): ImageURISource {
  return {
    cache: 'force-cache',
    uri,
  };
}

export function __resetPhotoImageCacheForTests(): void {
  loadedPhotoUris.clear();
  prefetchedPhotoUris.clear();
  pendingPrefetchPhotoUris.clear();
}
