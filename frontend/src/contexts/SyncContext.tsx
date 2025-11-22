/**
 * Sync Context - Manages offline data synchronization state
 *
 * Provides:
 * - Online/offline status detection
 * - Automatic sync when connection returns
 * - Queue statistics and sync state
 * - Manual sync trigger
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncQueue, type QueuedOperation, type SyncQueueStats } from '@/lib/syncQueue';
import { pb } from '@/lib/pocketbase';

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
  const updateStats = useCallback(async () => {
    try {
      const stats = await syncQueue.getStats();
      setQueueStats(stats);
    } catch (error) {
      console.error('Failed to get queue stats:', error);
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
        await executeComplexRestaurantCreation(data);
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
    } catch (error: any) {
      // Increment retries and store error
      operation.retries += 1;
      operation.error = error?.message || 'Unknown error';

      // Keep in queue for retry (up to 3 times)
      if (operation.retries < 3) {
        await syncQueue.update(operation);
      } else {
        // Mark as permanently failed but keep in queue for manual retry
        await syncQueue.update(operation);
        console.error(`Operation ${operation.id} failed after 3 retries:`, error);
      }

      throw error;
    }
  };

  /**
   * Execute complex visit creation (visit + food items + photos)
   */
  const executeComplexVisitCreation = async (data: any): Promise<void> => {
    const { visit: visitData, foodItems, photos } = data;

    // 1. Create visit
    const visit = await pb.collection('visits').create(visitData);
    console.log('Created visit:', visit.id);

    // 2. Create food items sequentially
    const createdFoodItems: any[] = [];
    for (const item of foodItems) {
      const foodItem = await pb.collection('food_items').create({
        ...item,
        visit: visit.id,
      });
      createdFoodItems.push(foodItem);
      console.log('Created food item:', foodItem.id);
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
            formData.append('user', visitData.user);

            await pb.collection('visit_photos').create(formData);
            console.log('Uploaded photo for food item:', foodItem.id);
          } catch (error) {
            console.error('Failed to upload photo, continuing...', error);
            // Don't fail the entire operation if photo upload fails
          }
        }
      }
    }

    console.log('Complex visit creation complete');
  };

  /**
   * Execute complex visit deletion (delete food items + visit)
   */
  const executeComplexVisitDeletion = async (data: any): Promise<void> => {
    const { visitId, foodItemIds } = data;

    // 1. Delete all food items
    if (foodItemIds && foodItemIds.length > 0) {
      await Promise.all(
        foodItemIds.map((id: string) => pb.collection('food_items').delete(id))
      );
      console.log('Deleted', foodItemIds.length, 'food items');
    }

    // 2. Delete visit
    await pb.collection('visits').delete(visitId);
    console.log('Deleted visit:', visitId);
  };

  /**
   * Execute complex restaurant creation (restaurant + menu items)
   */
  const executeComplexRestaurantCreation = async (data: any): Promise<void> => {
    const { restaurant: restaurantData, menuItems } = data;

    // 1. Create restaurant
    const restaurant = await pb.collection('restaurants').create(restaurantData);
    console.log('Created restaurant:', restaurant.id);

    // 2. Create menu items sequentially
    if (menuItems && menuItems.length > 0) {
      for (const item of menuItems) {
        try {
          const menuItem = await pb.collection('menu_items').create({
            ...item,
            restaurant: restaurant.id,
          });
          console.log('Created menu item:', menuItem.id, menuItem.name);
        } catch (error) {
          console.error('Failed to create menu item, continuing...', error);
          // Don't fail the entire operation if one menu item fails
        }
      }
    }

    console.log('Complex restaurant creation complete');
  };

  /**
   * Sync all pending operations
   */
  const syncOperations = useCallback(async () => {
    // Prevent concurrent syncs
    if (syncInProgressRef.current) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    syncInProgressRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      // Get all pending operations
      const operations = await syncQueue.getAll();

      if (operations.length === 0) {
        setLastSyncTime(Date.now());
        return;
      }

      console.log(`Syncing ${operations.length} operations...`);

      // Filter out operations that have failed too many times
      const operationsToSync = operations.filter(op => op.retries < 3 && !op.error);

      let successCount = 0;
      let failCount = 0;

      // Execute operations sequentially to respect dependencies
      for (const operation of operationsToSync) {
        try {
          await executeOperation(operation);
          successCount++;
        } catch (error) {
          failCount++;
          console.error('Failed to sync operation:', operation, error);
          // Continue with other operations even if one fails
        }
      }

      console.log(`Sync complete: ${successCount} succeeded, ${failCount} failed`);

      // Invalidate all queries to refetch fresh data
      if (successCount > 0) {
        await queryClient.invalidateQueries();
      }

      setLastSyncTime(Date.now());

      if (failCount > 0) {
        setSyncError(`${failCount} operation(s) failed to sync`);
      }
    } catch (error: any) {
      console.error('Sync failed:', error);
      setSyncError(error?.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
      syncInProgressRef.current = false;
      await updateStats();
    }
  }, [queryClient, updateStats]);

  /**
   * Clear all operations from queue (destructive)
   */
  const clearQueue = useCallback(async () => {
    try {
      await syncQueue.clear();
      await updateStats();
    } catch (error) {
      console.error('Failed to clear queue:', error);
    }
  }, [updateStats]);

  /**
   * Retry all failed operations
   */
  const retryFailedOperations = useCallback(async () => {
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
      console.error('Failed to retry operations:', error);
    }
  }, [isOnline, syncOperations, updateStats]);

  /**
   * Handle online/offline events
   */
  useEffect(() => {
    const handleOnline = () => {
      console.log('Connection restored, triggering sync...');
      setIsOnline(true);
      // Trigger sync after a short delay to ensure connection is stable
      setTimeout(() => {
        syncOperations();
      }, 1000);
    };

    const handleOffline = () => {
      console.log('Connection lost');
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
          console.log('Found pending operations on mount, syncing...');
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
