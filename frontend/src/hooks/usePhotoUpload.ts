import { useState } from 'react';
import { pb } from '@/lib/pocketbase';
import { compressDishPhoto } from '@/services/photoService';

export interface PhotoUploadProgress {
  status: 'idle' | 'compressing' | 'uploading' | 'complete' | 'error';
  progress: number; // 0-100
  currentOperation: string;
  error: string | null;
}

export interface PhotoUploadItem {
  photo: File;
  foodItemId: string;
  visitId: string;
  userId: string;
  existingPhotoId?: string; // For updates
}

export const usePhotoUpload = () => {
  const [state, setState] = useState<PhotoUploadProgress>({
    status: 'idle',
    progress: 0,
    currentOperation: '',
    error: null,
  });

  const uploadPhotos = async (items: PhotoUploadItem[]): Promise<void> => {
    if (items.length === 0) {
      return;
    }

    try {
      const totalPhotos = items.length;
      console.log(`[usePhotoUpload] Starting upload for ${totalPhotos} photos`);

      // Step 1: Compress all photos in parallel
      setState({
        status: 'compressing',
        progress: 10,
        currentOperation: `Compressing ${totalPhotos} ${totalPhotos === 1 ? 'photo' : 'photos'}...`,
        error: null,
      });

      const compressionPromises = items.map(async (item, index) => {
        try {
          console.log(`[usePhotoUpload] Compressing photo ${index + 1}/${totalPhotos}`);
          const compressed = await compressDishPhoto(item.photo);
          console.log(`[usePhotoUpload] Compressed photo ${index + 1}/${totalPhotos}`);
          return { ...item, compressed };
        } catch (err: any) {
          console.error(`[usePhotoUpload] Failed to compress photo ${index + 1}:`, err);
          throw err;
        }
      });

      const compressedItems = await Promise.all(compressionPromises);

      // Update progress after all compression completes
      setState(prev => ({
        ...prev,
        progress: 50,
        currentOperation: `Compressed ${totalPhotos} ${totalPhotos === 1 ? 'photo' : 'photos'}`,
      }));

      // Step 2: Upload all photos in parallel with progress tracking
      setState(prev => ({
        ...prev,
        status: 'uploading',
        progress: 50,
        currentOperation: `Uploading ${totalPhotos} ${totalPhotos === 1 ? 'photo' : 'photos'}...`,
      }));

      // Track completed uploads for progress
      let completedUploads = 0;

      const uploadPromises = compressedItems.map(async (item, index) => {
        try {
          console.log(`[usePhotoUpload] Uploading photo ${index + 1}/${totalPhotos}`, {
            foodItemId: item.foodItemId,
            visitId: item.visitId,
            existingPhotoId: item.existingPhotoId,
            compressedSize: item.compressed.size,
          });

          const formData = new FormData();
          formData.append('photo', item.compressed);

          // Only add these fields if creating new photo
          if (!item.existingPhotoId) {
            formData.append('visit', item.visitId);
            formData.append('food_item', item.foodItemId);
            formData.append('user', item.userId);
          }

          // Update or create photo
          const result = item.existingPhotoId
            ? await pb.collection('visit_photos').update(item.existingPhotoId, formData)
            : await pb.collection('visit_photos').create(formData);

          // Update progress after each upload completes (50% to 100%)
          completedUploads++;
          const uploadProgress = 50 + (completedUploads / totalPhotos) * 50;
          setState(prev => ({
            ...prev,
            progress: Math.round(uploadProgress),
            currentOperation: `Uploaded ${completedUploads} of ${totalPhotos} ${totalPhotos === 1 ? 'photo' : 'photos'}`,
          }));

          console.log(`[usePhotoUpload] Uploaded photo ${index + 1}/${totalPhotos}`, result.id);
          return result;
        } catch (err: any) {
          console.error(`[usePhotoUpload] Failed to upload photo ${index + 1}:`, err);
          throw err;
        }
      });

      const results = await Promise.all(uploadPromises);

      // Complete
      setState({
        status: 'complete',
        progress: 100,
        currentOperation: `Successfully uploaded ${totalPhotos} ${totalPhotos === 1 ? 'photo' : 'photos'}`,
        error: null,
      });

      console.log(`[usePhotoUpload] Upload complete for ${totalPhotos} photos`, results);
    } catch (error: any) {
      console.error('[usePhotoUpload] Upload failed:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error.message || 'Failed to upload photos',
      }));
      throw error;
    }
  };

  const reset = () => {
    setState({
      status: 'idle',
      progress: 0,
      currentOperation: '',
      error: null,
    });
  };

  return { state, uploadPhotos, reset };
};
