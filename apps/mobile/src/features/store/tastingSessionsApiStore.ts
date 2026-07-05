import type {
  TastingInviteRecord,
  TastingSessionListSummary,
  TastingSessionRecord,
  TastingSessionStatus,
  TastingSuggestionStatus,
} from '../models';
import type {
  CreateTastingSessionInput,
  JoinTastingSessionInput,
  PaginatedResult,
  ReopenTastingInviteWindowInput,
  SubmitTastingRatingsInput,
  SuggestTastingMenuItemInput,
  SuggestTastingRestaurantInput,
} from './featureStore';
import {
  isNotFoundError,
  resolveFeatureWriteHeaders,
  trackFeatureMutation,
  type FeatureWriteRequestOptions,
} from './featureStoreShared';
import { sendApiRequest } from './pocketbaseGateway';

export type {
  CreateTastingSessionInput,
  JoinTastingSessionInput,
  ReopenTastingInviteWindowInput,
  SubmitTastingRatingsInput,
  SuggestTastingMenuItemInput,
  SuggestTastingRestaurantInput,
} from './featureStore';

export interface AddTastingItemInput {
  name: string;
  description?: string;
}

export interface SubmitTastingRatingInput {
  rating: number;
  note?: string;
}

export type TastingSessionListFilter = 'active' | 'completed';
export type TastingSessionListPage = PaginatedResult<TastingSessionListSummary>;

