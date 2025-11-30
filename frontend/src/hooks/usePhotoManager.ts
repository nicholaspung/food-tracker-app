import { useState, useEffect, useCallback } from "react";

/**
 * Hook for managing photo capture, preview, and cleanup
 * Supports both single photo and multiple photos (Map-based) modes
 *
 * @template K - Key type for multiple photos mode (number | string)
 *
 * Usage:
 * - Single photo: const { photo, previewUrl, handleCapture, handleRemove } = usePhotoManager()
 * - Multiple photos: const { photos, previewUrls, handleCapture, handleRemove } = usePhotoManager<number>(true)
 */
export function usePhotoManager<K extends number | string = never>(
  multipleMode: boolean = false
) {
  // Single photo mode state
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // Multiple photos mode state
  const [photos, setPhotos] = useState<Map<K, File>>(new Map());
  const [previewUrls, setPreviewUrls] = useState<Map<K, string>>(new Map());

  /**
   * Handle photo capture - creates preview URL and revokes old one
   */
  const handleCapture = useCallback(
    (keyOrFile: K | File, file?: File) => {
      if (multipleMode) {
        // Multiple photos mode - first arg is key, second is file
        const key = keyOrFile as K;
        const photoFile = file!;

        // Store the photo file
        setPhotos((prev) => {
          const newPhotos = new Map(prev);
          newPhotos.set(key, photoFile);
          return newPhotos;
        });

        // Create preview URL and revoke old one
        setPreviewUrls((prev) => {
          const newPreviewUrls = new Map(prev);
          const oldUrl = newPreviewUrls.get(key);
          if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
          }
          newPreviewUrls.set(key, URL.createObjectURL(photoFile));
          return newPreviewUrls;
        });
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
      }
    },
    [multipleMode]
  );

  /**
   * Handle photo removal - revokes preview URL and clears state
   */
  const handleRemove = useCallback(
    (key?: K) => {
      if (multipleMode && key !== undefined) {
        // Multiple photos mode - remove specific photo
        setPhotos((prev) => {
          const newPhotos = new Map(prev);
          newPhotos.delete(key);
          return newPhotos;
        });

        setPreviewUrls((prev) => {
          const newPreviewUrls = new Map(prev);
          const previewUrl = newPreviewUrls.get(key);
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
          }
          newPreviewUrls.delete(key);
          return newPreviewUrls;
        });
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
   * Manual cleanup function - revokes all preview URLs
   * Useful for early cleanup before unmount
   */
  const cleanup = useCallback(() => {
    if (multipleMode) {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
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
        previewUrls.forEach((url) => URL.revokeObjectURL(url));
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
  };
}
