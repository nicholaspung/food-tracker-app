import type { VisitPhotoRecord } from './featureStore';

export interface VisitPhotoCollectionRecord {
  id: string;
  food_item?: string;
  user?: string;
  photo: string;
  created: string;
}

export function mapVisitPhotoCollectionRecord(
  record: VisitPhotoCollectionRecord,
): VisitPhotoRecord {
  return {
    id: record.id,
    food_item: record.food_item?.trim() || undefined,
    user: record.user?.trim() || undefined,
    photo: record.photo.trim(),
    collectionName: 'visit_photos',
    created: record.created,
  };
}
