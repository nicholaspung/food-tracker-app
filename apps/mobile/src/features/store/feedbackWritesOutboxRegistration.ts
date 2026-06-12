import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import { createFeedback, sendFeedbackMessage } from './featureStore';

export const FEEDBACK_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: ['feedback.create', 'feedback.message.send'] as const,
  replayAdapters: {
    'feedback.create': replayFeedbackCreate,
    'feedback.message.send': replayFeedbackMessageSend,
  },
});

async function replayFeedbackCreate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createFeedback(payload as FeatureOutboxOperationPayloadMap['feedback.create'], requestOptions);
}

async function replayFeedbackMessageSend(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await sendFeedbackMessage(
    payload as FeatureOutboxOperationPayloadMap['feedback.message.send'],
    requestOptions,
  );
}
