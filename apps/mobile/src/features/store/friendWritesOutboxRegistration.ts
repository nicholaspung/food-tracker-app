import type { QueryClient } from '@tanstack/react-query';

import {
  createFeatureOutboxDomainRegistration,
  type FeatureOutboxSuccessfulReplayOutcome,
} from './featureOutboxDomainRegistration';
import {
  createFeatureOutboxPayloadDecoder,
  terminalInvalidPayload,
} from './featureOutboxPayloadDecoders';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  createFriendSuggestionAcceptance,
  inviteFriend,
  markFriendInviteAccepted,
  removeFriend,
} from './friendsStore';
import { evictFriendshipDependentQueries, friendsQueryKeys } from './friendsQuery';
import { invalidateHomeFeedQueries } from './homeFeedQuery';
import { profileQueryKeys } from './profileQuery';
import { restaurantListQueryKeys } from './restaurantListQuery';

export const FRIEND_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'friend.accept',
    'friend.suggestion.accept',
    'friend.remove',
    'friend.request.send',
    'friend.request.reject',
    'friend.request.cancel',
  ] as const,
  legacyPayloadPolicy: 'decode-as-current',
  payloadDecoders: {
    'friend.accept': createFeatureOutboxPayloadDecoder('friend.accept', [
      { key: 'friendId', type: 'string' },
    ]),
    'friend.suggestion.accept': createFeatureOutboxPayloadDecoder('friend.suggestion.accept', [
      { key: 'inviterId', type: 'string' },
    ]),
    'friend.remove': createFeatureOutboxPayloadDecoder('friend.remove', [
      { key: 'friendId', type: 'string' },
    ]),
    'friend.request.send': decodeFriendRequestSendPayload,
    'friend.request.reject': createFeatureOutboxPayloadDecoder('friend.request.reject', [
      { key: 'friendId', type: 'string' },
    ]),
    'friend.request.cancel': createFeatureOutboxPayloadDecoder('friend.request.cancel', [
      { key: 'friendId', type: 'string' },
    ]),
  },
  replayAdapters: {
    'friend.accept': replayFriendAccept,
    'friend.suggestion.accept': replayFriendSuggestionAccept,
    'friend.remove': replayFriendRemove,
    'friend.request.send': replayFriendRequestSend,
    'friend.request.reject': replayFriendRequestReject,
    'friend.request.cancel': replayFriendRequestCancel,
  },
  replayCacheEffects: {
    'friend.accept': reconcileFriendReplayCaches,
    'friend.suggestion.accept': reconcileFriendReplayCaches,
    'friend.remove': reconcileFriendReplayCaches,
    'friend.request.send': reconcileFriendReplayCaches,
    'friend.request.reject': reconcileFriendReplayCaches,
    'friend.request.cancel': reconcileFriendReplayCaches,
  },
});

type FriendReplayOperationName =
  | 'friend.accept'
  | 'friend.suggestion.accept'
  | 'friend.remove'
  | 'friend.request.send'
  | 'friend.request.reject'
  | 'friend.request.cancel';

async function reconcileFriendReplayCaches(
  queryClient: QueryClient,
  outcome: FeatureOutboxSuccessfulReplayOutcome<FriendReplayOperationName>,
): Promise<void> {
  const invalidations: Promise<unknown>[] = [
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.profile }),
  ];
  if (outcome.operationName === 'friend.remove') {
    invalidations.push(evictFriendshipDependentQueries(queryClient));
  } else {
    invalidations.push(queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root }));
    if (
      outcome.operationName === 'friend.accept' ||
      outcome.operationName === 'friend.suggestion.accept'
    ) {
      invalidations.push(
        invalidateHomeFeedQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: restaurantListQueryKeys.scope('friends') }),
      );
    }
  }
  await Promise.all(invalidations);
}

async function replayFriendAccept(
  friendAcceptPayload: FeatureOutboxOperationPayloadMap['friend.accept'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await markFriendInviteAccepted(friendAcceptPayload.friendId, requestOptions);
}

async function replayFriendSuggestionAccept(
  friendSuggestionAcceptPayload: FeatureOutboxOperationPayloadMap['friend.suggestion.accept'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createFriendSuggestionAcceptance(friendSuggestionAcceptPayload, requestOptions);
}

async function replayFriendRemove(
  friendRemovePayload: FeatureOutboxOperationPayloadMap['friend.remove'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await removeFriend(friendRemovePayload.friendId, requestOptions);
}

async function replayFriendRequestSend(
  payload: FeatureOutboxOperationPayloadMap['friend.request.send'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await inviteFriend(payload, requestOptions);
}

async function replayFriendRequestReject(
  friendRejectPayload: FeatureOutboxOperationPayloadMap['friend.request.reject'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await removeFriend(friendRejectPayload.friendId, requestOptions);
}

async function replayFriendRequestCancel(
  friendCancelPayload: FeatureOutboxOperationPayloadMap['friend.request.cancel'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await removeFriend(friendCancelPayload.friendId, requestOptions);
}

function decodeFriendRequestSendPayload(payload: unknown) {
  if (!isRecord(payload)) {
    return terminalInvalidPayload('friend.request.send', 'payload must be an object');
  }

  const code = typeof payload.code === 'string' ? payload.code : payload.friendCode;
  if (typeof code !== 'string' || code.trim() === '') {
    return terminalInvalidPayload('friend.request.send', 'code is required');
  }

  return {
    status: 'ok' as const,
    payload: {
      code,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
