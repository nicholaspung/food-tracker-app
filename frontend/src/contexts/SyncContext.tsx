/**
 * Sync Context - Manages offline data synchronization state
 *
 * Provides:
 * - Online/offline status detection
 * - Automatic sync when connection returns
 * - Queue statistics and sync state
 * - Manual sync trigger
 */

import { logger } from '@/lib/logger';
import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  syncQueue,
  type QueuedOperation,
  type SyncQueueStats,
  type VisitCreationData,
  type VisitDeletionData,
  type RestaurantCreationData,
} from '@/lib/syncQueue';
import { pb, type FoodItem } from '@/lib/pocketbase';
import { COLLECTIONS } from '@/constants/collections';

export interface SyncContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  queueStats: SyncQueueStats;
  lastSyncTime: number | null;
  syncError: string | null;
  triggerSync: () => Promise<void>;
  clearQueue: () => Promise<void>;
  retryFailedOperations: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

interface SyncProviderProps {
  children: React.ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps) {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queueStats, setQueueStats] = useState<SyncQueueStats>({ pending: 0, failed: 0, total: 0 });
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncInProgressRef = useRef(false);

  /**
   * Update queue statistics
   */
  const updateStats = useCallback(async (): Promise<void> => {
    try {
      const stats = await syncQueue.getStats();
      setQueueStats(stats);
    } catch (error) {
      logger.error('Failed to get queue stats:', error);
    }
  }, []);

  /**
   * Execute a single queued operation
   */
  const executeOperation = async (operation: QueuedOperation): Promise<void> => {
    const { type, collection, data, recordId } = operation;

    try {
      // Handle complex visit creation
      if (collection === 'visits_with_items' && type === 'create') {
        await executeComplexVisitCreation(data);
      }
      // Handle complex visit deletion
      else if (collection === 'visits_with_items_delete' && type === 'delete') {
        await executeComplexVisitDeletion(data);
      }
      // Handle complex restaurant creation
      else if (collection === 'restaurants_with_menu_items' && type === 'create') {
        await executeComplexRestaurantCreation(data, operation);
      } else {
        // Standard operations
        switch (type) {
          case 'create':
            await pb.collection(collection).create(data);
            break;

          case 'update':
            if (!recordId) throw new Error('Record ID required for update');
            await pb.collection(collection).update(recordId, data);
            break;

          case 'delete':
            if (!recordId) throw new Error('Record ID required for delete');
            await pb.collection(collection).delete(recordId);
            break;

          default:
            throw new Error(`Unknown operation type: ${type}`);
        }
      }

      // Success - remove from queue
      await syncQueue.dequeue(operation.id);
    } catch (error: unknown) {
      // Increment retries and store error
      operation.retries += 1;
      operation.error = error instanceof Error ? error.message : 'Unknown error';

      // Keep in queue for retry (up to 3 times)
      if (operation.retries < 3) {
        await syncQueue.update(operation);
      } else {
        // Mark as permanently failed but keep in queue for manual retry
        await syncQueue.update(operation);
        logger.error(`Operation ${operation.id} failed after 3 retries:`, error);
      }

      throw error;
    }
  };

  /**
   * Execute complex visit creation (visit + food items + photos)
   */
  const executeComplexVisitCreation = async (data: VisitCreationData): Promise<void> => {
    const { visit: visitData, foodItems, photos } = data;

    logger.log('[SyncContext] Attempting to create visit with data:', visitData);
    logger.log('[SyncContext] Visit fields:', {
      restaurant: visitData.restaurant,
      user: visitData.user,
      visitDate: visitData.visitDate,
      visibility: visitData.visibility,
      notes: visitData.notes,
    });

    // 1. Create visit
    const visit = await pb.collection(COLLECTIONS.VISITS).create(visitData);
    logger.log('Created visit:', visit.id);

    // 2. Create food items sequentially
    const createdFoodItems: FoodItem[] = [];
    for (const item of foodItems) {
      const foodItem = await pb.collection(COLLECTIONS.FOOD_ITEMS).create<FoodItem>({
        ...item,
        visit: visit.id,
      });
      createdFoodItems.push(foodItem);
      logger.log('Created food item:', foodItem.id);
    }

    // 3. Upload photos if any
    if (photos && photos.length > 0) {
      const { compressDishPhoto } = await import('@/services/photoService');

      for (const photoItem of photos) {
        const { index, file } = photoItem;

        if (index < createdFoodItems.length) {
          const foodItem = createdFoodItems[index];

          try {
            // Compress photo
            const compressed = await compressDishPhoto(file);

            // Upload to PocketBase
            const formData = new FormData();
            formData.append('photo', compressed);
            formData.append('visit', visit.id);
            formData.append('food_item', foodItem.id);
            if (visitData.user) {
              formData.append('user', visitData.user);
            }

            await pb.collection(COLLECTIONS.VISIT_PHOTOS).create(formData);
            logger.log('Uploaded photo for food item:', foodItem.id);
          } catch (error) {
            logger.error('Failed to upload photo, continuing...', error);
            // Don't fail the entire operation if photo upload fails
          }
        }
      }
    }

    logger.log('Complex visit creation complete');
  };

  /**
   * Execute complex visit deletion (delete food items + visit)
   */
  const executeComplexVisitDeletion = async (data: VisitDeletionData): Promise<void> => {
    const { visitId, foodItemIds } = data;

    // 1. Delete all food items
    if (foodItemIds && foodItemIds.length > 0) {
      await Promise.all(
        foodItemIds.map((id: string) => pb.collection(COLLECTIONS.FOOD_ITEMS).delete(id))
      );
      logger.log('Deleted', foodItemIds.length, 'food items');
    }

    // 2. Delete visit
    await pb.collection(COLLECTIONS.VISITS).delete(visitId);
    logger.log('Deleted visit:', visitId);
  };

  /**
   * Execute complex restaurant creation (restaurant + menu items)
   */
  const executeComplexRestaurantCreation = async (data: RestaurantCreationData, operation: QueuedOperation): Promise<void> => {
    const { restaurant: restaurantData, menuItems } = data;

    // 1. Create restaurant
    const restaurant = await pb.collection(COLLECTIONS.RESTAURANTS).create(restaurantData);
    logger.log('Created restaurant:', restaurant.id);

    // 2. Update any queued operations that reference the temp restaurant ID
    if (operation.localId) {
      logger.log(`Updating queued operations: replacing temp ID ${operation.localId} with real ID ${restaurant.id}`);
      await syncQueue.replaceRestaurantId(operation.localId, restaurant.id);
    }

    // 3. Create menu items sequentially
    if (menuItems && menuItems.length > 0) {
      for (const item of menuItems) {
        try {
          const menuItem = await pb.collection(COLLECTIONS.MENU_ITEMS).create({
            ...item,
            restaurant: restaurant.id,
          });
          logger.log('Created menu item:', menuItem.id, menuItem.name);
        } catch (error) {
          logger.error('Failed to create menu item, continuing...', error);
          // Don't fail the entire operation if one menu item fails
        }
      }
    }

    logger.log('Complex restaurant creation complete');
  };

  /**
   * Sync all pending operations
   */
  const syncOperations = useCallback(async (): Promise<void> => {
    // Prevent concurrent syncs
    if (syncInProgressRef.current) {
      logger.log('Sync already in progress, skipping...');
      return;
    }

    syncInProgressRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      let successCount = 0;
      let failCount = 0;

      // Keep syncing until no more operations remain
      // Refetch operations each iteration because restaurant creation updates other operations in the queue
      while (true) {
        // Get all pending operations (fresh each iteration)
        const operations = await syncQueue.getAll();

        if (operations.length === 0) {
          break;
        }

        // Filter out operations that have failed too many times
        const operationsToSync = operations.filter(op => op.retries < 3 && !op.error);

        if (operationsToSync.length === 0) {
          break;
        }

        if (successCount === 0) {
          logger.log(`Syncing ${operationsToSync.length} operations...`);
        }

        // Execute ONE operation at a time and refetch
        // This ensures we always have the latest data after updates (e.g., temp ID replacement)
        const operation = operationsToSync[0];

        try {
          await executeOperation(operation);
          successCount++;
        } catch (error) {
          failCount++;
          logger.error('Failed to sync operation:', operation, error);
          // Continue with other operations even if one fails
        }
      }

      logger.log(`Sync complete: ${successCount} succeeded, ${failCount} failed`);

      // Invalidate all queries to refetch fresh data
      if (successCount > 0) {
        await queryClient.invalidateQueries();
      }

      setLastSyncTime(Date.now());

      if (failCount > 0) {
        setSyncError(`${failCount} operation(s) failed to sync`);
      }
    } catch (error: unknown) {
      logger.error('Sync failed:', error);
      setSyncError(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
      syncInProgressRef.current = false;
      await updateStats();
    }
  }, [queryClient, updateStats]);

  /**
   * Clear all operations from queue (destructive)
   */
  const clearQueue = useCallback(async (): Promise<void> => {
    try {
      await syncQueue.clear();
      await updateStats();
    } catch (error) {
      logger.error('Failed to clear queue:', error);
    }
  }, [updateStats]);

  /**
   * Retry all failed operations
   */
  const retryFailedOperations = useCallback(async (): Promise<void> => {
    try {
      const failedOps = await syncQueue.getFailedOperations();

      for (const op of failedOps) {
        await syncQueue.retryOperation(op.id);
      }

      await updateStats();

      // Trigger sync if online
      if (isOnline) {
        await syncOperations();
      }
    } catch (error) {
      logger.error('Failed to retry operations:', error);
    }
  }, [isOnline, syncOperations, updateStats]);

  /**
   * Handle online/offline events
   */
  useEffect(() => {
    const handleOnline = (): void => {
      logger.log('Connection restored, triggering sync...');
      setIsOnline(true);
      // Trigger sync after a short delay to ensure connection is stable
      setTimeout(() => {
        syncOperations();
      }, 1000);
    };

    const handleOffline = (): void => {
      logger.log('Connection lost');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncOperations]);

  /**
   * Initialize sync queue and load stats
   */
  useEffect(() => {
    syncQueue.init().then(() => {
      updateStats();

      // Auto-sync on mount if online and there are pending operations
      syncQueue.getStats().then(stats => {
        if (stats.pending > 0 && navigator.onLine) {
          logger.log('Found pending operations on mount, syncing...');
          syncOperations();
        }
      });
    });
  }, [updateStats, syncOperations]);

  /**
   * Periodic stats update
   */
  useEffect(() => {
    const interval = setInterval(updateStats, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, [updateStats]);

  const value: SyncContextValue = useMemo(() => ({
    isOnline,
    isSyncing,
    queueStats,
    lastSyncTime,
    syncError,
    triggerSync: syncOperations,
    clearQueue,
    retryFailedOperations,
  }), [isOnline, isSyncing, queueStats, lastSyncTime, syncError, syncOperations, clearQueue, retryFailedOperations]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/**
 * Hook to access sync context
 */
export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
