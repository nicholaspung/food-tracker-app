import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import { createFeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import { createFeedback, sendFeedbackMessage } from './featureStore';

export const FEEDBACK_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: ['feedback.create', 'feedback.message.send'] as const,
  payloadDecoders: {
    'feedback.create': createFeatureOutboxPayloadDecoder('feedback.create', [
      { key: 'title', type: 'string' },
      { key: 'description', type: 'string' },
    ]),
    'feedback.message.send': createFeatureOutboxPayloadDecoder('feedback.message.send', [
      { key: 'feedbackId', type: 'string' },
      { key: 'message', type: 'string' },
    ]),
  },
  replayAdapters: {
    'feedback.create': replayFeedbackCreate,
    'feedback.message.send': replayFeedbackMessageSend,
  },
});

async function replayFeedbackCreate(
  payload: FeatureOutboxOperationPayloadMap['feedback.create'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createFeedback(payload, requestOptions);
}

async function replayFeedbackMessageSend(
  payload: FeatureOutboxOperationPayloadMap['feedback.message.send'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await sendFeedbackMessage(payload, requestOptions);
}
