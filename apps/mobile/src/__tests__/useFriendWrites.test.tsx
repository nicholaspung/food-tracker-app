import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { FriendRecord } from '../features/models';
import {
  inviteFriend,
  markFriendInviteAccepted,
  removeFriend,
} from '../features/store/friendsStore';
import {
  acceptCachedFriendRequest,
  evictFriendshipDependentQueries,
  friendsQueryKeys,
  removeCachedFriend,
} from '../features/store/friendsQuery';
import { useFriendWrites } from '../features/store/useFriendWrites';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/friendsStore', () => ({
  inviteFriend: jest.fn(),
  markFriendInviteAccepted: jest.fn(),
  removeFriend: jest.fn(),
}));

jest.mock('../features/store/friendsQuery', () => ({
  acceptCachedFriendRequest: jest.fn(),
  evictFriendshipDependentQueries: jest.fn(),
  friendsQueryKeys: {
    root: ['feature', 'friends'],
  },
  removeCachedFriend: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedInviteFriend = inviteFriend as jest.MockedFunction<typeof inviteFriend>;
const mockedMarkFriendInviteAccepted =
  markFriendInviteAccepted as jest.MockedFunction<typeof markFriendInviteAccepted>;
const mockedRemoveFriend = removeFriend as jest.MockedFunction<typeof removeFriend>;
const mockedAcceptCachedFriendRequest =
  acceptCachedFriendRequest as jest.MockedFunction<typeof acceptCachedFriendRequest>;
const mockedEvictFriendshipDependentQueries =
  evictFriendshipDependentQueries as jest.MockedFunction<typeof evictFriendshipDependentQueries>;
const mockedRemoveCachedFriend = removeCachedFriend as jest.MockedFunction<typeof removeCachedFriend>;
const mockedUseOfflineAwareFeatureWrite =
  useOfflineAwareFeatureWrite as jest.MockedFunction<typeof useOfflineAwareFeatureWrite>;
const mockedShowQueuedOfflineAlert = showQueuedOfflineAlert as jest.MockedFunction<
  typeof showQueuedOfflineAlert
>;

describe('useFriendWrites', () => {
  const queryClient = {
    invalidateQueries: jest.fn(),
  };
  const friend: FriendRecord = {
    createdAt: '2026-05-20T00:00:00.000Z',
    email: 'sam@example.com',
    id: 'friendship_1',
    name: 'Sam',
    status: 'pending_received',
    userId: 'user_2',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedInviteFriend.mockResolvedValue({ ...friend, status: 'pending_sent' } as never);
    mockedMarkFriendInviteAccepted.mockResolvedValue({ ...friend, status: 'friend' } as never);
    mockedRemoveFriend.mockResolvedValue(undefined);
    mockedEvictFriendshipDependentQueries.mockResolvedValue(undefined);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useFriendWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useFriendWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useFriendWrites();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!hook || !renderer) {
      throw new Error('Expected hook to render.');
    }

    return { hook, renderer };
  }

  it('sends friend requests through the outbox payload and invalidates friends', async () => {
    const beforeExecute = jest.fn().mockResolvedValue(undefined);
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.sendFriendRequest({
      beforeExecute,
      code: 'ABCD1234',
      trackOnlineWrite: false,
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'friend.request.send',
        trackOnlineWrite: false,
        offline: {
          strategy: 'outbox',
          payload: { code: 'ABCD1234' },
        },
      }),
    );
    expect(beforeExecute).toHaveBeenCalledTimes(1);
    expect(mockedInviteFriend).toHaveBeenCalledWith({ code: 'ABCD1234' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: friendsQueryKeys.root });
    expect(mockedShowQueuedOfflineAlert).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues friend requests and shows queued feedback', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.sendFriendRequest({ code: 'WXYZ9876' });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'friend.request.send',
        offline: {
          strategy: 'outbox',
          payload: { code: 'WXYZ9876' },
        },
      }),
    );
    expect(mockedInviteFriend).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: friendsQueryKeys.root });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('Friend request');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('accepts friend requests and patches friend caches', async () => {
    const acceptedFriend = { ...friend, status: 'friend' as const };
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedMarkFriendInviteAccepted.mockResolvedValue(acceptedFriend as never);
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.acceptFriendRequest({ friend, userId: 'user_1' });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'friend.accept',
        offline: {
          strategy: 'outbox',
          payload: { friendId: 'friendship_1' },
        },
      }),
    );
    expect(mockedMarkFriendInviteAccepted).toHaveBeenCalledWith('friendship_1');
    expect(mockedAcceptCachedFriendRequest).toHaveBeenCalledWith(
      queryClient,
      'user_1',
      friend,
      acceptedFriend,
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: friendsQueryKeys.root });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues accept and remove friend actions with cache effects', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.acceptFriendRequest({ friend, userId: 'user_1' });
    await hook.removeFriend({
      friend: { ...friend, status: 'friend' },
      operationName: 'friend.remove',
      removedUserId: 'user_2',
      userId: 'user_1',
    });

    expect(writeFeature).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationName: 'friend.accept',
        offline: {
          strategy: 'outbox',
          payload: { friendId: 'friendship_1' },
        },
      }),
    );
    expect(mockedAcceptCachedFriendRequest).toHaveBeenCalledWith(
      queryClient,
      'user_1',
      friend,
      undefined,
    );
    expect(writeFeature).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        operationName: 'friend.remove',
        offline: {
          strategy: 'outbox',
          payload: { friendId: 'friendship_1' },
        },
      }),
    );
    expect(mockedRemoveFriend).not.toHaveBeenCalled();
    expect(mockedRemoveCachedFriend).toHaveBeenCalledWith(
      queryClient,
      'user_1',
      expect.objectContaining({ id: 'friendship_1', status: 'friend' }),
    );
    expect(mockedEvictFriendshipDependentQueries).toHaveBeenCalledWith(queryClient, {
      removedUserId: 'user_2',
      preserveFriendsQueries: true,
    });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'FriendsScreen',
      subject: 'Friend action',
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('removes pending friend requests through reject and cancel actions', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.removeFriend({
      friend,
      operationName: 'friend.request.reject',
      userId: 'user_1',
    });
    await hook.removeFriend({
      friend: { ...friend, status: 'pending_sent' },
      operationName: 'friend.request.cancel',
      userId: 'user_1',
    });

    expect(writeFeature).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationName: 'friend.request.reject',
        offline: {
          strategy: 'outbox',
          payload: { friendId: 'friendship_1' },
        },
      }),
    );
    expect(writeFeature).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        operationName: 'friend.request.cancel',
        offline: {
          strategy: 'outbox',
          payload: { friendId: 'friendship_1' },
        },
      }),
    );
    expect(mockedRemoveFriend).toHaveBeenCalledTimes(2);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: friendsQueryKeys.root });

    await act(async () => {
      renderer.unmount();
    });
  });
});
