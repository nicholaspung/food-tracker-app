import { logger } from '../../lib/logger';
import { trackObservabilityEvent } from '../../observability';

export type AuthenticatedLocalStateResetReason = 'auth_change' | 'logout';

export interface AuthenticatedLocalStateReset {
  reset: (reason: AuthenticatedLocalStateResetReason) => Promise<void>;
}

interface AuthenticatedLocalStateResetDependencies {
  clearMemoryCache: () => void;
  clearPersistedCache: () => Promise<void>;
  discardQueuedMutations: (reason: AuthenticatedLocalStateResetReason) => Promise<unknown>;
  isActive?: () => boolean;
  waitUntilSafe?: () => Promise<void>;
}

export function createAuthenticatedLocalStateReset({
  clearMemoryCache,
  clearPersistedCache,
  discardQueuedMutations,
  isActive = () => true,
  waitUntilSafe,
}: AuthenticatedLocalStateResetDependencies): AuthenticatedLocalStateReset {
  let isResetting = false;

  return {
    async reset(reason) {
      if (isResetting) {
        return;
      }

      isResetting = true;
      try {
        await waitUntilSafe?.();
        if (!isActive()) {
          return;
        }

        const cleanupErrors: unknown[] = [];
        const runCleanup = async (cleanup: () => void | Promise<unknown>) => {
          try {
            await cleanup();
          } catch (error) {
            cleanupErrors.push(error);
          }
        };

        await runCleanup(clearMemoryCache);
        await runCleanup(clearPersistedCache);
        await runCleanup(() => discardQueuedMutations(reason));

        if (cleanupErrors.length > 0) {
          const [firstError] = cleanupErrors;
          logger.warn('[AuthenticatedLocalStateReset] Failed to reset authenticated local state:', firstError);
          trackObservabilityEvent('AUTH_LOCAL_STATE_RESET_FAILED', {
            cleanupErrorCount: cleanupErrors.length,
            errorMessage: firstError instanceof Error ? firstError.message : String(firstError),
            errorType: firstError instanceof Error ? firstError.name : 'unknown_error',
            reason,
            source: 'AuthProvider',
          });
        }
      } finally {
        isResetting = false;
      }
    },
  };
}
