import { useCallback } from 'react';

import { useConnectivity } from '../../providers/ConnectivityProvider';
import { useSync } from '../../providers/SyncProvider';
import type { EnqueueMutationInput } from '../../offline/types';
import { isRetryableStatus } from '../../offline/retryPolicy';
import {
  createFeatureOutboxMutationInput,
  type FeatureOutboxOperationName,
  type FeatureOutboxOperationPayload,
} from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import { useWriteTelemetry } from './useWriteTelemetry';

type FeatureWriteExecute<TResult> = (
  requestOptions: FeatureWriteRequestOptions,
) => Promise<TResult>;

export interface OfflineApiFeatureWriteOptions<TResult> {
  execute: FeatureWriteExecute<TResult>;
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
  execute: FeatureWriteExecute<TResult>;
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

export class DurableFeatureWriteFailure extends Error {
  readonly status = 'failed' as const;
  readonly retryable = false as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DurableFeatureWriteFailure';
  }
}

export type OfflineAwareFeatureWriteOptions<
  TName extends FeatureOutboxOperationName,
  TResult,
> =
  | OfflineApiFeatureWriteOptions<TResult>
  | OfflineOutboxFeatureWriteOptions<TName, TResult>;

export function useOfflineAwareFeatureWrite(): OfflineAwareFeatureWrite {
  const connectivity = useConnectivity();
  const {
    beginMutationDelivery,
    completeMutationDelivery,
    deferMutationDelivery,
    discardMutationDelivery,
    stageMutation,
  } = useSync();
  const trackWriteTelemetry = useWriteTelemetry();

  const writeFeature = useCallback(
    async (
      options:
        | OfflineApiFeatureWriteOptions<unknown>
        | OfflineOutboxFeatureWriteOptions<FeatureOutboxOperationName, unknown>,
    ): Promise<OfflineAwareFeatureWriteResult<unknown>> => {
      const mutationInput =
        options.offline.strategy === 'api'
          ? options.offline.input
          : createFeatureOutboxMutationInput(
              options.operationName as FeatureOutboxOperationName,
              options.offline.payload,
            );
      const stagedMutation = await stageMutation(mutationInput);

      if (connectivity.status !== 'online') {
        return { status: 'queued' };
      }

      await beginMutationDelivery(stagedMutation.id);

      const requestOptions: FeatureWriteRequestOptions = {
        headers: {
          ...mutationInput.headers,
          'Idempotency-Key': stagedMutation.idempotencyKey,
          'X-Idempotency-Key': stagedMutation.idempotencyKey,
        },
      };

      try {
        if (options.trackOnlineWrite !== false) {
          await trackWriteTelemetry(options.operationName);
        }
        const result = await options.execute(requestOptions);
        await completeMutationDelivery(stagedMutation.id);
        return {
          status: 'completed',
          result,
        };
      } catch (error) {
        if (isRetryableFeatureWriteError(error)) {
          await deferMutationDelivery(stagedMutation.id, resolveErrorMessage(error));
          return { status: 'queued' };
        }

        await discardMutationDelivery(stagedMutation.id);
        throw new DurableFeatureWriteFailure(resolveErrorMessage(error), { cause: error });
      }
    },
    [
      beginMutationDelivery,
      completeMutationDelivery,
      connectivity.status,
      deferMutationDelivery,
      discardMutationDelivery,
      stageMutation,
      trackWriteTelemetry,
    ],
  ) as OfflineAwareFeatureWrite;

  return writeFeature;
}

function isRetryableFeatureWriteError(error: unknown): boolean {
  const statusCode = resolveStatusCode(error);
  if (statusCode !== null) {
    return statusCode === 0 || isRetryableStatus(statusCode);
  }

  if (error instanceof TypeError) {
    return true;
  }

  const message = resolveErrorMessage(error).toLowerCase();
  return /network|fetch|timed? out|timeout|connection|offline/.test(message);
}

function resolveStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

function resolveErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Feature write failed.';
}
