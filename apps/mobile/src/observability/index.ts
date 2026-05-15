import { PostHog } from 'posthog-react-native';
import { Platform } from 'react-native';

import { env } from '../config/env';
import { logger } from '../lib/logger';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type EventProperties = Record<string, JsonValue>;
type ContextPropertiesInput = Record<string, JsonValue | undefined>;
type ExpoConstants = typeof import('expo-constants')['default'];
export type WebPageAnalyticsProperties = {
  durationMs?: number;
  nextScreenName?: string | null;
  previousScreenName?: string | null;
  reason?: 'navigation' | 'app_background' | null;
  screenName: string;
};

let initialized = false;
let posthogClient: PostHog | null = null;
let contextProperties: EventProperties = {};
const warnedRedactionKeys = new Set<string>();
const expoConstants = readExpoConstants();
const platformOS = readPlatformOS();

const staticEventProperties: EventProperties = {
  appEnvironment: __DEV__ ? 'development' : 'production',
  appVersion: expoConstants?.expoConfig?.version ?? expoConstants?.nativeAppVersion ?? null,
  buildVersion:
    expoConstants?.nativeBuildVersion ??
    (platformOS === 'ios'
      ? (expoConstants?.expoConfig?.ios?.buildNumber ?? null)
      : (typeof expoConstants?.expoConfig?.android?.versionCode === 'number'
          ? String(expoConstants.expoConfig.android.versionCode)
          : null)),
  executionEnvironment: expoConstants?.executionEnvironment ?? null,
  platform: platformOS,
};

export function initializeObservability(): void {
  if (initialized) {
    return;
  }

  if (env.posthogApiKey) {
    posthogClient = new PostHog(env.posthogApiKey, {
      host: env.posthogHost,
      errorTracking: {
        autocapture: {
          uncaughtExceptions: true,
          unhandledRejections: true,
          console: ['error'],
        },
      },
    });
  } else {
    logger.log('[Observability] PostHog disabled (missing EXPO_PUBLIC_POSTHOG_API_KEY)');
  }

  initialized = true;
}

export function resetObservabilityIdentity(): void {
  if (!initialized) {
    return;
  }

  posthogClient?.reset();
}

export function identifyObservabilityUser(userKey: string, traits?: EventProperties): void {
  if (!initialized) {
    return;
  }

  const { redactedKeys, sanitized } = sanitizeEventProperties(traits);
  if (__DEV__ && redactedKeys.length > 0) {
    warnOnRedactedEventProperties('OBSERVABILITY_USER_IDENTIFIED', redactedKeys);
  }

  posthogClient?.identify(userKey, sanitized);
}

export function setObservabilityContext(properties: ContextPropertiesInput): void {
  const nextContext: EventProperties = { ...contextProperties };

  Object.entries(properties).forEach(([key, value]) => {
    if (value === undefined) {
      delete nextContext[key];
      return;
    }

    const sanitizedValue = sanitizeJsonValue(value);
    if (sanitizedValue === undefined) {
      delete nextContext[key];
      return;
    }

    nextContext[key] = sanitizedValue;
  });

  contextProperties = nextContext;
}

export function trackObservabilityEvent(eventName: string, properties?: EventProperties): void {
  if (!initialized) {
    return;
  }

  const { redactedKeys, sanitized } = sanitizeEventProperties(properties);
  if (__DEV__ && redactedKeys.length > 0) {
    warnOnRedactedEventProperties(eventName, redactedKeys);
  }

  posthogClient?.capture(eventName, {
    ...staticEventProperties,
    ...contextProperties,
    ...sanitized,
  });
}

export function trackWebPageView(properties: WebPageAnalyticsProperties): void {
  if (!canCaptureWebPageAnalytics()) {
    return;
  }

  posthogClient?.capture('$pageview', buildWebPageAnalyticsProperties(properties));
}

export function trackWebPageLeave(properties: WebPageAnalyticsProperties): void {
  if (!canCaptureWebPageAnalytics()) {
    return;
  }

  posthogClient?.capture('$pageleave', buildWebPageAnalyticsProperties(properties));
}

