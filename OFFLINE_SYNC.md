# Offline Data Synchronization

This document explains how offline data sync works in the Food Tracker app and how to use it when implementing new features.

## Overview

The offline sync system allows users to continue using the app without an internet connection. All data operations (create, update, delete) are queued locally and automatically synchronized when the connection is restored.

## Architecture

### Components

1. **IndexedDB Sync Queue** (`src/lib/syncQueue.ts`)
   - Stores pending operations in browser's IndexedDB
   - Persists across page reloads
   - Tracks operation metadata (timestamps, retries, errors)

2. **Sync Context** (`src/contexts/SyncContext.tsx`)
   - Manages online/offline state detection
   - Triggers automatic sync when connection returns
   - Provides sync status and statistics
   - Exposes manual sync controls

3. **Offline Mutation Hooks** (`src/hooks/useOfflineMutation.ts`)
   - Wraps TanStack Query's `useMutation`
   - Automatically queues operations when offline
   - Executes immediately when online
   - Handles errors and retries

4. **Sync Status Indicator** (`src/components/SyncStatusIndicator.tsx`)
   - Visual feedback for users
   - Shows pending operations count
   - Manual sync trigger
   - Failed operation retry

## How It Works

### Online Behavior
1. User performs an action (e.g., add restaurant)
2. Mutation executes immediately via PocketBase API
3. Data is saved to server
4. UI updates with fresh data

### Offline Behavior
1. User performs an action while offline
2. Operation is queued in IndexedDB
3. Optimistic UI update (if configured)
4. Sync indicator shows pending count
5. When connection returns:
   - Auto-sync triggers after 1 second
   - Operations execute in order
   - Failed operations retry up to 3 times
   - Queries invalidate to refetch fresh data

### Conflict Resolution
- **Strategy**: Last-write-wins (server version takes precedence)
- Failed operations remain in queue for manual retry
- Users can view and retry failed operations via sync indicator

## Usage Guide

### Simple Mutations

Use the convenience hooks for common operations:

#### Create Operation
```tsx
import { useOfflineCreate } from '@/hooks/useOfflineMutation';

const createMutation = useOfflineCreate<Restaurant, CreateData>(
  'restaurants',
  {
    mutationFn: async (data) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('Not authenticated');

      return await pb.collection('restaurants').create<Restaurant>({
        ...data,
        createdBy: user.id,
      });
    },
    invalidateQueries: ['restaurants'],
    onSuccess: (newRestaurant) => {
      console.log('Restaurant created:', newRestaurant);
    },
    onError: (error) => {
      console.error('Failed to create restaurant:', error);
    },
  }
);

// Usage
createMutation.mutate({
  name: 'Pizza Palace',
  location: 'Downtown',
  visibility: 'public',
});
```

#### Update Operation
```tsx
import { useOfflineUpdate } from '@/hooks/useOfflineMutation';

const updateMutation = useOfflineUpdate<FoodItem, UpdateData>(
  'food_items',
  {
    mutationFn: async ({ id, data }) => {
      return await pb.collection('food_items').update<FoodItem>(id, data);
    },
    getRecordId: (variables) => variables.id,
    invalidateQueries: ['food_items'],
  }
);

// Usage
updateMutation.mutate({
  id: 'item123',
  data: { name: 'Updated Pizza', rating: 5 },
});
```

#### Delete Operation
```tsx
import { useOfflineDelete } from '@/hooks/useOfflineMutation';

const deleteMutation = useOfflineDelete<void, string>(
  'visits',
  {
    mutationFn: async (id) => {
      return await pb.collection('visits').delete(id);
    },
    getRecordId: (id) => id,
    invalidateQueries: ['visits', 'food_items'],
  }
);

// Usage
deleteMutation.mutate('visit123');
```

### Advanced: Custom Offline Mutations

For more control, use `useOfflineMutation` directly:

```tsx
import { useOfflineMutation } from '@/hooks/useOfflineMutation';

const customMutation = useOfflineMutation({
  collection: 'ratings',
  type: 'create',
  mutationFn: async (data) => {
    // Custom logic here
    return await pb.collection('ratings').create(data);
  },
  invalidateQueries: [['ratings'], ['food_items', data.foodItemId]],
  optimisticUpdate: (variables) => ({
    // Return optimistic data to show immediately
    id: `temp_${Date.now()}`,
    ...variables,
  }),
  onSuccess: async (data, variables) => {
    // Custom success handling
  },
  onError: (error, variables) => {
    // Custom error handling
  },
});
```

### Complex Multi-Step Mutations

#### Visit Creation (NEW - Full Offline Support!)

For creating visits with food items and photos, use the specialized `useOfflineVisitCreation` hook:

