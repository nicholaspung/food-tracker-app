import { QueryClient } from '@tanstack/react-query';

import {
  friendsQueryKeys,
  getCachedFriendsSummary,
  hydrateFriendsSummaryFromPaginatedData,
  isFriendsSummaryQueryKey,
  isPaginatedFriendsQueryKey,
  selectFriendsSummary,
} from '../features/store/friendsQuery';

describe('friendsQuery', () => {
  it('uses the canonical paginated friends browse key', () => {
    expect(friendsQueryKeys.paginated('friends')).toEqual(['feature', 'friends', 'paginated', 'friends']);
    expect(isPaginatedFriendsQueryKey(friendsQueryKeys.paginated('friends'))).toBe(true);
  });

  it('reuses the browse key when search is empty and normalizes search keys when present', () => {
    expect(friendsQueryKeys.paginated('friends', '')).toEqual(['feature', 'friends', 'paginated', 'friends']);
    expect(friendsQueryKeys.paginated('friends', '  sam  ')).toEqual([
      'feature',
      'friends',
      'paginated',
      'friends',
      'sam',
    ]);
    expect(isPaginatedFriendsQueryKey(friendsQueryKeys.paginated('friends', 'sam'))).toBe(true);
  });

  it('uses the canonical friends summary key', () => {
    expect(friendsQueryKeys.summary).toEqual(['feature', 'friends', 'summary']);
    expect(isFriendsSummaryQueryKey(friendsQueryKeys.summary)).toBe(true);
  });

  it('selects summary metadata from loaded friends pages', () => {
    expect(
      selectFriendsSummary({
        pageParams: [1],
        pages: [
          {
            items: [],
            page: 1,
            pageSize: 20,
            summary: {
              friendsCount: 3,
              requestsCount: 2,
              sentCount: 1,
            },
            totalItems: 3,
            totalPages: 1,
            hasNextPage: false,
          },
        ],
      }),
    ).toEqual({
      friendsCount: 3,
      requestsCount: 2,
      sentCount: 1,
    });
  });

  it('hydrates the canonical friends summary query from paginated friends data', () => {
    const queryClient = new QueryClient();
    const paginatedData = {
      pageParams: [1],
      pages: [
        {
          items: [],
          page: 1,
          pageSize: 20,
          summary: {
            friendsCount: 6,
            requestsCount: 3,
            sentCount: 2,
          },
          totalItems: 6,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
    };

    hydrateFriendsSummaryFromPaginatedData(queryClient, paginatedData);

    expect(queryClient.getQueryData(friendsQueryKeys.summary)).toEqual({
      friendsCount: 6,
      requestsCount: 3,
      sentCount: 2,
    });
  });

  it('reads cached friends summary metadata from base paginated queries', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(friendsQueryKeys.paginated('requests'), {
      pageParams: [1],
      pages: [
        {
          items: [],
          page: 1,
          pageSize: 20,
          summary: {
            friendsCount: 4,
            requestsCount: 2,
            sentCount: 1,
          },
          totalItems: 2,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
    });

    expect(getCachedFriendsSummary(queryClient)).toEqual({
      summary: {
        friendsCount: 4,
        requestsCount: 2,
        sentCount: 1,
      },
      updatedAt: expect.any(Number),
    });
  });
});
