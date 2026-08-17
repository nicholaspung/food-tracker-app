import type { QueryClient } from '@tanstack/react-query';

import type {
  SuccessfulMutationReplayOutcome,
  SuccessfulReplayCacheHint,
  SuccessfulReplayIdentity,
} from '../../offline/types';
import type {
  FeatureOutboxReplayAdapter,
  FeatureOutboxReplayCacheHintResolver,
  FeatureOutboxReplayIdentityResolver,
} from './featureOutboxDomainRegistration';
import {
  FEATURE_OUTBOX_PAYLOAD_DECODERS,
  FEATURE_OUTBOX_REPLAY_ADAPTERS,
  FEATURE_OUTBOX_REPLAY_CACHE_EFFECTS,
  FEATURE_OUTBOX_REPLAY_CACHE_HINT_RESOLVERS,
  FEATURE_OUTBOX_REPLAY_IDENTITY_RESOLVERS,
  FEATURE_OUTBOX_OPERATION_NAMES,
} from './featureOutboxRegistry';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';
import type { FeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
import type { FeatureWriteRequestOptions } from './featureStoreShared';

export type FeatureOutboxReplayResult =
  | {
      status: 'replayed';
      cacheHints: readonly SuccessfulReplayCacheHint[];
      identity: SuccessfulReplayIdentity;
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
  const metadata = resolveDecodedFeatureOutboxReplayMetadata(
    operationName,
    decodedPayload.payload,
  );
  return {
    status: 'replayed',
    ...metadata,
  };
}

export function resolveRegisteredFeatureOutboxReplayMetadata<
  TName extends FeatureOutboxOperationName,
>(operationName: TName, payload: unknown): {
  cacheHints: readonly SuccessfulReplayCacheHint[];
  identity: SuccessfulReplayIdentity;
} | null {
  const decoder = FEATURE_OUTBOX_PAYLOAD_DECODERS[operationName] as
    | FeatureOutboxPayloadDecoder<TName>
    | undefined;
  if (!decoder) {
    return null;
  }
  const decodedPayload = decoder(payload);
  return decodedPayload.status === 'ok'
    ? resolveDecodedFeatureOutboxReplayMetadata(operationName, decodedPayload.payload)
    : null;
}

function resolveDecodedFeatureOutboxReplayMetadata<TName extends FeatureOutboxOperationName>(
  operationName: TName,
  payload: Parameters<FeatureOutboxReplayIdentityResolver<TName>>[0],
): {
  cacheHints: readonly SuccessfulReplayCacheHint[];
  identity: SuccessfulReplayIdentity;
} {
  const identityResolver = FEATURE_OUTBOX_REPLAY_IDENTITY_RESOLVERS[operationName] as
    | FeatureOutboxReplayIdentityResolver<TName>
    | undefined;
  const cacheHintResolver = FEATURE_OUTBOX_REPLAY_CACHE_HINT_RESOLVERS[operationName] as
    | FeatureOutboxReplayCacheHintResolver<TName>
    | undefined;
  return {
    cacheHints: cacheHintResolver ? cacheHintResolver(payload) : [],
    identity: identityResolver ? identityResolver(payload) : {},
  };
}

export async function reconcileSuccessfulFeatureOutboxReplay(
  queryClient: QueryClient,
  outcome: SuccessfulMutationReplayOutcome,
): Promise<void> {
  if (!FEATURE_OUTBOX_OPERATION_NAMES.has(outcome.operationName as FeatureOutboxOperationName)) {
    return;
  }

  const operationName = outcome.operationName as FeatureOutboxOperationName;
  const cacheEffect = FEATURE_OUTBOX_REPLAY_CACHE_EFFECTS[operationName];
  if (!cacheEffect) {
    return;
  }

  await cacheEffect(queryClient, {
    ...outcome,
    operationName,
  });
}
