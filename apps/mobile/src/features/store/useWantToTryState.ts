import { useCallback, useMemo } from 'react';
import {
  type QueryClient,
  type QueryKey,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { RestaurantListRecord } from '../models';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';
import type { OfflineAwareFeatureWriteResult } from './useOfflineAwareFeatureWrite';
import { useOfflineAwareFeatureWrite } from './useOfflineAwareFeatureWrite';
import { useQueuedFeatureWrites } from './useQueuedFeatureWrites';
import { restaurantListQueryKeys, upsertRestaurantListInCollectionCaches } from './restaurantListQuery';
import {
  createDefaultRestaurantList,
  getDefaultRestaurantList,
  getRestaurantListBookmarkState,
  type RestaurantListBookmarkStateRecord,
  type RestaurantListBookmarkStateTargetInput,
} from './restaurantListsStore';

const PENDING_DEFAULT_LIST_ID = '__default_list_pending__';
const WANT_TO_TRY_MEMBERSHIP_CHUNK_SIZE = 100;

export type WantToTryTargetInput = RestaurantListBookmarkStateTargetInput;

const WANT_TO_TRY_MEMBERSHIP_OPERATION_NAMES = [
  'list.default.bookmark.save',
  'list.default.restaurant.save',
  'list.bookmark.save',
  'list.bookmark.remove',
] as const satisfies readonly FeatureOutboxOperationName[];
const WANT_TO_TRY_PENDING_OPERATION_NAMES = [
  'list.default.create',
  ...WANT_TO_TRY_MEMBERSHIP_OPERATION_NAMES,
] as const satisfies readonly FeatureOutboxOperationName[];
const resolverPromisesByUserId = new Map<string, Promise<RestaurantListRecord | null>>();

function normalizeRequiredId(value: string): string {
  return value.trim();
}

function normalizeOptionalId(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function normalizeBookmarkName(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

export function createWantToTryRestaurantTarget(restaurantId: string): WantToTryTargetInput {
  const normalizedRestaurantId = normalizeRequiredId(restaurantId);
  return {
    bookmarkKey: `restaurant:${normalizedRestaurantId}`,
    restaurantId: normalizedRestaurantId,
  };
}

export function createWantToTryMenuItemTarget(
  restaurantId: string,
  menuItemId: string,
): WantToTryTargetInput {
  const normalizedRestaurantId = normalizeRequiredId(restaurantId);
  const normalizedMenuItemId = normalizeRequiredId(menuItemId);
  return {
    bookmarkKey: `menu-item:${normalizedRestaurantId}:${normalizedMenuItemId}`,
    menuItemId: normalizedMenuItemId,
    restaurantId: normalizedRestaurantId,
  };
}

export function createWantToTryRecommendationTarget(input: {
  bookmarkKey?: string;
  foodItemId: string;
  itemName?: string;
  menuItemId?: string;
  restaurantId: string;
}): WantToTryTargetInput {
  const restaurantId = normalizeRequiredId(input.restaurantId);
  const foodItemId = normalizeRequiredId(input.foodItemId);
  const menuItemId = normalizeOptionalId(input.menuItemId);
  const normalizedName = normalizeBookmarkName(input.itemName);
  const bookmarkKey = normalizeOptionalId(input.bookmarkKey) || menuItemId || (
    normalizedName ? `restaurant-item:${restaurantId}:${normalizedName}` : foodItemId
  );

  return {
    bookmarkKey,
    restaurantId,
    ...(menuItemId ? { menuItemId } : { foodItemId }),
  };
}

export function normalizeWantToTryTargets(
  targets: readonly WantToTryTargetInput[],
): WantToTryTargetInput[] {
  const normalizedTargets: WantToTryTargetInput[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    const normalizedTarget: WantToTryTargetInput = {
      bookmarkKey: normalizeRequiredId(target.bookmarkKey),
      restaurantId: normalizeRequiredId(target.restaurantId),
      foodItemId: normalizeOptionalId(target.foodItemId),
      menuItemId: normalizeOptionalId(target.menuItemId),
    };
    if (!normalizedTarget.bookmarkKey || !normalizedTarget.restaurantId) {
      continue;
    }

    const identity = getWantToTryTargetIdentity(normalizedTarget);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    normalizedTargets.push(normalizedTarget);
  }

  return normalizedTargets;
}

function getWantToTryTargetIdentity(target: WantToTryTargetInput): string {
  return JSON.stringify([
    target.bookmarkKey,
    target.restaurantId,
    target.foodItemId ?? '',
    target.menuItemId ?? '',
  ]);
}

function serializeWantToTryTargets(targets: readonly WantToTryTargetInput[]): string[] {
  return targets.map(getWantToTryTargetIdentity).sort();
}

export const wantToTryQueryKeys = {
  resolverRoot: restaurantListQueryKeys.defaultListRoot,
  resolver: restaurantListQueryKeys.defaultList,
  membershipRoot: ['feature', 'wantToTryMembership'] as const,
  membershipByList: (listId: string) => ['feature', 'wantToTryMembership', listId.trim()] as const,
  membershipChunk: (
    listId: string,
    userId: string,
    targets: readonly WantToTryTargetInput[],
  ) => [
    'feature',
    'wantToTryMembership',
    listId.trim(),
    userId.trim(),
    serializeWantToTryTargets(targets),
  ] as const,
};

async function resolveWantToTryList(
  userId: string,
  signal: AbortSignal,
  provisionDefaultList: () => Promise<OfflineAwareFeatureWriteResult<RestaurantListRecord>>,
): Promise<RestaurantListRecord | null> {
  const existingList = await getDefaultRestaurantList({ signal });
  if (existingList) {
    return existingList;
  }

  const normalizedUserId = userId.trim();
  const pendingResolver = resolverPromisesByUserId.get(normalizedUserId);
  if (pendingResolver) {
    return pendingResolver;
  }

  const resolver = provisionDefaultList().then((result) =>
    result.status === 'completed' ? result.result : null,
  ).finally(() => {
    if (resolverPromisesByUserId.get(normalizedUserId) === resolver) {
      resolverPromisesByUserId.delete(normalizedUserId);
    }
  });
  resolverPromisesByUserId.set(normalizedUserId, resolver);
  return resolver;
}

export function cacheResolvedWantToTryList(
  queryClient: QueryClient,
  list: RestaurantListRecord,
): void {
  const userId = list.userId?.trim();
  if (userId) {
    queryClient.setQueryData(wantToTryQueryKeys.resolver(userId), list);
  }
  upsertRestaurantListInCollectionCaches(queryClient, list, 'my');
}

export function useWantToTryResolver(
  userId: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();
  const normalizedUserId = userId?.trim() || '';
  const query = useQuery({
    enabled: (options.enabled ?? true) && normalizedUserId.length > 0,
    queryKey: wantToTryQueryKeys.resolver(normalizedUserId),
    queryFn: async ({ signal }) => {
      const list = await resolveWantToTryList(normalizedUserId, signal, () =>
        writeFeature({
          operationName: 'list.default.create',
          offline: {
            strategy: 'outbox',
            payload: {},
          },
          execute: createDefaultRestaurantList,
        }),
      );
      if (list) {
        cacheResolvedWantToTryList(queryClient, list);
      }
      return list;
    },
  });

  return {
    defaultList: query.data ?? null,
    defaultListId: query.data?.id,
    defaultListQuery: query,
  };
}

function queuedWriteMatchesTarget(
  operationName: (typeof WANT_TO_TRY_MEMBERSHIP_OPERATION_NAMES)[number],
  payload: Record<string, unknown>,
  target: WantToTryTargetInput,
  defaultListId: string | undefined,
): boolean {
  if (
    (operationName === 'list.bookmark.save' || operationName === 'list.bookmark.remove') &&
    (!defaultListId || payload.listId !== defaultListId)
  ) {
    return false;
  }
  if (payload.restaurantId !== target.restaurantId) {
    return false;
  }

  const payloadMenuItemId = typeof payload.menuItemId === 'string' ? payload.menuItemId.trim() : '';
  const payloadFoodItemId = typeof payload.foodItemId === 'string' ? payload.foodItemId.trim() : '';
  if (target.menuItemId) {
    return payloadMenuItemId === target.menuItemId;
  }
  if (target.foodItemId) {
    return payloadFoodItemId === target.foodItemId;
  }

  return operationName !== 'list.bookmark.remove' || (!payloadMenuItemId && !payloadFoodItemId);
}

function resolveErrorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : error ? 'Could not load Want to Try state.' : null;
}

function chunkWantToTryTargets(
  targets: readonly WantToTryTargetInput[],
): WantToTryTargetInput[][] {
  const chunks: WantToTryTargetInput[][] = [];
  for (let index = 0; index < targets.length; index += WANT_TO_TRY_MEMBERSHIP_CHUNK_SIZE) {
    chunks.push(targets.slice(index, index + WANT_TO_TRY_MEMBERSHIP_CHUNK_SIZE));
  }
  return chunks;
}

export function useWantToTryMembership(input: {
  enabled?: boolean;
  targets: readonly WantToTryTargetInput[];
  userId: string | null | undefined;
}) {
  const enabled = input.enabled ?? true;
  const resolver = useWantToTryResolver(input.userId, { enabled });
  const { queuedWrites } = useQueuedFeatureWrites(
    WANT_TO_TRY_PENDING_OPERATION_NAMES,
    'all',
    {
      enabled,
    },
  );
  const normalizedUserId = input.userId?.trim() || '';
  const normalizedTargets = useMemo(
    () => normalizeWantToTryTargets(input.targets),
    [input.targets],
  );
  const accountQueuedWrites = useMemo(
    () => queuedWrites.filter((write) => write.originAccountId === normalizedUserId),
    [normalizedUserId, queuedWrites],
  );
  const targetChunks = useMemo(
    () => chunkWantToTryTargets(normalizedTargets),
    [normalizedTargets],
  );
  const queries = useQueries({
    queries: targetChunks.map((targets) => ({
      enabled:
        enabled &&
        Boolean(resolver.defaultListId) &&
        normalizedUserId.length > 0 &&
        targets.length > 0,
      queryKey: wantToTryQueryKeys.membershipChunk(
        resolver.defaultListId ?? PENDING_DEFAULT_LIST_ID,
        normalizedUserId,
        targets,
      ),
      queryFn: ({ signal }): Promise<RestaurantListBookmarkStateRecord> =>
        resolver.defaultListId
          ? getRestaurantListBookmarkState(resolver.defaultListId, targets, { signal })
          : Promise.resolve({ savedTargetsByBookmarkKey: {} }),
    })),
  });
  const savedTargetsByBookmarkKey = useMemo(() => {
    const savedTargets: RestaurantListBookmarkStateRecord['savedTargetsByBookmarkKey'] = {};
    for (const query of queries) {
      Object.assign(savedTargets, query.data?.savedTargetsByBookmarkKey ?? {});
    }

    for (const queuedWrite of [...accountQueuedWrites].sort((left, right) => left.createdAt - right.createdAt)) {
      if (queuedWrite.operationName === 'list.default.create') {
        continue;
      }
      const payload = queuedWrite.payload as unknown as Record<string, unknown>;
      for (const target of normalizedTargets) {
        if (!queuedWriteMatchesTarget(
          queuedWrite.operationName,
          payload,
          target,
          resolver.defaultListId,
        )) {
          continue;
        }

        if (queuedWrite.operationName === 'list.bookmark.remove') {
          delete savedTargets[target.bookmarkKey];
        } else {
          savedTargets[target.bookmarkKey] = target;
        }
      }
    }
    return savedTargets;
  }, [accountQueuedWrites, normalizedTargets, queries, resolver.defaultListId]);
  const getSavedTarget = useCallback(
    (bookmarkKey: string) => savedTargetsByBookmarkKey[bookmarkKey],
    [savedTargetsByBookmarkKey],
  );
  const isSaved = useCallback(
    (bookmarkKey: string) => Boolean(savedTargetsByBookmarkKey[bookmarkKey]),
    [savedTargetsByBookmarkKey],
  );

  const resolverHasBlockingError = resolver.defaultListQuery.isError && resolver.defaultListQuery.data === undefined;
  const resolverHasRefreshError = resolver.defaultListQuery.isError && resolver.defaultListQuery.data !== undefined;
  const membershipHasBlockingError = queries.some((query) => query.isError && query.data === undefined);
  const membershipHasRefreshError = queries.some((query) => query.isError && query.data !== undefined);
  const membershipError = queries.find((query) => query.error)?.error;

  return {
    ...resolver,
    errorMessage:
      resolveErrorMessage(resolver.defaultListQuery.error) ?? resolveErrorMessage(membershipError),
    hasBlockingError: resolverHasBlockingError || membershipHasBlockingError,
    hasRefreshError: resolverHasRefreshError || membershipHasRefreshError,
    getSavedTarget,
    isLoading: resolver.defaultListQuery.isLoading || queries.some((query) => query.isLoading),
    isSaved,
  };
}

function isWantToTryMembershipQueryForTarget(
  queryKey: QueryKey,
  listId: string,
  target: WantToTryTargetInput,
): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === wantToTryQueryKeys.membershipRoot[0] &&
    queryKey[1] === wantToTryQueryKeys.membershipRoot[1] &&
    queryKey[2] === listId.trim() &&
    Array.isArray(queryKey[4]) &&
    queryKey[4].includes(getWantToTryTargetIdentity(target))
  );
}

