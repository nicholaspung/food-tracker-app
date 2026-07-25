import { QueryClient } from '@tanstack/react-query';

import type { TastingSessionListSummary } from '../features';
import {
  removeTastingSessionFromSummariesCache,
  type TastingSessionSummariesInfiniteData,
} from '../features/store/tastingSessionSummariesCache';
import { tastingSessionsQueryKeys } from '../features/store/tastingSessionsQuery';

function createSummary(id: string): TastingSessionListSummary {
  return {
    approvedItemCount: 0,
    approvedRestaurantCount: 0,
    createdAt: '2026-05-20T11:00:00.000Z',
    id,
    joinedCount: 1,
    joinExpiresAt: '2026-05-20T12:00:00.000Z',
    leaderUserId: 'leader_1',
    maxApprovedItems: 8,
    maxParticipants: 8,
    maxRestaurants: 3,
    name: id,
    status: 'lobby',
    updatedAt: '2026-05-20T11:00:00.000Z',
    viewerParticipant: true,
  };
}

function createSummaryCache(...sessionIds: string[]): TastingSessionSummariesInfiniteData {
  return {
    pageParams: [1],
    pages: [
      {
        hasNextPage: false,
        items: sessionIds.map(createSummary),
        page: 1,
        pageSize: 20,
        totalItems: sessionIds.length,
        totalPages: sessionIds.length > 0 ? 1 : 0,
      },
    ],
  };
}

describe('tasting session summaries cache', () => {
  it('removes an unavailable session from both real paginated summary caches', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      tastingSessionsQueryKeys.summaries('active'),
      createSummaryCache('session_1', 'session_2'),
    );
    queryClient.setQueryData(
      tastingSessionsQueryKeys.summaries('completed'),
      createSummaryCache('session_1'),
    );

    removeTastingSessionFromSummariesCache(queryClient, 'session_1');

    expect(
      queryClient.getQueryData<TastingSessionSummariesInfiniteData>(
        tastingSessionsQueryKeys.summaries('active'),
      ),
    ).toEqual(createSummaryCache('session_2'));
    expect(
      queryClient.getQueryData<TastingSessionSummariesInfiniteData>(
        tastingSessionsQueryKeys.summaries('completed'),
      ),
    ).toEqual(createSummaryCache());
    expect(queryClient.getQueryData(tastingSessionsQueryKeys.root)).toBeUndefined();
  });

  it('preserves untouched summary cache references', () => {
    const queryClient = new QueryClient();
    const activeCache = createSummaryCache('session_2');
    queryClient.setQueryData(tastingSessionsQueryKeys.summaries('active'), activeCache);

    removeTastingSessionFromSummariesCache(queryClient, 'session_1');

    expect(queryClient.getQueryData(tastingSessionsQueryKeys.summaries('active'))).toBe(
      activeCache,
    );
  });

  it('preserves page params and recalculates pagination metadata across cached pages', () => {
    const queryClient = new QueryClient();
    const paginatedCache: TastingSessionSummariesInfiniteData = {
      pageParams: [1, 2],
      pages: [
        {
          hasNextPage: true,
          items: [createSummary('session_1'), createSummary('session_2')],
          page: 1,
          pageSize: 2,
          totalItems: 3,
          totalPages: 2,
        },
        {
          hasNextPage: false,
          items: [createSummary('session_3')],
          page: 2,
          pageSize: 2,
          totalItems: 3,
          totalPages: 2,
        },
      ],
    };
    queryClient.setQueryData(tastingSessionsQueryKeys.summaries('active'), paginatedCache);

    removeTastingSessionFromSummariesCache(queryClient, 'session_1');

    expect(
      queryClient.getQueryData<TastingSessionSummariesInfiniteData>(
        tastingSessionsQueryKeys.summaries('active'),
      ),
    ).toEqual({
      pageParams: [1, 2],
      pages: [
        {
          hasNextPage: false,
          items: [createSummary('session_2')],
          page: 1,
          pageSize: 2,
          totalItems: 2,
          totalPages: 1,
        },
        {
          hasNextPage: false,
          items: [createSummary('session_3')],
          page: 2,
          pageSize: 2,
          totalItems: 2,
          totalPages: 1,
        },
      ],
    });
  });
});
