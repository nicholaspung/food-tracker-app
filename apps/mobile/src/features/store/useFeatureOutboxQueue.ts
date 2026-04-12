import { useCallback } from 'react';

import { useSync } from '../../providers/SyncProvider';
import {
  createFeatureOutboxMutationInput,
  type FeatureOutboxOperationName,
  type FeatureOutboxOperationPayload,
} from './featureOutboxOperations';

export function useFeatureOutboxQueue() {
  const { enqueueMutation } = useSync();

  return useCallback(
    async <TName extends FeatureOutboxOperationName>(
      operationName: TName,
      payload: FeatureOutboxOperationPayload<TName>,
    ): Promise<void> => {
      // This is a low-level queue primitive. Screen flows should prefer
      // useOfflineAwareFeatureWrite so online execution and offline replay stay coupled.
      await enqueueMutation(createFeatureOutboxMutationInput(operationName, payload));
    },
    [enqueueMutation],
  );
}
