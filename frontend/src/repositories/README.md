# Repository Layer

This directory contains the repository layer for accessing PocketBase collections in a centralized, type-safe manner.

## Why Use Repositories?

Instead of calling `pb.collection()` directly throughout the codebase, we use repository classes that provide:

1. **Type Safety**: All methods return properly typed data
2. **Centralized Logic**: Common query patterns in one place
3. **Consistent Error Handling**: Errors handled uniformly
4. **Easier Testing**: Mock repositories instead of PocketBase
5. **Better Maintainability**: Changes to data access logic in one place

## Usage

### Basic CRUD Operations

```typescript
import { repositories } from '@/repositories';

// Create
const visit = await repositories.visits.create({
  restaurant: restaurantId,
  user: userId,
  visitDate: new Date().toISOString(),
  visibility: 'friends',
});

// Read one
const visit = await repositories.visits.getOne(visitId);

// Read many
const visits = await repositories.visits.getFullList({
  sort: '-visitDate',
  expand: 'restaurant',
});

// Update
const updated = await repositories.visits.update(visitId, {
  notes: 'Great food!',
});

// Delete
await repositories.visits.delete(visitId);
```

### Collection-Specific Methods

Each repository provides methods for common query patterns:

```typescript
// Get all visits for a user
const userVisits = await repositories.visits.getByUser(userId);

// Get all restaurants created by a user
const userRestaurants = await repositories.restaurants.getByUser(userId);

// Search food items by name
const items = await repositories.foodItems.searchByName('pizza', userId);

// Get accepted friends
const friends = await repositories.friendships.getAcceptedFriends(userId);
```

### Advanced Queries

Use the base methods with custom options for complex queries:

```typescript
const visits = await repositories.visits.getFullList({
  filter: `user = "${userId}" && visitDate >= "${startDate}"`,
  sort: '-visitDate',
  expand: 'restaurant,user',
  fields: 'id,visitDate,restaurant,notes',
});
```

### Real-time Subscriptions

```typescript
// Subscribe to a specific record
const unsubscribe = repositories.visits.subscribe(visitId, (data) => {
  console.log('Visit updated:', data.record);
});

// Subscribe to all changes in a collection
const unsubscribeAll = repositories.visits.subscribeToAll((data) => {
  console.log(`${data.action}:`, data.record);
});

// Clean up when done
unsubscribe();
```

## Migration Guide

### Before (Direct pb.collection calls)

```typescript
// ❌ Old way - scattered throughout codebase
const visits = await pb.collection('visits').getFullList({
  filter: `user = "${userId}"`,
  sort: '-visitDate',
});

const visit = await pb.collection('visits').create({
  restaurant: restaurantId,
  user: userId,
  visitDate: new Date().toISOString(),
});
```

### After (Repository pattern)

```typescript
// ✅ New way - centralized and type-safe
const visits = await repositories.visits.getByUser(userId);

const visit = await repositories.visits.create({
  restaurant: restaurantId,
  user: userId,
  visitDate: new Date().toISOString(),
});
```

## Creating New Repositories

To add a repository for a new collection:

1. Create a new file: `src/repositories/YourRepository.ts`
2. Extend `BaseRepository`:

```typescript
import type PocketBase from 'pocketbase';
import type { RecordListOptions } from 'pocketbase';
import { BaseRepository } from './BaseRepository';
import type { YourType } from '../lib/pocketbase';
import { COLLECTIONS } from '../constants/collections';

export class YourRepository extends BaseRepository<YourType> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.YOUR_COLLECTION);
  }

  // Add collection-specific methods
  async getByUser(userId: string, options?: RecordListOptions): Promise<YourType[]> {
    return await this.getFullList({
      filter: `user = "${userId}"`,
      ...options,
    });
  }
}
```

3. Export it in `index.ts`:

```typescript
import { YourRepository } from './YourRepository';

export const repositories = {
  // ... existing repositories
  yours: new YourRepository(pb),
};
```

## Testing

Repositories can be easily mocked for testing:

```typescript
// Mock a repository
const mockVisitRepo = {
  getByUser: jest.fn().mockResolvedValue([mockVisit1, mockVisit2]),
  create: jest.fn().mockResolvedValue(mockVisit1),
  // ... other methods
};

// Use in tests
const visits = await mockVisitRepo.getByUser('user123');
expect(visits).toHaveLength(2);
```

## Common Patterns

### Filtering

```typescript
// Simple filter
filter: `user = "${userId}"`

// Multiple conditions
filter: `user = "${userId}" && status = "active"`

// Text search
filter: `name ~ "${searchQuery}"`

// Date range
filter: `created >= "${startDate}" && created <= "${endDate}"`
```

### Sorting

```typescript
// Single field ascending
sort: 'name'

// Single field descending
sort: '-created'

// Multiple fields
sort: '-visitDate,name'
```

### Expanding Relations

```typescript
// Single relation
expand: 'restaurant'

// Multiple relations
expand: 'restaurant,user'

// Nested relations
expand: 'visit.restaurant'
```

## Best Practices

1. **Always use repositories** instead of direct `pb.collection()` calls
2. **Add type-specific methods** for common queries in each repository
3. **Use COLLECTIONS constants** for collection names (already done in BaseRepository)
4. **Handle errors gracefully** - repositories throw errors, handle them in components/services
5. **Leverage TypeScript** - methods are fully typed for better DX
6. **Keep repositories focused** - one repository per collection

## Architecture

```
repositories/
├── BaseRepository.ts        # Base class with common CRUD operations
├── VisitRepository.ts       # Visit-specific methods
├── RestaurantRepository.ts  # Restaurant-specific methods
├── FoodItemRepository.ts    # Food item-specific methods
├── BillRepository.ts        # Bill splitting repositories
├── MenuRepository.ts        # Menu items and images
├── FriendshipRepository.ts  # Social features
├── FeedbackRepository.ts    # User feedback
├── ListRepository.ts        # Restaurant lists
├── index.ts                 # Exports all repositories
└── README.md                # This file
```
