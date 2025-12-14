/**
 * Sync Queue - IndexedDB-based offline data synchronization
 *
 * Stores pending mutations while offline and replays them when connection returns.
 * Supports create, update, and delete operations across all PocketBase collections.
 */

import type { FoodItem, Visit, Restaurant, MenuItem } from '@/lib/pocketbase';

export type OperationType = 'create' | 'update' | 'delete';

/**
 * Complex operation data types for multi-record operations
 */
export interface VisitCreationData {
  visit: Partial<Visit>;
  foodItems: Partial<FoodItem>[];
  photos?: Array<{ index: number; file: File }>;
}

export interface VisitDeletionData {
  visitId: string;
  foodItemIds: string[];
}

export interface RestaurantCreationData {
  restaurant: Partial<Restaurant>;
  menuItems?: Partial<MenuItem>[];
}

/**
 * Discriminated union for all possible operation data types
 */
export type OperationData =
  // Complex operations
  | { collection: 'visits_with_items'; type: 'create'; data: VisitCreationData }
  | { collection: 'visits_with_items_delete'; type: 'delete'; data: VisitDeletionData }
  | { collection: 'restaurants_with_menu_items'; type: 'create'; data: RestaurantCreationData }
  // Standard create operations
  | { collection: string; type: 'create'; data: Record<string, unknown> }
  // Standard update operations
  | { collection: string; type: 'update'; data: Record<string, unknown> }
  // Standard delete operations (data not used for deletes)
  | { collection: string; type: 'delete'; data?: never };

export interface QueuedOperation {
  id: string; // Unique ID for this queued operation
  type: OperationType;
  collection: string;
  data: VisitCreationData | VisitDeletionData | RestaurantCreationData | Record<string, unknown> | undefined;
  recordId?: string; // PocketBase record ID for update/delete operations
  timestamp: number;
  retries: number;
  error?: string;
  localId?: string; // Client-generated ID for optimistic updates
  dependencies?: string[]; // IDs of operations this depends on
}

export interface SyncQueueStats {
  pending: number;
  failed: number;
  total: number;
}

class SyncQueueManager {
  private dbName = 'food-tracker-sync';
  private dbVersion = 1;
  private storeName = 'operations';
  private db: IDBDatabase | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('collection', 'collection', { unique: false });
          store.createIndex('retries', 'retries', { unique: false });
        }
      };
    });
  }

  /**
   * Ensure database is initialized
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }
    return this.db;
  }

  /**
   * Add a new operation to the queue
   */
  async enqueue(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>): Promise<string> {
    const db = await this.ensureDB();

    const queuedOp: QueuedOperation = {
      ...operation,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retries: 0,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(queuedOp);

      request.onsuccess = () => resolve(queuedOp.id);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all pending operations, ordered by timestamp
   */
  async getAll(): Promise<QueuedOperation[]> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const operations = request.result as QueuedOperation[];
        // Sort by timestamp to maintain order
        operations.sort((a, b) => a.timestamp - b.timestamp);
        resolve(operations);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a specific operation by ID
   */
  async getById(id: string): Promise<QueuedOperation | null> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove an operation from the queue (after successful sync)
   */
  async dequeue(id: string): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update an operation (e.g., increment retries, update error)
   */
  async update(operation: QueuedOperation): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(operation);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all operations from the queue
   */
  async clear(): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<SyncQueueStats> {
    const operations = await this.getAll();

    return {
      pending: operations.filter(op => !op.error).length,
      failed: operations.filter(op => op.error).length,
      total: operations.length,
    };
  }

  /**
   * Get operations that failed after multiple retries
   */
  async getFailedOperations(): Promise<QueuedOperation[]> {
    const operations = await this.getAll();
    return operations.filter(op => op.retries >= 3);
  }

  /**
   * Retry a failed operation (reset error and retries)
   */
  async retryOperation(id: string): Promise<void> {
    const operation = await this.getById(id);
    if (!operation) return;

    operation.error = undefined;
    operation.retries = 0;
    await this.update(operation);
  }

  /**
   * Replace temp restaurant ID with real ID in all queued operations
   * This is called after a restaurant is successfully synced
   */
  async replaceRestaurantId(tempId: string, realId: string): Promise<void> {
    const operations = await this.getAll();

    for (const op of operations) {
      let updated = false;

      // Check if this operation references the temp restaurant ID
      if (op.data && typeof op.data === 'object') {
        // For complex visit operations
        if (op.collection === 'visits_with_items' && op.data.visit) {
          if (op.data.visit.restaurant === tempId) {
            op.data.visit.restaurant = realId;
            updated = true;
          }
        }

        // For simple restaurant references
        if (op.data.restaurant === tempId) {
          op.data.restaurant = realId;
          updated = true;
        }
      }

      if (updated) {
        console.log(`Updated operation ${op.id}: replaced restaurant ${tempId} -> ${realId}`);
        await this.update(op);
      }
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance
export const syncQueue = new SyncQueueManager();
