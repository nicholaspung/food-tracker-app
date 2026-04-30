import { buildPocketBaseFileUrl } from '../features/store/pocketbaseGateway';

export interface PhotoFileReference {
  id: string;
  photo: string;
  uri?: string;
  collectionId?: string;
  collectionName?: string;
}

export function buildPhotoFileUrl(photo: PhotoFileReference, thumb?: string): string {
  const localUri = photo.uri?.trim();
  if (localUri) {
    return localUri;
  }

  return buildPocketBaseFileUrl({
    collectionId: photo.collectionId,
    collectionName: photo.collectionName ?? 'visit_photos',
    recordId: photo.id,
    filename: photo.photo,
    thumb,
  });
}

export function buildPhotoThumbnailUrl(photo: PhotoFileReference): string {
  return buildPhotoFileUrl(photo, '100x100');
}
