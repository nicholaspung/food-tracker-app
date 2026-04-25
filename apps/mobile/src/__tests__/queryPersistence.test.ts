import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/query-persist-client-core';
import { QueryClient } from '@tanstack/react-query';

import { getEnvironmentStorageKey } from '../config/persistence';
import { feedbackQueryKeys } from '../features/store/feedbackQuery';
import { friendsQueryKeys } from '../features/store/friendsQuery';
import { homeFeedQueryKeys } from '../features/store/homeFeedQuery';
import { notesQueryKeys } from '../features/store/notesQuery';
import { profileQueryKeys } from '../features/store/profileQuery';
import {
  clearPersistedQueryCache,
  queryPersister,
  removeLegacyQueryCache,
  sanitizePersistedClient,
  shouldPersistQuery,
} from '../providers/queryPersistence';

describe('React Query persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('restores only allowlisted browse-surface queries after a cold restart', async () => {
    const sourceClient = new QueryClient();
    sourceClient.setQueryData(homeFeedQueryKeys.paginated('user-1', 'mine', 'all', 'created', ''), {
      pages: [
        {
          items: [
            {
              source: 'visit',
              eventAt: '2026-02-12T00:00:00.000Z',
              visit: {
                id: 'visit_1',
              },
            },
          ],
          cursor: undefined,
          hasNextPage: false,
          totalFoodProducts: 0,
          totalVisits: 1,
        },
      ],
      pageParams: ['page_1'],
    });
    sourceClient.setQueryData(['feature', 'visitPhotos', 'feedItems', 'mine'], {
      loadedIds: ['item_1'],
      records: [
        {
          id: 'photo_1',
          food_item: 'item_1',
          photo: 'photo_1.jpg',
          created: '2026-02-12T00:00:00.000Z',
        },
      ],
    });
    sourceClient.setQueryData(notesQueryKeys.paginated('draft'), {
      pages: [
        {
          items: [
            {
              id: 'note_1',
              title: 'Saved place',
              content: 'Try the noodles',
              status: 'draft',
              createdAt: '2026-02-12T00:00:00.000Z',
              updatedAt: '2026-02-12T00:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    });
    sourceClient.setQueryData(notesQueryKeys.paginated('draft', 'noodles'), {
      pages: [
        {
          items: [
            {
              id: 'note_search_1',
              title: 'Search match',
              content: 'Try the noodles',
              status: 'draft',
              createdAt: '2026-02-13T00:00:00.000Z',
              updatedAt: '2026-02-13T00:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    });
    sourceClient.setQueryData(notesQueryKeys.summary, {
      allCount: 1,
      draftCount: 1,
      usedCount: 0,
    });
    sourceClient.setQueryData(['feature', 'notePhotos', 'notes'], {
      loadedIds: ['note_1'],
      records: [
        {
          id: 'note_photo_1',
          note: 'note_1',
          photo: 'note-photo-1.jpg',
          created: '2026-02-12T00:00:00.000Z',
        },
      ],
    });
    sourceClient.setQueryData(friendsQueryKeys.summary('user-1'), {
      friendsCount: 1,
      requestsCount: 0,
      sentCount: 0,
    });
    sourceClient.setQueryData(friendsQueryKeys.paginated('user-1', 'friends'), {
      pages: [
        {
          items: [
            {
              id: 'friend_1',
              userId: 'user_2',
              name: 'Taylor',
              email: 'taylor@example.com',
              status: 'friend',
              createdAt: '2026-02-12T00:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          summary: {
            friendsCount: 1,
            requestsCount: 0,
            sentCount: 0,
          },
          totalItems: 1,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    });
    sourceClient.setQueryData(feedbackQueryKeys.list, {
      pages: [
        {
          items: [
            {
              id: 'feedback_1',
              userId: 'user_1',
              title: 'Bug',
              description: 'App crashed',
              status: 'open',
              adminUnreadCount: 0,
              userUnreadCount: 1,
              createdAt: '2026-02-12T00:00:00.000Z',
              updatedAt: '2026-02-12T00:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    });
    sourceClient.setQueryData(feedbackQueryKeys.summary, {
      allCount: 4,
      activeCount: 2,
    });
    sourceClient.setQueryData(profileQueryKeys.profile, {
      displayName: 'Should persist',
      bio: 'Private bio',
      favoriteCuisine: 'Sushi',
      location: 'San Francisco',
      receiveMarketingEmails: true,
    });
    sourceClient.setQueryData(['feature', 'feedback', 'thread_1'], {
      id: 'thread_1',
      description: 'Thread detail should not persist',
    });
    sourceClient.setQueryData(['feature', 'quickTracks'], [
      {
        id: 'legacy_food_product_1',
        itemName: 'Legacy Food Product',
      },
    ]);
    sourceClient.setQueryData(['feature', 'homeFeed', 'paginated', 'friends', 'all', 'created', ''], {
      pages: [{ items: [], hasNextPage: false }],
      pageParams: [undefined],
    });
    sourceClient.setQueryData(['feature', 'friends', 'summary'], {
      friendsCount: 99,
      requestsCount: 0,
      sentCount: 0,
    });
    sourceClient.setQueryData(friendsQueryKeys.paginated('user-1', 'friends', 'tay'), {
      pages: [
        {
          items: [
            {
              id: 'friend_2',
              userId: 'user_3',
              name: 'Bill Picker',
              email: 'bill@example.com',
              status: 'friend',
              createdAt: '2026-02-12T00:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    });

    await persistQueryClientSave({
      queryClient: sourceClient,
      persister: queryPersister,
      dehydrateOptions: {
        shouldDehydrateQuery: shouldPersistQuery,
      },
    });

    const restoredClient = new QueryClient();
    await persistQueryClientRestore({
      queryClient: restoredClient,
      persister: queryPersister,
      maxAge: 1000 * 60 * 60 * 24,
    });

    expect(restoredClient.getQueryData(homeFeedQueryKeys.paginated('user-1', 'mine', 'all', 'created', ''))).toEqual(
      sourceClient.getQueryData(homeFeedQueryKeys.paginated('user-1', 'mine', 'all', 'created', '')),
    );
    expect(restoredClient.getQueryData(['feature', 'visitPhotos', 'feedItems', 'mine'])).toEqual(
      sourceClient.getQueryData(['feature', 'visitPhotos', 'feedItems', 'mine']),
    );
    expect(restoredClient.getQueryData(notesQueryKeys.paginated('draft'))).toEqual(
      sourceClient.getQueryData(notesQueryKeys.paginated('draft')),
    );
    expect(restoredClient.getQueryData(notesQueryKeys.paginated('draft', 'noodles'))).toEqual(
      sourceClient.getQueryData(notesQueryKeys.paginated('draft', 'noodles')),
    );
    expect(restoredClient.getQueryData(notesQueryKeys.summary)).toEqual(
      sourceClient.getQueryData(notesQueryKeys.summary),
    );
    expect(restoredClient.getQueryData(['feature', 'notePhotos', 'notes'])).toEqual(
      sourceClient.getQueryData(['feature', 'notePhotos', 'notes']),
    );
    expect(restoredClient.getQueryData(friendsQueryKeys.summary('user-1'))).toEqual(
      sourceClient.getQueryData(friendsQueryKeys.summary('user-1')),
    );
    expect(restoredClient.getQueryData(friendsQueryKeys.paginated('user-1', 'friends'))).toEqual(
      sourceClient.getQueryData(friendsQueryKeys.paginated('user-1', 'friends')),
    );
    expect(restoredClient.getQueryData(feedbackQueryKeys.list)).toEqual(
      sourceClient.getQueryData(feedbackQueryKeys.list),
    );
    expect(restoredClient.getQueryData(feedbackQueryKeys.summary)).toEqual(
      sourceClient.getQueryData(feedbackQueryKeys.summary),
    );
    expect(restoredClient.getQueryData(profileQueryKeys.profile)).toEqual(
      sourceClient.getQueryData(profileQueryKeys.profile),
    );
    expect(restoredClient.getQueryData(['feature', 'quickTracks'])).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'feedback', 'thread_1'])).toBeUndefined();
    expect(restoredClient.getQueryData(friendsQueryKeys.paginated('user-1', 'friends', 'tay'))).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'homeFeed', 'paginated', 'friends', 'all', 'created', ''])).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'friends', 'summary'])).toBeUndefined();

    sourceClient.clear();
    restoredClient.clear();
  });

  it('stores persisted queries under the v5 cache key and removes legacy cache keys', async () => {
    const legacyCacheKeyV1 = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v1');
    const legacyCacheKeyV2 = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v2');
    const legacyCacheKeyV3 = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v3');
    const legacyCacheKeyV4 = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v4');
    const activeCacheKeyV5 = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v5');

    await AsyncStorage.setItem(legacyCacheKeyV1, 'legacy-v1');
    await AsyncStorage.setItem(legacyCacheKeyV2, 'legacy-v2');
    await AsyncStorage.setItem(legacyCacheKeyV3, 'legacy-v3');
    await AsyncStorage.setItem(legacyCacheKeyV4, 'legacy-v4');

    const removedLegacyKeys = await removeLegacyQueryCache();

    expect(removedLegacyKeys).toEqual([legacyCacheKeyV1, legacyCacheKeyV2, legacyCacheKeyV3, legacyCacheKeyV4]);
    expect(await AsyncStorage.getItem(legacyCacheKeyV1)).toBeNull();
    expect(await AsyncStorage.getItem(legacyCacheKeyV2)).toBeNull();
    expect(await AsyncStorage.getItem(legacyCacheKeyV3)).toBeNull();
    expect(await AsyncStorage.getItem(legacyCacheKeyV4)).toBeNull();
    expect(await AsyncStorage.getItem(activeCacheKeyV5)).toBeNull();

    const queryClient = new QueryClient();
    queryClient.setQueryData(['feature', 'foodProducts'], [{ id: 'food-product-1' }]);

    await persistQueryClientSave({
      queryClient,
      persister: queryPersister,
      dehydrateOptions: {
        shouldDehydrateQuery: shouldPersistQuery,
      },
    });

    expect(await AsyncStorage.getItem(activeCacheKeyV5)).not.toBeNull();
    expect(await AsyncStorage.getItem(legacyCacheKeyV2)).toBeNull();
    expect(await AsyncStorage.getItem(legacyCacheKeyV3)).toBeNull();
    expect(await AsyncStorage.getItem(legacyCacheKeyV4)).toBeNull();

    queryClient.clear();
  });

  it('clears the active persisted query cache key on demand', async () => {
    const activeCacheKeyV5 = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v5');
    const queryClient = new QueryClient();
    queryClient.setQueryData(['feature', 'foodProducts'], [{ id: 'food-product-1' }]);

    await persistQueryClientSave({
      queryClient,
      persister: queryPersister,
      dehydrateOptions: {
        shouldDehydrateQuery: shouldPersistQuery,
      },
    });

    expect(await AsyncStorage.getItem(activeCacheKeyV5)).not.toBeNull();

    await clearPersistedQueryCache();

    expect(await AsyncStorage.getItem(activeCacheKeyV5)).toBeNull();
    queryClient.clear();
  });

  it('redacts sensitive fields from persisted notes and feedback browse data', async () => {
    const persistedClient = sanitizePersistedClient({
      buster: '',
      timestamp: Date.now(),
      clientState: {
        mutations: [],
        queries: [
          {
            dehydratedAt: Date.now(),
            queryHash: 'notes-paginated-draft',
            queryKey: ['feature', 'notes', 'paginated', 'draft'],
            state: {
              data: {
                pages: [
                  {
                    items: [
                      {
                        id: 'note_1',
                        title: 'Saved place',
                        content: 'Try the noodles',
                        locationText: 'Mission District',
                        status: 'draft',
                        latitude: 37.7749,
                        longitude: -122.4194,
                        createdAt: '2026-01-01T00:00:00.000Z',
                        updatedAt: '2026-01-01T00:00:00.000Z',
                      },
                    ],
                    page: 1,
                    pageSize: 20,
                    totalItems: 1,
                    totalPages: 1,
                    hasNextPage: false,
                  },
                ],
                pageParams: [1],
              },
              dataUpdateCount: 1,
              dataUpdatedAt: Date.now(),
              error: null,
              errorUpdateCount: 0,
              errorUpdatedAt: 0,
              fetchFailureCount: 0,
              fetchFailureReason: null,
              fetchMeta: null,
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
            },
          },
          {
            dehydratedAt: Date.now(),
            queryHash: 'notes-paginated-draft-search',
            queryKey: ['feature', 'notes', 'paginated', 'draft', 'noodles'],
            state: {
              data: {
                pages: [
                  {
                    items: [
                      {
                        id: 'note_2',
                        title: 'Saved place',
                        content: 'Try the noodles',
                        locationText: 'Mission District',
                        status: 'draft',
                        latitude: 40.7128,
                        longitude: -74.006,
                        createdAt: '2026-01-02T00:00:00.000Z',
                        updatedAt: '2026-01-02T00:00:00.000Z',
                      },
                    ],
                    page: 1,
                    pageSize: 20,
                    totalItems: 1,
                    totalPages: 1,
                    hasNextPage: false,
                  },
                ],
                pageParams: [1],
              },
              dataUpdateCount: 1,
              dataUpdatedAt: Date.now(),
              error: null,
              errorUpdateCount: 0,
              errorUpdatedAt: 0,
              fetchFailureCount: 0,
              fetchFailureReason: null,
              fetchMeta: null,
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
            },
          },
          {
            dehydratedAt: Date.now(),
            queryHash: 'feedback-all-paginated',
            queryKey: feedbackQueryKeys.list,
            state: {
              data: {
                pages: [
                  {
                    items: [
                      {
                        id: 'feedback_1',
                        userId: 'user_1',
                        userEmail: 'private@example.com',
                        assignedAdminId: 'admin_1',
                        title: 'Bug',
                        description: 'App crashed',
                        status: 'open',
                        adminUnreadCount: 0,
                        userUnreadCount: 1,
                        createdAt: '2026-01-01T00:00:00.000Z',
                        updatedAt: '2026-01-01T00:00:00.000Z',
                      },
                    ],
                    page: 1,
                    pageSize: 20,
                    totalItems: 1,
                    totalPages: 1,
                    hasNextPage: false,
                  },
                ],
                pageParams: [1],
              },
              dataUpdateCount: 1,
              dataUpdatedAt: Date.now(),
              error: null,
              errorUpdateCount: 0,
              errorUpdatedAt: 0,
              fetchFailureCount: 0,
              fetchFailureReason: null,
              fetchMeta: null,
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
            },
          },
        ],
      },
    } as never);

    const note = (
      ((persistedClient.clientState.queries[0]?.state.data as {
        pages?: {
          items?: {
            latitude?: number;
            locationText?: string;
            longitude?: number;
          }[];
        }[];
      })?.pages ?? [])[0]?.items ?? []
    )[0];
    const feedback = (
      ((persistedClient.clientState.queries[2]?.state.data as {
        pages?: {
          items?: {
            userEmail?: string;
            assignedAdminId?: string;
          }[];
        }[];
      })?.pages ?? [])[0]?.items ?? []
    )[0];

    expect(note).toBeDefined();
    expect(feedback).toBeDefined();
    expect(note?.locationText).toBe('Mission District');
    expect(note?.latitude).toBeUndefined();
    expect(note?.longitude).toBeUndefined();
    const searchedNote = (
      ((persistedClient.clientState.queries[1]?.state.data as {
        pages?: {
          items?: {
            latitude?: number;
            locationText?: string;
            longitude?: number;
          }[];
        }[];
      })?.pages ?? [])[0]?.items ?? []
    )[0];
    expect(searchedNote?.locationText).toBe('Mission District');
    expect(searchedNote?.latitude).toBeUndefined();
    expect(searchedNote?.longitude).toBeUndefined();
    expect(feedback?.userEmail).toBeUndefined();
    expect(feedback?.assignedAdminId).toBeUndefined();
  });
});
