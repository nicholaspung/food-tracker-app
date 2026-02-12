const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 1000 * 60;

export function computeRetryDelayMs(attemptCount: number): number {
  const boundedAttempt = Math.max(1, attemptCount);
  const exponentialDelay = BASE_DELAY_MS * 2 ** (boundedAttempt - 1);
  const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_MS);
  const jitter = Math.floor(Math.random() * 250);
  return cappedDelay + jitter;
}

export function isConflictStatus(statusCode: number): boolean {
  return statusCode === 409 || statusCode === 412;
}

export function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}
