import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
  persistQueryClient,
  type PersistedClient,
  type PersistQueryClientOptions,
  type Persister,
} from '@tanstack/query-persist-client-core';
import { defaultShouldDehydrateQuery, type Query, type QueryKey } from '@tanstack/react-query';

import type { FeedbackMessageRecord, FeedbackRecord } from '../features/models';
import { isBillDetailQueryKey, isPaginatedBillsQueryKey } from '../features/store/billsQuery';
import { isFeedbackListQueryKey, isFeedbackMessagesQueryKey } from '../features/store/feedbackQuery';
import { isFriendsSummaryQueryKey, isPaginatedFriendsQueryKey } from '../features/store/friendsQuery';
import { isPaginatedHomeFeedQueryKey } from '../features/store/homeFeedQuery';
import { moreFeatureSignalQueryKeys } from '../features/store/moreFeatureSignalsQuery';
import { isNotesSummaryQueryKey, isPaginatedNotesQueryKey } from '../features/store/notesQuery';
import { isProfileQueryKey } from '../features/store/profileQuery';
import { isTastingSessionsListQueryKey } from '../features/store/tastingSessionsQuery';
import { localPersistence } from '../localPersistence';

const MAX_PERSISTED_INFINITE_PAGES = 1;
const MAX_PERSISTED_INFINITE_PAGE_ITEMS = 50;
const PERSISTED_QUERY_CACHE_METADATA_KEY = '__foodTrackerQueryPersistence';

export interface QueryPersistenceMetadata {
  version: 1;
  maxInfinitePages: number;
  maxInfinitePageItems: number;
  trimmed: boolean;
  trimmedQueryCount: number;
}

type PersistedClientWithMetadata = PersistedClient & {
  [PERSISTED_QUERY_CACHE_METADATA_KEY]?: QueryPersistenceMetadata;
};

function isFeatureQueryKey(queryKey: QueryKey): queryKey is readonly [string, ...unknown[]] {
  return Array.isArray(queryKey) && queryKey[0] === 'feature';
}

function hasQueryKeyPrefix(queryKey: QueryKey, prefix: readonly unknown[]): boolean {
  return Array.isArray(queryKey) && prefix.every((segment, index) => queryKey[index] === segment);
}

function isPaginatedFeedbackListQuery(queryKey: QueryKey): boolean {
  return isFeedbackListQueryKey(queryKey);
}

function isFeedbackSummaryQuery(queryKey: QueryKey): boolean {
  return hasQueryKeyPrefix(queryKey, ['feature', 'feedback', 'summary']) && queryKey.length === 3;
}

function isHomeFeedPhotosQuery(queryKey: QueryKey): boolean {
  return hasQueryKeyPrefix(queryKey, ['feature', 'visitPhotos', 'feedItems']) && queryKey.length === 4;
}

function isSearchQueryKey(queryKey: QueryKey): boolean {
  if (isPaginatedHomeFeedQueryKey(queryKey)) {
    return typeof queryKey[8] === 'string' && queryKey[8].trim().length > 0;
  }

  if (isPaginatedNotesQueryKey(queryKey)) {
    return queryKey.length === 5 && typeof queryKey[4] === 'string' && queryKey[4].trim().length > 0;
  }

  if (isPaginatedFriendsQueryKey(queryKey)) {
    return queryKey.length === 7 && typeof queryKey[6] === 'string' && queryKey[6].trim().length > 0;
  }

  return false;
}

function isPersistedFeatureQuery(queryKey: QueryKey): boolean {
  if (!isFeatureQueryKey(queryKey) || typeof queryKey[1] !== 'string') {
    return false;
  }

  switch (queryKey[1]) {
    case 'homeFeed':
      return isPaginatedHomeFeedQueryKey(queryKey);
    case 'visits':
    case 'foodProducts':
      return queryKey.length === 2;
    case 'bills':
      return isPaginatedBillsQueryKey(queryKey);
    case 'bill':
      return isBillDetailQueryKey(queryKey);
    case 'visitPhotos':
      return queryKey.length === 2 || isHomeFeedPhotosQuery(queryKey);
    case 'notes':
      return queryKey.length === 2 || isPaginatedNotesQueryKey(queryKey) || isNotesSummaryQueryKey(queryKey);
    case 'friends':
      return (
        (queryKey.length === 6 && isPaginatedFriendsQueryKey(queryKey)) ||
        isFriendsSummaryQueryKey(queryKey)
      );
    case 'restaurantLists':
    case 'restaurantListItemCounts.v2':
      return true;
    case 'profile':
      return isProfileQueryKey(queryKey);
    case 'tasting-sessions':
      return isTastingSessionsListQueryKey(queryKey);
    case 'moreFeatureSignals':
      return queryKey.length === moreFeatureSignalQueryKeys.summary.length;
    case 'feedback':
      return isPaginatedFeedbackListQuery(queryKey) || isFeedbackSummaryQuery(queryKey);
    case 'feedback-messages':
      return isFeedbackMessagesQueryKey(queryKey);
    default:
      return false;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function redactFeedbackRecord(record: FeedbackRecord): FeedbackRecord {
  const { assignedAdminId: _assignedAdminId, userEmail: _userEmail, ...redacted } = record;
  return redacted;
}

function redactFeedbackMessageRecord(record: FeedbackMessageRecord): FeedbackMessageRecord {
  const { userEmail: _userEmail, ...redacted } = record;
  return redacted;
}

function redactPersistedInfiniteItems<TRecord>(
  data: unknown,
  redactRecord: (record: TRecord) => TRecord,
): unknown {
  if (!isObjectRecord(data) || !Array.isArray(data.pages)) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => {
      if (!isObjectRecord(page) || !Array.isArray(page.items)) {
        return page;
      }

      return {
        ...page,
        items: page.items.map((record) => redactRecord(record as TRecord)),
      };
    }),
  };
}