export function captureObservabilityError(error: unknown, properties?: EventProperties): void {
  if (!initialized) {
    return;
  }

  const { redactedKeys, sanitized } = sanitizeEventProperties(properties);
  if (__DEV__ && redactedKeys.length > 0) {
    warnOnRedactedEventProperties('OBSERVABILITY_ERROR_CAPTURED', redactedKeys);
  }

  if (posthogClient) {
    posthogClient.captureException(error, {
      ...staticEventProperties,
      ...contextProperties,
      ...sanitized,
      source: 'capture_observability_error',
    });
    return;
  }

  trackObservabilityEvent('OBSERVABILITY_ERROR_CAPTURED', {
    errorMessage: error instanceof Error ? error.message : String(error),
    errorType: error instanceof Error ? error.name : 'unknown_error',
    ...sanitized,
  });
}

function canCaptureWebPageAnalytics(): boolean {
  return initialized && posthogClient !== null && readPlatformOS() === 'web' && typeof window !== 'undefined';
}

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

function buildWebPageAnalyticsProperties(properties: WebPageAnalyticsProperties): EventProperties {
  const location = window.location;
  const currentUrl = `${location.origin}${location.pathname}`;
  const referrer = typeof document !== 'undefined' && document.referrer ? document.referrer : null;

  return {
    ...staticEventProperties,
    $current_url: currentUrl,
    $host: location.host,
    $pathname: location.pathname,
    $referrer: referrer,
    durationMs: properties.durationMs ?? null,
    nextScreenName: properties.nextScreenName ?? null,
    previousScreenName: properties.previousScreenName ?? null,
    reason: properties.reason ?? null,
    screenName: properties.screenName,
  };
}

function sanitizeEventProperties(
  properties?: EventProperties,
): { sanitized: EventProperties; redactedKeys: string[] } {
  if (!properties) {
    return {
      sanitized: {},
      redactedKeys: [],
    };
  }

  const sanitized: EventProperties = {};
  const redactedKeys: string[] = [];

  Object.entries(properties).forEach(([key, value]) => {
    if (shouldRedactObservabilityKey(key)) {
      redactedKeys.push(key);
      return;
    }

    const sanitizedValue = sanitizeJsonValue(value, redactedKeys, key);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }
  });

  return {
    sanitized,
    redactedKeys,
  };
}

function warnOnRedactedEventProperties(eventName: string, redactedKeys: string[]): void {
  const sortedKeys = [...redactedKeys].sort();
  const warningKey = `${eventName}::${sortedKeys.join(',')}`;
  if (warnedRedactionKeys.has(warningKey)) {
    return;
  }

  warnedRedactionKeys.add(warningKey);
  logger.warn('[Observability] Redacted event properties before PostHog capture.', {
    eventName,
    redactedKeys: sortedKeys,
  });
}

function shouldRedactObservabilityKey(key: string): boolean {
  const normalizedKey = key.trim().toLowerCase();

  if (normalizedKey === 'anonymousid') {
    return false;
  }

  return (
    normalizedKey === 'email' ||
    normalizedKey === 'name' ||
    normalizedKey === 'query' ||
    normalizedKey === 'location' ||
    normalizedKey === 'searchtext' ||
    normalizedKey === 'searchquery' ||
    normalizedKey === 'notes' ||
    normalizedKey === 'note' ||
    normalizedKey === 'freetext' ||
    normalizedKey === 'restaurantname' ||
    normalizedKey === 'itemname' ||
    normalizedKey === 'foodname' ||
    normalizedKey === 'friendname' ||
    normalizedKey === 'username' ||
    normalizedKey === 'placename' ||
    normalizedKey === 'placeid' ||
    normalizedKey === 'latitude' ||
    normalizedKey === 'longitude' ||
    normalizedKey === 'lat' ||
    normalizedKey === 'lng' ||
    normalizedKey.endsWith('id')
  );
}

function sanitizeJsonValue(
  value: JsonValue,
  redactedKeys?: string[],
  path?: string,
): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    const nextArray = value
      .map((item) => sanitizeJsonValue(item, redactedKeys, path))
      .filter((item): item is JsonValue => item !== undefined);
    return nextArray;
  }

  if (typeof value === 'object') {
    const nextObject: Record<string, JsonValue> = {};
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (shouldRedactObservabilityKey(key)) {
        redactedKeys?.push(nextPath);
        return;
      }

      const sanitizedItem = sanitizeJsonValue(item, redactedKeys, nextPath);
      if (sanitizedItem !== undefined) {
        nextObject[key] = sanitizedItem;
      }
    });
    return nextObject;
  }

  return undefined;
}
