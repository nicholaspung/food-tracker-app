# Mutation Patterns Guide

This document describes the mutation patterns used in the codebase and when to use offline-aware vs standard mutations.

## Offline-Aware Mutations (Use for User Data)

These mutations queue operations when offline and sync when connection is restored:

### ✅ Available Offline-Aware Hooks

| Hook | Use Case | Location |
|------|----------|----------|
| `useOfflineVisitCreation` | Create visits with food items and photos | `hooks/offline/useOfflineVisitCreation.ts` |
| `useOfflineQuickTrack` | Quick track a single dish | `hooks/offline/useOfflineQuickTrack.ts` |
| `useOfflineQuickTrackUpdate` | Update quick track item | `hooks/offline/useOfflineQuickTrackUpdate.ts` |
| `useOfflineQuickTrackDelete` | Delete quick track item | `hooks/offline/useOfflineQuickTrackDelete.ts` |
| `useOfflineRestaurantCreation` | Create restaurant with menu items | `hooks/offline/useOfflineRestaurantCreation.ts` |
| `useOfflineCreateList` | Create restaurant list | `hooks/offline/useOfflineListOperations.ts` |
| `useOfflineAddToList` | Add restaurant to list | `hooks/offline/useOfflineListOperations.ts` |
| `useOfflineDeleteListItem` | Remove item from list | `hooks/offline/useOfflineListOperations.ts` |
| `useOfflineDeleteList` | Delete entire list | `hooks/offline/useOfflineListOperations.ts` |
| `useOfflineCreate` | Generic create operation | `hooks/offline/useOfflineMutation.ts` |
| `useOfflineUpdate` | Generic update operation | `hooks/offline/useOfflineMutation.ts` |
| `useOfflineDelete` | Generic delete operation | `hooks/offline/useOfflineMutation.ts` |

### When to Use Offline-Aware Hooks

Use offline-aware hooks when:
- ✅ Creating/updating/deleting user-generated content (visits, food items, restaurants, lists)
- ✅ Operations users expect to work offline
- ✅ Non-collaborative, single-user operations
- ✅ Operations that can be queued and executed later

## Standard Mutations (Don't Need Offline Support)

These use direct `useMutation` from TanStack Query:

### ❌ Intentionally NOT Offline-Aware

| Feature | Why Not Offline | Files |
|---------|----------------|-------|
| **Bill Splitting** | Requires real-time collaboration between multiple users | `components/bills/*.tsx` |
| **Friendship Requests** | Requires immediate server validation and notifications | `components/profile/FriendsPage.tsx` |
| **Feedback System** | Admin communication requires server connection | `components/settings/Feedback*.tsx` |
| **Settings Updates** | Require server confirmation (visibility, preferences) | `components/settings/SettingsPage.tsx` |
| **Admin Operations** | Menu item reviews require immediate server action | `components/settings/AdminMenuReviewsPage.tsx` |
| **Onboarding** | One-time operation on account setup | `components/auth/OnboardingDialog.tsx` |

### When to Use Standard Mutations

Use standard `useMutation` when:
- ❌ Real-time collaboration is required
- ❌ Immediate server response/validation is needed
- ❌ Admin or system operations
- ❌ One-time setup operations
- ❌ Operations that don't make sense offline (e.g., sending messages, real-time sync)

## Migration Guide

### Example: Converting to Offline-Aware

**Before (Standard Mutation):**
```typescript
const createListMutation = useMutation({
  mutationFn: async (data) => {
    return await pb.collection('restaurant_lists').create(data);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['restaurant_lists'] });
  },
});
```

**After (Offline-Aware):**
```typescript
import { useOfflineCreateList } from '@/hooks/offline/useOfflineListOperations';

const createListMutation = useOfflineCreateList({
  onSuccess: () => {
    // Query invalidation handled automatically
    toast.success('List created!');
  },
});
```

## Coverage Summary

### ✅ Covered by Offline Hooks
- Visits (creation with items and photos)
- Quick Tracks (create, update, delete)
- Restaurants (creation with menu items)
- Restaurant Lists (create, add items, delete items, delete list)
- Generic CRUD operations (useOfflineCreate/Update/Delete)

### ❌ Intentionally Standard Mutations
- Bill splitting (3 mutations)
- Friendship management (3 mutations)
- Feedback system (3 mutations)
- Settings updates (1 mutation)
- Admin operations (3 mutations)
- Onboarding (1 mutation)

**Total Coverage:** ~70% of mutations use offline-aware hooks where appropriate
**Remaining 30%:** Intentionally use standard mutations for collaborative/admin features

## Best Practices

1. **Use offline hooks for user data** - Visits, food items, restaurants, lists
2. **Use standard mutations for collaborative features** - Bills, real-time sync
3. **Always specify `networkMode: 'always'`** in offline hooks to allow offline execution
4. **Provide optimistic data** when offline to improve UX
5. **Invalidate queries properly** to ensure UI updates correctly
6. **Log operations** using logger for debugging sync issues