export interface ListTastingSessionSummariesPageInput {
  filter?: TastingSessionListFilter;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

interface ReadRequestOptions {
  signal?: AbortSignal;
}

interface TastingSessionListSummaryApiResponseItem {
  id: string;
  name: string;
  leaderUserId: string;
  status: TastingSessionStatus;
  joinExpiresAt?: string;
  joinedCount?: number;
  maxParticipants?: number;
  maxRestaurants?: number;
  maxApprovedItems?: number;
  approvedRestaurantCount?: number;
  approvedItemCount?: number;
  viewerParticipant?: boolean;
  viewerInvite?: TastingInviteRecord;
  createdAt?: string;
  updatedAt?: string;
}

interface TastingSessionListPageApiResponse {
  items?: TastingSessionListSummaryApiResponseItem[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
  hasNextPage?: boolean;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

function parseCount(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function mapTastingSessionListSummaryApiItem(
  item: TastingSessionListSummaryApiResponseItem,
): TastingSessionListSummary {
  return {
    id: item.id,
    name: item.name,
    leaderUserId: item.leaderUserId,
    status: item.status,
    joinExpiresAt: typeof item.joinExpiresAt === 'string' ? item.joinExpiresAt : '',
    joinedCount: parseCount(item.joinedCount),
    maxParticipants: parseCount(item.maxParticipants),
    maxRestaurants: parseCount(item.maxRestaurants),
    maxApprovedItems: parseCount(item.maxApprovedItems),
    approvedRestaurantCount: parseCount(item.approvedRestaurantCount),
    approvedItemCount: parseCount(item.approvedItemCount),
    viewerParticipant: item.viewerParticipant === true,
    viewerInvite: item.viewerInvite,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
  };
}

export async function listTastingSessionSummariesPage(
  input: ListTastingSessionSummariesPageInput = {},
): Promise<TastingSessionListPage> {
  const query = new URLSearchParams();
  query.set('filter', input.filter ?? 'active');
  if (input.page) {
    query.set('page', String(input.page));
  }
  if (input.pageSize) {
    query.set('pageSize', String(input.pageSize));
  }

  const response = await sendApiRequest<TastingSessionListPageApiResponse>(
    `/api/tasting-sessions/summary-page?${query.toString()}`,
    {
      method: 'GET',
      signal: input.signal,
    },
  );

  return {
    items: (response.items ?? []).map(mapTastingSessionListSummaryApiItem),
    page: response.page ?? input.page ?? 1,
    pageSize: response.pageSize ?? input.pageSize ?? 20,
    totalItems: parseCount(response.totalItems),
    totalPages: parseCount(response.totalPages),
    hasNextPage: response.hasNextPage === true,
  };
}

export async function getTastingSessionById(
  sessionId: string,
  options?: ReadRequestOptions,
): Promise<TastingSessionRecord | null> {
  try {
    return await sendApiRequest<TastingSessionRecord>(`/api/tasting-sessions/${encodePathSegment(sessionId)}`, {
      method: 'GET',
      signal: options?.signal,
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function createTastingSession(
  input: CreateTastingSessionInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.create',
    () =>
      sendApiRequest<TastingSessionRecord>('/api/tasting-sessions', {
        body: {
          invitedUserIds: input.invitedUserIds ?? [],
          joinDurationMinutes: input.joinDurationMinutes,
          name: input.name.trim(),
        },
        headers: resolveFeatureWriteHeaders(requestOptions),
        method: 'POST',
      }),
    {
      inviteCount: input.invitedUserIds?.length ?? 0,
      joinDurationMinutes: input.joinDurationMinutes,
    },
  );
}

export async function joinTastingSession(
  input: JoinTastingSessionInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.join',
    () =>
      sendApiRequest<TastingSessionRecord>('/api/tasting-sessions/join', {
        body: { code: input.inviteCode.trim().toUpperCase() },
        headers: resolveFeatureWriteHeaders(requestOptions),
        method: 'POST',
      }),
    { inviteCodeLength: input.inviteCode.trim().length },
  );
}

export async function acceptTastingInvite(
  sessionId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation('tasting_session.invite.accept', () =>
    sendApiRequest<TastingSessionRecord>(
      `/api/tasting-sessions/${encodePathSegment(sessionId)}/accept-invite`,
      {
        headers: resolveFeatureWriteHeaders(requestOptions),
        method: 'POST',
      },
    ),
  );
}

export async function reopenTastingInviteWindow(
  sessionId: string,
  input: ReopenTastingInviteWindowInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.invite_window.reopen',
    () =>
      sendApiRequest<TastingSessionRecord>(
        `/api/tasting-sessions/${encodePathSegment(sessionId)}/reopen-invite-window`,
        {
          body: { joinDurationMinutes: input.joinDurationMinutes },
          headers: resolveFeatureWriteHeaders(requestOptions),
          method: 'POST',
        },
      ),
    { joinDurationMinutes: input.joinDurationMinutes },
  );
}

export async function dismissTastingInvite(
  sessionId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<{ success: boolean }> {
  return trackFeatureMutation('tasting_session.invite.dismiss', () =>
    sendApiRequest<{ success: boolean }>(
      `/api/tasting-sessions/${encodePathSegment(sessionId)}/dismiss-invite`,
      {
        headers: resolveFeatureWriteHeaders(requestOptions),
        method: 'POST',
      },
    ),
  );
}

export async function resendTastingInvite(
  sessionId: string,
  inviteId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation('tasting_session.invite.resend', () =>
    sendApiRequest<TastingSessionRecord>(
      `/api/tasting-sessions/${encodePathSegment(sessionId)}/invites/${encodePathSegment(inviteId)}/resend`,
      {
        headers: resolveFeatureWriteHeaders(requestOptions),
        method: 'POST',
      },
    ),
  );
}

export async function deleteTastingSession(
  sessionId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<{ success: boolean }> {
  return trackFeatureMutation('tasting_session.delete', () =>
    sendApiRequest<{ success: boolean }>(`/api/tasting-sessions/${encodePathSegment(sessionId)}`, {
      headers: resolveFeatureWriteHeaders(requestOptions),
      method: 'DELETE',
    }),
  );
}

export async function kickTastingParticipant(
  sessionId: string,
  participantId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation('tasting_session.participant.kick', () =>
    sendApiRequest<TastingSessionRecord>(
      `/api/tasting-sessions/${encodePathSegment(sessionId)}/participants/${encodePathSegment(participantId)}/kick`,
      {
        headers: resolveFeatureWriteHeaders(requestOptions),
        method: 'POST',
      },
    ),
  );
}

export async function leaveTastingSession(
  sessionId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<{ success: boolean }> {
  return trackFeatureMutation('tasting_session.leave', () =>
    sendApiRequest<{ success: boolean }>(`/api/tasting-sessions/${encodePathSegment(sessionId)}/leave`, {
      headers: resolveFeatureWriteHeaders(requestOptions),
      method: 'POST',
    }),
  );
}

export async function lockTastingSessionMembership(
  sessionId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation('tasting_session.membership.lock', () =>
    sendApiRequest<TastingSessionRecord>(
      `/api/tasting-sessions/${encodePathSegment(sessionId)}/lock-membership`,
      {
        headers: resolveFeatureWriteHeaders(requestOptions),
        method: 'POST',
      },
    ),
  );
}

export async function suggestTastingRestaurant(
  sessionId: string,
  input: SuggestTastingRestaurantInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.restaurant.suggest',
    () =>
      sendApiRequest<TastingSessionRecord>(
        `/api/tasting-sessions/${encodePathSegment(sessionId)}/restaurants`,
        {
          body: {
            restaurantId: input.restaurantId?.trim() || undefined,
            restaurantName: input.restaurantName.trim(),
          },
          headers: resolveFeatureWriteHeaders(requestOptions),
          method: 'POST',
        },
      ),
    { hasLinkedRestaurant: Boolean(input.restaurantId?.trim()) },
  );
}

export async function setTastingRestaurantSuggestionStatus(
  sessionId: string,
  restaurantSuggestionId: string,
  status: TastingSuggestionStatus,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.restaurant.status',
    () =>
      sendApiRequest<TastingSessionRecord>(
        `/api/tasting-sessions/${encodePathSegment(sessionId)}/restaurants/${encodePathSegment(restaurantSuggestionId)}/status`,
        {
          body: { status },
          headers: resolveFeatureWriteHeaders(requestOptions),
          method: 'PATCH',
        },
      ),
    { status },
  );
}

export async function suggestTastingMenuItem(
  sessionId: string,
  restaurantSuggestionId: string,
  input: SuggestTastingMenuItemInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.item.suggest',
    () =>
      sendApiRequest<TastingSessionRecord>(
        `/api/tasting-sessions/${encodePathSegment(sessionId)}/restaurants/${encodePathSegment(restaurantSuggestionId)}/items`,
        {
          body: {
            menuItemId: input.menuItemId?.trim() || undefined,
            name: input.name.trim(),
          },
          headers: resolveFeatureWriteHeaders(requestOptions),
          method: 'POST',
        },
      ),
    { hasMenuItemId: Boolean(input.menuItemId?.trim()) },
  );
}

export async function setTastingMenuItemSuggestionStatus(
  sessionId: string,
  itemSuggestionId: string,
  status: TastingSuggestionStatus,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.item.status',
    () =>
      sendApiRequest<TastingSessionRecord>(
        `/api/tasting-sessions/${encodePathSegment(sessionId)}/items/${encodePathSegment(itemSuggestionId)}/status`,
        {
          body: { status },
          headers: resolveFeatureWriteHeaders(requestOptions),
          method: 'PATCH',
        },
      ),
    { status },
  );
}

export async function startTastingSession(
  sessionId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation('tasting_session.start', () =>
    sendApiRequest<TastingSessionRecord>(`/api/tasting-sessions/${encodePathSegment(sessionId)}/start`, {
      headers: resolveFeatureWriteHeaders(requestOptions),
      method: 'POST',
    }),
  );
}

export async function submitTastingRatings(
  sessionId: string,
  input: SubmitTastingRatingsInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.ratings.submit',
    () =>
      sendApiRequest<TastingSessionRecord>(
        `/api/tasting-sessions/${encodePathSegment(sessionId)}/ratings`,
        {
          body: input,
          headers: resolveFeatureWriteHeaders(requestOptions),
          method: 'POST',
        },
      ),
    {
      restaurantCount: input.restaurants.length,
      itemCount: input.restaurants.reduce((count, restaurant) => count + restaurant.items.length, 0),
    },
  );
}

export async function completeTastingSession(
  sessionId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation('tasting_session.complete', () =>
    sendApiRequest<TastingSessionRecord>(`/api/tasting-sessions/${encodePathSegment(sessionId)}/complete`, {
      headers: resolveFeatureWriteHeaders(requestOptions),
      method: 'POST',
    }),
  );
}

export async function setTastingSessionStatus(
  sessionId: string,
  status: TastingSessionStatus,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  if (status === 'planning' || status === 'adding_items') {
    return lockTastingSessionMembership(sessionId, requestOptions);
  }
  if (status === 'tasting' || status === 'rating') {
    return startTastingSession(sessionId, requestOptions);
  }
  if (status === 'completed') {
    return completeTastingSession(sessionId, requestOptions);
  }
  throw new Error('Unsupported tasting session status transition.');
}
