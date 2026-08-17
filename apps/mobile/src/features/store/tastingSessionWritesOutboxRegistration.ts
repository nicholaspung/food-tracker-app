import type { QueryClient } from '@tanstack/react-query';

import {
  createFeatureOutboxDomainRegistration,
  getReplayIdentityString,
  pickFeatureOutboxReplayIdentity,
  type FeatureOutboxSuccessfulReplayOutcome,
} from './featureOutboxDomainRegistration';
import { createFeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  createTastingSession,
  joinTastingSession,
  setTastingSessionStatus,
} from './tastingSessionsApiStore';
import { moreFeatureSignalQueryKeys } from './moreFeatureSignalsQuery';
import { tastingSessionsQueryKeys } from './tastingSessionsQuery';

export const TASTING_SESSION_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'tasting-session.create',
    'tasting-session.join',
    'tasting-session.status.update',
  ] as const,
  payloadDecoders: {
    'tasting-session.create': createFeatureOutboxPayloadDecoder('tasting-session.create', [
      { key: 'name', type: 'string' },
      { key: 'joinDurationMinutes', type: 'number' },
    ]),
    'tasting-session.join': createFeatureOutboxPayloadDecoder('tasting-session.join', [
      { key: 'inviteCode', type: 'string' },
    ]),
    'tasting-session.status.update': createFeatureOutboxPayloadDecoder(
      'tasting-session.status.update',
      [
        { key: 'sessionId', type: 'string' },
        {
          key: 'status',
          type: 'string',
          allowedValues: ['lobby', 'planning', 'tasting', 'completed', 'adding_items', 'rating'],
        },
      ],
    ),
  },
  replayAdapters: {
    'tasting-session.create': replayTastingSessionCreate,
    'tasting-session.join': replayTastingSessionJoin,
    'tasting-session.status.update': replayTastingSessionStatusUpdate,
  },
  replayIdentityResolvers: {
    'tasting-session.status.update': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['sessionId']),
  },
  replayCacheEffects: {
    'tasting-session.create': reconcileTastingSessionReplayCaches,
    'tasting-session.join': reconcileTastingSessionReplayCaches,
    'tasting-session.status.update': reconcileTastingSessionReplayCaches,
  },
});

type TastingSessionReplayOperationName =
  | 'tasting-session.create'
  | 'tasting-session.join'
  | 'tasting-session.status.update';

async function reconcileTastingSessionReplayCaches(
  queryClient: QueryClient,
  outcome: FeatureOutboxSuccessfulReplayOutcome<TastingSessionReplayOperationName>,
): Promise<void> {
  const sessionId = getReplayIdentityString(outcome, 'sessionId');
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.summariesRoot }),
    queryClient.invalidateQueries({ queryKey: moreFeatureSignalQueryKeys.summary }),
    ...(sessionId
      ? [queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) })]
      : []),
  ]);
}

async function replayTastingSessionCreate(
  payload: FeatureOutboxOperationPayloadMap['tasting-session.create'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createTastingSession(payload, requestOptions);
}

async function replayTastingSessionJoin(
  payload: FeatureOutboxOperationPayloadMap['tasting-session.join'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await joinTastingSession(payload, requestOptions);
}

async function replayTastingSessionStatusUpdate(
  statusPayload: FeatureOutboxOperationPayloadMap['tasting-session.status.update'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await setTastingSessionStatus(statusPayload.sessionId, statusPayload.status, requestOptions);
}
