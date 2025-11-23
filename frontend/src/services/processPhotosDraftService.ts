import { Restaurant } from '@/lib/pocketbase';

const PROCESS_PHOTOS_DRAFT_KEY = 'processPhotosDraft';

export interface ProcessedPhotoDraft {
  photoId: string;
  photoDataUrl: string; // Base64 data URL for the photo
  restaurant: Restaurant;
  menuItemName: string;
  menuItemDescription: string;
  rating: number;
  notes: string;
  isNewMenuItem: boolean;
}

export interface ProcessPhotosDraft {
  photos: Array<{
    id: string;
    dataUrl: string; // Base64 data URL
  }>;
  currentPhotoIndex: number;
  processedPhotos: ProcessedPhotoDraft[];
  currentFormState?: {
    selectedRestaurant: Restaurant | null;
    menuItemName: string;
    rating: number | null;
    notes: string;
    isCreatingNewItem: boolean;
  };
}

const getEmptyDraft = (): ProcessPhotosDraft => ({
  photos: [],
  currentPhotoIndex: 0,
  processedPhotos: [],
});

export const processPhotosDraftService = {
  /**
   * Get the current draft from localStorage
   */
  getDraft(): ProcessPhotosDraft {
    try {
      const stored = localStorage.getItem(PROCESS_PHOTOS_DRAFT_KEY);
      if (!stored) {
        return getEmptyDraft();
      }
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to load process photos draft:', error);
      return getEmptyDraft();
    }
  },

  /**
   * Save photos to draft (converts File objects to data URLs)
   */
  async savePhotos(files: File[]): Promise<void> {
    const photoDataUrls = await Promise.all(
      files.map(async (file, index) => {
        const dataUrl = await fileToDataUrl(file);
        return {
          id: `${Date.now()}-${index}`,
          dataUrl,
        };
      })
    );

    const draft = this.getDraft();
    draft.photos = photoDataUrls;
    draft.currentPhotoIndex = 0;
    draft.processedPhotos = [];
    draft.currentFormState = undefined;
    localStorage.setItem(PROCESS_PHOTOS_DRAFT_KEY, JSON.stringify(draft));
  },

  /**
   * Save current photo index
   */
  saveCurrentIndex(index: number): void {
    const draft = this.getDraft();
    draft.currentPhotoIndex = index;
    localStorage.setItem(PROCESS_PHOTOS_DRAFT_KEY, JSON.stringify(draft));
  },

  /**
   * Save processed photo data
   */
  async saveProcessedPhoto(
    photoId: string,
    photoFile: File,
    restaurant: Restaurant,
    menuItemName: string,
    menuItemDescription: string,
    rating: number,
    notes: string,
    isNewMenuItem: boolean
  ): Promise<void> {
    const draft = this.getDraft();

    const photoDataUrl = await fileToDataUrl(photoFile);

    const processedPhoto: ProcessedPhotoDraft = {
      photoId,
      photoDataUrl,
      restaurant,
      menuItemName,
      menuItemDescription,
      rating,
      notes,
      isNewMenuItem,
    };

    draft.processedPhotos.push(processedPhoto);
    localStorage.setItem(PROCESS_PHOTOS_DRAFT_KEY, JSON.stringify(draft));
  },

  /**
   * Save current form state (for restoration)
   */
  saveFormState(
    selectedRestaurant: Restaurant | null,
    menuItemName: string,
    rating: number | null,
    notes: string,
    isCreatingNewItem: boolean
  ): void {
    const draft = this.getDraft();
    draft.currentFormState = {
      selectedRestaurant,
      menuItemName,
      rating,
      notes,
      isCreatingNewItem,
    };
    localStorage.setItem(PROCESS_PHOTOS_DRAFT_KEY, JSON.stringify(draft));
  },

  /**
   * Clear the draft (after successful submission or cancellation)
   */
  clearDraft(): void {
    localStorage.removeItem(PROCESS_PHOTOS_DRAFT_KEY);
  },

  /**
   * Check if a draft exists
   */
  hasDraft(): boolean {
    const draft = this.getDraft();
    return draft.photos.length > 0;
  },

  /**
   * Check if there are any processed photos
   */
  hasProcessedPhotos(): boolean {
    const draft = this.getDraft();
    return draft.processedPhotos.length > 0;
  },
};

/**
 * Convert File to base64 data URL for storage
 */
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convert data URL back to File object
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}
