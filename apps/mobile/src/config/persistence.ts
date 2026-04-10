import { env } from './env';

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getEnvironmentStorageKey(baseKey: string): string {
  return `${baseKey}.${env.environment}`;
}

export function getEnvironmentDatabaseName(baseName: string): string {
  const lastDotIndex = baseName.lastIndexOf('.');
  if (lastDotIndex <= 0) {
    return `${baseName}.${env.environment}`;
  }

  return `${baseName.slice(0, lastDotIndex)}.${env.environment}${baseName.slice(lastDotIndex)}`;
}

export function isCurrentBackendUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  return trimTrailingSlashes(url) === trimTrailingSlashes(env.pocketbaseUrl);
}
