import { Image, type ImageURISource } from 'react-native';

const loadedPhotoUris = new Set<string>();
const prefetchedPhotoUris = new Set<string>();

function normalizePhotoUri(uri: string): string {
  return uri.trim();
}

export function markPhotoImageLoaded(uri: string): void {
  const normalizedUri = normalizePhotoUri(uri);
  if (!normalizedUri) {
    return;
  }

  loadedPhotoUris.add(normalizedUri);
}

export function hasPhotoImageLoaded(uri: string): boolean {
  const normalizedUri = normalizePhotoUri(uri);
  return Boolean(normalizedUri && loadedPhotoUris.has(normalizedUri));
}

export function prefetchPhotoImages(uris: string[]): void {
  const uniqueUris = Array.from(
    new Set(
      uris
        .map(normalizePhotoUri)
        .filter((uri) => uri.length > 0 && !prefetchedPhotoUris.has(uri)),
    ),
  );

  for (const uri of uniqueUris) {
    prefetchedPhotoUris.add(uri);
    Image.prefetch(uri).catch(() => {
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
