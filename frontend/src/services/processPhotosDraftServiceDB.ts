import { logger } from '@/lib/logger';
import { Restaurant } from '@/lib/pocketbase';

const DB_NAME = 'ProcessPhotosDB';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'current';

export interface ProcessedPhotoDraft {
  photoId: string;
  photoDataUrl: string; // Store as base64 data URL (fully serializable)
  photoFileName: string;
  photoFileType: string;
  restaurant: Restaurant;
  menuItemName: string;
  menuItemDescription: string;
  rating: number;
  notes: string;
  isNewMenuItem: boolean;
  captureDate?: Date | null; // Capture date from EXIF data
}

export interface QuickTrackPhotoDraft {
  photoId: string;
  photoDataUrl: string; // Store as base64 data URL (fully serializable)
  photoFileName: string;
  photoFileType: string;
  itemName: string;
  category: 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other' | '';
  rating: number;
  locationText: string;
  notes: string;
  visibility: 'friends' | 'private';
  captureDate?: Date | null; // Capture date from EXIF data
}

export interface ProcessPhotosDraft {
  photos: Array<{
    id: string;
    dataUrl: string; // Store as base64 data URL (fully serializable)
    fileName: string;
    fileType: string;
  }>;
  currentPhotoIndex: number;
  processedPhotos: ProcessedPhotoDraft[];
  quickTrackPhotos?: QuickTrackPhotoDraft[]; // Quick track items
  visitVisibility: 'friends' | 'private';
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
  visitVisibility: 'friends',
});

/**
 * Open IndexedDB connection
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Get data from IndexedDB
 */
async function getFromDB<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onerror = () => {
      logger.error('[IndexedDB] GET error:', request.error);
      reject(request.error);
    };
    request.onsuccess = () => {
      const result = request.result || null;
      logger.log('[IndexedDB] GET success:', {
        key,
        hasResult: !!result,
        resultType: typeof result,
        result: result, // Log the actual value being retrieved
      });
      resolve(result);
    };
  });
}

/**
 * Save data to IndexedDB
 */
async function saveToDB<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    logger.log('[IndexedDB] Attempting to PUT:', {
      key,
      valueType: typeof value,
      value: value, // Log the actual value being saved
    });

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Add transaction error handler
    transaction.onerror = () => {
      logger.error('[IndexedDB] Transaction error:', transaction.error);
    };

    transaction.onabort = () => {
      logger.error('[IndexedDB] Transaction aborted');
    };

    const request = store.put(value, key);

    request.onerror = () => {
      logger.error('[IndexedDB] PUT error:', request.error);
      reject(request.error);
    };
    request.onsuccess = () => {
      logger.log('[IndexedDB] PUT success:', { key });
      resolve();
    };
  });
}

/**
 * Delete data from IndexedDB
 */
