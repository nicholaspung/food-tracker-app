import type { TastingSessionRecord, TastingSessionStatus } from '../models';
import type {
  AddTastingItemInput,
  CreateTastingSessionInput,
  JoinTastingSessionInput,
  SubmitTastingRatingInput,
} from './featureStore';
import {
  isNotFoundError,
  resolveFeatureWriteHeaders,
  trackFeatureMutation,
  type FeatureWriteRequestOptions,
} from './featureStoreShared';
import { sendApiRequest } from './pocketbaseGateway';

export type {
  AddTastingItemInput,
  CreateTastingSessionInput,
  JoinTastingSessionInput,
  SubmitTastingRatingInput,
} from './featureStore';

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
          name: input.name.trim(),
          restaurantName: input.restaurantName.trim(),
        },
        headers: resolveFeatureWriteHeaders(requestOptions),
        method: 'POST',
      }),
    {
      hasRestaurantName: Boolean(input.restaurantName.trim()),
      hasSessionName: Boolean(input.name.trim()),
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
        body: {
          code: input.inviteCode.trim().toUpperCase(),
        },
        headers: resolveFeatureWriteHeaders(requestOptions),
        method: 'POST',
      }),
    {
      inviteCodeLength: input.inviteCode.trim().length,
    },
  );
}

export async function regenerateTastingInviteCode(
  sessionId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation('tasting_session.invite_code.regenerate', () =>
    sendApiRequest<TastingSessionRecord>(
      `/api/tasting-sessions/${encodePathSegment(sessionId)}/invite-code`,
      {
        headers: resolveFeatureWriteHeaders(requestOptions),
        method: 'POST',
      },
    ),
  );
}

export async function addTastingItem(
  sessionId: string,
  input: AddTastingItemInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.item.add',
    () =>
      sendApiRequest<TastingSessionRecord>(
        `/api/tasting-sessions/${encodePathSegment(sessionId)}/items`,
        {
          body: {
            description: input.description?.trim() || undefined,
            name: input.name.trim(),
          },
          headers: resolveFeatureWriteHeaders(requestOptions),
          method: 'POST',
        },
      ),
    {
      hasDescription: Boolean(input.description?.trim()),
    },
  );
}

export async function deleteTastingItem(
  sessionId: string,
  itemId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation('tasting_session.item.delete', () =>
    sendApiRequest<TastingSessionRecord>(
      `/api/tasting-sessions/${encodePathSegment(sessionId)}/items/${encodePathSegment(itemId)}`,
      {
        headers: resolveFeatureWriteHeaders(requestOptions),
        method: 'DELETE',
      },
    ),
  );
}

export async function submitTastingRating(
  sessionId: string,
  itemId: string,
  input: SubmitTastingRatingInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.rating.submit',
    () =>
      sendApiRequest<TastingSessionRecord>(
        `/api/tasting-sessions/${encodePathSegment(sessionId)}/items/${encodePathSegment(itemId)}/rating`,
        {
          body: {
            note: input.note?.trim() || undefined,
            rating: input.rating,
          },
          headers: resolveFeatureWriteHeaders(requestOptions),
          method: 'PUT',
        },
      ),
    {
      hasNote: Boolean(input.note?.trim()),
      rating: input.rating,
    },
  );
}

export async function setTastingSessionStatus(
  sessionId: string,
  status: TastingSessionStatus,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.status.update',
    () =>
      sendApiRequest<TastingSessionRecord>(
        `/api/tasting-sessions/${encodePathSegment(sessionId)}/status`,
        {
          body: { status },
          headers: resolveFeatureWriteHeaders(requestOptions),
          method: 'PATCH',
        },
      ),
    { status },
  );
}
