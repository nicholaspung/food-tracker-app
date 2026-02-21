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
      await enqueueMutation(createFeatureOutboxMutationInput(operationName, payload));
    },
    [enqueueMutation],
  );
}
