import { BILL_WRITE_OUTBOX_REGISTRATION } from './billWritesOutboxReplayAdapter';
import type {
  FeatureOutboxDomainRegistration,
  FeatureOutboxReplayAdapter,
  FeatureOutboxReplayCacheEffect,
  FeatureOutboxReplayCacheHintResolver,
  FeatureOutboxReplayIdentityResolver,
} from './featureOutboxDomainRegistration';
import type { FeatureOutboxPersistedPayloadDecoder } from './featureOutboxPayloadDecoders';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';
import { FEEDBACK_WRITE_OUTBOX_REGISTRATION } from './feedbackWritesOutboxRegistration';
import { FOOD_PRODUCT_WRITE_OUTBOX_REGISTRATION } from './foodProductWritesOutboxRegistration';
import { FRIEND_WRITE_OUTBOX_REGISTRATION } from './friendWritesOutboxRegistration';
import { NOTE_WRITE_OUTBOX_REGISTRATION } from './noteWritesOutboxRegistration';
import { ONBOARDING_PROGRESS_OUTBOX_REGISTRATION } from './onboardingProgressOutboxRegistration';
import { RESTAURANT_LIST_WRITE_OUTBOX_REGISTRATION } from './restaurantListWritesOutboxRegistration';
import { SETTINGS_PREFERENCES_OUTBOX_REGISTRATION } from './settingsPreferencesOutboxRegistration';
import { TASTING_SESSION_WRITE_OUTBOX_REGISTRATION } from './tastingSessionWritesOutboxRegistration';
import { VISIT_WRITE_OUTBOX_REGISTRATION } from './visitWritesOutboxRegistration';

const FEATURE_OUTBOX_DOMAIN_REGISTRATIONS: readonly FeatureOutboxDomainRegistration[] = [
  SETTINGS_PREFERENCES_OUTBOX_REGISTRATION,
  ONBOARDING_PROGRESS_OUTBOX_REGISTRATION,
  VISIT_WRITE_OUTBOX_REGISTRATION,
  FOOD_PRODUCT_WRITE_OUTBOX_REGISTRATION,
  NOTE_WRITE_OUTBOX_REGISTRATION,
  RESTAURANT_LIST_WRITE_OUTBOX_REGISTRATION,
  BILL_WRITE_OUTBOX_REGISTRATION,
  FEEDBACK_WRITE_OUTBOX_REGISTRATION,
  FRIEND_WRITE_OUTBOX_REGISTRATION,
  TASTING_SESSION_WRITE_OUTBOX_REGISTRATION,
];

export const FEATURE_OUTBOX_OPERATION_NAMES = new Set<FeatureOutboxOperationName>(
  FEATURE_OUTBOX_DOMAIN_REGISTRATIONS.flatMap((registration) => registration.operationNames),
);

export const FEATURE_OUTBOX_REPLAY_ADAPTERS: Partial<
  Record<FeatureOutboxOperationName, FeatureOutboxReplayAdapter>
> = Object.assign(
  {},
  ...FEATURE_OUTBOX_DOMAIN_REGISTRATIONS.map((registration) => registration.replayAdapters),
);

export const FEATURE_OUTBOX_REPLAY_CACHE_EFFECTS: Partial<
  Record<FeatureOutboxOperationName, FeatureOutboxReplayCacheEffect>
> = Object.assign(
  {},
  ...FEATURE_OUTBOX_DOMAIN_REGISTRATIONS.map((registration) => registration.replayCacheEffects),
);

export const FEATURE_OUTBOX_REPLAY_CACHE_HINT_RESOLVERS: Partial<
  Record<FeatureOutboxOperationName, FeatureOutboxReplayCacheHintResolver>
> = Object.assign(
  {},
  ...FEATURE_OUTBOX_DOMAIN_REGISTRATIONS.map(
    (registration) => registration.replayCacheHintResolvers,
  ),
);

export const FEATURE_OUTBOX_REPLAY_IDENTITY_RESOLVERS: Partial<
  Record<FeatureOutboxOperationName, FeatureOutboxReplayIdentityResolver>
> = Object.assign(
  {},
  ...FEATURE_OUTBOX_DOMAIN_REGISTRATIONS.map(
    (registration) => registration.replayIdentityResolvers,
  ),
);

export const FEATURE_OUTBOX_PAYLOAD_DECODERS: Partial<
  Record<
    FeatureOutboxOperationName,
    FeatureOutboxPersistedPayloadDecoder<FeatureOutboxOperationName>
  >
> = Object.assign(
  {},
  ...FEATURE_OUTBOX_DOMAIN_REGISTRATIONS.map(
    (registration) => registration.persistedPayloadDecoders,
  ),
);
