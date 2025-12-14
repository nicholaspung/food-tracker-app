import { useState, useEffect } from "react";
import { PhotoToProcess } from "@/types/photos";
import { extractImageCaptureDate } from "@/lib/photoUtils";
import { processPhotosDraftService } from "@/services/processPhotosDraftServiceDB";
import { pb } from "@/lib/pocketbase";
import { compressImage } from "@/services/ocrService";
import { COLLECTIONS } from '@/constants/collections';

/**
 * Item to be uploaded with photo and metadata
 */
export interface PhotoUploadItem {
  photo: File;
  foodItemId: string;
  userId: string;
  visitId?: string; // Optional - omitted for Quick Track mode
  existingPhotoId?: string; // Optional - for updating existing photos
}

/**
 * Upload state tracking
 */
interface UploadState {
  status: "idle" | "uploading" | "compressing" | "complete" | "error";
  progress: number;
  currentOperation: string;
  error: string | null;
}

/**
 * Hook for managing photo upload and EXIF extraction
 *
 * Handles:
 * - File selection from input
 * - EXIF date extraction from photos
 * - Creating PhotoToProcess objects with preview URLs
 * - Saving to draft service
 * - Managing current photo index
 * - Photo compression and upload with progress tracking
 */
export function usePhotoUpload() {
  const [photos, setPhotos] = useState<PhotoToProcess[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    progress: 0,
    currentOperation: "",
    error: null,
  });

  // Cleanup: Revoke all blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      photos.forEach((photo) => {
        if (photo.previewUrl) {
          URL.revokeObjectURL(photo.previewUrl);
        }
      });
    };
  }, [photos]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Extract capture dates from photos
    const photosWithDates = await Promise.all(
      files.map(async (file, index) => {
        const captureDate = await extractImageCaptureDate(file);
        return {
          id: `${Date.now()}-${index}`,
          file,
          previewUrl: URL.createObjectURL(file),
          captureDate,
        };
      })
    );

    setPhotos(photosWithDates);
    setCurrentPhotoIndex(0);

    // Save to draft
    await processPhotosDraftService.savePhotos(files);

    e.target.value = ""; // Reset input
  };

  const clearPhotos = () => {
    // Revoke blob URLs before clearing to prevent memory leaks
    photos.forEach((photo) => {
      if (photo.previewUrl) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    });
    setPhotos([]);
    setCurrentPhotoIndex(0);
  };

  /**
   * Upload photos with compression and progress tracking
   * @param items - Array of photo upload items with metadata
   */
  const uploadPhotos = async (items: PhotoUploadItem[]) => {
    if (items.length === 0) return;

    try {
      setUploadState({
        status: "compressing",
        progress: 0,
        currentOperation: "Compressing images...",
        error: null,
      });

      // Compress all photos
      const totalItems = items.length;
      const compressedItems: Array<{ compressed: File; item: PhotoUploadItem }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const compressed = await compressImage(item.photo);
        compressedItems.push({ compressed, item });

        // Update compression progress
        const progress = Math.round(((i + 1) / totalItems) * 50); // 0-50% for compression
        setUploadState({
          status: "compressing",
          progress,
          currentOperation: `Compressing image ${i + 1} of ${totalItems}...`,
          error: null,
        });
      }

      // Upload all compressed photos
      setUploadState({
        status: "uploading",
        progress: 50,
        currentOperation: "Uploading photos...",
        error: null,
      });

      for (let i = 0; i < compressedItems.length; i++) {
        const { compressed, item } = compressedItems[i];

        // Create FormData for photo upload
        const formData = new FormData();
        formData.append("photo", compressed);
        formData.append("food_item", item.foodItemId);
        formData.append("user", item.userId);
        if (item.visitId) {
          formData.append("visit", item.visitId);
        }

        // Upload photo (update if existingPhotoId provided, otherwise create)
        if (item.existingPhotoId) {
          await pb.collection(COLLECTIONS.VISIT_PHOTOS).update(item.existingPhotoId, formData);
        } else {
          await pb.collection(COLLECTIONS.VISIT_PHOTOS).create(formData);
        }

        // Update upload progress (50-100%)
        const progress = Math.round(50 + ((i + 1) / totalItems) * 50);
        setUploadState({
          status: "uploading",
          progress,
          currentOperation: `Uploading photo ${i + 1} of ${totalItems}...`,
          error: null,
        });
      }

      // Mark as complete
      setUploadState({
        status: "complete",
        progress: 100,
        currentOperation: "Upload complete!",
        error: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      setUploadState({
        status: "error",
        progress: 0,
        currentOperation: "",
        error: errorMessage,
      });
      throw error; // Re-throw to allow caller to handle
    }
  };

  /**
   * Reset upload state
   */
  const reset = () => {
    setUploadState({
      status: "idle",
      progress: 0,
      currentOperation: "",
      error: null,
    });
  };

  const hasPhotos = photos.length > 0;
  const currentPhoto = photos[currentPhotoIndex];
  const isLastPhoto = currentPhotoIndex === photos.length - 1;
  const isFirstPhoto = currentPhotoIndex === 0;

  return {
    photos,
    currentPhotoIndex,
    currentPhoto,
    hasPhotos,
    isLastPhoto,
    isFirstPhoto,
    handlePhotoSelect,
    setCurrentPhotoIndex,
    clearPhotos,
    setPhotos, // Exposed for draft restoration
    uploadPhotos, // Photo upload with progress tracking
    state: uploadState, // Upload state for progress display
    reset, // Reset upload state
  };
}
