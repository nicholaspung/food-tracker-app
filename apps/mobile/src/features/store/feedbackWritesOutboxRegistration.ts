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
import { createFeedback, sendFeedbackMessage } from './feedbackStore';
import { feedbackQueryKeys } from './feedbackQuery';
import { profileQueryKeys } from './profileQuery';

export const FEEDBACK_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: ['feedback.create', 'feedback.message.send'] as const,
  legacyPayloadPolicy: 'decode-as-current',
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
  replayIdentityResolvers: {
    'feedback.message.send': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['feedbackId']),
  },
  replayCacheEffects: {
    'feedback.create': reconcileFeedbackReplayCaches,
    'feedback.message.send': reconcileFeedbackReplayCaches,
  },
});

async function reconcileFeedbackReplayCaches(
  queryClient: QueryClient,
  outcome: FeatureOutboxSuccessfulReplayOutcome<'feedback.create' | 'feedback.message.send'>,
): Promise<void> {
  const feedbackId = getReplayIdentityString(outcome, 'feedbackId');
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: feedbackQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.profile }),
    ...(feedbackId
      ? [
          queryClient.invalidateQueries({ queryKey: feedbackQueryKeys.thread(feedbackId) }),
          queryClient.invalidateQueries({ queryKey: feedbackQueryKeys.messages(feedbackId) }),
        ]
      : []),
  ]);
}

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
