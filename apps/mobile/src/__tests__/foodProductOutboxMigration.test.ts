import {
  LEGACY_FOOD_PRODUCT_OUTBOX_MIGRATION_ERROR,
  migrateQueuedFoodProductMutation,
} from '../offline/foodProductOutboxMigration';
import type { QueuedMutation } from '../offline/types';

function buildQueuedMutation(overrides?: Partial<QueuedMutation>): QueuedMutation {
  return {
    id: 'mut_1',
    method: 'POST',
    url: 'local://feature/quick-track.create',
    body: JSON.stringify({
      itemName: 'Iced Coffee',
    }),
    headers: {
      'X-Mobile-Write-Operation': 'quick-track.create',
    },
    status: 'pending',
    idempotencyKey: 'idem_1',
    attemptCount: 0,
    maxAttempts: 5,
    nextRetryAt: 0,
    lastError: null,
    createdAt: 1000,
    updatedAt: 1000,
    lastAttemptAt: null,
    ...overrides,
  };
}

describe('foodProductOutboxMigration', () => {
  it('migrates legacy create mutations to food-product.create without changing the payload', () => {
    const legacyMutation = buildQueuedMutation();

    const result = migrateQueuedFoodProductMutation(legacyMutation);

    expect(result.isLegacyFoodProductMutation).toBe(true);
    expect(result.outcome).toBe('migrated');
    expect(result.mutation.url).toBe('local://feature/food-product.create');
    expect(result.mutation.headers['X-Mobile-Write-Operation']).toBe('food-product.create');
    expect(result.mutation.body).toBe(legacyMutation.body);
    expect(result.mutation.createdAt).toBe(legacyMutation.createdAt);
    expect(result.mutation.updatedAt).toBe(legacyMutation.updatedAt);
  });

  it('migrates legacy update payloads from quickTrackId to foodProductId', () => {
    const legacyMutation = buildQueuedMutation({
      body: JSON.stringify({
        quickTrackId: 'food-product-1',
        updates: {
          itemName: 'Cold Brew',
        },
      }),
      headers: {
        'X-Mobile-Write-Operation': 'quick-track.update',
      },
      method: 'PUT',
      url: 'local://feature/quick-track.update',
    });

    const result = migrateQueuedFoodProductMutation(legacyMutation);

    expect(result.outcome).toBe('migrated');
    expect(result.mutation.url).toBe('local://feature/food-product.update');
    expect(result.mutation.headers['X-Mobile-Write-Operation']).toBe('food-product.update');
    expect(JSON.parse(result.mutation.body ?? '{}')).toEqual({
      foodProductId: 'food-product-1',
      updates: {
        itemName: 'Cold Brew',
      },
    });
  });

  it('marks malformed legacy delete payloads as failed', () => {
    const legacyMutation = buildQueuedMutation({
      body: JSON.stringify({
        foodProductId: 'food-product-1',
      }),
      headers: {
        'X-Mobile-Write-Operation': 'quick-track.delete',
      },
      method: 'DELETE',
      url: 'local://feature/quick-track.delete',
    });

    const result = migrateQueuedFoodProductMutation(legacyMutation);

    expect(result.outcome).toBe('failed');
    expect(result.mutation.status).toBe('failed');
    expect(result.mutation.lastError).toBe(LEGACY_FOOD_PRODUCT_OUTBOX_MIGRATION_ERROR);
    expect(result.mutation.nextRetryAt).toBe(0);
    expect(result.mutation.url).toBe('local://feature/food-product.delete');
    expect(result.mutation.headers['X-Mobile-Write-Operation']).toBe('food-product.delete');
  });

  it('is idempotent for already-migrated food product mutations', () => {
    const migratedMutation = buildQueuedMutation({
      headers: {
        'X-Mobile-Write-Operation': 'food-product.delete',
      },
      method: 'DELETE',
      url: 'local://feature/food-product.delete',
    });

    const result = migrateQueuedFoodProductMutation(migratedMutation);

    expect(result.isLegacyFoodProductMutation).toBe(false);
    expect(result.outcome).toBe('unchanged');
    expect(result.mutation).toEqual(migratedMutation);
  });

  it('leaves non-food-product mutations unchanged', () => {
    const nonFoodProductMutation = buildQueuedMutation({
      body: JSON.stringify({
        visitId: 'visit-1',
      }),
      headers: {
        'X-Mobile-Write-Operation': 'visit.delete',
      },
      method: 'DELETE',
      url: 'local://feature/visit.delete',
    });

    const result = migrateQueuedFoodProductMutation(nonFoodProductMutation);

    expect(result.isLegacyFoodProductMutation).toBe(false);
    expect(result.outcome).toBe('unchanged');
    expect(result.mutation).toEqual(nonFoodProductMutation);
  });
});
