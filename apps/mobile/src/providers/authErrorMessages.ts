import { ClientResponseError } from 'pocketbase';

import { env } from '../config/env';
import type { AppEnvironment } from '../config/envUtils';
import { pb } from '../lib/pocketbase';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractPocketBaseResponseMessage(error: ClientResponseError): string | null {
  if (!isRecord(error.response)) {
    return null;
  }

  if (typeof error.response.message === 'string' && error.response.message.trim()) {
    return error.response.message.trim();
  }

  if (isRecord(error.response.data)) {
    for (const value of Object.values(error.response.data)) {
      if (!isRecord(value)) {
        continue;
      }

      if (typeof value.message === 'string' && value.message.trim()) {
        return value.message.trim();
      }
    }
  }

  return null;
}

function isInvalidCredentialError(error: ClientResponseError): boolean {
  if (error.status !== 400) {
    return false;
  }

  const responseMessage = extractPocketBaseResponseMessage(error);
  if (responseMessage && /authenticate|invalid|password|identity/i.test(responseMessage)) {
    return true;
  }

  if (!isRecord(error.response) || !isRecord(error.response.data)) {
    return false;
  }

  for (const value of Object.values(error.response.data)) {
    if (!isRecord(value)) {
      continue;
    }

    if (typeof value.code === 'string' && /invalid/i.test(value.code)) {
      return true;
    }
  }

  return false;
}

interface AuthErrorVisibilityOptions {
  environment?: AppEnvironment;
  isAdmin?: boolean;
  isDevBuild?: boolean;
}

interface AuthErrorMessageOptions extends AuthErrorVisibilityOptions {
  backendUrl?: string;
}

export function shouldShowDetailedAuthDiagnostics(
  options: AuthErrorVisibilityOptions = {},
): boolean {
  const environment = options.environment ?? env.environment;
  const isDevBuild = options.isDevBuild ?? __DEV__;

  return isDevBuild || environment !== 'production' || options.isAdmin === true;
}

function formatDetailedAuthDiagnostics(error: unknown, backendUrl: string): string {
  const isBetaBackend = /beta/i.test(backendUrl);

  if (error instanceof ClientResponseError) {
    const responseMessage = extractPocketBaseResponseMessage(error);

    if (isInvalidCredentialError(error)) {
      return [
        'Invalid email or password for this backend.',
        isBetaBackend
          ? 'Preview uses the beta database, so production accounts do not automatically work here.'
          : null,
        `Backend: ${backendUrl}`,
        `HTTP status: ${error.status}`,
        responseMessage ? `Server message: ${responseMessage}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (error.status === 0) {
      return [
        'Could not reach the sign-in server.',
        'This usually means the app cannot connect to the configured backend URL.',
        `Backend: ${backendUrl}`,
        responseMessage ? `Network detail: ${responseMessage}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (error.status === 404) {
      return [
        'The sign-in endpoint was not found on the configured backend.',
        'This usually means the preview build is pointed at the wrong host or the proxy is misconfigured.',
        `Backend: ${backendUrl}`,
        `HTTP status: ${error.status}`,
        responseMessage ? `Server message: ${responseMessage}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (error.status >= 500) {
      return [
        'The backend failed while processing sign-in.',
        `Backend: ${backendUrl}`,
        `HTTP status: ${error.status}`,
        responseMessage ? `Server message: ${responseMessage}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      'Sign-in request was rejected by the backend.',
      `Backend: ${backendUrl}`,
      `HTTP status: ${error.status}`,
      responseMessage ? `Server message: ${responseMessage}` : null,
      error.message && error.message !== responseMessage ? `Client message: ${error.message}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (error instanceof TypeError && /network|fetch|load failed/i.test(error.message)) {
    return [
      'Could not reach the sign-in server.',
      'Check internet access and confirm the preview backend is online.',
      `Backend: ${backendUrl}`,
      `Network detail: ${error.message}`,
    ].join('\n');
  }

  if (error instanceof Error) {
    return [
      'Sign-in failed before the session could be created.',
      `Backend: ${backendUrl}`,
      `Error detail: ${error.message}`,
    ].join('\n');
  }

  return ['Sign-in failed for an unknown reason.', `Backend: ${backendUrl}`].join('\n');
}

function formatGenericAuthErrorMessage(error: unknown): string {
  if (error instanceof ClientResponseError) {
    if (isInvalidCredentialError(error)) {
      return 'Invalid email or password. Please try again.';
    }

    if (error.status === 0) {
      return 'Unable to reach the sign-in server. Check your connection and try again.';
    }

    return 'Unable to sign in right now. Please try again.';
  }

  if (error instanceof TypeError && /network|fetch|load failed/i.test(error.message)) {
    return 'Unable to reach the sign-in server. Check your connection and try again.';
  }

  return 'Unable to sign in right now. Please try again.';
}

export function formatAuthErrorMessage(
  error: unknown,
  options: AuthErrorMessageOptions = {},
): string {
  const includeDiagnostics = shouldShowDetailedAuthDiagnostics(options);

  if (!includeDiagnostics) {
    return formatGenericAuthErrorMessage(error);
  }

  return formatDetailedAuthDiagnostics(error, options.backendUrl ?? pb.baseUrl);
}

export function buildAuthErrorObservabilityProperties(
  error: unknown,
): Record<string, string | number | boolean | null> {
  const responseMessage =
    error instanceof ClientResponseError ? extractPocketBaseResponseMessage(error) : null;

  return {
    authErrorCategory:
      error instanceof ClientResponseError
        ? isInvalidCredentialError(error)
          ? 'invalid_credentials'
          : error.status === 0
            ? 'network_unreachable'
            : error.status >= 500
              ? 'server_error'
              : 'request_rejected'
        : error instanceof TypeError && /network|fetch|load failed/i.test(error.message)
          ? 'network_unreachable'
          : error instanceof Error
            ? 'client_error'
            : 'unknown_error',
    backendUrl: pb.baseUrl,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorName: error instanceof Error ? error.name : 'unknown_error',
    errorStatus: error instanceof ClientResponseError ? error.status : null,
    responseMessage,
  };
}
