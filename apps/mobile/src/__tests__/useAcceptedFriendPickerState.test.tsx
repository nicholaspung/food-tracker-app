import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import {
  friendsQueryKeys,
  hydrateFriendsSummaryFromPaginatedData,
  listFriendsPage,
  type FriendRecord,
} from '../features';
import { useAcceptedFriendPickerState } from '../hooks/useAcceptedFriendPickerState';

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: unknown) => value,
}));

jest.mock('../features', () => {
  return {
    friendsQueryKeys: {
      paginated: (userId: string | null | undefined, section: string, search?: string) => {
        const normalizedSearch = search?.trim() ?? '';
        if (!normalizedSearch) {
          return ['feature', 'friends', 'user', userId ?? 'anonymous', 'paginated', section] as const;
        }

        return ['feature', 'friends', 'user', userId ?? 'anonymous', 'paginated', section, normalizedSearch] as const;
      },
    },
    hydrateFriendsSummaryFromPaginatedData: jest.fn(),
    listFriendsPage: jest.fn(),
  };
});

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedHydrateFriendsSummaryFromPaginatedData =
  hydrateFriendsSummaryFromPaginatedData as jest.MockedFunction<typeof hydrateFriendsSummaryFromPaginatedData>;
const mockedListFriendsPage = listFriendsPage as jest.MockedFunction<typeof listFriendsPage>;

type HookState = ReturnType<typeof useAcceptedFriendPickerState>;
type TestRenderer = ReturnType<typeof create> & { update: (element: React.ReactElement) => void };

function buildFriend(overrides: Partial<FriendRecord> & Pick<FriendRecord, 'id' | 'name'>): FriendRecord {
  const { id, name, ...rest } = overrides;
  return {
    createdAt: '2026-06-01T12:00:00.000Z',
    email: `${id}@example.com`,
    id,
    name,
    status: 'friend',
    userId: `user_${id}`,
    ...rest,
  };
}

function buildFriendsQuery(items: FriendRecord[]) {
  return {
    data: {
      pageParams: [1],
      pages: [{
        hasNextPage: false,
        items,
        page: 1,
        pageSize: 20,
        totalItems: items.length,
        totalPages: items.length > 0 ? 1 : 0,
      }],
    },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    isSuccess: true,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useInfiniteQuery>;
}

describe('useAcceptedFriendPickerState', () => {
  const queryClient = {};
  let latestHook: HookState | null = null;

  function Harness({
    additionalFriends,
    currentUserId = 'user_1',
  }: {
    additionalFriends?: FriendRecord[];
    currentUserId?: string | null;
  }) {
    latestHook = useAcceptedFriendPickerState({
      additionalFriends,
      currentUserId,
    });
    return React.createElement('HookState', {
      visibleCount: latestHook.visibleFriends.length,
    });
  }

  beforeEach(() => {
    latestHook = null;
    jest.clearAllMocks();
    mockedUseQueryClient.mockReturnValue(queryClient as ReturnType<typeof useQueryClient>);
    mockedUseInfiniteQuery.mockReturnValue(buildFriendsQuery([]));
  });

  it('keeps the accepted-friends paginated query key and reconnect behavior', async () => {
    await act(async () => {
      create(React.createElement(Harness, null));
    });

    expect(mockedUseInfiniteQuery).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      initialPageParam: 1,
      queryKey: friendsQueryKeys.paginated('user_1', 'friends', ''),
      refetchOnReconnect: 'always',
    }));
    expect(mockedHydrateFriendsSummaryFromPaginatedData).toHaveBeenCalled();
  });

  it('forwards the AbortSignal through accepted-friend page reads', async () => {
    mockedListFriendsPage.mockResolvedValue({
      hasNextPage: false,
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
    });
    const abortController = new AbortController();

    await act(async () => {
      create(React.createElement(Harness, null));
    });

    const options = mockedUseInfiniteQuery.mock.calls[0]?.[0] as unknown as {
      queryFn: (input: { pageParam: number; signal: AbortSignal }) => Promise<unknown>;
    };
    await options.queryFn({ pageParam: 2, signal: abortController.signal });

    expect(mockedListFriendsPage).toHaveBeenCalledWith({
      page: 2,
      pageSize: 20,
      search: undefined,
      section: 'friends',
      signal: abortController.signal,
    });
  });

  it('uses server search at the threshold and local filtering below it', async () => {
    mockedUseInfiniteQuery.mockReturnValue(buildFriendsQuery([
      buildFriend({ id: 'friend_alice', name: 'Alice Kim' }),
      buildFriend({ id: 'friend_ben', name: 'Ben Ortiz' }),
    ]));

    await act(async () => {
      create(React.createElement(Harness, null));
    });
    await act(async () => {
      latestHook?.setFriendSearchQuery('ali');
    });

    expect(mockedUseInfiniteQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      queryKey: friendsQueryKeys.paginated('user_1', 'friends', 'ali'),
    }));

    await act(async () => {
      latestHook?.setFriendSearchQuery('k');
    });

    expect(latestHook?.visibleFriends.map((friend) => friend.id)).toEqual(['friend_alice']);
    expect(mockedUseInfiniteQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      queryKey: friendsQueryKeys.paginated('user_1', 'friends', ''),
    }));
  });

  it('retains accepted friend records after they leave the current page', async () => {
    const alice = buildFriend({ id: 'friend_alice', name: 'Alice Kim' });
    mockedUseInfiniteQuery.mockReturnValue(buildFriendsQuery([alice]));
    let renderer: TestRenderer | null = null;

    await act(async () => {
      renderer = create(React.createElement(Harness, null)) as TestRenderer;
    });

    mockedUseInfiniteQuery.mockReturnValue(buildFriendsQuery([]));
    await act(async () => {
      renderer!.update(React.createElement(Harness, null));
    });

    expect(latestHook?.acceptedFriendById.get('friend_alice')).toEqual(alice);
  });

  it('merges additional friends for edit-mode participant hydration', async () => {
    const editModeFriend = buildFriend({ id: 'friend_existing', name: 'Existing Friend' });

    await act(async () => {
      create(React.createElement(Harness, { additionalFriends: [editModeFriend] }));
    });

    expect(latestHook?.acceptedFriendById.get('friend_existing')).toEqual(editModeFriend);
  });
});