async function deleteFromDB(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export const processPhotosDraftService = {
  /**
   * Get the current draft from IndexedDB
   */
  async getDraft(): Promise<ProcessPhotosDraft> {
    try {
      logger.log('[DraftService] Getting draft from IndexedDB...');
      const draft = await getFromDB<ProcessPhotosDraft>(DRAFT_KEY);
      logger.log('[DraftService] Draft retrieved:', {
        hasDraft: !!draft,
        photosCount: draft?.photos?.length || 0,
        processedCount: draft?.processedPhotos?.length || 0,
        hasFormState: !!draft?.currentFormState,
        formStateDetails: draft?.currentFormState ? {
          hasRestaurant: !!draft.currentFormState.selectedRestaurant,
          restaurantName: draft.currentFormState.selectedRestaurant?.name,
          menuItemName: draft.currentFormState.menuItemName,
          rating: draft.currentFormState.rating,
          isCreatingNewItem: draft.currentFormState.isCreatingNewItem,
        } : null,
      });
      return draft || getEmptyDraft();
    } catch (error) {
      logger.error('[DraftService] Failed to load process photos draft:', error);
      return getEmptyDraft();
    }
  },

  /**
   * Convert File to base64 data URL
   */
  fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /**
   * Save photos to draft (converts Files to data URLs for reliable storage)
   */
  async savePhotos(files: File[]): Promise<void> {
    try {
      logger.log('[DraftService] Saving photos to draft:', files.length);

      // Convert Files to data URLs (base64) for fully serializable storage
      const photos = await Promise.all(
        files.map(async (file, index) => ({
          id: `${Date.now()}-${index}`,
          dataUrl: await this.fileToDataUrl(file),
          fileName: file.name,
          fileType: file.type,
        }))
      );

      const draft = await this.getDraft();
      draft.photos = photos;
      draft.currentPhotoIndex = 0;
      draft.processedPhotos = [];
      draft.currentFormState = undefined;
      draft.visitVisibility = draft.visitVisibility || 'friends'; // Preserve or default to 'friends'
      await saveToDB(DRAFT_KEY, draft);
      logger.log('[DraftService] Photos saved successfully');
    } catch (error) {
      logger.error('[DraftService] Failed to save photos:', error);
      throw error;
    }
  },

  /**
   * Save current photo index
   */
  async saveCurrentIndex(index: number): Promise<void> {
    const draft = await this.getDraft();
    draft.currentPhotoIndex = index;
    await saveToDB(DRAFT_KEY, draft);
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
    const draft = await this.getDraft();

    // Serialize restaurant to plain object
    const serializedRestaurant = {
      id: restaurant.id,
      name: restaurant.name,
      location: restaurant.location,
      cuisineType: restaurant.cuisineType,
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
      placeId: restaurant.placeId,
      isGooglePlace: restaurant.isGooglePlace,
      googlePlaceCachedAt: restaurant.googlePlaceCachedAt,
      createdBy: restaurant.createdBy,
      visibility: restaurant.visibility,
      created: restaurant.created,
      updated: restaurant.updated,
    };

    const processedPhoto: ProcessedPhotoDraft = {
      photoId,
      photoDataUrl: await this.fileToDataUrl(photoFile),
      photoFileName: photoFile.name,
      photoFileType: photoFile.type,
      restaurant: serializedRestaurant as any,
      menuItemName,
      menuItemDescription,
      rating,
      notes,
      isNewMenuItem,
    };

    draft.processedPhotos.push(processedPhoto);
    await saveToDB(DRAFT_KEY, draft);
  },

  /**
   * Save current form state (for restoration)
   */
  async saveFormState(
    selectedRestaurant: Restaurant | null,
    menuItemName: string,
    rating: number | null,
    notes: string,
    isCreatingNewItem: boolean
  ): Promise<void> {
    try {
      logger.log('[DraftService] Saving form state:', {
        hasRestaurant: !!selectedRestaurant,
        restaurantName: selectedRestaurant?.name,
        menuItemName,
        rating,
        notes: notes.substring(0, 20) + (notes.length > 20 ? '...' : ''),
        isCreatingNewItem,
      });
      const draft = await this.getDraft();

      // Serialize restaurant to plain object to ensure it can be stored in IndexedDB
      const serializedRestaurant = selectedRestaurant ? {
        id: selectedRestaurant.id,
        name: selectedRestaurant.name,
        location: selectedRestaurant.location,
        cuisineType: selectedRestaurant.cuisineType,
        latitude: selectedRestaurant.latitude,
        longitude: selectedRestaurant.longitude,
        placeId: selectedRestaurant.placeId,
        isGooglePlace: selectedRestaurant.isGooglePlace,
        googlePlaceCachedAt: selectedRestaurant.googlePlaceCachedAt,
        createdBy: selectedRestaurant.createdBy,
        visibility: selectedRestaurant.visibility,
        created: selectedRestaurant.created,
        updated: selectedRestaurant.updated,
      } : null;

      draft.currentFormState = {
        selectedRestaurant: serializedRestaurant as any,
        menuItemName,
        rating,
        notes,
        isCreatingNewItem,
      };

      // Log what we're about to save
      logger.log('[DraftService] About to save draft:', {
        photosCount: draft.photos.length,
        processedCount: draft.processedPhotos.length,
        hasFormState: !!draft.currentFormState,
        formState: draft.currentFormState,
      });

      await saveToDB(DRAFT_KEY, draft);

      // Verify it was saved by reading it back
      const verifyDraft = await this.getDraft();
      logger.log('[DraftService] Form state saved and verified:', {
        hasFormState: !!verifyDraft.currentFormState,
        hasRestaurant: !!verifyDraft.currentFormState?.selectedRestaurant,
        restaurantName: verifyDraft.currentFormState?.selectedRestaurant?.name,
        menuItemName: verifyDraft.currentFormState?.menuItemName,
        fullFormState: verifyDraft.currentFormState,
      });
    } catch (error) {
      logger.error('[DraftService] Failed to save form state:', error);
      throw error;
    }
  },

  /**
   * Clear the draft (after successful submission or cancellation)
   */
  async clearDraft(): Promise<void> {
    try {
      logger.log('[DraftService] Clearing draft');
      await deleteFromDB(DRAFT_KEY);
      logger.log('[DraftService] Draft cleared successfully');
    } catch (error) {
      logger.error('[DraftService] Failed to clear draft:', error);
      throw error;
    }
  },

  /**
   * Check if a draft exists
   */
  async hasDraft(): Promise<boolean> {
    const draft = await this.getDraft();
    return draft.photos.length > 0;
  },

  /**
   * Check if there are any processed photos
   */
  async hasProcessedPhotos(): Promise<boolean> {
    const draft = await this.getDraft();
    return draft.processedPhotos.length > 0;
  },

  /**
   * Update visit visibility
   */
  async saveVisitVisibility(visitVisibility: 'friends' | 'private'): Promise<void> {
    const draft = await this.getDraft();
    draft.visitVisibility = visitVisibility;
    await saveToDB(DRAFT_KEY, draft);
  },
};
