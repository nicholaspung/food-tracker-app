import { Restaurant } from '@/lib/pocketbase';

const DB_NAME = 'ProcessPhotosDB';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'current';

export interface ProcessedPhotoDraft {
  photoId: string;
  photo: File; // Store File directly instead of data URL
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
    file: File; // Store File directly
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

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * Save data to IndexedDB
 */
async function saveToDB<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
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
      const draft = await getFromDB<ProcessPhotosDraft>(DRAFT_KEY);
      return draft || getEmptyDraft();
    } catch (error) {
      console.error('Failed to load process photos draft:', error);
      return getEmptyDraft();
    }
  },

  /**
   * Save photos to draft (stores File objects directly)
   */
  async savePhotos(files: File[]): Promise<void> {
    const photos = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
    }));

    const draft = await this.getDraft();
    draft.photos = photos;
    draft.currentPhotoIndex = 0;
    draft.processedPhotos = [];
    draft.currentFormState = undefined;
    await saveToDB(DRAFT_KEY, draft);
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

    const processedPhoto: ProcessedPhotoDraft = {
      photoId,
      photo: photoFile, // Store File directly
      restaurant,
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
    const draft = await this.getDraft();
    draft.currentFormState = {
      selectedRestaurant,
      menuItemName,
      rating,
      notes,
      isCreatingNewItem,
    };
    await saveToDB(DRAFT_KEY, draft);
  },

  /**
   * Clear the draft (after successful submission or cancellation)
   */
  async clearDraft(): Promise<void> {
    await deleteFromDB(DRAFT_KEY);
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
};