function redactPersistedQueryData(queryKey: QueryKey, data: unknown): unknown {
  if (!data) {
    return data;
  }

  if (isPaginatedFeedbackListQuery(queryKey)) {
    return redactPersistedInfiniteItems(data, redactFeedbackRecord);
  }

  if (isFeedbackMessagesQueryKey(queryKey)) {
    return redactPersistedInfiniteItems(data, redactFeedbackMessageRecord);
  }

  return data;
}

function trimPersistedInfiniteData(data: unknown): { data: unknown; trimmed: boolean } {
  if (!isObjectRecord(data) || !Array.isArray(data.pages)) {
    return { data, trimmed: false };
  }

  const pages = data.pages;
  const pageParams = Array.isArray(data.pageParams) ? data.pageParams : null;
  const nextPages = pages.slice(0, MAX_PERSISTED_INFINITE_PAGES).map((page) => {
    if (!isObjectRecord(page) || !Array.isArray(page.items)) {
      return page;
    }

    const nextItems = page.items.slice(0, MAX_PERSISTED_INFINITE_PAGE_ITEMS);
    if (nextItems.length === page.items.length) {
      return page;
    }

    return {
      ...page,
      items: nextItems,
    };
  });
  const nextPageParams = pageParams ? pageParams.slice(0, MAX_PERSISTED_INFINITE_PAGES) : data.pageParams;
  const trimmed =
    nextPages.length !== pages.length ||
    (pageParams !== null && Array.isArray(nextPageParams) && nextPageParams.length !== pageParams.length) ||
    nextPages.some((page, index) => {
      const originalPage = pages[index];
      return (
        isObjectRecord(page) &&
        isObjectRecord(originalPage) &&
        Array.isArray(page.items) &&
        Array.isArray(originalPage.items) &&
        page.items.length !== originalPage.items.length
      );
    });

  if (!trimmed) {
    return { data, trimmed: false };
  }

  return {
    data: {
      ...data,
      pages: nextPages,
      pageParams: nextPageParams,
    },
    trimmed: true,
  };
}

function redactAndTrimPersistedQueryData(queryKey: QueryKey, data: unknown): { data: unknown; trimmed: boolean } {
  const redactedData = redactPersistedQueryData(queryKey, data);
  return trimPersistedInfiniteData(redactedData);
}

function redactAndTrimPersistedClient(persistedClient: PersistedClient): PersistedClientWithMetadata {
  let trimmedQueryCount = 0;
  return {
    ...persistedClient,
    clientState: {
      ...persistedClient.clientState,
      queries: persistedClient.clientState.queries.map((persistedQuery) => {
        const nextData = redactAndTrimPersistedQueryData(
          persistedQuery.queryKey,
          persistedQuery.state.data,
        );
        if (nextData.trimmed) {
          trimmedQueryCount += 1;
        }

        return {
          ...persistedQuery,
          state: {
            ...persistedQuery.state,
            data: nextData.data,
          },
        };
      }),
    },
    [PERSISTED_QUERY_CACHE_METADATA_KEY]: {
      version: 1,
      maxInfinitePages: MAX_PERSISTED_INFINITE_PAGES,
      maxInfinitePageItems: MAX_PERSISTED_INFINITE_PAGE_ITEMS,
      trimmed: trimmedQueryCount > 0,
      trimmedQueryCount,
    },
  };
}

export function shouldPersistQuery(query: Query): boolean {
  return (
    defaultShouldDehydrateQuery(query) &&
    isPersistedFeatureQuery(query.queryKey) &&
    !isSearchQueryKey(query.queryKey)
  );
}

export async function clearPersistedQueryCache(): Promise<void> {
  await queryPersister.removeClient();
}

type AsyncPersisterOptions = Parameters<typeof createAsyncStoragePersister>[0];

export function createQueryPersister(
  options: Partial<Pick<AsyncPersisterOptions, 'deserialize' | 'key' | 'storage'>> = {},
): Persister {
  return createAsyncStoragePersister({
    storage: options.storage ?? localPersistence.queryCache.storage,
    key: options.key ?? localPersistence.queryCache.activeStorageKey,
    throttleTime: 1000,
    serialize: (persistedClient) => JSON.stringify(redactAndTrimPersistedClient(persistedClient)),
    deserialize: options.deserialize,
  });
}

export const queryPersister = createQueryPersister();

type PersistQueryClientWithRestoreMetadataOptions = Omit<PersistQueryClientOptions, 'persister'> & {
  persister?: Persister;
};

export function persistQueryClientWithRestoreMetadata(
  options: PersistQueryClientWithRestoreMetadataOptions,
): [() => void, Promise<QueryPersistenceMetadata | null>] {
  const { persister = queryPersister, ...persistOptions } = options;
  let restoredMetadata: QueryPersistenceMetadata | null = null;
  const restoreAwarePersister: Persister = {
    persistClient: persister.persistClient,
    removeClient: persister.removeClient,
    restoreClient: async () => {
      const persistedClient = (await persister.restoreClient()) as PersistedClientWithMetadata | undefined;
      restoredMetadata = persistedClient?.[PERSISTED_QUERY_CACHE_METADATA_KEY] ?? null;
      return persistedClient;
    },
  };
  const [unsubscribe, restorePromise] = persistQueryClient({
    ...persistOptions,
    persister: restoreAwarePersister,
  });

  return [unsubscribe, restorePromise.then(() => restoredMetadata)];
}
