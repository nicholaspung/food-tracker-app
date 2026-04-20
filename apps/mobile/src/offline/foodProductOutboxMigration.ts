import type { QueuedMutation } from './types';

const LOCAL_FEATURE_OUTBOX_URL_PREFIX = 'local://feature/';
const OPERATION_HEADER_NAME = 'X-Mobile-Write-Operation';

export const LEGACY_FOOD_PRODUCT_OUTBOX_MIGRATION_ERROR =
  'Legacy food product outbox migration failed. Please retry this action in the app.';

type LegacyFoodProductOperationName =
  | 'quick-track.create'
  | 'quick-track.update'
  | 'quick-track.delete';

type FoodProductOperationName =
  | 'food-product.create'
  | 'food-product.update'
  | 'food-product.delete';

const FOOD_PRODUCT_OPERATION_NAME_MAP: Record<
  LegacyFoodProductOperationName,
  FoodProductOperationName
> = {
  'quick-track.create': 'food-product.create',
  'quick-track.update': 'food-product.update',
  'quick-track.delete': 'food-product.delete',
};

interface FoodProductOutboxMigrationResult {
  isLegacyFoodProductMutation: boolean;
  mutation: QueuedMutation;
  outcome: 'failed' | 'migrated' | 'unchanged';
}

export interface FoodProductOutboxMigrationSummary {
  failedCount: number;
  migratedCount: number;
  mutations: QueuedMutation[];
  queuedLegacyMutationCount: number;
}

export function migrateQueuedFoodProductMutation(
  mutation: QueuedMutation,
): FoodProductOutboxMigrationResult {
  if (!mutation.url.startsWith(LOCAL_FEATURE_OUTBOX_URL_PREFIX)) {
    return {
      isLegacyFoodProductMutation: false,
      mutation,
      outcome: 'unchanged',
    };
  }

  const operationName = resolveFoodProductOperationName(mutation);
  if (!operationName) {
    return {
      isLegacyFoodProductMutation: false,
      mutation,
      outcome: 'unchanged',
    };
  }

  if (isCurrentFoodProductOperationName(operationName)) {
    return {
      isLegacyFoodProductMutation: false,
      mutation,
      outcome: 'unchanged',
    };
  }

  const nextOperationName = FOOD_PRODUCT_OPERATION_NAME_MAP[operationName];
  const migratedMutation: QueuedMutation = {
    ...mutation,
    headers: setHeaderValue(mutation.headers, OPERATION_HEADER_NAME, nextOperationName),
    url: `${LOCAL_FEATURE_OUTBOX_URL_PREFIX}${nextOperationName}`,
  };

  if (operationName === 'quick-track.create') {
    return {
      isLegacyFoodProductMutation: true,
      mutation: migratedMutation,
      outcome: 'migrated',
    };
  }

  const payload = parseMutationPayloadObject(mutation.body);
  const legacyFoodProductId = payload?.quickTrackId;
  if (!payload || typeof legacyFoodProductId !== 'string' || legacyFoodProductId.trim().length === 0) {
    return {
      isLegacyFoodProductMutation: true,
      mutation: {
        ...migratedMutation,
        lastError: LEGACY_FOOD_PRODUCT_OUTBOX_MIGRATION_ERROR,
        nextRetryAt: 0,
        status: 'failed',
      },
      outcome: 'failed',
    };
  }

  const payloadWithLegacyFoodProductId = payload;
  const {
    quickTrackId: _unusedLegacyFoodProductId,
    ...remainingPayload
  } = payloadWithLegacyFoodProductId;

  return {
    isLegacyFoodProductMutation: true,
    mutation: {
      ...migratedMutation,
      body: JSON.stringify({
        ...remainingPayload,
        foodProductId: legacyFoodProductId,
      }),
    },
    outcome: 'migrated',
  };
}

export function migrateQueuedFoodProductMutations(
  mutations: QueuedMutation[],
): FoodProductOutboxMigrationSummary {
  let queuedLegacyMutationCount = 0;
  let migratedCount = 0;
  let failedCount = 0;

  const nextMutations = mutations.map((mutation) => {
    const result = migrateQueuedFoodProductMutation(mutation);
    if (result.isLegacyFoodProductMutation) {
      queuedLegacyMutationCount += 1;
    }
    if (result.outcome === 'migrated') {
      migratedCount += 1;
    }
    if (result.outcome === 'failed') {
      failedCount += 1;
    }
    return result.mutation;
  });

  return {
    failedCount,
    migratedCount,
    mutations: nextMutations,
    queuedLegacyMutationCount,
  };
}

function resolveFoodProductOperationName(
  mutation: QueuedMutation,
): FoodProductOperationName | LegacyFoodProductOperationName | null {
  const headerOperationName = getHeaderValue(mutation.headers, OPERATION_HEADER_NAME);
  if (isKnownFoodProductOperationName(headerOperationName)) {
    return headerOperationName;
  }

  const urlOperationName = mutation.url.startsWith(LOCAL_FEATURE_OUTBOX_URL_PREFIX)
    ? mutation.url.slice(LOCAL_FEATURE_OUTBOX_URL_PREFIX.length)
    : null;
  if (isKnownFoodProductOperationName(urlOperationName)) {
    return urlOperationName;
  }

  return null;
}

function parseMutationPayloadObject(
  value: string | null,
): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(value) as unknown;
    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
      return null;
    }

    return { ...(parsedValue as Record<string, unknown>) };
  } catch {
    return null;
  }
}

function getHeaderValue(
  headers: Record<string, string>,
  expectedHeaderName: string,
): string | null {
  const loweredExpectedHeaderName = expectedHeaderName.toLowerCase();
  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() === loweredExpectedHeaderName) {
      return headerValue;
    }
  }

  return null;
}

function setHeaderValue(
  headers: Record<string, string>,
  headerName: string,
  value: string,
): Record<string, string> {
  const nextHeaders = { ...headers };
  const loweredHeaderName = headerName.toLowerCase();
  const existingHeaderName = Object.keys(nextHeaders).find(
    (candidateHeaderName) => candidateHeaderName.toLowerCase() === loweredHeaderName,
  );
  nextHeaders[existingHeaderName ?? headerName] = value;
  return nextHeaders;
}

function isCurrentFoodProductOperationName(
  value: string | null | undefined,
): value is FoodProductOperationName {
  return (
    value === 'food-product.create' ||
    value === 'food-product.update' ||
    value === 'food-product.delete'
  );
}

function isLegacyFoodProductOperationName(
  value: string | null | undefined,
): value is LegacyFoodProductOperationName {
  return (
    value === 'quick-track.create' ||
    value === 'quick-track.update' ||
    value === 'quick-track.delete'
  );
}

function isKnownFoodProductOperationName(
  value: string | null | undefined,
): value is FoodProductOperationName | LegacyFoodProductOperationName {
  return isCurrentFoodProductOperationName(value) || isLegacyFoodProductOperationName(value);
}
