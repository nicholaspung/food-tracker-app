import { QueryClient } from '@tanstack/react-query';

import {
  acceptCachedFriendRequest,
  evictFriendshipDependentQueries,
  friendsQueryKeys,
  getCachedFriendsSummary,
  hydrateFriendsSummaryFromPaginatedData,
  isFriendsSummaryQueryKey,
  isPaginatedFriendsQueryKey,
  removeCachedFriend,
  selectFriendsSummary,
} from '../features/store/friendsQuery';
import { homeFeedQueryKeys } from '../features/store/homeFeedQuery';
import { restaurantListQueryKeys } from '../features/store/restaurantListQuery';
import type { FriendRecord } from '../features/models';

function buildFriend(overrides: Partial<FriendRecord> = {}): FriendRecord {
  return {
    id: 'friendship-1',
    userId: 'user-2',
    name: 'Sam',
    email: 'sam@example.com',
    status: 'pending_received',
    createdAt: '2026-04-18T08:00:00.000Z',
    ...overrides,
  };
}

function buildFriendsPage(
  items: FriendRecord[],
  summary?: { friendsCount: number; requestsCount: number; sentCount: number },
) {
  return {
    pageParams: [1],
    pages: [
      {
        items,
        page: 1,
        pageSize: 20,
        totalItems: items.length,
        totalPages: items.length === 0 ? 0 : 1,
        hasNextPage: false,
        summary,
      },
    ],
  };
}

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

  it('moves an accepted request into cached friends data and updates summary counts', () => {
    const queryClient = new QueryClient();
    const pendingRequest = buildFriend();

    queryClient.setQueryData(
      friendsQueryKeys.paginated('requests'),
      buildFriendsPage([pendingRequest], {
        friendsCount: 2,
        requestsCount: 1,
        sentCount: 0,
      }),
    );

    acceptCachedFriendRequest(queryClient, pendingRequest);

    expect(
      queryClient.getQueryData<{ pages: { items: FriendRecord[] }[] }>(
        friendsQueryKeys.paginated('requests'),
      )?.pages[0]?.items,
    ).toEqual([]);
    expect(
      queryClient.getQueryData<{ pages: { items: FriendRecord[] }[] }>(
        friendsQueryKeys.paginated('friends'),
      )?.pages[0]?.items,
    ).toEqual([
      {
        ...pendingRequest,
        status: 'friend',
      },
    ]);
    expect(queryClient.getQueryData(friendsQueryKeys.summary)).toEqual({
      friendsCount: 3,
      requestsCount: 0,
      sentCount: 0,
    });
  });

  it('removes a cached friend from loaded queries and decrements summary counts', () => {
    const queryClient = new QueryClient();
    const existingFriend = buildFriend({ status: 'friend' });
    const summary = {
      friendsCount: 2,
      requestsCount: 1,
      sentCount: 0,
    };

    queryClient.setQueryData(friendsQueryKeys.summary, summary);
    queryClient.setQueryData(friendsQueryKeys.paginated('friends'), buildFriendsPage([existingFriend], summary));
    queryClient.setQueryData(friendsQueryKeys.paginated('friends', 'sam'), buildFriendsPage([existingFriend], summary));

    removeCachedFriend(queryClient, existingFriend);

    expect(
      queryClient.getQueryData<{ pages: { items: FriendRecord[] }[] }>(
        friendsQueryKeys.paginated('friends'),
      )?.pages[0]?.items,
    ).toEqual([]);
    expect(
      queryClient.getQueryData<{ pages: { items: FriendRecord[] }[] }>(
        friendsQueryKeys.paginated('friends', 'sam'),
      )?.pages[0]?.items,
    ).toEqual([]);
    expect(queryClient.getQueryData(friendsQueryKeys.summary)).toEqual({
      friendsCount: 1,
      requestsCount: 1,
      sentCount: 0,
    });
  });

  it('evicts friendship-dependent home and list caches together', async () => {
    const queryClient = new QueryClient();
    const removedUserId = 'user-2';
    const friendsSummaryKey = friendsQueryKeys.summary;
    const friendsKey = friendsQueryKeys.paginated('friends');
    const homeFeedKey = homeFeedQueryKeys.paginated('friends', 'all', 'created', '');
    const mineHomeFeedKey = homeFeedQueryKeys.paginated('mine', 'all', 'created', '');
    const friendsListsKey = restaurantListQueryKeys.paginated('friends', '');
    const myListsKey = restaurantListQueryKeys.paginated('my', '');
    const friendListDetailKey = restaurantListQueryKeys.detail('list_1');
    const savedFriendItemListDetailKey = restaurantListQueryKeys.detail('list_2');
    const unaffectedMyListDetailKey = restaurantListQueryKeys.detail('list_3');

    queryClient.setQueryData(friendsSummaryKey, {
      friendsCount: 4,
      requestsCount: 1,
      sentCount: 0,
    });
    queryClient.setQueryData(friendsKey, { pageParams: [1], pages: [] });
    queryClient.setQueryData(homeFeedKey, { pageParams: [undefined], pages: [] });
    queryClient.setQueryData(mineHomeFeedKey, { pageParams: [undefined], pages: [] });
    queryClient.setQueryData(friendsListsKey, { pageParams: [1], pages: [] });
    queryClient.setQueryData(myListsKey, { pageParams: [1], pages: [] });
    queryClient.setQueryData(friendListDetailKey, {
      items: [],
      list: { id: 'list_1', userId: removedUserId },
    });
    queryClient.setQueryData(savedFriendItemListDetailKey, {
      items: [
        {
          bookmarkedItems: [{ id: 'bookmark-1', sourceUserId: removedUserId }],
          createdAt: '2026-04-18T08:00:00.000Z',
          id: 'item-1',
          listId: 'list_2',
          position: 0,
          restaurantId: 'restaurant-1',
          restaurantName: 'Saved spot',
        },
      ],
      list: { id: 'list_2', userId: 'user-1' },
    });
    queryClient.setQueryData(unaffectedMyListDetailKey, {
      items: [],
      list: { id: 'list_3', userId: 'user-1' },
    });

    await evictFriendshipDependentQueries(queryClient, { removedUserId });

    expect(queryClient.getQueryState(friendsSummaryKey)?.data).toBeUndefined();
    expect(queryClient.getQueryState(friendsKey)?.data).toBeUndefined();
    expect(queryClient.getQueryState(homeFeedKey)?.data).toBeUndefined();
    expect(queryClient.getQueryState(friendsListsKey)?.data).toBeUndefined();
    expect(queryClient.getQueryState(friendListDetailKey)?.data).toBeUndefined();
    expect(queryClient.getQueryState(savedFriendItemListDetailKey)?.data).toBeUndefined();

    expect(queryClient.getQueryData(mineHomeFeedKey)).toEqual({ pageParams: [undefined], pages: [] });
    expect(queryClient.getQueryData(myListsKey)).toEqual({ pageParams: [1], pages: [] });
    expect(queryClient.getQueryData(unaffectedMyListDetailKey)).toEqual({
      items: [],
      list: { id: 'list_3', userId: 'user-1' },
    });
  });

  it('can evict friend-gated caches while preserving the patched friends queries', async () => {
    const queryClient = new QueryClient();
    const removedUserId = 'user-2';
    const friendsSummaryKey = friendsQueryKeys.summary;
    const friendsKey = friendsQueryKeys.paginated('friends');
    const homeFeedKey = homeFeedQueryKeys.paginated('friends', 'all', 'created', '');
    const friendsListsKey = restaurantListQueryKeys.paginated('friends', '');
    const friendListDetailKey = restaurantListQueryKeys.detail('list_1');
    const currentFriend = buildFriend({ status: 'friend' });

    queryClient.setQueryData(friendsSummaryKey, {
      friendsCount: 3,
      requestsCount: 0,
      sentCount: 0,
    });
    queryClient.setQueryData(friendsKey, buildFriendsPage([currentFriend]));
    queryClient.setQueryData(homeFeedKey, { pageParams: [undefined], pages: [] });
    queryClient.setQueryData(friendsListsKey, { pageParams: [1], pages: [] });
    queryClient.setQueryData(friendListDetailKey, {
      items: [],
      list: { id: 'list_1', userId: removedUserId },
    });

    await evictFriendshipDependentQueries(queryClient, {
      removedUserId,
      preserveFriendsQueries: true,
    });

    expect(queryClient.getQueryData(friendsSummaryKey)).toEqual({
      friendsCount: 3,
      requestsCount: 0,
      sentCount: 0,
    });
    expect(queryClient.getQueryData(friendsKey)).toEqual(buildFriendsPage([currentFriend]));
    expect(queryClient.getQueryState(homeFeedKey)?.data).toBeUndefined();
    expect(queryClient.getQueryState(friendsListsKey)?.data).toBeUndefined();
    expect(queryClient.getQueryState(friendListDetailKey)?.data).toBeUndefined();
  });
});
