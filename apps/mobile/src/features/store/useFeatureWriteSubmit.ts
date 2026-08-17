import { useCallback, useState } from 'react';

import type { EnqueueMutationInput } from '../../offline/types';
import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import {
  type FeatureOutboxOperationName,
  type FeatureOutboxOperationPayload,
} from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import { useOfflineAwareFeatureWrite } from './useOfflineAwareFeatureWrite';

type FeatureWriteSubmitOffline<TName extends FeatureOutboxOperationName> =
  | {
      input: EnqueueMutationInput;
      strategy: 'api';
    }
  | {
      payload: FeatureOutboxOperationPayload<TName>;
      strategy: 'outbox';
    };

export interface FeatureWriteSubmitOptions<TName extends FeatureOutboxOperationName, TResult> {
  execute: (requestOptions: FeatureWriteRequestOptions) => Promise<TResult>;
  fallbackErrorMessage: string;
  offline: FeatureWriteSubmitOffline<TName>;
  onQueued?: () => Promise<void> | void;
  onSuccess?: (result: TResult) => Promise<void> | void;
  onSettledInvalidate?: () => Promise<void> | void;
  operationName: TName;
  queuedToast?: Parameters<typeof showQueuedOfflineAlert>[0];
  trackOnlineWrite?: boolean;
}

export function useFeatureWriteSubmit() {
  const writeFeature = useOfflineAwareFeatureWrite();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitFeatureWrite = useCallback(
    async <TName extends FeatureOutboxOperationName, TResult>({
      execute,
      fallbackErrorMessage,
      offline,
      onQueued,
      onSettledInvalidate,
      onSuccess,
      operationName,
      queuedToast,
      trackOnlineWrite,
    }: FeatureWriteSubmitOptions<TName, TResult>) => {
      setErrorMessage(null);
      setIsSubmitting(true);

      try {
        const result =
          offline.strategy === 'api'
            ? await writeFeature({
                operationName,
                offline,
                execute,
                trackOnlineWrite,
              })
            : await writeFeature({
                operationName,
                offline,
                execute,
                trackOnlineWrite,
              });

        if (result.status === 'queued') {
          await onQueued?.();
          await onSettledInvalidate?.();
          if (queuedToast) {
            showQueuedOfflineAlert(queuedToast);
          }
          return result;
        }

        await onSuccess?.(result.result);
        await onSettledInvalidate?.();
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : fallbackErrorMessage;
        setErrorMessage(message);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [writeFeature],
  );

  return {
    errorMessage,
    isSubmitting,
    setErrorMessage,
    setIsSubmitting,
    submitFeatureWrite,
  };
}
