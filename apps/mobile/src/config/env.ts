const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8090';

export interface MobileEnv {
  apiBaseUrl: string;
  pocketbaseUrl: string;
  posthogApiKey: string;
  posthogHost: string;
  sentryDsn: string;
  sentryTracesSampleRate: number;
}

type EnvSource = Record<string, string | undefined>;

function getRuntimeEnv(): EnvSource {
  const maybeProcess = globalThis as { process?: { env?: EnvSource } };
  return maybeProcess.process?.env ?? {};
}

export function loadMobileEnv(source?: EnvSource): MobileEnv {
  const resolvedSource = source ?? getRuntimeEnv();

  const apiBaseUrl = resolvedSource.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const pocketbaseUrl = resolvedSource.EXPO_PUBLIC_POCKETBASE_URL ?? apiBaseUrl;

  const tracesRateValue = Number(resolvedSource.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.2');
  const sentryTracesSampleRate = Number.isFinite(tracesRateValue)
    ? tracesRateValue
    : 0.2;

  return {
    apiBaseUrl,
    pocketbaseUrl,
    posthogApiKey: resolvedSource.EXPO_PUBLIC_POSTHOG_API_KEY ?? '',
    posthogHost: resolvedSource.EXPO_PUBLIC_POSTHOG_HOST ?? `${apiBaseUrl}/api/visit-insights`,
    sentryDsn: resolvedSource.EXPO_PUBLIC_SENTRY_DSN ?? '',
    sentryTracesSampleRate,
  };
}

export const env = loadMobileEnv();
