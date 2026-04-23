import { ClientResponseError } from 'pocketbase';

import { replayFeatureOutboxMutation } from '../features/store/featureOutboxOperations';
import { logger } from '../lib/logger';
import { isConflictStatus, isRetryableStatus } from './retryPolicy';
import type {
  MutationSendResult,
  MutationTransport,
  MutationTransportSendOptions,
  QueuedMutation,
} from './types';

const DEFAULT_ERROR_MESSAGE = 'Request failed.';
const MAX_ERROR_MESSAGE_LENGTH = 180;

interface CreateFetchMutationTransportOptions {
  cancelPendingRequests?: () => void;
  fetchImplementation?: typeof fetch;
  getAuthToken?: () => string | null;
}

export function createFetchMutationTransport(
  options: CreateFetchMutationTransportOptions = {},
): MutationTransport {
  return {
    cancelPendingRequests: options.cancelPendingRequests,
    send: async (
      mutation: QueuedMutation,
      sendOptions?: MutationTransportSendOptions,
    ): Promise<MutationSendResult> => {
      const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
      const signal = sendOptions?.signal;

      if (signal?.aborted) {
        return createCancelledSendResult();
      }

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
        const localResult = await trySendLocalFeatureMutation(mutation, signal);
        if (localResult) {
          return localResult;
        }

        const response = await fetchImplementation(mutation.url, {
          method: mutation.method,
          headers,
          body: mutation.body,
          signal,
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
        if (isAbortError(error) || signal?.aborted) {
          return createCancelledSendResult();
        }

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

async function trySendLocalFeatureMutation(
  mutation: QueuedMutation,
  signal?: AbortSignal,
): Promise<MutationSendResult | null> {
  const isLocalFeatureMutation = mutation.url.startsWith('local://feature/');
  if (!isLocalFeatureMutation) {
    return null;
  }

  if (signal?.aborted) {
    return createCancelledSendResult();
  }

  try {
    const wasHandled = await replayFeatureOutboxMutation(mutation);
    if (!wasHandled) {
      return {
        ok: false,
        retryable: false,
        statusCode: null,
        errorMessage: 'Unknown local feature mutation.',
      };
    }

    return {
      ok: true,
      retryable: false,
      statusCode: 200,
      errorMessage: null,
    };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      return createCancelledSendResult();
    }

    if (error instanceof ClientResponseError) {
      const statusCode = Number.isFinite(error.status) && error.status > 0 ? error.status : null;
      return {
        ok: false,
        retryable: statusCode === null ? true : isRetryableStatus(statusCode),
        statusCode,
        errorMessage: error.message,
      };
    }

    return {
      ok: false,
      retryable: true,
      statusCode: null,
      errorMessage: error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE,
    };
  }
}

function createCancelledSendResult(): MutationSendResult {
  return {
    ok: false,
    retryable: false,
    statusCode: null,
    errorMessage: null,
    cancelled: true,
  };
}

function isAbortError(error: unknown): boolean {
  if (error instanceof ClientResponseError) {
    return error.isAbort;
  }

  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message === 'Aborted';
  }

  return false;
}
