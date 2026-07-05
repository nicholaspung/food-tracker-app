import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/query-persist-client-core';
import { QueryClient } from '@tanstack/react-query';

import { getEnvironmentStorageKey } from '../config/persistence';
import { billsQueryKeys } from '../features/store/billsQuery';
import { feedbackQueryKeys } from '../features/store/feedbackQuery';
import { friendsQueryKeys } from '../features/store/friendsQuery';
import { homeFeedQueryKeys } from '../features/store/homeFeedQuery';
import { moreFeatureSignalQueryKeys } from '../features/store/moreFeatureSignalsQuery';
import { notesQueryKeys } from '../features/store/notesQuery';
import { profileQueryKeys } from '../features/store/profileQuery';
import { tastingSessionsQueryKeys } from '../features/store/tastingSessionsQuery';
import { localPersistence } from '../localPersistence';
import { clearPersistedQueryCache, queryPersister, shouldPersistQuery } from '../providers/queryPersistence';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

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
    sourceClient.setQueryData(feedbackQueryKeys.messages('feedback_1'), {
      pages: [
        {
          items: [
            {
              id: 'feedback_message_1',
              feedbackId: 'feedback_1',
              userId: 'user_1',
              message: 'Any update?',
              isAdminMessage: false,
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
    sourceClient.setQueryData(profileQueryKeys.profile, {
      displayName: 'Should persist',
      bio: 'Private bio',
      favoriteCuisine: 'Sushi',
      location: 'San Francisco',
      receiveMarketingEmails: true,
    });
    sourceClient.setQueryData(tastingSessionsQueryKeys.root, [
      {
        createdAt: '2026-05-20T11:00:00.000Z',
        id: 'session_1',
        inviteCode: 'ABC123',
        invites: [],
        joinedCount: 1,
        joinExpiresAt: '2099-01-01T00:00:00.000Z',
        leaderUserId: 'user-1',
        maxApprovedItems: 8,
        maxParticipants: 8,
        maxRestaurants: 3,
        name: 'Ramen night',
        participants: [],
        restaurants: [],
        status: 'lobby',
        updatedAt: '2026-05-20T11:00:00.000Z',
      },
    ]);
    sourceClient.setQueryData(moreFeatureSignalQueryKeys.summary, {
      bills: {
        activeOwedBillCount: 1,
        indicator: { count: 1, kind: 'count' },
      },
      tastingSessions: {
        hasActiveParticipantSession: false,
        hasLeaderInviteAction: true,
        indicator: { kind: 'dot' },
        pendingInviteCount: 0,
      },
    });
    sourceClient.setQueryData(billsQueryKeys.paginated('you_owe'), {
      pages: [
        {
          items: [
            {
              id: 'bill-summary-1',
              title: 'Bounded bill summary',
              status: 'open',
              participantCount: 2,
              pendingOtherParticipantCount: 0,
              youOwe: 12,
              youAreOwed: 0,
              isCreator: false,
              createdAt: '2026-02-12T00:00:00.000Z',
              updatedAt: '2026-02-12T00:00:00.000Z',
            },
          ],
          summary: {
            billCount: 1,
            totalAmount: 12,
          },
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    });
    sourceClient.setQueryData(billsQueryKeys.root, [
      {
        id: 'legacy-bill-summary',
        title: 'Legacy unpaginated bill summary',
      },
    ]);
    sourceClient.setQueryData(billsQueryKeys.detail('bill-1'), {
      id: 'bill-1',
      title: 'Persisted bill',
      status: 'open',
      createdAt: '2026-02-12T00:00:00.000Z',
      updatedAt: '2026-02-12T00:00:00.000Z',
    });
    sourceClient.setQueryData(['feature', 'feedback', 'thread_1'], {
      id: 'thread_1',
      description: 'Thread detail should not persist',
    });
    sourceClient.setQueryData(['feature', 'feedback'], [
      {
        id: 'legacy_feedback_1',
        title: 'Legacy root feedback should not persist',
      },
    ]);
    sourceClient.setQueryData(['feature', 'feedback', 'all'], [
      {
        id: 'legacy_feedback_2',
        title: 'Legacy all feedback should not persist',
      },
    ]);
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
    expect(restoredClient.getQueryData(notesQueryKeys.paginated('draft', 'noodles'))).toBeUndefined();
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
    expect(restoredClient.getQueryData(feedbackQueryKeys.messages('feedback_1'))).toEqual(
      sourceClient.getQueryData(feedbackQueryKeys.messages('feedback_1')),
    );
    expect(restoredClient.getQueryData(profileQueryKeys.profile)).toEqual(
      sourceClient.getQueryData(profileQueryKeys.profile),
    );
    expect(restoredClient.getQueryData(tastingSessionsQueryKeys.root)).toEqual(
      sourceClient.getQueryData(tastingSessionsQueryKeys.root),
    );
    expect(restoredClient.getQueryData(moreFeatureSignalQueryKeys.summary)).toEqual(
      sourceClient.getQueryData(moreFeatureSignalQueryKeys.summary),
    );
    expect(restoredClient.getQueryData(billsQueryKeys.paginated('you_owe'))).toEqual(
      sourceClient.getQueryData(billsQueryKeys.paginated('you_owe')),
    );
    expect(restoredClient.getQueryData(billsQueryKeys.detail('bill-1'))).toEqual(
      sourceClient.getQueryData(billsQueryKeys.detail('bill-1')),
    );
    expect(restoredClient.getQueryData(billsQueryKeys.root)).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'quickTracks'])).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'feedback', 'thread_1'])).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'feedback'])).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'feedback', 'all'])).toBeUndefined();
    expect(restoredClient.getQueryData(friendsQueryKeys.paginated('user-1', 'friends', 'tay'))).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'homeFeed', 'paginated', 'friends', 'all', 'created', ''])).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'friends', 'summary'])).toBeUndefined();

    sourceClient.clear();
    restoredClient.clear();
  });

  it('bounds persisted infinite-query data to the first page window', async () => {
    const homeFeedKey = homeFeedQueryKeys.paginated('user-1', 'mine', 'all', 'created', '');
    const notesKey = notesQueryKeys.paginated('draft');
    const feedbackKey = feedbackQueryKeys.list;
    const homeFeedData = {
      pages: [
        {
          items: Array.from({ length: 60 }, (_, index) => ({
            source: 'visit',
            eventAt: `2026-02-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
            visit: {
              id: `visit_${index + 1}`,
            },
          })),
          cursor: 'cursor_2',
          hasNextPage: true,
          totalFoodProducts: 0,
          totalVisits: 120,
        },
        {
          items: [
            {
              source: 'visit',
              eventAt: '2026-03-01T00:00:00.000Z',
              visit: {
                id: 'visit_61',
              },
            },
          ],
          cursor: undefined,
          hasNextPage: false,
          totalFoodProducts: 0,
          totalVisits: 120,
        },
      ],
      pageParams: [undefined, 'cursor_2'],
    };
    const notesData = {
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
          totalItems: 2,
          totalPages: 2,
          hasNextPage: true,
        },
        {
          items: [
            {
              id: 'note_2',
              title: 'Second page',
              content: 'Too much cache',
              status: 'draft',
              createdAt: '2026-02-13T00:00:00.000Z',
              updatedAt: '2026-02-13T00:00:00.000Z',
            },
          ],
          page: 2,
          pageSize: 20,
          totalItems: 2,
          totalPages: 2,
          hasNextPage: false,
        },
      ],
      pageParams: [1, 2],
    };
    const feedbackData = {
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
          totalItems: 2,
          totalPages: 2,
          hasNextPage: true,
        },
        {
          items: [
            {
              id: 'feedback_2',
              userId: 'user_1',
              title: 'Second page',
              description: 'Should not persist',
              status: 'open',
              adminUnreadCount: 0,
              userUnreadCount: 0,
              createdAt: '2026-02-13T00:00:00.000Z',
              updatedAt: '2026-02-13T00:00:00.000Z',
            },
          ],
          page: 2,
          pageSize: 20,
          totalItems: 2,
          totalPages: 2,
          hasNextPage: false,
        },
      ],
      pageParams: [1, 2],
    };
    const sourceClient = new QueryClient();
    sourceClient.setQueryData(homeFeedKey, homeFeedData);
    sourceClient.setQueryData(notesKey, notesData);
    sourceClient.setQueryData(feedbackKey, feedbackData);

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

    expect(restoredClient.getQueryData(homeFeedKey)).toEqual({
      ...homeFeedData,
      pages: [
        {
          ...homeFeedData.pages[0],
          items: homeFeedData.pages[0].items.slice(0, 50),
        },
      ],
      pageParams: [null],
    });
    expect(restoredClient.getQueryData(notesKey)).toEqual({
      ...notesData,
      pages: [notesData.pages[0]],
      pageParams: [1],
    });
    expect(restoredClient.getQueryData(feedbackKey)).toEqual({
      ...feedbackData,
      pages: [feedbackData.pages[0]],
      pageParams: [1],
    });
    expect(await AsyncStorage.getItem(localPersistence.queryCache.activeStorageKey)).toContain(
      '"trimmed":true',
    );

    sourceClient.clear();
    restoredClient.clear();
  });

  it('excludes transient search-specific browse query caches', async () => {
    const homeSearchKey = homeFeedQueryKeys.paginated('user-1', 'mine', 'all', 'created', 'ramen');
    const notesSearchKey = notesQueryKeys.paginated('draft', 'noodles');
    const friendsSearchKey = friendsQueryKeys.paginated('user-1', 'friends', 'tay');
    const sourceClient = new QueryClient();
    sourceClient.setQueryData(homeSearchKey, {
      pages: [{ items: [{ id: 'visit_search_1' }], hasNextPage: false }],
      pageParams: [undefined],
    });
    sourceClient.setQueryData(notesSearchKey, {
      pages: [{ items: [{ id: 'note_search_1' }], hasNextPage: false }],
      pageParams: [1],
    });
    sourceClient.setQueryData(friendsSearchKey, {
      pages: [{ items: [{ id: 'friend_search_1' }], hasNextPage: false }],
      pageParams: [1],
    });
    sourceClient.setQueryData(profileQueryKeys.profile, {
      displayName: 'Persisted profile keeps save non-empty',
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

    expect(restoredClient.getQueryData(homeSearchKey)).toBeUndefined();
    expect(restoredClient.getQueryData(notesSearchKey)).toBeUndefined();
    expect(restoredClient.getQueryData(friendsSearchKey)).toBeUndefined();
    expect(restoredClient.getQueryData(profileQueryKeys.profile)).toEqual({
      displayName: 'Persisted profile keeps save non-empty',
    });

    sourceClient.clear();
    restoredClient.clear();
  });

  it('stores persisted queries under the v5 cache key without touching retired legacy cache keys', async () => {
    const legacyCacheKeyV1 = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v1');
    const legacyCacheKeyV2 = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v2');
    const legacyCacheKeyV3 = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v3');
    const legacyCacheKeyV4 = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v4');
    const activeCacheKeyV5 = getEnvironmentStorageKey('food_tracker_mobile_query_cache_v5');

    await AsyncStorage.setItem(legacyCacheKeyV1, 'legacy-v1');
    await AsyncStorage.setItem(legacyCacheKeyV2, 'legacy-v2');
    await AsyncStorage.setItem(legacyCacheKeyV3, 'legacy-v3');
    await AsyncStorage.setItem(legacyCacheKeyV4, 'legacy-v4');

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
    expect(await AsyncStorage.getItem(legacyCacheKeyV1)).toBe('legacy-v1');
    expect(await AsyncStorage.getItem(legacyCacheKeyV2)).toBe('legacy-v2');
    expect(await AsyncStorage.getItem(legacyCacheKeyV3)).toBe('legacy-v3');
    expect(await AsyncStorage.getItem(legacyCacheKeyV4)).toBe('legacy-v4');

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

  it('round-trips current default Notes data and redacts private Feedback fields', async () => {
    const notesData = {
      pages: [
        {
          items: [
            {
              id: 'note_1',
              title: 'Saved place',
              content: 'Try the noodles',
              locationText: 'Mission District',
              status: 'draft',
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
    };
    const feedbackData = {
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
    };
    const feedbackMessagesData = {
      pages: [
        {
          items: [
            {
              id: 'feedback_message_1',
              feedbackId: 'feedback_1',
              userId: 'user_1',
              userEmail: 'private-message@example.com',
              message: 'Can you help?',
              isAdminMessage: false,
              createdAt: '2026-01-01T00:00:00.000Z',
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
    };
    const redactedFeedbackData = {
      ...feedbackData,
      pages: [
        {
          ...feedbackData.pages[0],
          items: [
            {
              ...feedbackData.pages[0].items[0],
              assignedAdminId: undefined,
              userEmail: undefined,
            },
          ],
        },
      ],
    };
    const redactedFeedbackMessagesData = {
      ...feedbackMessagesData,
      pages: [
        {
          ...feedbackMessagesData.pages[0],
          items: [
            {
              ...feedbackMessagesData.pages[0].items[0],
              userEmail: undefined,
            },
          ],
        },
      ],
    };
    const sourceClient = new QueryClient();
    sourceClient.setQueryData(notesQueryKeys.paginated('draft'), notesData);
    sourceClient.setQueryData(notesQueryKeys.paginated('draft', 'noodles'), notesData);
    sourceClient.setQueryData(feedbackQueryKeys.list, feedbackData);
    sourceClient.setQueryData(feedbackQueryKeys.messages('feedback_1'), feedbackMessagesData);

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

    expect(restoredClient.getQueryData(notesQueryKeys.paginated('draft'))).toEqual(notesData);
    expect(restoredClient.getQueryData(notesQueryKeys.paginated('draft', 'noodles'))).toBeUndefined();
    expect(restoredClient.getQueryData(feedbackQueryKeys.list)).toEqual(redactedFeedbackData);
    expect(restoredClient.getQueryData(feedbackQueryKeys.messages('feedback_1'))).toEqual(
      redactedFeedbackMessagesData,
    );
    expect(await AsyncStorage.getItem(localPersistence.queryCache.activeStorageKey)).not.toContain(
      'private@example.com',
    );
    expect(await AsyncStorage.getItem(localPersistence.queryCache.activeStorageKey)).not.toContain(
      'private-message@example.com',
    );
    expect(await AsyncStorage.getItem(localPersistence.queryCache.activeStorageKey)).not.toContain('admin_1');

    sourceClient.clear();
    restoredClient.clear();
  });
});
