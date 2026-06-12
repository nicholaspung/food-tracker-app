import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  createTastingSession,
  joinTastingSession,
  setTastingSessionStatus,
} from './tastingSessionsApiStore';

export const TASTING_SESSION_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'tasting-session.create',
    'tasting-session.join',
    'tasting-session.status.update',
  ] as const,
  replayAdapters: {
    'tasting-session.create': replayTastingSessionCreate,
    'tasting-session.join': replayTastingSessionJoin,
    'tasting-session.status.update': replayTastingSessionStatusUpdate,
  },
});

async function replayTastingSessionCreate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createTastingSession(
    payload as FeatureOutboxOperationPayloadMap['tasting-session.create'],
    requestOptions,
  );
}

async function replayTastingSessionJoin(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await joinTastingSession(
    payload as FeatureOutboxOperationPayloadMap['tasting-session.join'],
    requestOptions,
  );
}

async function replayTastingSessionStatusUpdate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const statusPayload = payload as FeatureOutboxOperationPayloadMap['tasting-session.status.update'];
  await setTastingSessionStatus(statusPayload.sessionId, statusPayload.status, requestOptions);
}