```tsx
import { useOfflineVisitCreation } from '@/hooks/useOfflineVisitCreation';

const saveVisitMutation = useOfflineVisitCreation();

// Prepare data
const visitData = {
  restaurant: restaurantId,
  visitDate: '2025-01-15',
  visibility: 'friends',
  notes: 'Great food!',
  foodItems: [
    { name: 'Pizza', description: 'Margherita', rating: 5, notes: 'Amazing!' },
    { name: 'Pasta', description: 'Carbonara', rating: 4, notes: 'Delicious' },
  ],
  itemPhotos: new Map([
    [0, photoFile1], // Photo for first item
    [1, photoFile2], // Photo for second item
  ]),
};

// Create visit (works online AND offline!)
await saveVisitMutation.mutateAsync(visitData);
```

**What happens offline:**
- Visit and food items are queued in IndexedDB
- Photos are stored as File objects (IndexedDB supports this!)
- When connection returns, everything syncs automatically
- Photos are compressed and uploaded
- Queries are invalidated to show fresh data

**Example implementation:** See `frontend/src/components/RateItemsPage.tsx`

#### Visit Deletion (NEW - Full Offline Support!)

Deleting visits with associated food items also works offline:

```tsx
import { syncQueue } from '@/lib/syncQueue';
import { useSync } from '@/contexts/SyncContext';

const { isOnline } = useSync();

const handleDeleteVisit = async (visitId: string) => {
  if (isOnline) {
    // Online: Delete immediately
    await pb.collection('visits').delete(visitId);
  } else {
    // Offline: Queue deletion
    await syncQueue.enqueue({
      type: 'delete',
      collection: 'visits_with_items_delete',
      data: {
        visitId,
        foodItemIds: foodItems.filter(item => item.visit === visitId).map(item => item.id),
      },
      recordId: visitId,
    });
  }

  // Invalidate queries
  await queryClient.invalidateQueries({ queryKey: ['visits'] });
};
```

**Example implementation:** See `frontend/src/components/HomePage.tsx`

#### Other Complex Operations

For operations involving multiple steps that aren't covered by specialized hooks:

**Option 1: Queue Each Operation Separately** (Recommended for independent operations)
```tsx
// Each operation will be queued and synced independently
const createVisit = useOfflineCreate('visits', { ... });
const createFoodItem = useOfflineCreate('food_items', { ... });

// Execute sequentially
const visit = await createVisit.mutateAsync(visitData);
await createFoodItem.mutateAsync({
  ...foodItemData,
  visit: visit.id,
});
```

**Option 2: Use Standard useMutation** (For tightly coupled operations)
```tsx
import { useMutation } from '@tanstack/react-query';

// Complex operations that must succeed/fail together
// should use standard mutation for now
const complexMutation = useMutation({
  mutationFn: async (data) => {
    // All operations execute together
    const visit = await pb.collection('visits').create(data.visit);
    const foodItems = await Promise.all(
      data.foodItems.map(item =>
        pb.collection('food_items').create({ ...item, visit: visit.id })
      )
    );
    return { visit, foodItems };
  },
  onSuccess: () => {
    queryClient.invalidateQueries(['visits', 'food_items']);
  },
});

// Note: This will fail if offline and won't queue operations
```

## Accessing Sync State

Use the `useSync` hook to access sync state in components:

```tsx
import { useSync } from '@/contexts/SyncContext';

function MyComponent() {
  const {
    isOnline,          // boolean: connection status
    isSyncing,         // boolean: sync in progress
    queueStats,        // { pending, failed, total }
    lastSyncTime,      // number | null: timestamp
    syncError,         // string | null: error message
    triggerSync,       // () => Promise<void>: manual sync
    clearQueue,        // () => Promise<void>: clear all
    retryFailedOperations, // () => Promise<void>: retry failed
  } = useSync();

  return (
    <div>
      <p>Status: {isOnline ? 'Online' : 'Offline'}</p>
      <p>Pending: {queueStats.pending}</p>
      {queueStats.failed > 0 && (
        <button onClick={retryFailedOperations}>
          Retry {queueStats.failed} Failed Operations
        </button>
      )}
    </div>
  );
}
```

## Migration Guide

### Converting Existing Mutations

**Before:**
```tsx
import { useMutation } from '@tanstack/react-query';

const mutation = useMutation({
  mutationFn: async (data) => {
    return await pb.collection('restaurants').create(data);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['restaurants'] });
  },
});
```

**After:**
```tsx
import { useOfflineCreate } from '@/hooks/useOfflineMutation';

const mutation = useOfflineCreate('restaurants', {
  mutationFn: async (data) => {
    return await pb.collection('restaurants').create(data);
  },
  invalidateQueries: ['restaurants'],
});
```

