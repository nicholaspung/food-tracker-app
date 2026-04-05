import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient } from '@tanstack/query-persist-client-core';
import { defaultShouldDehydrateQuery, type Query, type QueryKey } from '@tanstack/react-query';

import type { FeedbackRecord, NoteRecord } from '../features';

export const LEGACY_QUERY_CACHE_STORAGE_KEY = 'food_tracker_mobile_query_cache_v1';
export const QUERY_CACHE_STORAGE_KEY = 'food_tracker_mobile_query_cache_v2';

function isFeatureQueryKey(queryKey: QueryKey): queryKey is readonly [string, ...unknown[]] {
  return Array.isArray(queryKey) && queryKey[0] === 'feature';
}

function isFeedbackListQuery(queryKey: QueryKey): boolean {
  if (!isFeatureQueryKey(queryKey) || queryKey[1] !== 'feedback') {
    return false;
  }

  return queryKey.length === 2 || (queryKey.length === 3 && queryKey[2] === 'all');
}

function isPersistedFeatureQuery(queryKey: QueryKey): boolean {
  if (!isFeatureQueryKey(queryKey) || typeof queryKey[1] !== 'string') {
    return false;
  }

  switch (queryKey[1]) {
    case 'visits':
    case 'quickTracks':
    case 'visitPhotos':
    case 'notes':
    case 'bills':
    case 'friends':
      return queryKey.length === 2;
    case 'restaurantLists':
    case 'restaurantListItemCounts.v2':
      return true;
    case 'feedback':
      return isFeedbackListQuery(queryKey);
    default:
      return false;
  }
}

function sanitizeNoteRecord(note: NoteRecord): NoteRecord {
  const sanitized = {
    ...(note as NoteRecord & {
      latitude?: number;
      locationText?: string;
      longitude?: number;
    }),
  };

  delete sanitized.locationText;
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

function sanitizePersistedQueryData(queryKey: QueryKey, data: unknown): unknown {
  if (!data) {
    return data;
  }

  if (isFeatureQueryKey(queryKey) && queryKey[1] === 'notes' && Array.isArray(data)) {
    return data.map((note) => sanitizeNoteRecord(note as NoteRecord));
  }

  if (isFeedbackListQuery(queryKey) && Array.isArray(data)) {
    return data.map((feedback) => sanitizeFeedbackRecord(feedback as FeedbackRecord));
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
  await AsyncStorage.removeItem(LEGACY_QUERY_CACHE_STORAGE_KEY);
}

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_STORAGE_KEY,
  throttleTime: 1000,
  serialize: (persistedClient) => JSON.stringify(sanitizePersistedClient(persistedClient)),
});
