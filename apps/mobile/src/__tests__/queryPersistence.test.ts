import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/query-persist-client-core';
import { QueryClient } from '@tanstack/react-query';

import { queryPersister, sanitizePersistedClient, shouldPersistQuery } from '../providers/queryPersistence';

describe('React Query persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('restores only allowlisted browse-surface queries after a cold restart', async () => {
    const sourceClient = new QueryClient();
    sourceClient.setQueryData(['feature', 'visits'], {
      total: 3,
      refreshedAt: '2026-02-12T00:00:00.000Z',
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

    expect(restoredClient.getQueryData(['feature', 'visits'])).toEqual({
      total: 3,
      refreshedAt: '2026-02-12T00:00:00.000Z',
    });
    expect(restoredClient.getQueryData(['feature', 'profile'])).toBeUndefined();
    expect(restoredClient.getQueryData(['feature', 'feedback', 'thread_1'])).toBeUndefined();

    sourceClient.clear();
    restoredClient.clear();
  });

  it('redacts sensitive fields from persisted notes and feedback list data', async () => {
    const persistedClient = sanitizePersistedClient({
      buster: '',
      timestamp: Date.now(),
      clientState: {
        mutations: [],
        queries: [
          {
            dehydratedAt: Date.now(),
            queryHash: 'notes',
            queryKey: ['feature', 'notes'],
            state: {
              data: [
                {
                  id: 'note_1',
                  title: 'Saved place',
                  content: 'Try the noodles',
                  status: 'draft',
                  latitude: 37.7749,
                  longitude: -122.4194,
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                },
              ],
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
            queryHash: 'feedback-all',
            queryKey: ['feature', 'feedback', 'all'],
            state: {
              data: [
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

    const note = ((persistedClient.clientState.queries[0]?.state.data as {
      latitude?: number;
      longitude?: number;
    }[]) ?? [])[0];
    const feedback = (
      (persistedClient.clientState.queries[1]?.state.data as {
        userEmail?: string;
        assignedAdminId?: string;
      }[]) ?? []
    )[0];

    expect(note).toBeDefined();
    expect(feedback).toBeDefined();
    expect(note?.latitude).toBeUndefined();
    expect(note?.longitude).toBeUndefined();
    expect(feedback?.userEmail).toBeUndefined();
    expect(feedback?.assignedAdminId).toBeUndefined();
  });
});