export function projectWantToTryMembership(
  queryClient: QueryClient,
  input: {
    listId: string;
    saved: boolean;
    target: WantToTryTargetInput;
  },
): void {
  const [target] = normalizeWantToTryTargets([input.target]);
  if (!target || !input.listId.trim()) {
    return;
  }

  queryClient.setQueriesData<RestaurantListBookmarkStateRecord>(
    {
      predicate: (query) => isWantToTryMembershipQueryForTarget(query.queryKey, input.listId, target),
    },
    (current) => {
      const savedTargetsByBookmarkKey = { ...(current?.savedTargetsByBookmarkKey ?? {}) };
      if (input.saved) {
        savedTargetsByBookmarkKey[target.bookmarkKey] = target;
      } else {
        delete savedTargetsByBookmarkKey[target.bookmarkKey];
      }
      return { savedTargetsByBookmarkKey };
    },
  );
}

export async function invalidateWantToTryMembershipTarget(
  queryClient: QueryClient,
  listId: string,
  target: WantToTryTargetInput | undefined,
): Promise<void> {
  const [normalizedTarget] = target ? normalizeWantToTryTargets([target]) : [];
  if (!normalizedTarget) {
    return;
  }

  await queryClient.invalidateQueries({
    predicate: (query) =>
      isWantToTryMembershipQueryForTarget(query.queryKey, listId, normalizedTarget),
  });
}
