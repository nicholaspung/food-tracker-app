import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import type { FriendRecord } from '../models';
import type { InviteFriendInput } from './featureStore';
import {
  createFriendSuggestionAcceptance,
  inviteFriend,
  markFriendInviteAccepted,
  removeFriend as removeFriendRecord,
} from './friendsStore';
import {
  acceptCachedFriendRequest,
  evictFriendshipDependentQueries,
  friendsQueryKeys,
  removeCachedFriend,
} from './friendsQuery';
import { invalidateHomeFeedQueries } from './homeFeedQuery';
import type { FriendRequestEntryMethod } from './friendCodeUtils';
import {
  type OfflineAwareFeatureWrite,
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';
import { useWriteTelemetry } from './useWriteTelemetry';

export type FriendRemoveOperationName =
  | 'friend.remove'
  | 'friend.request.reject'
  | 'friend.request.cancel';

interface SendFriendRequestWriteInput extends InviteFriendInput {
  entryMethod?: FriendRequestEntryMethod;
}

interface AcceptFriendRequestWriteInput {
  friend: FriendRecord;
  userId: string | null | undefined;
}

interface AcceptFriendSuggestionWriteInput {
  inviterId: string;
}

interface RemoveFriendWriteInput {
  friend: FriendRecord;
  operationName: FriendRemoveOperationName;
  removedUserId?: string;
  userId: string | null | undefined;
}

async function invalidateFriends(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
}

async function invalidateFriendRemovalQueries(
  queryClient: QueryClient,
  operationName: FriendRemoveOperationName,
  removedUserId?: string,
  options?: {
    preserveFriendsQueries?: boolean;
  },
): Promise<void> {
  if (operationName === 'friend.remove') {
    await evictFriendshipDependentQueries(queryClient, {
      removedUserId,
      preserveFriendsQueries: options?.preserveFriendsQueries,
    });
    return;
  }

  await invalidateFriends(queryClient);
}

async function sendFriendRequestWithOfflineSupport({
  code,
  entryMethod = 'manual_code',
  queryClient,
  trackWriteTelemetry,
  writeFeature,
}: SendFriendRequestWriteInput & {
  queryClient: QueryClient;
  trackWriteTelemetry: (operationName: string) => Promise<void>;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<FriendRecord>> {
  const isQrScan = entryMethod === 'qr_scan';
  const result = await writeFeature({
    operationName: 'friend.request.send',
    trackOnlineWrite: isQrScan ? false : undefined,
    offline: {
      strategy: 'outbox',
      payload: { code },
    },
    execute: async () => {
      if (isQrScan) {
        await trackWriteTelemetry('friend.qr.scan');
      }
      return inviteFriend({ code });
    },
  });

  await invalidateFriends(queryClient);

  if (result.status === 'queued') {
    showQueuedOfflineAlert('Friend request');
  }

  return result;
}

async function acceptFriendRequestWithOfflineSupport({
  friend,
  queryClient,
  userId,
  writeFeature,
}: AcceptFriendRequestWriteInput & {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<FriendRecord>> {
  const result = await writeFeature({
    operationName: 'friend.accept',
    offline: {
      strategy: 'outbox',
      payload: { friendId: friend.id },
    },
    execute: () => markFriendInviteAccepted(friend.id),
  });

  acceptCachedFriendRequest(
    queryClient,
    userId,
    friend,
    result.status === 'queued' ? undefined : result.result,
  );
  await invalidateFriends(queryClient);

  if (result.status === 'queued') {
    showQueuedOfflineAlert({
      analyticsSource: 'FriendsScreen',
      subject: 'Friend action',
    });
  }

  return result;
}

async function acceptFriendSuggestionWithWriteTelemetry({
  inviterId,
  queryClient,
  writeFeature,
}: AcceptFriendSuggestionWriteInput & {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<void>> {
  const result = await writeFeature({
    operationName: 'friend.suggestion.accept',
    offline: {
      strategy: 'outbox',
      payload: { inviterId },
    },
    execute: () => createFriendSuggestionAcceptance({ inviterId }),
  });

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root }),
    invalidateHomeFeedQueries(queryClient),
  ]);

  if (result.status === 'queued') {
    showQueuedOfflineAlert({
      analyticsSource: 'HomeScreen',
      subject: 'Friend action',
    });
  }

  return result;
}

async function removeFriendWithOfflineSupport({
  friend,
  operationName,
  queryClient,
  removedUserId,
  userId,
  writeFeature,
}: RemoveFriendWriteInput & {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<void>> {
  const result = await writeFeature({
    operationName,
    offline: {
      strategy: 'outbox',
      payload: { friendId: friend.id },
    },
    execute: () => removeFriendRecord(friend.id),
  });

  removeCachedFriend(queryClient, userId, friend);

  if (result.status === 'queued') {
    await invalidateFriendRemovalQueries(queryClient, operationName, removedUserId, {
      preserveFriendsQueries: true,
    });
    showQueuedOfflineAlert({
      analyticsSource: 'FriendsScreen',
      subject: 'Friend action',
    });
    return result;
  }

  await invalidateFriendRemovalQueries(queryClient, operationName, removedUserId);
  return result;
}

export function useFriendWrites() {
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();
  const trackWriteTelemetry = useWriteTelemetry();

  const sendFriendRequest = useCallback(
    async (input: SendFriendRequestWriteInput): Promise<OfflineAwareFeatureWriteResult<FriendRecord>> =>
      sendFriendRequestWithOfflineSupport({
        ...input,
        queryClient,
        trackWriteTelemetry,
        writeFeature,
      }),
    [queryClient, trackWriteTelemetry, writeFeature],
  );

  const acceptFriendRequest = useCallback(
    async (input: AcceptFriendRequestWriteInput): Promise<OfflineAwareFeatureWriteResult<FriendRecord>> =>
      acceptFriendRequestWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  const acceptFriendSuggestion = useCallback(
    async (input: AcceptFriendSuggestionWriteInput): Promise<OfflineAwareFeatureWriteResult<void>> =>
      acceptFriendSuggestionWithWriteTelemetry({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  const removeFriend = useCallback(
    async (input: RemoveFriendWriteInput): Promise<OfflineAwareFeatureWriteResult<void>> =>
      removeFriendWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  return {
    acceptFriendRequest,
    acceptFriendSuggestion,
    removeFriend,
    sendFriendRequest,
  };
}
