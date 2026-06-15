import { ClientResponseError } from 'pocketbase';

import type { EventProperties } from './index';

interface SafeTelemetryErrorInput {
  error?: unknown;
  retryable?: boolean | null;
  sourceOperation?: string | null;
  statusCode?: number | null;
  unsafeErrorMessage?: string | null;
}

export function buildSafeTelemetryErrorProperties(
  input: SafeTelemetryErrorInput | unknown,
): EventProperties {
  const normalizedInput = isSafeTelemetryErrorInput(input) ? input : { error: input };
  const statusCode = resolveStatusCode(normalizedInput);
  const errorType = resolveErrorType(normalizedInput.error);
  const hasRawMessage = hasUnsafeErrorMessage(normalizedInput);

  return compactTelemetryErrorProperties({
    errorCategory: resolveErrorCategory({
      error: normalizedInput.error,
      statusCode,
    }),
    errorMessage: resolveSafeErrorMessage({
      error: normalizedInput.error,
      errorType,
      statusCode,
    }),
    errorMessageRedacted: hasRawMessage,
    errorType,
    isAbort: isAbortError(normalizedInput.error),
    retryable: typeof normalizedInput.retryable === 'boolean' ? normalizedInput.retryable : undefined,
    sourceOperation: normalizedInput.sourceOperation ?? undefined,
    statusCode,
  });
}

function isSafeTelemetryErrorInput(input: unknown): input is SafeTelemetryErrorInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    ('error' in input ||
      'retryable' in input ||
      'sourceOperation' in input ||
      'statusCode' in input ||
      'unsafeErrorMessage' in input)
  );
}

function resolveStatusCode(input: SafeTelemetryErrorInput): number | null {
  if (typeof input.statusCode === 'number' && Number.isFinite(input.statusCode)) {
    return input.statusCode;
  }

  if (input.error instanceof ClientResponseError) {
    return Number.isFinite(input.error.status) && input.error.status > 0 ? input.error.status : null;
  }

  return null;
}

function resolveErrorType(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (error instanceof ClientResponseError) {
    return 'ClientResponseError';
  }

  if (error instanceof Error) {
    return error.name || 'Error';
  }

  return 'unknown_error';
}

function resolveSafeErrorMessage(input: {
  error: unknown;
  errorType: string | null;
  statusCode: number | null;
}): string | null {
  if (input.statusCode !== null) {
    return `HTTP ${input.statusCode}`;
  }

  if (isAbortError(input.error)) {
    return 'Request aborted';
  }

  return input.errorType;
}

function resolveErrorCategory(input: {
  error: unknown;
  statusCode: number | null;
}): string {
  if (isAbortError(input.error)) {
    return 'request_aborted';
  }

  if (input.statusCode !== null) {
    return 'http_error';
  }

  if (input.error instanceof ClientResponseError) {
    return 'transport_error';
  }

  if (input.error instanceof Error) {
    return 'error';
  }

  return 'unknown_error';
}

function hasUnsafeErrorMessage(input: SafeTelemetryErrorInput): boolean {
  if (typeof input.unsafeErrorMessage === 'string' && input.unsafeErrorMessage.trim().length > 0) {
    return true;
  }

  const error = input.error;

  if (error instanceof ClientResponseError) {
    const responseMessage = error.response?.message;
    return (
      (typeof responseMessage === 'string' && responseMessage.trim().length > 0) ||
      error.message.trim().length > 0
    );
  }

  if (error instanceof Error) {
    return error.message.trim().length > 0;
  }

  return typeof error === 'string' && error.trim().length > 0;
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

function compactTelemetryErrorProperties(
  properties: Record<string, string | number | boolean | null | undefined>,
): EventProperties {
  const compacted: EventProperties = {};

  Object.entries(properties).forEach(([key, value]) => {
    if (value !== undefined) {
      compacted[key] = value;
    }
  });

  return compacted;
}
