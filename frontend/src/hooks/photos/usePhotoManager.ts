import { useState, useEffect, useCallback } from "react";
import { MAX_PHOTOS_PER_FOOD_ITEM } from "@/constants/limits";

/**
 * Hook for managing photo capture, preview, and cleanup
 * Supports both single photo and multiple photos (Map-based) modes
 * In multiple mode, each key can have multiple photos (up to MAX_PHOTOS_PER_FOOD_ITEM)
 *
 * @template K - Key type for multiple photos mode (number | string)
 *
 * Usage:
 * - Single photo: const { photo, previewUrl, handleCapture, handleRemove } = usePhotoManager()
 * - Multiple photos: const { photos, previewUrls, addPhoto, removePhoto } = usePhotoManager<string>(true)
 */
export function usePhotoManager<K extends number | string = never>(
  multipleMode: boolean = false
) {
  // Single photo mode state
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // Multiple photos mode state - now arrays per key
  const [photos, setPhotos] = useState<Map<K, File[]>>(new Map());
  const [previewUrls, setPreviewUrls] = useState<Map<K, string[]>>(new Map());

  /**
   * Handle photo capture - creates preview URL and revokes old one
   * In multiple mode, adds to the array (respects max limit)
   */
  const handleCapture = useCallback(
    (keyOrFile: K | File, file?: File) => {
      if (multipleMode) {
        // Multiple photos mode - first arg is key, second is file
        const key = keyOrFile as K;
        const photoFile = file!;

        // Check limit
        const currentPhotos = photos.get(key) || [];
        if (currentPhotos.length >= MAX_PHOTOS_PER_FOOD_ITEM) {
          return false;
        }

        // Add photo to array
        setPhotos((prev) => {
          const newPhotos = new Map(prev);
          const existing = newPhotos.get(key) || [];
          newPhotos.set(key, [...existing, photoFile]);
          return newPhotos;
        });

        // Add preview URL to array
        setPreviewUrls((prev) => {
          const newPreviewUrls = new Map(prev);
          const existing = newPreviewUrls.get(key) || [];
          newPreviewUrls.set(key, [...existing, URL.createObjectURL(photoFile)]);
          return newPreviewUrls;
        });

        return true;
      } else {
        // Single photo mode - first arg is file
        const photoFile = keyOrFile as File;

        setPhoto(photoFile);

        // Create preview URL and revoke old one
        setPreviewUrl((prevUrl) => {
          if (prevUrl) {
            URL.revokeObjectURL(prevUrl);
          }
          return URL.createObjectURL(photoFile);
        });

        return true;
      }
    },
    [multipleMode, photos]
  );

  /**
   * Add photo (alias for handleCapture in multiple mode)
   */
  const addPhoto = useCallback(
    (key: K, file: File): boolean => {
      if (!multipleMode) return false;
      return handleCapture(key, file) as boolean;
    },
    [multipleMode, handleCapture]
  );

  /**
   * Add multiple photos at once (for multi-select file picker)
   * Returns the number of photos successfully added
   */
  const addMultiplePhotos = useCallback(
    (key: K, files: File[]): number => {
      if (!multipleMode) return 0;

      const currentPhotos = photos.get(key) || [];
      const remainingSlots = MAX_PHOTOS_PER_FOOD_ITEM - currentPhotos.length;
      if (remainingSlots <= 0) return 0;

      const filesToAdd = files.slice(0, remainingSlots);

      // Batch add photos
      setPhotos((prev) => {
        const newPhotos = new Map(prev);
        const existing = newPhotos.get(key) || [];
        newPhotos.set(key, [...existing, ...filesToAdd]);
        return newPhotos;
      });

      // Batch add preview URLs
      setPreviewUrls((prev) => {
        const newPreviewUrls = new Map(prev);
        const existing = newPreviewUrls.get(key) || [];
        const newUrls = filesToAdd.map(file => URL.createObjectURL(file));
        newPreviewUrls.set(key, [...existing, ...newUrls]);
        return newPreviewUrls;
      });

      return filesToAdd.length;
    },
    [multipleMode, photos]
  );

  /**
   * Handle photo removal - revokes preview URL and clears state
   * In multiple mode, can remove specific photo by index
   */
  const handleRemove = useCallback(
    (key?: K, photoIndex?: number) => {
      if (multipleMode && key !== undefined) {
        if (photoIndex !== undefined) {
          // Remove specific photo at index
          setPhotos((prev) => {
            const newPhotos = new Map(prev);
            const existing = newPhotos.get(key) || [];
            const updated = existing.filter((_, i) => i !== photoIndex);
            if (updated.length === 0) {
              newPhotos.delete(key);
            } else {
              newPhotos.set(key, updated);
            }
            return newPhotos;
          });

          setPreviewUrls((prev) => {
            const newPreviewUrls = new Map(prev);
            const existing = newPreviewUrls.get(key) || [];
            // Revoke the URL being removed
            if (existing[photoIndex]) {
              URL.revokeObjectURL(existing[photoIndex]);
            }
            const updated = existing.filter((_, i) => i !== photoIndex);
            if (updated.length === 0) {
              newPreviewUrls.delete(key);
            } else {
              newPreviewUrls.set(key, updated);
            }
            return newPreviewUrls;
          });
        } else {
          // Remove all photos for key
          setPhotos((prev) => {
            const newPhotos = new Map(prev);
            newPhotos.delete(key);
            return newPhotos;
          });

          setPreviewUrls((prev) => {
            const newPreviewUrls = new Map(prev);
            const urls = newPreviewUrls.get(key) || [];
            urls.forEach((url) => URL.revokeObjectURL(url));
            newPreviewUrls.delete(key);
            return newPreviewUrls;
          });
        }
      } else {
        // Single photo mode - clear the photo
        setPreviewUrl((prevUrl) => {
          if (prevUrl) {
            URL.revokeObjectURL(prevUrl);
          }
          return "";
        });
        setPhoto(null);
      }
    },
    [multipleMode]
  );

  /**
   * Remove specific photo at index (convenience method for multiple mode)
   */
  const removePhoto = useCallback(
    (key: K, photoIndex: number) => {
      if (!multipleMode) return;
      handleRemove(key, photoIndex);
    },
    [multipleMode, handleRemove]
  );

  /**
   * Remove all photos for a key
   */
  const removeAllPhotos = useCallback(
    (key: K) => {
      if (!multipleMode) return;
      handleRemove(key);
    },
    [multipleMode, handleRemove]
  );

  /**
   * Get photos array for a key
   */
  const getPhotos = useCallback(
    (key: K): File[] => {
      return photos.get(key) || [];
    },
    [photos]
  );

  /**
   * Get preview URLs array for a key
   */
  const getPreviewUrls = useCallback(
    (key: K): string[] => {
      return previewUrls.get(key) || [];
    },
    [previewUrls]
  );

  /**
   * Get photo count for a key
   */
  const getPhotoCount = useCallback(
    (key: K): number => {
      return (photos.get(key) || []).length;
    },
    [photos]
  );

  /**
   * Manual cleanup function - revokes all preview URLs
   * Useful for early cleanup before unmount
   */
  const cleanup = useCallback(() => {
    if (multipleMode) {
      previewUrls.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)));
      setPreviewUrls(new Map());
      setPhotos(new Map());
    } else {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl("");
      setPhoto(null);
    }
  }, [multipleMode, previewUrl, previewUrls]);

  /**
   * Automatic cleanup on unmount - revoke all preview URLs
   */
  useEffect(() => {
    return () => {
      if (multipleMode) {
        previewUrls.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)));
      } else {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
      }
    };
  }, [multipleMode, previewUrl, previewUrls]);

  return {
    // Single photo mode returns
    photo,
    previewUrl,
    // Multiple photos mode returns
    photos,
    previewUrls,
    // Common functions
    handleCapture,
    handleRemove,
    cleanup,
    // Multiple mode convenience functions
    addPhoto,
    addMultiplePhotos,
    removePhoto,
    removeAllPhotos,
    getPhotos,
    getPreviewUrls,
    getPhotoCount,
  };
}
