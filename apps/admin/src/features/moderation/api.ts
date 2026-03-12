import { pb } from '@/lib/pocketbase';
import type { PhotoUpload } from '@/lib/types';

export async function listRecentPhotoUploads() {
  const response = await pb.collection('visit_photos').getList<PhotoUpload>(1, 24, {
    expand: 'user,visit,foodItem',
    sort: '-created',
  });

  return response.items;
}
