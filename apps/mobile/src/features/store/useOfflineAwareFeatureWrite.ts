import { useCallback } from 'react';

import { useConnectivity } from '../../providers/ConnectivityProvider';
import { useSync } from '../../providers/SyncProvider';
import type { EnqueueMutationInput } from '../../offline/types';
import {
  createFeatureOutboxMutationInput,
  type FeatureOutboxOperationName,
  type FeatureOutboxOperationPayload,
} from './featureOutboxOperations';
import { useWriteTelemetry } from './useWriteTelemetry';

export interface OfflineApiFeatureWriteOptions<TResult> {
  execute: () => Promise<TResult>;
  offline: {
    input: EnqueueMutationInput;
    strategy: 'api';
  };
  operationName: string;
  trackOnlineWrite?: boolean;
}

export interface OfflineOutboxFeatureWriteOptions<
  TName extends FeatureOutboxOperationName,
  TResult,
> {
  execute: () => Promise<TResult>;
  offline: {
    payload: FeatureOutboxOperationPayload<TName>;
    strategy: 'outbox';
  };
  operationName: TName;
  trackOnlineWrite?: boolean;
}

export type OfflineAwareFeatureWriteResult<TResult> =
  | {
      status: 'completed';
      result: TResult;
    }
  | {
      status: 'queued';
    };

export interface OfflineAwareFeatureWrite {
  <TResult>(
    options: OfflineApiFeatureWriteOptions<TResult>,
  ): Promise<OfflineAwareFeatureWriteResult<TResult>>;
  <TName extends FeatureOutboxOperationName, TResult>(
    options: OfflineOutboxFeatureWriteOptions<TName, TResult>,
  ): Promise<OfflineAwareFeatureWriteResult<TResult>>;
}

export type OfflineAwareFeatureWriteOptions<
  TName extends FeatureOutboxOperationName,
  TResult,
> =
  | OfflineApiFeatureWriteOptions<TResult>
  | OfflineOutboxFeatureWriteOptions<TName, TResult>;

export function useOfflineAwareFeatureWrite(): OfflineAwareFeatureWrite {
  const { isOnline } = useConnectivity();
  const { enqueueMutation } = useSync();
  const trackWriteTelemetry = useWriteTelemetry();

  const writeFeature = useCallback(
    async (
      options:
        | OfflineApiFeatureWriteOptions<unknown>
        | OfflineOutboxFeatureWriteOptions<FeatureOutboxOperationName, unknown>,
    ): Promise<OfflineAwareFeatureWriteResult<unknown>> => {
      if (!isOnline) {
        if (options.offline.strategy === 'api') {
          await enqueueMutation(options.offline.input);
        } else {
          await enqueueMutation(
            createFeatureOutboxMutationInput(
              options.operationName as FeatureOutboxOperationName,
              options.offline.payload,
            ),
          );
        }

        return { status: 'queued' };
      }

      if (options.trackOnlineWrite !== false) {
        await trackWriteTelemetry(options.operationName);
      }
      return {
        status: 'completed',
        result: await options.execute(),
      };
    },
    [enqueueMutation, isOnline, trackWriteTelemetry],
  ) as OfflineAwareFeatureWrite;

  return writeFeature;
}
