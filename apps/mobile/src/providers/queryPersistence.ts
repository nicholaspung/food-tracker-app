import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient } from '@tanstack/query-persist-client-core';
import { defaultShouldDehydrateQuery, type Query, type QueryKey } from '@tanstack/react-query';

import { getEnvironmentStorageKey } from '../config/persistence';
import type { FeedbackRecord, NoteRecord } from '../features/models';
import { isFeedbackListQueryKey } from '../features/store/feedbackQuery';
import { isFriendsSummaryQueryKey, isPaginatedFriendsQueryKey } from '../features/store/friendsQuery';
import { isPaginatedHomeFeedQueryKey } from '../features/store/homeFeedQuery';
import { isNotesSummaryQueryKey, isPaginatedNotesQueryKey } from '../features/store/notesQuery';
import { isProfileQueryKey } from '../features/store/profileQuery';

const LEGACY_QUERY_CACHE_STORAGE_KEYS = [
  'food_tracker_mobile_query_cache_v1',
  'food_tracker_mobile_query_cache_v2',
];
const QUERY_CACHE_STORAGE_KEY = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v2');

function isFeatureQueryKey(queryKey: QueryKey): queryKey is readonly [string, ...unknown[]] {
  return Array.isArray(queryKey) && queryKey[0] === 'feature';
}

function hasQueryKeyPrefix(queryKey: QueryKey, prefix: readonly unknown[]): boolean {
  return Array.isArray(queryKey) && prefix.every((segment, index) => queryKey[index] === segment);
}

function isLegacyFeedbackListQuery(queryKey: QueryKey): boolean {
  if (!isFeatureQueryKey(queryKey) || queryKey[1] !== 'feedback') {
    return false;
  }

  return queryKey.length === 2 || (queryKey.length === 3 && queryKey[2] === 'all');
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

function isWhatsNewSeenVersionQuery(queryKey: QueryKey): boolean {
  return hasQueryKeyPrefix(queryKey, ['feature', 'whats-new-seen-version']) && queryKey.length === 2;
}

function isPersistedFeatureQuery(queryKey: QueryKey): boolean {
  if (!isFeatureQueryKey(queryKey) || typeof queryKey[1] !== 'string') {
    return false;
  }

  switch (queryKey[1]) {
    case 'homeFeed':
      return isPaginatedHomeFeedQueryKey(queryKey);
    case 'visits':
    case 'quickTracks':
    case 'bills':
      return queryKey.length === 2;
    case 'visitPhotos':
      return queryKey.length === 2 || isHomeFeedPhotosQuery(queryKey);
    case 'notes':
      return queryKey.length === 2 || isPaginatedNotesQueryKey(queryKey) || isNotesSummaryQueryKey(queryKey);
    case 'notePhotos':
      return isBrowseNotePhotosQuery(queryKey);
    case 'friends':
      return (
        queryKey.length === 2 ||
        (queryKey.length === 4 && isPaginatedFriendsQueryKey(queryKey)) ||
        isFriendsSummaryQueryKey(queryKey)
      );
    case 'restaurantLists':
    case 'restaurantListItemCounts.v2':
      return true;
    case 'profile':
      return isProfileQueryKey(queryKey);
    case 'feedback':
      return (
        isLegacyFeedbackListQuery(queryKey) ||
        isPaginatedFeedbackListQuery(queryKey) ||
        isFeedbackSummaryQuery(queryKey)
      );
    case 'whats-new-seen-version':
      return isWhatsNewSeenVersionQuery(queryKey);
    default:
      return false;
  }
}

function sanitizeNoteRecord(note: NoteRecord): NoteRecord {
  const sanitized = {
    ...(note as NoteRecord & {
      latitude?: number;
      longitude?: number;
    }),
  };

  delete sanitized.latitude;
  delete sanitized.longitude;

  return sanitized;
}

function sanitizeFeedbackRecord(feedback: FeedbackRecord): FeedbackRecord {
  return {
    ...feedback,
    assignedAdminId: undefined,
    userEmail: undefined,
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizePersistedCollectionData<TRecord>(
  data: unknown,
  sanitizeRecord: (record: TRecord) => TRecord,
): unknown {
  if (Array.isArray(data)) {
    return data.map((record) => sanitizeRecord(record as TRecord));
  }

  if (!isObjectRecord(data)) {
    return data;
  }

  if (Array.isArray(data.pages)) {
    return {
      ...data,
      pages: data.pages.map((page) => {
        if (!isObjectRecord(page) || !Array.isArray(page.items)) {
          return page;
        }

        return {
          ...page,
          items: page.items.map((record) => sanitizeRecord(record as TRecord)),
        };
      }),
    };
  }

  if (Array.isArray(data.records)) {
    return {
      ...data,
      records: data.records.map((record) => sanitizeRecord(record as TRecord)),
    };
  }

  return data;
}

function sanitizePersistedQueryData(queryKey: QueryKey, data: unknown): unknown {
  if (!data) {
    return data;
  }

  if (isFeatureQueryKey(queryKey) && queryKey[1] === 'notes') {
    return sanitizePersistedCollectionData(data, sanitizeNoteRecord);
  }

  if (isLegacyFeedbackListQuery(queryKey) || isPaginatedFeedbackListQuery(queryKey)) {
    return sanitizePersistedCollectionData(data, sanitizeFeedbackRecord);
  }

  return data;
}

export function shouldPersistQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && isPersistedFeatureQuery(query.queryKey);
}

export function sanitizePersistedClient(persistedClient: PersistedClient): PersistedClient {
  return {
    ...persistedClient,
    clientState: {
      ...persistedClient.clientState,
      queries: persistedClient.clientState.queries.map((persistedQuery) => ({
        ...persistedQuery,
        state: {
          ...persistedQuery.state,
          data: sanitizePersistedQueryData(persistedQuery.queryKey, persistedQuery.state.data),
        },
      })),
    },
  };
}

export async function removeLegacyQueryCache(): Promise<void> {
  await Promise.all(LEGACY_QUERY_CACHE_STORAGE_KEYS.map((storageKey) => AsyncStorage.removeItem(storageKey)));
}

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_STORAGE_KEY,
  throttleTime: 1000,
  serialize: (persistedClient) => JSON.stringify(sanitizePersistedClient(persistedClient)),
});