### Key Changes:
1. Import `useOfflineCreate/Update/Delete` instead of `useMutation`
2. Specify collection name as first argument
3. Use `invalidateQueries` array instead of manual invalidation
4. Optional: Add `optimisticUpdate` for instant UI feedback

## Best Practices

### 1. Use Offline Hooks for Simple Operations
✅ **Good**: Single create/update/delete operations
```tsx
const createItem = useOfflineCreate('food_items', { ... });
```

❌ **Avoid**: Complex multi-step transactions (use standard mutation for now)

### 2. Always Invalidate Related Queries
```tsx
invalidateQueries: ['restaurants', 'visits', 'food_items']
```

### 3. Provide User Feedback
- The `SyncStatusIndicator` automatically shows sync state
- Use `useSync()` to add custom feedback in your components
- Show loading states during mutations

### 4. Handle Errors Gracefully
```tsx
onError: (error) => {
  if (error.message.includes('queued for later sync')) {
    setMessage('Saved offline - will sync when online');
  } else {
    setError(error.message);
  }
}
```

### 5. Test Offline Scenarios
- Use Chrome DevTools > Network > Offline
- Test with slow 3G to simulate poor connections
- Verify data syncs correctly when reconnecting

## Limitations

### Current Limitations:
1. **No Conflict UI**: Failed operations just show error count (can manually retry)
2. **Simple Retry Logic**: Fixed 3 retry attempts
3. **No Offline-First Queries**: Read operations require connection
4. **Limited Complex Operations**: Only visit creation/deletion supported with special hooks

### ✅ Recently Added:
- [x] File upload queuing (photos stored in IndexedDB!)
- [x] Complex visit creation (visit + food items + photos)
- [x] Complex visit deletion (cascading deletes)
- [x] Transaction-like support for visits

### Planned Enhancements:
- [ ] Visit editing offline support
- [ ] Generic dependency tracking system
- [ ] Conflict resolution UI with user choice
- [ ] Intelligent retry with exponential backoff
- [ ] Offline-first query caching
- [ ] Optimistic update templates
- [ ] Sync progress notifications
- [ ] Partial sync failure handling

## Debugging

### Check Queue Contents
```tsx
import { syncQueue } from '@/lib/syncQueue';

// Get all pending operations
const operations = await syncQueue.getAll();
console.log('Pending operations:', operations);

// Get failed operations
const failed = await syncQueue.getFailedOperations();
console.log('Failed operations:', failed);

// Get statistics
const stats = await syncQueue.getStats();
console.log('Queue stats:', stats);
```

### Monitor Sync Events
Open browser console to see sync logs:
```
Connection lost
Queued create operation for restaurants
Connection restored, triggering sync...
Syncing 3 operations...
Sync complete: 3 succeeded, 0 failed
```

### Clear Queue (Development Only)
```tsx
import { syncQueue } from '@/lib/syncQueue';

// Clear all queued operations
await syncQueue.clear();
```

## Technical Details

### IndexedDB Schema
```
Database: food-tracker-sync
Store: operations
Indexes:
  - timestamp (for ordering)
  - collection (for filtering)
  - retries (for failed operations)

Record Structure:
{
  id: string,              // UUID
  type: 'create'|'update'|'delete',
  collection: string,      // PocketBase collection
  data: any,              // Payload
  recordId?: string,      // For update/delete
  timestamp: number,      // Created time
  retries: number,        // Retry count
  error?: string,         // Error message
  localId?: string,       // Client-generated ID
  dependencies?: string[] // Operation IDs
}
```

### Sync Algorithm
```
1. Listen for online event
2. Wait 1 second for connection to stabilize
3. Load all operations from IndexedDB
4. Filter out failed operations (retries >= 3)
5. Execute operations sequentially
6. On success: Remove from queue
7. On failure: Increment retries, update error
8. If retries < 3: Keep in queue
9. If retries >= 3: Mark as failed
10. Invalidate queries
11. Update UI
```

### Error Handling
- **Network Errors**: Queue operation automatically
- **Server Errors** (4xx, 5xx): Fail immediately, don't queue
- **Auth Errors**: Fail immediately (user must re-login)
- **Validation Errors**: Fail immediately (bad data)

## Examples

See these files for working examples:
- `src/components/SelectRestaurantPage.tsx` - Create restaurant
- `src/hooks/useOfflineMutation.ts` - Hook implementations
- `src/contexts/SyncContext.tsx` - Sync orchestration
- `src/lib/syncQueue.ts` - Queue management

## Support

For issues or questions:
1. Check browser console for sync logs
2. Inspect IndexedDB in DevTools > Application > IndexedDB
3. Review this documentation
4. Check GitHub issues for known problems
