import type {
  FeatureOutboxOperationName,
  FeatureOutboxOperationPayload,
} from './featureOutboxOperations';
import type { FeatureOutboxPayloadDecoderMap } from './featureOutboxPayloadDecoders';
import type { FeatureWriteRequestOptions } from './featureStoreShared';

export type FeatureOutboxReplayAdapter<
  TName extends FeatureOutboxOperationName = FeatureOutboxOperationName,
> = (
  payload: FeatureOutboxOperationPayload<TName>,
  requestOptions: FeatureWriteRequestOptions,
) => Promise<void>;

export type FeatureOutboxReplayAdapterMap<TName extends FeatureOutboxOperationName> = {
  [Name in TName]: FeatureOutboxReplayAdapter<Name>;
};

export interface FeatureOutboxDomainRegistration<
  TName extends FeatureOutboxOperationName = FeatureOutboxOperationName,
> {
  operationNames: readonly TName[];
  payloadDecoders: Partial<FeatureOutboxPayloadDecoderMap<FeatureOutboxOperationName>>;
  replayAdapters: Partial<FeatureOutboxReplayAdapterMap<FeatureOutboxOperationName>>;
}

export function createFeatureOutboxDomainRegistration<
  TName extends FeatureOutboxOperationName,
>(
  registration: {
    operationNames: readonly TName[];
    payloadDecoders: FeatureOutboxPayloadDecoderMap<TName>;
    replayAdapters?: Partial<FeatureOutboxReplayAdapterMap<TName>>;
  },
): FeatureOutboxDomainRegistration<TName> {
  return {
    operationNames: registration.operationNames,
    payloadDecoders: registration.payloadDecoders,
    replayAdapters: registration.replayAdapters ?? {},
  };
}
