import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import type {
  CreateFeedbackInput,
  FeedbackCountSummary,
  SendFeedbackMessageInput,
} from './featureStore';
import {
  createFeedback,
  sendFeedbackMessage,
  type FeedbackReplyResult,
} from './feedbackStore';
import {
  feedbackQueryKeys,
  mergeFeedbackRecord,
  prependFeedbackListItem,
  prependFeedbackMessageListItem,
  upsertFeedbackListItem,
  type FeedbackListQueryData,
  type FeedbackMessageListQueryData,
} from './feedbackQuery';
import type { FeedbackThreadDetailResult } from './feedbackStore';
import {
  type OfflineAwareFeatureWrite,
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';
import type { FeedbackRecord } from '../models';

interface CreateFeedbackWriteInput extends CreateFeedbackInput {
  queuedAlert?: false | Parameters<typeof showQueuedOfflineAlert>[0];
}

function applyCreatedFeedback(queryClient: QueryClient, createdFeedback: FeedbackRecord): void {
  queryClient.setQueryData<FeedbackListQueryData>(feedbackQueryKeys.list, (currentFeedback) =>
    prependFeedbackListItem(currentFeedback, createdFeedback),
  );
  queryClient.setQueryData(feedbackQueryKeys.detail(createdFeedback.id), createdFeedback);
  queryClient.setQueryData<FeedbackCountSummary | undefined>(feedbackQueryKeys.summary, (currentSummary) =>
    currentSummary
      ? {
          allCount: currentSummary.allCount + 1,
          activeCount:
            createdFeedback.status === 'closed'
              ? currentSummary.activeCount
              : currentSummary.activeCount + 1,
        }
      : currentSummary,
  );
}

function applyFeedbackThreadUpdate(
  queryClient: QueryClient,
  nextFeedback: FeedbackRecord,
  options?: { moveToFront?: boolean },
): void {
  queryClient.setQueryData(
    feedbackQueryKeys.thread(nextFeedback.id),
    (currentThread: FeedbackThreadDetailResult | undefined) =>
      currentThread
        ? {
            ...currentThread,
            feedback: mergeFeedbackRecord(currentThread.feedback, nextFeedback),
          }
        : currentThread,
  );
  queryClient.setQueryData<FeedbackListQueryData | undefined>(feedbackQueryKeys.list, (currentFeedback) =>
    upsertFeedbackListItem(currentFeedback, nextFeedback, {
      moveToFront: options?.moveToFront,
    }),
  );
}

async function createFeedbackWithOfflineSupport({
  description,
  queryClient,
  queuedAlert,
  title,
  writeFeature,
}: CreateFeedbackWriteInput & {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<FeedbackRecord>> {
  const input = {
    description,
    title,
  };
  const result = await writeFeature({
    operationName: 'feedback.create',
    offline: {
      strategy: 'outbox',
      payload: input,
    },
    execute: createFeedback.bind(null, input),
  });

  if (result.status === 'queued') {
    await queryClient.invalidateQueries({ queryKey: feedbackQueryKeys.root });
    if (queuedAlert !== false) {
      showQueuedOfflineAlert(
        queuedAlert ?? {
          analyticsSource: 'useFeedbackWrites',
          subject: 'Feedback',
        },
      );
    }
    return result;
  }

  applyCreatedFeedback(queryClient, result.result);
  return result;
}

async function sendFeedbackMessageWithOfflineSupport({
  feedbackId,
  message,
  queryClient,
  writeFeature,
}: SendFeedbackMessageInput & {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<FeedbackReplyResult>> {
  const input = {
    feedbackId,
    message,
  };
  const result = await writeFeature({
    operationName: 'feedback.message.send',
    offline: {
      strategy: 'outbox',
      payload: input,
    },
    execute: sendFeedbackMessage.bind(null, input),
  });

  const messagesQueryKey = feedbackQueryKeys.messages(feedbackId);
  if (result.status === 'queued') {
    await queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    return result;
  }

  applyFeedbackThreadUpdate(queryClient, result.result.feedback, { moveToFront: true });
  queryClient.setQueryData<FeedbackMessageListQueryData | undefined>(
    messagesQueryKey,
    (currentMessages) => prependFeedbackMessageListItem(currentMessages, result.result.message),
  );
  return result;
}

export function useFeedbackWrites() {
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();

  const createFeedbackWrite = useCallback(
    async (input: CreateFeedbackWriteInput): Promise<OfflineAwareFeatureWriteResult<FeedbackRecord>> =>
      createFeedbackWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  const sendFeedbackMessageWrite = useCallback(
    async (input: SendFeedbackMessageInput): Promise<OfflineAwareFeatureWriteResult<FeedbackReplyResult>> =>
      sendFeedbackMessageWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  return {
    createFeedback: createFeedbackWrite,
    sendFeedbackMessage: sendFeedbackMessageWrite,
  };
}
