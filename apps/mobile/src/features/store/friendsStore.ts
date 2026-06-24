import { pb } from '../../lib/pocketbase';
import type { FriendRecord, FriendStatus } from '../models';
import type {
  FriendsCountSummary,
  InviteFriendInput,
  ListFriendsPageInput,
  PaginatedResult,
} from './featureStore';
import {
  createEmptyPaginatedResult,
  type FeatureWriteRequestOptions,
  getAuthenticatedUserId,
  mapPaginatedResult,
  resolveFeatureWriteHeaders,
  resolvePaginationInput,
  trackFeatureMutation,
} from './featureStoreShared';
import { deleteCollectionRecord, sendApiRequest, updateCollectionRecord } from './pocketbaseGateway';

export type {
  FriendsCountSummary,
  InviteFriendInput,
  ListFriendsPageInput,
} from './featureStore';

export interface FriendsPageResult extends PaginatedResult<FriendRecord> {
  summary?: FriendsCountSummary;
}

interface ReadRequestOptions {
  signal?: AbortSignal;
}

interface FriendshipUser {
  id: string;
  name?: string;
  email?: string;
}

interface FriendshipRecord {
  id: string;
  user: string;
  friend: string;
  status: 'pending' | 'accepted' | 'blocked';
  created: string;
  updated: string;
  expand?: {
    user?: FriendshipUser;
    friend?: FriendshipUser;
  };
}

interface FriendListApiItem {
  id: string;
  userId: string;
  displayName?: string;
  status: FriendStatus;
  createdAt: string;
}

interface FriendListApiResponse {
  items: FriendListApiItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  summary?: FriendsCountSummary;
}

type UnsubscribeFriendshipChanges = () => void;

function resolveFriendName(user: FriendshipUser | undefined): string {
  const trimmedName =
    user && 'name' in user && typeof user.name === 'string' && user.name.trim()
      ? user.name.trim()
      : '';
  if (trimmedName) {
    return trimmedName;
  }

  const trimmedEmail = user?.email?.trim();
  if (trimmedEmail) {
    return trimmedEmail.split('@')[0];
  }

  return 'Unknown';
}

function resolveFriendEmail(user: FriendshipUser | undefined): string {
  return user?.email?.trim().toLowerCase() ?? '';
}

function mapFriendshipRecord(friendship: FriendshipRecord, currentUserId: string): FriendRecord | null {
  if (friendship.status === 'blocked') {
    return null;
  }

  const isSender = friendship.user === currentUserId;
  const otherUser = isSender ? friendship.expand?.friend : friendship.expand?.user;
  const otherUserId = isSender ? friendship.friend : friendship.user;

  const status: FriendStatus =
    friendship.status === 'accepted'
      ? 'friend'
      : friendship.friend === currentUserId
        ? 'pending_received'
        : 'pending_sent';

  return {
    id: friendship.id,
    userId: otherUser?.id ?? otherUserId,
    name: resolveFriendName(otherUser),
    email: resolveFriendEmail(otherUser),
    status,
    createdAt: friendship.created,
  };
}

function mapFriendListApiItem(item: FriendListApiItem): FriendRecord {
  const trimmedName = item.displayName?.trim();
  return {
    id: item.id,
    userId: item.userId,
    name: trimmedName && trimmedName.length > 0 ? trimmedName : 'Unknown',
    email: '',
    status: item.status,
    createdAt: item.createdAt,
  };
}

export async function listFriendsPage(input?: ListFriendsPageInput): Promise<FriendsPageResult> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const section = input?.section ?? 'friends';
  const normalizedSearch = input?.search?.trim();
  const normalizedUserIds = Array.from(new Set((input?.userIds ?? []).map((userId) => userId.trim()).filter(Boolean)));

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    section,
  });
  if (normalizedSearch) {
    query.set('search', normalizedSearch);
  }
  if (normalizedUserIds.length > 0) {
    query.set('userIds', normalizedUserIds.join(','));
  }

  const response = await sendApiRequest<FriendListApiResponse>(`/api/friends?${query.toString()}`, {
    method: 'GET',
    signal: input?.signal,
  });

  const pageResult = mapPaginatedResult(response, response.items.map(mapFriendListApiItem));

  if (!response.summary) {
    return pageResult;
  }

  return {
    ...pageResult,
    summary: response.summary,
  };
}

export async function getFriendsCountSummary(options?: ReadRequestOptions): Promise<FriendsCountSummary> {
  if (!pb.authStore.record?.id) {
    return {
      friendsCount: 0,
      requestsCount: 0,
      sentCount: 0,
    };
  }

  return sendApiRequest<FriendsCountSummary>('/api/friends/summary', {
    method: 'GET',
    signal: options?.signal,
  });
}

export async function inviteFriend(
  input: InviteFriendInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<FriendRecord> {
  return trackFeatureMutation('friend.invite', async () => {
    const normalizedCode = input.code.trim().toUpperCase();

    if (!normalizedCode) {
      throw new Error('Friend code is required.');
    }

    const response = await sendApiRequest<FriendListApiItem>('/api/friends/invite', {
      method: 'POST',
      headers: resolveFeatureWriteHeaders(requestOptions),
      body: {
        code: normalizedCode,
      },
    });

    return mapFriendListApiItem(response);
  });
}

export async function createFriendSuggestionAcceptance(
  input: { inviterId: string },
  requestOptions?: FeatureWriteRequestOptions,
): Promise<void> {
  return trackFeatureMutation('friend.suggestion.accept', async () => {
    const inviterId = input.inviterId.trim();

    if (!inviterId) {
      return;
    }

    await sendApiRequest('/api/friends/suggestions/accept', {
      method: 'POST',
      headers: resolveFeatureWriteHeaders(requestOptions),
      body: {
        inviterId,
      },
    });
  });
}

export async function markFriendInviteAccepted(
  friendId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<FriendRecord> {
  return trackFeatureMutation('friend.accept', async () => {
    const currentUserId = getAuthenticatedUserId();
    const updatedFriendship = await updateCollectionRecord<FriendshipRecord>(
      'friendships',
      friendId,
      {
        status: 'accepted',
      },
      {
        expand: 'user,friend',
        headers: resolveFeatureWriteHeaders(requestOptions),
      },
    );

    const mapped = mapFriendshipRecord(updatedFriendship, currentUserId);
    if (!mapped) {
      throw new Error('Could not accept friend request.');
    }

    return mapped;
  });
}

export async function removeFriend(
  friendId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<void> {
  return trackFeatureMutation('friend.remove', async () => {
    getAuthenticatedUserId();
    await deleteCollectionRecord('friendships', friendId, {
      headers: resolveFeatureWriteHeaders(requestOptions),
    });
  });
}

export function subscribeToFriendshipChanges(
  onChange: () => void,
  onError?: (error: unknown) => void,
): UnsubscribeFriendshipChanges {
  let unsubscribe: UnsubscribeFriendshipChanges | undefined;
  let didCancel = false;

  void pb
    .collection('friendships')
    .subscribe('*', () => {
      onChange();
    })
    .then((nextUnsubscribe: UnsubscribeFriendshipChanges) => {
      if (didCancel) {
        nextUnsubscribe();
        return;
      }

      unsubscribe = nextUnsubscribe;
    })
    .catch((error: unknown) => {
      if (!didCancel) {
        onError?.(error);
      }
    });

  return () => {
    didCancel = true;
    unsubscribe?.();
  };
}
