import { create } from "zustand";

/**
 * Zustand store for visit draft photos
 *
 * Persists photos across navigation within the add-visit flow.
 * Photos are stored in memory (won't survive page refresh, but will survive
 * navigation between add-visit steps).
 *
 * Key: item index (number)
 * Value: File object
 */
interface VisitDraftPhotoStore {
  // Photo storage
  photos: Map<number, File>;
  previewUrls: Map<number, string>;

  // Actions
  setPhoto: (index: number, file: File) => void;
  removePhoto: (index: number) => void;
  clearAllPhotos: () => void;

  // Getters
  getPhoto: (index: number) => File | undefined;
  getPreviewUrl: (index: number) => string | undefined;
  hasPhotos: () => boolean;
}

export const useVisitDraftPhotoStore = create<VisitDraftPhotoStore>(
  (set, get) => ({
    // Initial state
    photos: new Map(),
    previewUrls: new Map(),

    // Actions
    setPhoto: (index, file) => {
      const { photos, previewUrls } = get();

      // Create new maps to trigger re-render
      const newPhotos = new Map(photos);
      const newPreviewUrls = new Map(previewUrls);

      // Revoke old preview URL if exists
      const oldUrl = newPreviewUrls.get(index);
      if (oldUrl) {
        URL.revokeObjectURL(oldUrl);
      }

      // Set new photo and create preview URL
      newPhotos.set(index, file);
      newPreviewUrls.set(index, URL.createObjectURL(file));

      set({ photos: newPhotos, previewUrls: newPreviewUrls });
    },

    removePhoto: (index) => {
      const { photos, previewUrls } = get();

      const newPhotos = new Map(photos);
      const newPreviewUrls = new Map(previewUrls);

      // Revoke preview URL
      const url = newPreviewUrls.get(index);
      if (url) {
        URL.revokeObjectURL(url);
      }

      newPhotos.delete(index);
      newPreviewUrls.delete(index);

      set({ photos: newPhotos, previewUrls: newPreviewUrls });
    },

    clearAllPhotos: () => {
      const { previewUrls } = get();

      // Revoke all preview URLs
      previewUrls.forEach((url) => URL.revokeObjectURL(url));

      set({ photos: new Map(), previewUrls: new Map() });
    },

    // Getters
    getPhoto: (index) => get().photos.get(index),
    getPreviewUrl: (index) => get().previewUrls.get(index),
    hasPhotos: () => get().photos.size > 0,
  })
);
