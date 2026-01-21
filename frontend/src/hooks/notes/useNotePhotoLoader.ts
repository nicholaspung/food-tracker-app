import { useState, useEffect } from "react";
import { logger } from "@/lib/logger";
import { PhotoToProcess } from "@/types/photos";
import { extractImageCaptureDate } from "@/lib/photoUtils";

interface UseNotePhotoLoaderResult {
  photos: PhotoToProcess[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch note photos from URLs and convert them to PhotoToProcess objects.
 * This is used when converting a note to a tracking entry via the Process Photos flow.
 */
export function useNotePhotoLoader(photoUrls: string[]): UseNotePhotoLoaderResult {
  const [photos, setPhotos] = useState<PhotoToProcess[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (photoUrls.length === 0) {
      setPhotos([]);
      return;
    }

    let cancelled = false;

    async function loadPhotos() {
      setIsLoading(true);
      setError(null);

      try {
        const loadedPhotos: PhotoToProcess[] = await Promise.all(
          photoUrls.map(async (url, index) => {
            // Fetch the image from the URL
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Failed to fetch photo: ${response.statusText}`);
            }

            const blob = await response.blob();

            // Get filename from URL or use default
            const urlParts = url.split("/");
            const filename = urlParts[urlParts.length - 1] || `note-photo-${index}.jpg`;

            // Create a File object from the blob
            const file = new File([blob], filename, { type: blob.type || "image/jpeg" });

            // Extract capture date from EXIF if available
            const captureDate = await extractImageCaptureDate(file);

            // Create preview URL
            const previewUrl = URL.createObjectURL(blob);

            return {
              id: `note-photo-${Date.now()}-${index}`,
              file,
              previewUrl,
              captureDate,
            };
          })
        );

        if (!cancelled) {
          setPhotos(loadedPhotos);
        }
      } catch (err) {
        logger.error("[useNotePhotoLoader] Failed to load photos:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Failed to load photos"));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadPhotos();

    // Cleanup function to revoke blob URLs and cancel if unmounted
    return () => {
      cancelled = true;
      photos.forEach((photo) => {
        URL.revokeObjectURL(photo.previewUrl);
      });
    };
  }, [photoUrls.join(",")]); // Re-run when URLs change (join to create stable dependency)

  return { photos, isLoading, error };
}
