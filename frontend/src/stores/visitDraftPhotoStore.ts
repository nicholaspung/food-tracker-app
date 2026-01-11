import { create } from "zustand";
import { MAX_PHOTOS_PER_FOOD_ITEM } from "@/constants/limits";

/**
 * Zustand store for visit draft photos
 *
 * Persists photos across navigation within the add-visit flow.
 * Photos are stored in memory (won't survive page refresh, but will survive
 * navigation between add-visit steps).
 *
 * Supports multiple photos per item (up to MAX_PHOTOS_PER_FOOD_ITEM).
 *
 * Key: item index (number)
 * Value: Array of File objects
 */
interface VisitDraftPhotoStore {
  // Photo storage (arrays per item)
  photos: Map<number, File[]>;
  previewUrls: Map<number, string[]>;

  // Actions
  addPhoto: (index: number, file: File) => boolean; // Returns false if at max
  addMultiplePhotos: (index: number, files: File[]) => number; // Returns count of photos added
  removePhoto: (index: number, photoIndex: number) => void;
  removeAllPhotos: (index: number) => void;
  clearAllPhotos: () => void;

  // Getters
  getPhotos: (index: number) => File[];
  getPreviewUrls: (index: number) => string[];
  getPhotoCount: (index: number) => number;
  hasPhotos: () => boolean;
}

export const useVisitDraftPhotoStore = create<VisitDraftPhotoStore>(
  (set, get) => ({
    // Initial state
    photos: new Map(),
    previewUrls: new Map(),

    // Actions
    addPhoto: (index, file) => {
      const { photos, previewUrls } = get();
      const currentPhotos = photos.get(index) || [];

      // Check if at max limit
      if (currentPhotos.length >= MAX_PHOTOS_PER_FOOD_ITEM) {
        return false;
      }

      // Create new maps to trigger re-render
      const newPhotos = new Map(photos);
      const newPreviewUrls = new Map(previewUrls);

      // Add new photo to array
      const updatedPhotos = [...currentPhotos, file];
      newPhotos.set(index, updatedPhotos);

      // Create preview URL for new photo
      const currentUrls = previewUrls.get(index) || [];
      const updatedUrls = [...currentUrls, URL.createObjectURL(file)];
      newPreviewUrls.set(index, updatedUrls);

      set({ photos: newPhotos, previewUrls: newPreviewUrls });
      return true;
    },

    addMultiplePhotos: (index, files) => {
      const { photos, previewUrls } = get();
      const currentPhotos = photos.get(index) || [];
      const currentUrls = previewUrls.get(index) || [];

      // Calculate how many we can add
      const remainingSlots = MAX_PHOTOS_PER_FOOD_ITEM - currentPhotos.length;
      if (remainingSlots <= 0) {
        return 0;
      }

      // Limit files to remaining slots
      const filesToAdd = files.slice(0, remainingSlots);

      // Create new maps to trigger re-render
      const newPhotos = new Map(photos);
      const newPreviewUrls = new Map(previewUrls);

      // Add all photos and create preview URLs
      const updatedPhotos = [...currentPhotos, ...filesToAdd];
      const newUrls = filesToAdd.map(file => URL.createObjectURL(file));
      const updatedUrls = [...currentUrls, ...newUrls];

      newPhotos.set(index, updatedPhotos);
      newPreviewUrls.set(index, updatedUrls);

      set({ photos: newPhotos, previewUrls: newPreviewUrls });
      return filesToAdd.length;
    },

    removePhoto: (index, photoIndex) => {
      const { photos, previewUrls } = get();
      const currentPhotos = photos.get(index) || [];
      const currentUrls = previewUrls.get(index) || [];

      if (photoIndex < 0 || photoIndex >= currentPhotos.length) {
        return;
      }

      // Revoke the preview URL being removed
      if (currentUrls[photoIndex]) {
        URL.revokeObjectURL(currentUrls[photoIndex]);
      }

      // Create new maps
      const newPhotos = new Map(photos);
      const newPreviewUrls = new Map(previewUrls);

      // Remove photo at specified index
      const updatedPhotos = currentPhotos.filter((_, i) => i !== photoIndex);
      const updatedUrls = currentUrls.filter((_, i) => i !== photoIndex);

      if (updatedPhotos.length === 0) {
        newPhotos.delete(index);
        newPreviewUrls.delete(index);
      } else {
        newPhotos.set(index, updatedPhotos);
        newPreviewUrls.set(index, updatedUrls);
      }

      set({ photos: newPhotos, previewUrls: newPreviewUrls });
    },

    removeAllPhotos: (index) => {
      const { photos, previewUrls } = get();
      const currentUrls = previewUrls.get(index) || [];

      // Revoke all preview URLs for this item
      currentUrls.forEach((url) => URL.revokeObjectURL(url));

      const newPhotos = new Map(photos);
      const newPreviewUrls = new Map(previewUrls);

      newPhotos.delete(index);
      newPreviewUrls.delete(index);

      set({ photos: newPhotos, previewUrls: newPreviewUrls });
    },

    clearAllPhotos: () => {
      const { previewUrls } = get();

      // Revoke all preview URLs
      previewUrls.forEach((urls) => {
        urls.forEach((url) => URL.revokeObjectURL(url));
      });

      set({ photos: new Map(), previewUrls: new Map() });
    },

    // Getters
    getPhotos: (index) => get().photos.get(index) || [],
    getPreviewUrls: (index) => get().previewUrls.get(index) || [],
    getPhotoCount: (index) => (get().photos.get(index) || []).length,
    hasPhotos: () => get().photos.size > 0,
  })
);
