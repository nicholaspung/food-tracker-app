import { env } from '../config/env';
import { logger } from './logger';

type StartupMilestone =
  | 'APP_MODULE_EVALUATED'
  | 'APP_RENDER_STARTED'
  | 'APP_ROOT_LAYOUT'
  | 'APP_PROVIDERS_MOUNTED'
  | 'QUERY_RESTORE_STARTED'
  | 'QUERY_RESTORE_READY'
  | 'AUTH_BOOTSTRAP_STARTED'
  | 'AUTH_BOOTSTRAP_FINISHED'
  | 'APP_SHELL_LAYOUT'
  | 'ROOT_NAVIGATOR_RENDERED';

type StartupProperties = Record<string, string | number | boolean | null | undefined>;

const loggedMilestones = new Set<StartupMilestone>();

export function trackStartupMilestone(
  milestone: StartupMilestone,
  properties: StartupProperties = {},
): void {
  if (loggedMilestones.has(milestone)) {
    return;
  }

  loggedMilestones.add(milestone);
  const log = typeof logger.log === 'function' ? logger.log : logger.warn;
  log('[StartupDiagnostics]', milestone, {
    ...buildStartupDiagnosticsContext(),
    ...properties,
  });
}

function buildStartupDiagnosticsContext(): StartupProperties {
  const expoRuntime = readExpoRuntimeDiagnostics();

  return {
    apiBaseUrl: env.apiBaseUrl,
    appEnvironment: env.environment,
    appVariant: process.env.APP_VARIANT ?? null,
    channel: expoRuntime.channel,
    isEmbeddedLaunch: expoRuntime.isEmbeddedLaunch,
    isUpdatesEnabled: expoRuntime.isUpdatesEnabled,
    pocketbaseUrl: env.pocketbaseUrl,
    runtimeVersion: expoRuntime.runtimeVersion,
    updateId: expoRuntime.updateId,
  };
}

function readExpoRuntimeDiagnostics(): StartupProperties {
  if (process.env.NODE_ENV === 'test') {
    return {
      channel: 'test',
      isEmbeddedLaunch: null,
      isUpdatesEnabled: null,
      runtimeVersion: null,
      updateId: 'test',
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants') as {
      default?: {
        expoConfig?: {
          runtimeVersion?: string | { policy?: string };
        };
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates') as {
      channel?: string | null;
      isEmbeddedLaunch?: boolean;
      isEnabled?: boolean;
      runtimeVersion?: string | null;
      updateId?: string | null;
    };
    const runtimeVersion = Updates.runtimeVersion ?? Constants.default?.expoConfig?.runtimeVersion ?? null;

    return {
      channel: Updates.channel ?? 'unknown',
      isEmbeddedLaunch: Updates.isEmbeddedLaunch ?? null,
      isUpdatesEnabled: Updates.isEnabled ?? null,
      runtimeVersion: typeof runtimeVersion === 'string' ? runtimeVersion : JSON.stringify(runtimeVersion),
      updateId: Updates.updateId ?? 'embedded',
    };
  } catch {
    return {
      channel: 'unavailable',
      isEmbeddedLaunch: null,
      isUpdatesEnabled: null,
      runtimeVersion: null,
      updateId: 'unavailable',
    };
  }
}
