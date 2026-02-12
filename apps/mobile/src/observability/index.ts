import * as Sentry from '@sentry/react-native';
import { PostHog } from 'posthog-react-native';

import { env } from '../config/env';
import { logger } from '../lib/logger';
import type { AuthUser } from '../types/auth';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type EventProperties = Record<string, JsonValue>;

let initialized = false;
let posthogClient: PostHog | null = null;

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

export function trackObservabilityEvent(eventName: string, properties?: EventProperties): void {
  if (!initialized) {
    return;
  }

  posthogClient?.capture(eventName, properties);
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
