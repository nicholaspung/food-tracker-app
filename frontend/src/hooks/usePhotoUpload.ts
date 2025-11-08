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

      // Step 1: Compress all photos in parallel
      setState({
        status: 'compressing',
        progress: 10,
        currentOperation: `Compressing ${totalPhotos} ${totalPhotos === 1 ? 'photo' : 'photos'}...`,
        error: null,
      });

      let compressedCount = 0;
      const compressionPromises = items.map(async (item) => {
        const compressed = await compressDishPhoto(item.photo);
        compressedCount++;

        // Update progress during compression (10% to 50%)
        const compressionProgress = 10 + (compressedCount / totalPhotos) * 40;
        setState(prev => ({
          ...prev,
          progress: Math.round(compressionProgress),
          currentOperation: `Compressed ${compressedCount} of ${totalPhotos} ${totalPhotos === 1 ? 'photo' : 'photos'}`,
        }));

        return { ...item, compressedPhoto: compressed };
      });

      const compressedItems = await Promise.all(compressionPromises);

      // Step 2: Upload all photos in parallel
      setState(prev => ({
        ...prev,
        status: 'uploading',
        progress: 50,
        currentOperation: `Uploading ${totalPhotos} ${totalPhotos === 1 ? 'photo' : 'photos'}...`,
      }));

      let uploadedCount = 0;
      const uploadPromises = compressedItems.map(async (item) => {
        const formData = new FormData();
        formData.append('photo', item.compressedPhoto);

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

        uploadedCount++;

        // Update progress during upload (50% to 100%)
        const uploadProgress = 50 + (uploadedCount / totalPhotos) * 50;
        setState(prev => ({
          ...prev,
          progress: Math.round(uploadProgress),
          currentOperation: `Uploaded ${uploadedCount} of ${totalPhotos} ${totalPhotos === 1 ? 'photo' : 'photos'}`,
        }));

        return result;
      });

      await Promise.all(uploadPromises);

      // Complete
      setState({
        status: 'complete',
        progress: 100,
        currentOperation: `Successfully uploaded ${totalPhotos} ${totalPhotos === 1 ? 'photo' : 'photos'}`,
        error: null,
      });
    } catch (error: any) {
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
