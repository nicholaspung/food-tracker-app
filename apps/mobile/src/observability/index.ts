import Constants from 'expo-constants';
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

let initialized = false;
let posthogClient: PostHog | null = null;
let contextProperties: EventProperties = {};
const warnedRedactionKeys = new Set<string>();

const staticEventProperties: EventProperties = {
  appEnvironment: __DEV__ ? 'development' : 'production',
  appVersion: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null,
  buildVersion:
    Constants.nativeBuildVersion ??
    (Platform.OS === 'ios'
      ? (Constants.expoConfig?.ios?.buildNumber ?? null)
      : (typeof Constants.expoConfig?.android?.versionCode === 'number'
          ? String(Constants.expoConfig.android.versionCode)
          : null)),
  executionEnvironment: Constants.executionEnvironment ?? null,
  platform: Platform.OS,
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

    const sanitizedValue = sanitizeJsonValue(value);
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

  return (
    normalizedKey === 'email' ||
    normalizedKey === 'name' ||
    normalizedKey === 'query' ||
    normalizedKey === 'location' ||
    normalizedKey.endsWith('id')
  );
}

function sanitizeJsonValue(value: JsonValue): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    const nextArray = value
      .map((item) => sanitizeJsonValue(item))
      .filter((item): item is JsonValue => item !== undefined);
    return nextArray;
  }

  if (typeof value === 'object') {
    const nextObject: Record<string, JsonValue> = {};
    Object.entries(value).forEach(([key, item]) => {
      const sanitizedItem = sanitizeJsonValue(item);
      if (sanitizedItem !== undefined) {
        nextObject[key] = sanitizedItem;
      }
    });
    return nextObject;
  }

  return undefined;
}
