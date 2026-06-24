import type { FeatureOutboxReplayAdapter } from './featureOutboxDomainRegistration';
import {
  FEATURE_OUTBOX_PAYLOAD_DECODERS,
  FEATURE_OUTBOX_REPLAY_ADAPTERS,
} from './featureOutboxRegistry';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';
import type { FeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
import type { FeatureWriteRequestOptions } from './featureStoreShared';

export type FeatureOutboxReplayResult =
  | {
      status: 'replayed';
    }
  | {
      status: 'terminalInvalidPayload';
      message: string;
    }
  | {
      status: 'unhandled';
    };

export async function replayRegisteredFeatureOutboxOperation<TName extends FeatureOutboxOperationName>(
  operationName: TName,
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<FeatureOutboxReplayResult> {
  const adapter = FEATURE_OUTBOX_REPLAY_ADAPTERS[operationName] as
    | FeatureOutboxReplayAdapter<TName>
    | undefined;
  const decoder = FEATURE_OUTBOX_PAYLOAD_DECODERS[operationName] as
    | FeatureOutboxPayloadDecoder<TName>
    | undefined;
  if (!adapter || !decoder) {
    return { status: 'unhandled' };
  }

  const decodedPayload = decoder(payload);
  if (decodedPayload.status === 'terminalInvalidPayload') {
    return decodedPayload;
  }

  await adapter(decodedPayload.payload, requestOptions);
  return { status: 'replayed' };
}
