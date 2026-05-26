import { ClientResponseError } from 'pocketbase';

import type { EventProperties } from '../../observability';

export function createAIRequestCorrelation(prefix: 'menu-scan' | 'receipt-scan' | 'storefront'): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `mobile-${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function resolveAIImageErrorProperties(error: unknown): EventProperties {
  if (error instanceof ClientResponseError) {
    return {
      errorMessage:
        typeof error.response?.message === 'string' && error.response.message.trim()
          ? error.response.message
          : error.message,
      errorType: 'ClientResponseError',
      statusCode: Number.isFinite(error.status) && error.status > 0 ? error.status : null,
    };
  }

  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorType: error.name,
      statusCode: null,
    };
  }

  return {
    errorMessage: String(error),
    errorType: 'unknown_error',
    statusCode: null,
  };
}
