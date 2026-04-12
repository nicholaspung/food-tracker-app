import { ClientResponseError } from 'pocketbase';

import {
  buildAuthErrorObservabilityProperties,
  formatAuthErrorMessage,
  shouldShowDetailedAuthDiagnostics,
} from '../providers/authErrorMessages';

jest.mock('../config/env', () => ({
  env: {
    environment: 'production',
  },
}));

jest.mock('../lib/pocketbase', () => ({
  pb: {
    baseUrl: 'https://app.yummyrecs.com',
  },
}));

function buildClientResponseError(input: {
  message?: string;
  responseData?: Record<string, unknown>;
  status: number;
}): ClientResponseError {
  return new ClientResponseError({
    response: {
      data: input.responseData,
      message: input.message,
    },
    status: input.status,
    url: 'https://app.yummyrecs.com/api/collections/users/auth-with-password',
  });
}

describe('shouldShowDetailedAuthDiagnostics', () => {
  it('hides detailed diagnostics in production release mode', () => {
    expect(
      shouldShowDetailedAuthDiagnostics({
        environment: 'production',
        isDevBuild: false,
      }),
    ).toBe(false);
  });

  it('keeps detailed diagnostics for beta builds', () => {
    expect(
      shouldShowDetailedAuthDiagnostics({
        environment: 'beta',
        isDevBuild: false,
      }),
    ).toBe(true);
  });

  it('keeps detailed diagnostics for production admin builds', () => {
    expect(
      shouldShowDetailedAuthDiagnostics({
        environment: 'production',
        isAdmin: true,
        isDevBuild: false,
      }),
    ).toBe(true);
  });
});

describe('formatAuthErrorMessage', () => {
  it('uses generic actionable copy for production invalid-credential errors', () => {
    const error = buildClientResponseError({
      message: 'Failed to authenticate.',
      responseData: {
        password: {
          code: 'validation_invalid_password',
          message: 'Failed to authenticate.',
        },
      },
      status: 400,
    });

    expect(
      formatAuthErrorMessage(error, {
        environment: 'production',
        isDevBuild: false,
      }),
    ).toBe('Invalid email or password. Please try again.');
  });

  it('keeps backend diagnostics available in beta builds', () => {
    const error = buildClientResponseError({
      message: 'Failed to authenticate.',
      responseData: {
        password: {
          code: 'validation_invalid_password',
          message: 'Failed to authenticate.',
        },
      },
      status: 400,
    });

    expect(
      formatAuthErrorMessage(error, {
        backendUrl: 'https://beta.app.yummyrecs.com',
        environment: 'beta',
        isDevBuild: false,
      }),
    ).toContain('Backend: https://beta.app.yummyrecs.com');
  });

  it('uses generic network copy for production connectivity failures', () => {
    const error = new TypeError('Load failed');

    expect(
      formatAuthErrorMessage(error, {
        environment: 'production',
        isDevBuild: false,
      }),
    ).toBe('Unable to reach the sign-in server. Check your connection and try again.');
  });
});

describe('buildAuthErrorObservabilityProperties', () => {
  it('keeps detailed diagnostics in observability properties', () => {
    const error = buildClientResponseError({
      message: 'Failed to authenticate.',
      responseData: {
        password: {
          code: 'validation_invalid_password',
          message: 'Failed to authenticate.',
        },
      },
      status: 400,
    });

    expect(buildAuthErrorObservabilityProperties(error)).toEqual(
      expect.objectContaining({
        authErrorCategory: 'invalid_credentials',
        backendUrl: 'https://app.yummyrecs.com',
        errorMessage: 'Failed to authenticate.',
        errorStatus: 400,
        responseMessage: 'Failed to authenticate.',
      }),
    );
  });
});
