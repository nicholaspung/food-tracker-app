import { logger } from '../lib/logger';
import { isConflictStatus, isRetryableStatus } from './retryPolicy';
import type { MutationSendResult, MutationTransport, QueuedMutation } from './types';

const DEFAULT_ERROR_MESSAGE = 'Request failed.';
const MAX_ERROR_MESSAGE_LENGTH = 180;

interface CreateFetchMutationTransportOptions {
  fetchImplementation?: typeof fetch;
  getAuthToken?: () => string | null;
}

export function createFetchMutationTransport(
  options: CreateFetchMutationTransportOptions = {},
): MutationTransport {
  return {
    send: async (mutation: QueuedMutation): Promise<MutationSendResult> => {
      const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;

      if (!fetchImplementation) {
        return {
          ok: false,
          retryable: true,
          statusCode: null,
          errorMessage: 'Fetch API is unavailable.',
        };
      }

      const headers = normalizeHeaders(mutation.headers);
      headers['Idempotency-Key'] = mutation.idempotencyKey;
      headers['X-Idempotency-Key'] = mutation.idempotencyKey;

      const authToken = options.getAuthToken?.();
      if (authToken && !hasHeader(headers, 'Authorization')) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      if (mutation.body && !hasHeader(headers, 'Content-Type')) {
        headers['Content-Type'] = 'application/json';
      }

      try {
        const response = await fetchImplementation(mutation.url, {
          method: mutation.method,
          headers,
          body: mutation.body,
        });

        if (response.ok) {
          return {
            ok: true,
            retryable: false,
            statusCode: response.status,
            errorMessage: null,
          };
        }

        const statusCode = response.status;
        const responseText = await safeReadText(response);

        if (isConflictStatus(statusCode)) {
          return {
            ok: false,
            retryable: false,
            statusCode,
            errorMessage: `Conflict detected (${statusCode}). Manual resolution required before retry.`,
          };
        }

        return {
          ok: false,
          retryable: isRetryableStatus(statusCode),
          statusCode,
          errorMessage: createErrorMessage(statusCode, responseText),
        };
      } catch (error) {
        logger.warn('[OfflineSync] Request threw network error:', error);
        return {
          ok: false,
          retryable: true,
          statusCode: null,
          errorMessage: error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE,
        };
      }
    },
  };
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  return { ...headers };
}

function hasHeader(headers: Record<string, string>, targetHeader: string): boolean {
  const lowerTarget = targetHeader.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lowerTarget);
}

function createErrorMessage(statusCode: number, responseText: string): string {
  const normalizedText = responseText.replace(/\s+/g, ' ').trim();
  if (!normalizedText) {
    return `HTTP ${statusCode}`;
  }

  return `HTTP ${statusCode}: ${normalizedText.slice(0, MAX_ERROR_MESSAGE_LENGTH)}`;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
