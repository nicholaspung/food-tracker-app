import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { env } from '../config/env';
import type { AuthUser } from '../types/auth';
import {
  identifyObservabilityUser,
  setObservabilityContext,
  trackObservabilityEvent,
  type EventProperties,
} from './index';

export type AnalyticsEventName =
  | 'activation.signup_started'
  | 'activation.signup_completed'
  | 'activation.email_verified'
  | 'activation.onboarding_started'
  | 'activation.onboarding_completed'
  | 'activation.first_food_logged'
  | 'tracking.entry_started'
  | 'tracking.restaurant_selected'
  | 'tracking.items_selected'
  | 'tracking.rating_added'
  | 'tracking.photo_added'
  | 'tracking.visibility_selected'
  | 'tracking.entry_completed'
  | 'tracking.entry_failed'
  | 'tracking.entry_abandoned'
  | 'social.friend_code_viewed'
  | 'social.friend_request_sent'
  | 'social.friend_added'
  | 'social.feed_viewed'
  | 'social.feed_item_opened'
  | 'social.recommendation_saved'
  | 'social.i_went_there_started'
  | 'social.i_went_there_completed'
  | 'social.invite_shared'
  | 'social.invite_accepted'
  | 'retention.session_started'
  | 'retention.session_ended'
  | 'retention.screen_viewed'
  | 'retention.screen_dwell_completed'
  | 'quality.error_shown'
  | 'quality.empty_state_shown'
  | 'quality.offline_write_queued'
  | 'quality.offline_write_replayed'
  | 'quality.usage_limit_reached';

export type AnalyticsContext = {
  anonymousId: string;
  userKey?: string;
  appVersion: string | null;
  buildVersion: string | null;
  platform: string;
  environment: string;
  authStatus: string;
  userTier: 'admin' | 'subscriber' | 'free' | null;
};

export type TrackingEntryProperties = {
  entryType: 'restaurant_visit' | 'food_product' | 'note' | 'photo_batch';
  source:
    | 'add_tab'
    | 'home_feed'
    | 'friend_feed'
    | 'list'
    | 'note'
    | 'photo_processing'
    | 'food_discovery'
    | 'tutorial';
  hasPhoto: boolean;
  itemCount?: number;
  ratingCount?: number;
  visibility?: 'private' | 'friends';
  durationMs?: number;
  completed: boolean;
};

export type ProductAnalyticsProperties = EventProperties;

type UserTier = AnalyticsContext['userTier'];
type ExpoConstants = typeof import('expo-constants')['default'];

const DEFAULT_ANONYMOUS_ID = 'anonymous_pending';
const FIRST_FOOD_LOGGED_KEY = 'analytics.product.firstFoodLogged';

let currentAnonymousId = DEFAULT_ANONYMOUS_ID;
let currentUserKey: string | undefined;
let currentAuthStatus = 'unknown';
let currentUserTier: UserTier = null;
let lastIdentifiedUserKey: string | null = null;
let hasTrackedFirstFoodLogged = false;
const expoConstants = readExpoConstants();
const platformOS = readPlatformOS();

const appVersion = expoConstants?.expoConfig?.version ?? expoConstants?.nativeAppVersion ?? null;
const buildVersion =
  expoConstants?.nativeBuildVersion ??
  (platformOS === 'ios'
    ? (expoConstants?.expoConfig?.ios?.buildNumber ?? null)
    : (typeof expoConstants?.expoConfig?.android?.versionCode === 'number'
        ? String(expoConstants.expoConfig.android.versionCode)
        : null));

function readPlatformOS(): string {
  return Platform?.OS ?? 'unknown';
}

function readExpoConstants(): ExpoConstants | null {
  if (process.env.NODE_ENV === 'test' && Platform?.OS === undefined) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const constantsModule = require('expo-constants') as { default?: ExpoConstants };
    return constantsModule.default ?? (constantsModule as ExpoConstants);
  } catch {
    return null;
  }
}

export function setProductAnalyticsAnonymousId(anonymousId: string): void {
  const normalizedAnonymousId = anonymousId.trim();
  if (!normalizedAnonymousId) {
    return;
  }

  currentAnonymousId = normalizedAnonymousId;
  setObservabilityContext({
    anonymousId: currentAnonymousId,
  });
}

export function resolveProductAnalyticsUserKey(user: AuthUser): string {
  const record = user as AuthUser & {
    analyticsId?: string;
    analyticsKey?: string;
    userAnalyticsKey?: string;
  };
  const backendProvidedKey =
    record.analyticsId?.trim() || record.analyticsKey?.trim() || record.userAnalyticsKey?.trim();

  if (backendProvidedKey) {
    return backendProvidedKey;
  }

  return `usr_${hashString(`yummy-recs-mobile:${user.id}`)}`;
}

export function identifyProductAnalyticsUser(user: AuthUser): void {
  const userKey = resolveProductAnalyticsUserKey(user);
  const userTier = resolveUserTier(user);

  currentUserKey = userKey;
  currentAuthStatus = 'authenticated';
  currentUserTier = userTier;
  setObservabilityContext({
    userKey,
  });

  if (lastIdentifiedUserKey === userKey) {
    return;
  }

  lastIdentifiedUserKey = userKey;
  identifyObservabilityUser(userKey, {
    appEnvironment: env.environment,
    isAdmin: user.isAdmin === true,
    isBetaUser: user.isBetaUser === true,
    isSubscriber: user.isSubscriber === true,
    userTier,
    verified: user.verified,
  });
}

export function clearProductAnalyticsUser(): void {
  currentUserKey = undefined;
  currentAuthStatus = 'unauthenticated';
  currentUserTier = null;
  lastIdentifiedUserKey = null;
  setObservabilityContext({
    userKey: undefined,
  });
}

export function setProductAnalyticsAuthContext(input: {
  authStatus: string;
  userTier: UserTier;
}): void {
  currentAuthStatus = input.authStatus;
  currentUserTier = input.userTier;
}

export function trackProductEvent(
  eventName: AnalyticsEventName,
  properties: ProductAnalyticsProperties = {},
): void {
  trackObservabilityEvent(eventName, {
    ...buildAnalyticsContext(),
    ...properties,
  });
}

export function trackFirstFoodLogged(properties: TrackingEntryProperties): void {
  if (hasTrackedFirstFoodLogged) {
    return;
  }

  void trackFirstFoodLoggedOnce(properties);
}

export function buildAnalyticsContext(): AnalyticsContext {
  return {
    anonymousId: currentAnonymousId,
    ...(currentUserKey ? { userKey: currentUserKey } : {}),
    appVersion,
    buildVersion,
    platform: readPlatformOS(),
    environment: env.environment,
    authStatus: currentAuthStatus,
    userTier: currentUserTier,
  };
}

function resolveUserTier(user: AuthUser | null): UserTier {
  if (!user) {
    return null;
  }

  if (user.isAdmin) {
    return 'admin';
  }

  if (user.isSubscriber) {
    return 'subscriber';
  }

  return 'free';
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

async function trackFirstFoodLoggedOnce(properties: TrackingEntryProperties): Promise<void> {
  try {
    const existingValue = await AsyncStorage.getItem(FIRST_FOOD_LOGGED_KEY);
    if (existingValue === '1') {
      hasTrackedFirstFoodLogged = true;
      return;
    }

    hasTrackedFirstFoodLogged = true;
    await AsyncStorage.setItem(FIRST_FOOD_LOGGED_KEY, '1');
    trackProductEvent('activation.first_food_logged', properties);
  } catch {
    hasTrackedFirstFoodLogged = true;
    trackProductEvent('activation.first_food_logged', properties);
  }
}
