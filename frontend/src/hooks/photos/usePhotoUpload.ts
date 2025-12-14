import { useState, useEffect } from "react";
import { PhotoToProcess } from "@/types/photos";
import { extractImageCaptureDate } from "@/lib/photoUtils";
import { processPhotosDraftService } from "@/services/processPhotosDraftServiceDB";

/**
 * Hook for managing photo upload and EXIF extraction
 *
 * Handles:
 * - File selection from input
 * - EXIF date extraction from photos
 * - Creating PhotoToProcess objects with preview URLs
 * - Saving to draft service
 * - Managing current photo index
 */
export function usePhotoUpload() {
  const [photos, setPhotos] = useState<PhotoToProcess[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

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
  };
}
