import type { FeatureOutboxOperationName } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';

export type FeatureOutboxReplayAdapter = (
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
) => Promise<void>;

export interface FeatureOutboxDomainRegistration<
  TName extends FeatureOutboxOperationName = FeatureOutboxOperationName,
> {
  operationNames: readonly TName[];
  replayAdapters: Partial<Record<TName, FeatureOutboxReplayAdapter>>;
}

export function createFeatureOutboxDomainRegistration<
  TName extends FeatureOutboxOperationName,
>(
  registration: {
    operationNames: readonly TName[];
    replayAdapters?: Partial<Record<TName, FeatureOutboxReplayAdapter>>;
  },
): FeatureOutboxDomainRegistration<TName> {
  return {
    operationNames: registration.operationNames,
    replayAdapters: registration.replayAdapters ?? {},
  };
}
