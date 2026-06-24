import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  createFriendSuggestionAcceptance,
  inviteFriend,
  markFriendInviteAccepted,
  removeFriend,
} from './featureStore';

export const FRIEND_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'friend.accept',
    'friend.suggestion.accept',
    'friend.remove',
    'friend.request.send',
    'friend.request.reject',
    'friend.request.cancel',
  ] as const,
  replayAdapters: {
    'friend.accept': replayFriendAccept,
    'friend.suggestion.accept': replayFriendSuggestionAccept,
    'friend.remove': replayFriendRemove,
    'friend.request.send': replayFriendRequestSend,
    'friend.request.reject': replayFriendRequestReject,
    'friend.request.cancel': replayFriendRequestCancel,
  },
});

async function replayFriendAccept(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const friendAcceptPayload = payload as FeatureOutboxOperationPayloadMap['friend.accept'];
  await markFriendInviteAccepted(friendAcceptPayload.friendId, requestOptions);
}

async function replayFriendSuggestionAccept(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const friendSuggestionAcceptPayload =
    payload as FeatureOutboxOperationPayloadMap['friend.suggestion.accept'];
  await createFriendSuggestionAcceptance(friendSuggestionAcceptPayload, requestOptions);
}

async function replayFriendRemove(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const friendRemovePayload = payload as FeatureOutboxOperationPayloadMap['friend.remove'];
  await removeFriend(friendRemovePayload.friendId, requestOptions);
}

async function replayFriendRequestSend(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await inviteFriend(payload as FeatureOutboxOperationPayloadMap['friend.request.send'], requestOptions);
}

async function replayFriendRequestReject(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const friendRejectPayload = payload as FeatureOutboxOperationPayloadMap['friend.request.reject'];
  await removeFriend(friendRejectPayload.friendId, requestOptions);
}

async function replayFriendRequestCancel(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const friendCancelPayload = payload as FeatureOutboxOperationPayloadMap['friend.request.cancel'];
  await removeFriend(friendCancelPayload.friendId, requestOptions);
}
