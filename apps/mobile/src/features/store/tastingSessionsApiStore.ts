import type { TastingSessionRecord, TastingSessionStatus, TastingSuggestionStatus } from '../models';
import type {
  CreateTastingSessionInput,
  JoinTastingSessionInput,
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

interface ReadRequestOptions {
  signal?: AbortSignal;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

export async function listTastingSessions(options?: ReadRequestOptions): Promise<TastingSessionRecord[]> {
  return sendApiRequest<TastingSessionRecord[]>('/api/tasting-sessions', {
    method: 'GET',
    signal: options?.signal,
  });
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

export async function addTastingItem(): Promise<unknown> {
  throw new Error('Legacy tasting item queue operations are no longer supported.');
}

export async function deleteTastingItem(): Promise<unknown> {
  throw new Error('Legacy tasting item queue operations are no longer supported.');
}

export async function regenerateTastingInviteCode(): Promise<unknown> {
  throw new Error('Legacy tasting invite-code operations are no longer supported.');
}

export async function submitTastingRating(): Promise<unknown> {
  throw new Error('Legacy tasting rating queue operations are no longer supported.');
}
