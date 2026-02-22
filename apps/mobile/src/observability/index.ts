import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { PostHog } from 'posthog-react-native';
import { Platform } from 'react-native';

import { env } from '../config/env';
import { logger } from '../lib/logger';
import type { AuthUser } from '../types/auth';
export { MOBILE_RETENTION_DASHBOARD_SCHEMA } from './retentionDashboardSchema';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type EventProperties = Record<string, JsonValue>;
type ContextPropertiesInput = Record<string, JsonValue | undefined>;

let initialized = false;
let posthogClient: PostHog | null = null;
let contextProperties: EventProperties = {};

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

  if (env.sentryDsn) {
    Sentry.init({
      dsn: env.sentryDsn,
      tracesSampleRate: env.sentryTracesSampleRate,
    });
  } else {
    logger.log('[Observability] Sentry disabled (missing EXPO_PUBLIC_SENTRY_DSN)');
  }

  if (env.posthogApiKey) {
    posthogClient = new PostHog(env.posthogApiKey, {
      host: env.posthogHost,
    });
  } else {
    logger.log('[Observability] PostHog disabled (missing EXPO_PUBLIC_POSTHOG_API_KEY)');
  }

  initialized = true;
}

export function identifyObservabilityUser(user: AuthUser): void {
  if (!initialized) {
    return;
  }

  if (env.sentryDsn) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
    });
  }

  posthogClient?.identify(user.id, {
    isAdmin: Boolean(user.isAdmin),
    isSubscriber: Boolean(user.isSubscriber),
  });
}

export function clearObservabilityUser(): void {
  if (!initialized) {
    return;
  }

  if (env.sentryDsn) {
    Sentry.setUser(null);
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

  posthogClient?.capture(eventName, {
    ...staticEventProperties,
    ...contextProperties,
    ...sanitizeEventProperties(properties),
  });
}

export function captureObservabilityError(error: unknown): void {
  if (!initialized) {
    return;
  }

  if (error instanceof Error) {
    Sentry.captureException(error);
    return;
  }

  Sentry.captureMessage(String(error));
}

function sanitizeEventProperties(properties?: EventProperties): EventProperties {
  if (!properties) {
    return {};
  }

  const sanitized: EventProperties = {};

  Object.entries(properties).forEach(([key, value]) => {
    const sanitizedValue = sanitizeJsonValue(value);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }
  });

  return sanitized;
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
