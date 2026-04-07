import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/query-persist-client-core';
import { QueryClient } from '@tanstack/react-query';

import { feedbackQueryKeys } from '../features/store/feedbackQuery';
import { queryPersister, sanitizePersistedClient, shouldPersistQuery } from '../providers/queryPersistence';

describe('React Query persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('restores only allowlisted browse-surface queries after a cold restart', async () => {
    const sourceClient = new QueryClient();
    sourceClient.setQueryData(['feature', 'homeFeed', 'paginated', 'mine', 'all', ''], {
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
          totalQuickTracks: 0,
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
    sourceClient.setQueryData(['feature', 'notes', 'paginated', 'draft'], {
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
    sourceClient.setQueryData(['feature', 'notes', 'summary'], {
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
    sourceClient.setQueryData(['feature', 'friends', 'summary'], {
      friendsCount: 1,
      requestsCount: 0,
      sentCount: 0,
    });
    sourceClient.setQueryData(['feature', 'friends', 'paginated', 'friends'], {
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
    sourceClient.setQueryData(['feature', 'profile'], {
      displayName: 'Should not persist',
      bio: 'Private bio',
      favoriteCuisine: 'Sushi',
      location: 'San Francisco',
      receiveMarketingEmails: true,
    });
    sourceClient.setQueryData(['feature', 'feedback', 'thread_1'], {
      id: 'thread_1',
      description: 'Thread detail should not persist',
    });
    sourceClient.setQueryData(['feature', 'friends', 'paginated', 'friends', 'bill-picker', 'tay'], {
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

    expect(restoredClient.getQueryData(['feature', 'homeFeed', 'paginated', 'mine', 'all', ''])).toEqual(
      sourceClient.getQueryData(['feature', 'homeFeed', 'paginated', 'mine', 'all', '']),
    );
    expect(restoredClient.getQueryData(['feature', 'visitPhotos', 'feedItems', 'mine'])).toEqual(
      sourceClient.getQueryData(['feature', 'visitPhotos', 'feedItems', 'mine']),
    );
    expect(restoredClient.getQueryData(['feature', 'notes', 'paginated', 'draft'])).toEqual(
      sourceClient.getQueryData(['feature', 'notes', 'paginated', 'draft']),
    );
    expect(restoredClient.getQueryData(['feature', 'notes', 'summary'])).toEqual(
      sourceClient.getQueryData(['feature', 'notes', 'summary']),
    );
    expect(restoredClient.getQueryData(['feature', 'notePhotos', 'notes'])).toEqual(
      sourceClient.getQueryData(['feature', 'notePhotos', 'notes']),
    );
    expect(restoredClient.getQueryData(['feature', 'friends', 'summary'])).toEqual(
      sourceClient.getQueryData(['feature', 'friends', 'summary']),
    );
    expect(restoredClient.getQueryData(['feature', 'friends', 'paginated', 'friends'])).toEqual(
      sourceClient.getQueryData(['feature', 'friends', 'paginated', 'friends']),
    );
    expect(restoredClient.getQueryData(feedbackQueryKeys.list)).toEqual(
      sourceClient.getQueryData(feedbackQueryKeys.list),
    );
    expect(restoredClient.getQueryData(['feature', 'profile'])).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'feedback', 'thread_1'])).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'friends', 'paginated', 'friends', 'bill-picker', 'tay'])).toBeUndefined();

    sourceClient.clear();
    restoredClient.clear();
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
      ((persistedClient.clientState.queries[1]?.state.data as {
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
    expect(feedback?.userEmail).toBeUndefined();
    expect(feedback?.assignedAdminId).toBeUndefined();
  });
});
