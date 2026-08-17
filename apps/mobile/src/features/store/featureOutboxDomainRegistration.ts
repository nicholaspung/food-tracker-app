import type { QueryClient } from '@tanstack/react-query';

import type {
  SuccessfulMutationReplayOutcome,
  SuccessfulReplayCacheHint,
  SuccessfulReplayIdentity,
} from '../../offline/types';
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

export type FeatureOutboxReplayIdentityResolver<
  TName extends FeatureOutboxOperationName = FeatureOutboxOperationName,
> = (payload: FeatureOutboxOperationPayload<TName>) => SuccessfulReplayIdentity;

export type FeatureOutboxReplayIdentityResolverMap<TName extends FeatureOutboxOperationName> = {
  [Name in TName]: FeatureOutboxReplayIdentityResolver<Name>;
};

export type FeatureOutboxReplayCacheHintResolver<
  TName extends FeatureOutboxOperationName = FeatureOutboxOperationName,
> = (payload: FeatureOutboxOperationPayload<TName>) => readonly SuccessfulReplayCacheHint[];

export type FeatureOutboxReplayCacheHintResolverMap<TName extends FeatureOutboxOperationName> = {
  [Name in TName]: FeatureOutboxReplayCacheHintResolver<Name>;
};

export type FeatureOutboxSuccessfulReplayOutcome<
  TName extends FeatureOutboxOperationName = FeatureOutboxOperationName,
> = SuccessfulMutationReplayOutcome & { operationName: TName };

export type FeatureOutboxReplayCacheEffect<
  TName extends FeatureOutboxOperationName = FeatureOutboxOperationName,
> = (
  queryClient: QueryClient,
  outcome: FeatureOutboxSuccessfulReplayOutcome<TName>,
) => Promise<void>;

export type FeatureOutboxReplayCacheEffectMap<TName extends FeatureOutboxOperationName> = {
  [Name in TName]: FeatureOutboxReplayCacheEffect<Name>;
};

export interface FeatureOutboxDomainRegistration<
  TName extends FeatureOutboxOperationName = FeatureOutboxOperationName,
> {
  operationNames: readonly TName[];
  payloadDecoders: Partial<FeatureOutboxPayloadDecoderMap<FeatureOutboxOperationName>>;
  replayAdapters: Partial<FeatureOutboxReplayAdapterMap<FeatureOutboxOperationName>>;
  replayCacheEffects: Partial<FeatureOutboxReplayCacheEffectMap<FeatureOutboxOperationName>>;
  replayCacheHintResolvers: Partial<
    FeatureOutboxReplayCacheHintResolverMap<FeatureOutboxOperationName>
  >;
  replayIdentityResolvers: Partial<
    FeatureOutboxReplayIdentityResolverMap<FeatureOutboxOperationName>
  >;
}

export function createFeatureOutboxDomainRegistration<
  TName extends FeatureOutboxOperationName,
>(
  registration: {
    operationNames: readonly TName[];
    payloadDecoders: FeatureOutboxPayloadDecoderMap<TName>;
    replayAdapters?: Partial<FeatureOutboxReplayAdapterMap<TName>>;
    replayCacheEffects?: Partial<FeatureOutboxReplayCacheEffectMap<TName>>;
    replayCacheHintResolvers?: Partial<FeatureOutboxReplayCacheHintResolverMap<TName>>;
    replayIdentityResolvers?: Partial<FeatureOutboxReplayIdentityResolverMap<TName>>;
  },
): FeatureOutboxDomainRegistration<TName> {
  return {
    operationNames: registration.operationNames,
    payloadDecoders: registration.payloadDecoders,
    replayAdapters: registration.replayAdapters ?? {},
    replayCacheEffects: registration.replayCacheEffects ?? {},
    replayCacheHintResolvers: registration.replayCacheHintResolvers ?? {},
    replayIdentityResolvers: registration.replayIdentityResolvers ?? {},
  };
}

export function pickFeatureOutboxReplayIdentity(
  payload: unknown,
  keys: readonly string[],
): SuccessfulReplayIdentity {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const identity: Record<string, string | readonly string[]> = {};
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      identity[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      identity[key] = value;
    }
  }
  return identity;
}

export function getReplayIdentityString(
  outcome: SuccessfulMutationReplayOutcome,
  key: string,
): string | undefined {
  const value = outcome.identity[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function getReplayIdentityStrings(
  outcome: SuccessfulMutationReplayOutcome,
  key: string,
): string[] {
  const value = outcome.identity[key];
  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }
  return Array.isArray(value)
    ? value.map((item) => item.trim()).filter(Boolean)
    : [];
}

export function hasReplayCacheHint(
  outcome: SuccessfulMutationReplayOutcome,
  hint: SuccessfulReplayCacheHint,
): boolean {
  return outcome.cacheHints?.includes(hint) ?? false;
}
