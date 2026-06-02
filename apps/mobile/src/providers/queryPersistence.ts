import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient } from '@tanstack/query-persist-client-core';
import { defaultShouldDehydrateQuery, type Query, type QueryKey } from '@tanstack/react-query';

import type { FeedbackMessageRecord, FeedbackRecord } from '../features/models';
import { isBillDetailQueryKey } from '../features/store/billsQuery';
import { isFeedbackListQueryKey, isFeedbackMessagesQueryKey } from '../features/store/feedbackQuery';
import { isFriendsSummaryQueryKey, isPaginatedFriendsQueryKey } from '../features/store/friendsQuery';
import { isPaginatedHomeFeedQueryKey } from '../features/store/homeFeedQuery';
import { isNotesSummaryQueryKey, isPaginatedNotesQueryKey } from '../features/store/notesQuery';
import { isProfileQueryKey } from '../features/store/profileQuery';
import { isTastingSessionsListQueryKey } from '../features/store/tastingSessionsQuery';
import { localPersistence } from '../localPersistence';

function isFeatureQueryKey(queryKey: QueryKey): queryKey is readonly [string, ...unknown[]] {
  return Array.isArray(queryKey) && queryKey[0] === 'feature';
}

function hasQueryKeyPrefix(queryKey: QueryKey, prefix: readonly unknown[]): boolean {
  return Array.isArray(queryKey) && prefix.every((segment, index) => queryKey[index] === segment);
}

function isBrowseNotePhotosQuery(queryKey: QueryKey): boolean {
  return hasQueryKeyPrefix(queryKey, ['feature', 'notePhotos', 'notes']) && queryKey.length === 3;
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
      return queryKey.length === 2;
    case 'bill':
      return isBillDetailQueryKey(queryKey);
    case 'visitPhotos':
      return queryKey.length === 2 || isHomeFeedPhotosQuery(queryKey);
    case 'notes':
      return queryKey.length === 2 || isPaginatedNotesQueryKey(queryKey) || isNotesSummaryQueryKey(queryKey);
    case 'notePhotos':
      return isBrowseNotePhotosQuery(queryKey);
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

function redactPersistedClient(persistedClient: PersistedClient): PersistedClient {
  return {
    ...persistedClient,
    clientState: {
      ...persistedClient.clientState,
      queries: persistedClient.clientState.queries.map((persistedQuery) => ({
        ...persistedQuery,
        state: {
          ...persistedQuery.state,
          data: redactPersistedQueryData(persistedQuery.queryKey, persistedQuery.state.data),
        },
      })),
    },
  };
}

export function shouldPersistQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && isPersistedFeatureQuery(query.queryKey);
}

export async function clearPersistedQueryCache(): Promise<void> {
  await queryPersister.removeClient();
}

export const queryPersister = createAsyncStoragePersister({
  storage: localPersistence.queryCache.storage,
  key: localPersistence.queryCache.activeStorageKey,
  throttleTime: 1000,
  serialize: (persistedClient) => JSON.stringify(redactPersistedClient(persistedClient)),
});
